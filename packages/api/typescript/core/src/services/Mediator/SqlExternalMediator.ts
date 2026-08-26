import { injectable } from 'tsyringe-neo'
import { eq, inArray, sql } from 'drizzle-orm'
import { outbox } from '@codm/contracts/db'
import { BaseInfrastructureErrors } from '../../errors/codes'
import { BaseEvent } from '../../types/BaseEvent'
import { BaseError } from '../../types/BaseError'
import { Handler } from '../../types/Handler'
import { tryCatchAsync } from '../../utils/TryCatch'
import { LibSqlDatabaseDriver } from '../../db/libsql/LibSqlDatabaseDriver'
import { DomainEventRepository } from '../../repositories/DomainEventRepository'
import type { PollingService } from '../HealthService/HealthCheck'
import { BaseIntegrationEvent, type AnyIntegrationEvent } from '../../types/BaseIntegrationEvent'
import { EventCallback, ExternalMediator, Unsubscribe, handlerEventNames } from './Mediator'
import { adaptWireEnvelope, reviveIsoDates } from './wire'

/**
 * The lane this mediator owns — and it carries BOTH directions.
 *
 * The old text described `integration` as the Go gateway's egress to us and nothing else. That was a
 * restriction of the moment, not a property of the lane (founder, 29-jul): since B3 the TS side
 * PUBLISHES here too (`publish()` → `saveIntegrationEvent`), and the claim does not care who produced
 * a row — it filters by NAME (only names with a registered handler) and leases. There is still exactly
 * ONE claimant, because the Go twin is built EGRESS-ONLY on this lane
 * (`NewSqlExternalMediatorWithoutIngress`); when Go one day needs to consume a TS-published fact it
 * registers a handler for that name — same lane, same claim, no new lane.
 * (`api` belongs to LibSqlOutboxDispatcher, `gateway` to the Go dispatcher.)
 */
const LANE = 'integration'

const BATCH_SIZE = 50
const MAX_ATTEMPTS = 5
const LEASE_MS = 30_000

// Poll bounds. The MAX is 2s, not the domain dispatcher's 30s, mirroring the Go WAL polling
// strategy: SQLite has no cross-process push, and a `integration.channel.connected` sitting half a
// minute in the table reads to the user as exactly the DISCONNECTED console this phase exists to
// kill.
const POLL_MIN_MS = 50
const POLL_MAX_MS = 2_000
const POLL_BACKOFF_FACTOR = 1.5

interface ClaimedOutboxRow {
	id: string
	name: string
	owner_id: string | null
	/** RAW TEXT — parsed here, with the date reviver. Never through the ORM's json column mode. */
	payload: string | null
	attempts: number
}

/**
 * Shared-outbox ingress: the TS twin of the Go `SqlExternalMediator`.
 *
 * TRANSPORT. There is no broker and no socket — the transport IS the shared SQLite file. The
 * gateway INSERTs a row with `source = 'integration'`; this class claims it by lease, revives it,
 * and hands it to the registered external handlers. That is also why it can be the `real` binding
 * even under the e2e harness, which boots no Go process: nothing about it needs a peer to be up.
 *
 * PUBLISH PERSISTS, AND ONLY PERSISTS (B3, decisions 4/5). `publish()` INSERTs the event on this lane
 * via `DomainEventRepository.saveIntegrationEvent` and returns — it dispatches nothing in the caller's
 * call stack and fires no callback there. Every delivery, Go-published or TS-published, comes from
 * `drainOnce`: one poller, one claim/lease, at-least-once, and consumers dedup (the core
 * `IdempotencyGuard`, or a UNIQUE latch like thread's consumed-message ledger). That is what makes a
 * TS→TS integration event survive a crash between the publish and the consumer. Until B3 this method
 * was an alias of `dispatch()`: nothing was written, so "the outbox will retry it" was simply false for
 * that direction.
 *
 * ORDERING, said out loud because the alias used to provide it by accident: an awaited in-memory
 * fan-out delivered A before B by construction. On the lane, order is `created_at` WITHIN one claim
 * batch and delivery is sequential — but a failed row does NOT hold back its successors here (this lane
 * does not group by owner; see `finalizeFailure`). A consumer that cannot tolerate "the later fact
 * arrived first" must say so at its own site.
 */
