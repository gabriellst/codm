import { injectable } from 'tsyringe-neo'
import { eq, inArray, sql } from 'drizzle-orm'
import { outbox } from '@codedm/contracts/db'
import { BaseInfrastructureErrors } from '../../errors/codes'
import { BaseEvent } from '../../types/BaseEvent'
import { BaseError } from '../../types/BaseError'
import { Handler } from '../../types/Handler'
import { tryCatchAsync } from '../../utils/TryCatch'
import { DrizzleDatabaseDriver } from '../../db/drivers/DrizzleDatabaseDriver'
import { EventCallback, ExternalMediator, Unsubscribe, handlerEventNames } from './Mediator'
import { adaptWireEnvelope, reviveIsoDates } from './wire'

/**
 * The lane this mediator owns. `integration` is the Go gateway's EGRESS to us: the gateway writes
 * rows, we are the ONLY claimant. (`api` belongs to DrizzleOutboxDispatcher, `gateway` to the Go
 * dispatcher.) There is deliberately no `integration:gateway` lane yet — nothing TS-published is
 * consumed by Go today; if that changes it gets its OWN lane rather than sharing this one.
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
 * WHAT IT DOES NOT DO: it never INSERTs into the outbox. TS-published integration events already
 * travel on the `api` lane, written by DrizzleDomainEventRepository's saveIntegrationEvent, and the
 * domain dispatcher routes `integration.*` names here for fan-out. A second row would deliver
 * everything twice. So both outbound methods (`dispatch`, and `publish` for callers that use the
 * alias) are pure in-process fan-out.
 */
@injectable()
export class SqlExternalMediator extends ExternalMediator {
	private handlerMap = new Map<string, Handler[]>()
	private callbacks = new Set<EventCallback>()
	private namedCallbacks = new Map<string, Set<EventCallback>>()

	private timer: ReturnType<typeof setTimeout> | null = null
	private pollIntervalMs = POLL_MIN_MS
	private draining = false
	private stopped = true

	constructor(private driver: DrizzleDatabaseDriver) {
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

	/** Alias of dispatch, fire-and-forget. Same rule: no row is written. */
	async publish(event: BaseEvent): Promise<void> {
		void tryCatchAsync(() => this.dispatch(event))
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
		// No external handler registered ⇒ claim NOTHING. Claiming rows we cannot deliver would
		// burn their attempts budget and dead-letter the gateway's traffic. Mirrors the Go twin.
		if (names.length === 0) return 0

		const claimed = await this.claimBatch(names)
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
	 * `attempts` is charged HERE, not on failure. An ingress event that kills the process has
	 * exactly the same failure mode as a domain one — and this is the lane carrying payloads the TS
	 * daemon never validated, so if either claimant were to go without a crash-loop ceiling it would
	 * be the wrong one. The poison sweep collects rows that burned the budget without ever
	 * finalizing; without it they are neither claimable nor terminal, i.e. invisible.
	 */
	private async claimBatch(names: string[]): Promise<ClaimedOutboxRow[]> {
		const now = Date.now()
		const token = crypto.randomUUID()
		const nameList = sql.join(
			names.map(n => sql`${n}`),
			sql`, `,
		)

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
					AND ${outbox.name} IN (${nameList})
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