@injectable()
export class SqlExternalMediator extends ExternalMediator implements PollingService {
	private handlerMap = new Map<string, Handler[]>()
	private callbacks = new Set<EventCallback>()
	private namedCallbacks = new Map<string, Set<EventCallback>>()

	private timer: ReturnType<typeof setTimeout> | null = null
	private pollIntervalMs = POLL_MIN_MS
	private draining = false
	private stopped = true

	/**
	 * "Meu timer de poll está armado" — o menor sinal VERDADEIRO que já existia aqui.
	 *
	 * `stopped` e não `timer`: `stopped` nasce `true` e só é virado por `start()`/`stop()`, então
	 * `!stopped` é literalmente "start rodou e stop não" — correto ANTES do primeiro `start()`, que
	 * é a janela em que o probe de readiness pergunta. `timer` aqui só existe entre um
	 * `scheduleNext()` e o `drainOnce` seguinte.
	 */
	get running(): boolean {
		return !this.stopped
	}

	constructor(
		private driver: LibSqlDatabaseDriver,
		private domainEvents: DomainEventRepository,
	) {
		super()
	}

	override async start(): Promise<void> {
		this.stopped = false
		this.pollIntervalMs = POLL_MIN_MS
		this.scheduleNext()
	}

	override async stop(): Promise<void> {
		this.stopped = true
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}
		while (this.draining) await sleep(25)
	}

	async register(handler: Handler): Promise<void> {
		for (const name of handlerEventNames(handler)) {
			const existing = this.handlerMap.get(name)
			if (existing) existing.push(handler)
			else this.handlerMap.set(name, [handler])
		}
	}

	/** In-process fan-out ONLY — see the class docblock on why nothing is written here. */
	async dispatch(event: BaseEvent): Promise<void> {
		const handlers = this.handlerMap.get(event.name) ?? []
		const errors: Error[] = []
		for (const handler of handlers) {
			const outcome = await tryCatchAsync(async () => handler.execute(event))
			if (!outcome.success) errors.push(outcome.error)
		}
		this.notifyCallbacks(event.name, event)
		if (errors.length === 1) throw errors[0]
		if (errors.length > 1) {
			throw new AggregateError(errors, `${errors.length} of ${handlers.length} handlers failed for '${event.name}'`)
		}
	}

	/**
	 * PERSIST. Nothing else.
	 *
	 * The row is written inside the driver's write transaction (the only legitimate write path) and the
	 * method returns; `drainOnce` delivers it. The long note this docblock used to carry — about why the
	 * in-memory fan-out had to be awaited so `issue.opened` reached its consumer before
	 * `issue.completed` — described a property of the ALIAS, which is gone. What replaces it is the
	 * ORDERING paragraph on the class: intra-batch order, and consumers that dedup.
	 */
	async publish(event: BaseEvent): Promise<void> {
		// `publish` is typed on the widest event (the Mediator contract), but only integration events may
		// ride this lane: the row is scoped by the envelope `ownerId`, which a domain event does not have,
		// and an unscoped row is a row nothing can deliver. Fail loud rather than write it.
		if (!(event instanceof BaseIntegrationEvent)) {
			throw new BaseError<BaseInfrastructureErrors>(
				'INVALID_OUTBOX_PAYLOAD',
				`SqlExternalMediator.publish accepts integration events only — got '${event.name}'. Domain events are persisted by DomainEventRepository.save and dispatched on the api lane.`,
			)
		}
		// ONE documented boundary cast: `AnyIntegrationEvent` is the widest integration type the
		// persistence API accepts, but `instanceof` narrows to the class's DEFAULT schema instantiation,
		// not the concrete wire schema the row actually carries. A single widening cast is enough — the
		// two instantiations overlap structurally — and the `instanceof` IS the runtime proof.
		const integrationEvent = event as AnyIntegrationEvent
		await this.driver.transaction(tx => this.domainEvents.saveIntegrationEvent(integrationEvent, tx))
	}

	async execute<T extends Handler>(_handler: T['name'], _input: T['input']): Promise<T['output']> {
		throw new BaseError<BaseInfrastructureErrors>('NOT_IMPLEMENTED')
	}

	removeAllListeners(): void {
		this.handlerMap.clear()
		this.callbacks.clear()
		this.namedCallbacks.clear()
	}

	registerCallback(callback: EventCallback, eventName?: string): Unsubscribe {
		if (!eventName) {
			this.callbacks.add(callback)
			return () => this.callbacks.delete(callback)
		}
		const named = this.namedCallbacks.get(eventName) ?? new Set<EventCallback>()
		named.add(callback)
		this.namedCallbacks.set(eventName, named)
		return () => named.delete(callback)
	}

	/**
	 * One ingress pass: claim a leased batch of the `integration` lane, dispatch each row OUTSIDE
	 * the transaction, finalize. Returns how many rows were handled, so the poll loop can back off.
	 * Public because tests (and ops) drive it deterministically.
	 */
	async drainOnce(): Promise<number> {
		const names = [...this.handlerMap.keys()]
		// EMENDA O1 (B3) — THE CLAIM SERVES THE CALLBACKS TOO. A global callback (the SSE broadcaster is
		// one, registered once per process) consumes EVERY integration fact, not a named subset, so while
		// one exists the claim covers the WHOLE lane: handlers run for the names that have them,
		// `notifyCallbacks` fires for every claimed row. Without this, decision 5 ("the SSE fires FROM the
		// poller") would silently drop every TS-published fact with no backend consumer —
		// `thread.attached`, `issue.archived`, `issue.stop_resolved` — because they have no handler name
		// to be claimed by. Desired side effect: dormant rows are tombstoned after the broadcast instead
		// of accumulating unprocessed forever.
		const broadcasting = this.callbacks.size > 0
		// No handler AND no global callback ⇒ claim NOTHING. Claiming rows we cannot deliver would
		// burn their attempts budget and dead-letter the gateway's traffic. Mirrors the Go twin, and it
		// is what keeps a headless script (no SSE, no handlers) from tombstoning traffic it never reads.
		if (!broadcasting && names.length === 0) return 0

		const claimed = await this.claimBatch(broadcasting ? null : names)
		if (claimed.length === 0) return 0

		for (const row of claimed) {
			const outcome = await tryCatchAsync(() => this.deliver(row))
			if (outcome.success) await this.finalizeSuccess(row)
			else await this.finalizeFailure(row, String(outcome.error))
		}
		return claimed.length
	}

	private async deliver(row: ClaimedOutboxRow): Promise<void> {
		// Parse the payload OURSELVES, as raw TEXT, with the date reviver — see `reviveIsoDates`.
		const parsed = JSON.parse(row.payload ?? '{}', reviveIsoDates)
		// A flat Go wire struct is folded back into the nested BaseIntegrationEvent envelope; an
		// already-nested TS envelope passes through. Free defence, kept deliberately.
		const envelope = adaptWireEnvelope(parsed) as BaseEvent

		for (const handler of this.handlerMap.get(row.name) ?? []) {
			await handler.execute(envelope)
		}
		this.notifyCallbacks(row.name, envelope)
	}

	/**
	 * The claim, identical in protocol to the domain dispatcher's except for the lane and the
	 * handler-name filter. One `BEGIN IMMEDIATE` transaction, COMMITTED before anything is
	 * dispatched.
	 *
	 * `names === null` means "the whole lane" — the EMENDA O1 mode `drainOnce` selects while a global
	 * callback is registered. Any other value narrows to those names, as before.
	 *
	 * `attempts` is charged HERE, not on failure. An ingress event that kills the process has
	 * exactly the same failure mode as a domain one — and this is the lane carrying payloads the TS
	 * daemon never validated, so if either claimant were to go without a crash-loop ceiling it would
	 * be the wrong one. The poison sweep collects rows that burned the budget without ever
	 * finalizing; without it they are neither claimable nor terminal, i.e. invisible.
	 */
	private async claimBatch(names: string[] | null): Promise<ClaimedOutboxRow[]> {
		const now = Date.now()
		const token = crypto.randomUUID()
		const nameFilter = names
			? sql`AND ${outbox.name} IN (${sql.join(
					names.map(n => sql`${n}`),
					sql`, `,
				)})`
			: sql``

		return this.driver.transaction(async tx => {
			await tx.run(sql`
				UPDATE ${outbox}
				SET processed_at = ${now}, claimed_by = NULL, last_error = 'poison: exceeded attempts without finalize'
				WHERE ${outbox.source} = ${LANE}
					AND ${outbox.processedAt} IS NULL
					AND ${outbox.attempts} >= ${MAX_ATTEMPTS}
					AND ${outbox.leaseUntil} IS NOT NULL
					AND ${outbox.leaseUntil} < ${now}
			`)

			const due = await tx.all<{ id: string }>(sql`
				SELECT id
				FROM ${outbox}
				WHERE ${outbox.source} = ${LANE}
					AND ${outbox.processedAt} IS NULL
					AND ${outbox.attempts} < ${MAX_ATTEMPTS}
					AND (${outbox.leaseUntil} IS NULL OR ${outbox.leaseUntil} < ${now})
					${nameFilter}
				ORDER BY ${outbox.createdAt}
				LIMIT ${BATCH_SIZE}
			`)
			const ids = due.map(row => String(row.id))
			if (ids.length === 0) return []

			await tx
				.update(outbox)
				.set({
					claimedBy: token,
					leaseUntil: new Date(now + LEASE_MS),
					// Unqualified on purpose: single-table UPDATE, and `attempts + 1` is the whole point.
					attempts: sql`attempts + 1`,
				})
				.where(inArray(outbox.id, ids))

			// Raw re-read: `payload` must come back as TEXT so `deliver` can parse it with the
			// reviver. Reading it through the ORM's json column mode would parse it WITHOUT one.
			return tx.all<ClaimedOutboxRow>(sql`
				SELECT id, name, owner_id, payload, attempts
				FROM ${outbox}
				WHERE ${outbox.claimedBy} = ${token}
				ORDER BY ${outbox.createdAt}
			`)
		})
	}

	/** Tombstone. The row is kept — a deleted id is a re-insertable id on the Go side. */
	private async finalizeSuccess(row: ClaimedOutboxRow): Promise<void> {
		await this.driver.transaction(tx => tx.update(outbox).set({ processedAt: new Date(), claimedBy: null }).where(eq(outbox.id, row.id)))
	}

	/**
	 * Below the ceiling: record the error and NOTHING else — the lease is retained on purpose (that
	 * IS the 30s backoff) and `attempts` was charged at claim time. At or above it: dead-letter.
	 * There is no skip branch here: this lane does not group by owner (nor does the Go twin), so
	 * owner-sequential ordering and its skip belong to the `api` dispatcher alone.
	 */
	private async finalizeFailure(row: ClaimedOutboxRow, error: string): Promise<void> {
		const deadLettered = Number(row.attempts) >= MAX_ATTEMPTS
		await this.driver.transaction(tx =>
			tx
				.update(outbox)
				.set(deadLettered ? { lastError: error, processedAt: new Date(), claimedBy: null } : { lastError: error })
				.where(eq(outbox.id, row.id)),
		)
	}

	private notifyCallbacks(eventName: string, event: BaseEvent): void {
		for (const cb of this.callbacks) cb(event)
		const named = this.namedCallbacks.get(eventName)
		if (named) for (const cb of named) cb(event)
	}

	private scheduleNext(): void {
		if (this.stopped) return
		this.timer = setTimeout(() => void this.poll(), Math.min(this.pollIntervalMs, POLL_MAX_MS))
		this.timer.unref?.()
	}

	private async poll(): Promise<void> {
		if (this.stopped || this.draining) return
		this.draining = true
		try {
			const handled = await this.drainOnce()
			this.pollIntervalMs = handled > 0 ? POLL_MIN_MS : Math.min(this.pollIntervalMs * POLL_BACKOFF_FACTOR, POLL_MAX_MS)
		} catch (error) {
			console.error('SqlExternalMediator ingress poll failed:', error)
			this.pollIntervalMs = Math.min(this.pollIntervalMs * POLL_BACKOFF_FACTOR, POLL_MAX_MS)
		} finally {
			this.draining = false
			this.scheduleNext()
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}
