import { injectable } from 'tsyringe-neo'
import { DrizzleDatabaseDriver } from '../../db/drivers/DrizzleDatabaseDriver'
import { outbox } from '@codm/contracts/db'
import { InternalMediator, ExternalMediator } from '../Mediator'
import { OutboxDispatcher } from './OutboxDispatcher'
import { BaseEvent } from '../../types/BaseEvent'
import { BaseError } from '../../types/BaseError'
import type { BaseInfrastructureErrors } from '../../errors/codes'
import { eq, sql, inArray } from 'drizzle-orm'
import { tryCatchAsync } from '../../utils/TryCatch'
import type { PollingService } from '../HealthService/HealthCheck'
import { LoggingService } from '../Logging'

// ─── Configuration ───────────────────────────────────────────────────────────
const BATCH_SIZE = 50
const MAX_ATTEMPTS = 5
const OWNER_CONCURRENCY = 10
/** Crash-safety lease, ms. Aligned with the Go dispatcher's own constant. */
const LEASE_MS = 30_000

/**
 * The lane this dispatcher owns, and the ONLY one it may claim from.
 *
 * `shared_outbox` is shared by three producers and the `source` column partitions it so that
 * "a row has exactly one possible claimant" is a property of the DATA, not of who happened to
 * register a handler. `api` = rows written by this daemon's DomainEventRepository (domain AND
 * integration events); `gateway` = the Go gateway's own domain events, claimed only by its Go
 * dispatcher; `integration` = the gateway's egress to us, claimed only by SqlExternalMediator.
 * Without this predicate this dispatcher steals rows from both other lanes and drops them.
 */
const LANE = 'api'

// Adaptive polling bounds
const POLL_MIN_MS = 100
/**
 * Teto do backoff ocioso. Medido em 31/07: estava em 30s enquanto TODOS os vizinhos param em 2s
 * (`SqlExternalMediator`, `DrizzleMailboxDispatcher`) e o `CommandQueue` roda fixo em 1s — herança de
 * contexto de servidor, não decisão para um app local com um operador só.
 *
 * A assimetria custava latência pura: num app quieto o poller está no TETO do backoff justamente
 * quando o evento chega, então um fato de domínio recém-escrito esperava até 30 SEGUNDOS para ser
 * despachado. O operador sente isso como "o agente demora a responder".
 *
 * 1s por decisão do founder (31/07). O custo é uma consulta a mais por segundo num SQLite local —
 * irrelevante.
 *
 * ISTO NÃO É A CORREÇÃO ESTRUTURAL. O lado Go já tem `NotifyStrategy` (`SqliteWalPollingStrategy`),
 * cujo docblock diz "Notify is only the wake-up": quem escreve acorda o consumidor e o poll vira rede
 * de segurança. Nenhum dos três pollers do TS tem equivalente — enquanto não tiver, este teto É o
 * piso da latência, não um detalhe de afinação.
 */
const POLL_MAX_MS = 1_000
const POLL_BACKOFF_FACTOR = 1.5

type OutboxRow = typeof outbox.$inferSelect

interface OwnerBatch {
	ownerId: string
	rows: OutboxRow[]
}

interface DispatchResult {
	succeeded: string[]
	failed: { id: string; currentAttempts: number; error: string }[]
	skipped: string[]
}

@injectable()
export class DrizzleOutboxDispatcher extends OutboxDispatcher implements PollingService {
	private timer: ReturnType<typeof setInterval> | null = null
	private isProcessing = false
	private stopping = false
	private pollIntervalMs = POLL_MIN_MS
	private lastProcessedCount = 0

	/**
	 * "Meu timer de poll está armado" — o menor sinal VERDADEIRO que já existia aqui.
	 *
	 * `timer` e não `stopping`: `stopping` nasce `false`, então `!stopping` diria READY antes de
	 * `start()` ter rodado — mentiria exatamente na janela que o probe de readiness interroga.
	 * `timer` nasce `null`, é setado por `scheduleNext()` e NUNCA fica `null` durante o poll:
	 * `poll()` não o limpa, e `scheduleNext()` anula+reatribui no MESMO bloco síncrono.
	 */
	get running(): boolean {
		return this.timer !== null
	}

	constructor(
		private driver: DrizzleDatabaseDriver,
		private internalMediator: InternalMediator,
		private externalMediator: ExternalMediator,
		private loggingService: LoggingService,
	) {
		super()
	}

	start(): void {
		this.stopping = false
		console.log(
			`✅ OutboxDispatcher started (adaptive poll: ${POLL_MIN_MS}-${POLL_MAX_MS}ms, batch: ${BATCH_SIZE}, ownerConcurrency: ${OWNER_CONCURRENCY})`,
		)
		this.scheduleNext()
	}

	async stop(): Promise<void> {
		this.stopping = true

		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}

		// Wait for in-flight processing to finish
		while (this.isProcessing) {
			await new Promise(resolve => setTimeout(resolve, 50))
		}

		console.log('✅ OutboxDispatcher stopped')
	}

	// ─── Scheduling ────────────────────────────────────────────────────────

	private scheduleNext(): void {
		if (this.stopping) return
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}
		const interval = Math.min(this.pollIntervalMs, POLL_MAX_MS)
		this.timer = setTimeout(() => this.poll(), interval)
	}

	private adaptPolling(rowsFound: number): void {
		if (rowsFound > 0) {
			this.pollIntervalMs = POLL_MIN_MS
		} else {
			this.pollIntervalMs = Math.min(this.pollIntervalMs * POLL_BACKOFF_FACTOR, POLL_MAX_MS)
		}
	}

	// ─── Main Loop ─────────────────────────────────────────────────────────

	private async poll(): Promise<void> {
		if (this.isProcessing) {
			this.scheduleNext()
			return
		}

		this.isProcessing = true

		try {
			await this.flush()
			this.adaptPolling(this.lastProcessedCount)
		} catch (error) {
			this.loggingService.error({
				content: {
					message: 'OutboxDispatcher poll error',
					error: String(error),
					cause: error instanceof Error && error.cause ? String(error.cause) : undefined,
				},
			})
			this.pollIntervalMs = Math.min(this.pollIntervalMs * POLL_BACKOFF_FACTOR, POLL_MAX_MS)
		} finally {
			this.isProcessing = false
			this.scheduleNext()
		}
	}

	// ─── Three-Phase Processing ────────────────────────────────────────────

	/**
	 * Phase 1: Claim — one short WRITE transaction that leases a batch of the `api` lane, then
	 * COMMITS. Nothing is dispatched inside it.
	 *
	 * Committing before dispatching is not hygiene, it is survival: writes in this process are
	 * serialized through a single-holder FIFO gate, so dispatching from inside the claim would make
	 * the handler's own outbox write wait for a transaction that only ends when the handler ends —
	 * a deterministic deadlock, not a probabilistic one.
	 *
	 * The claim ALSO counts the attempt (`attempts + 1`). Incrementing only on a returned error
	 * misses hard crashes (an event whose dispatch kills the process never reaches finalize), which
	 * would re-claim at attempts=0 after every lease expiry — an unbreakable crash loop with no
	 * dead-letter. `attempts` therefore means "executions STARTED", exactly as documented on the
	 * SqliteCommandQueue claim, which is where this repo first paid for the lesson. The predicate
	 * `attempts < MAX_ATTEMPTS` is therefore a CRASH-LOOP CEILING, not a terminal state: the only
	 * terminal predicate is `processed_at IS NOT NULL`.
	 *
	 * KNOWN DIVERGENCE FROM THE GO DISPATCHER, deliberate: `sqlite_outbox_dispatcher.go` still
	 * increments in its failure path only, so the gateway lane keeps the unbounded crash loop. That
	 * is scheduled for its own phase. Do NOT "harmonise" this side down to match it.
	 */
	private async claimBatch(): Promise<OwnerBatch[]> {
		const now = Date.now()
		const token = crypto.randomUUID()

		const claimed = await this.driver.transaction(async tx => {
			// POISON SWEEP, before the claim. A row that burned its budget by crashing the process is
			// neither claimable (ceiling reached) nor terminal (never finalized) — it would sit there
			// invisible forever. Mirror of the dead-letter sweep the command queue already runs.
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

			// Re-read through the WRITE handle: it is inside the transaction that just wrote the lease.
			return tx.select().from(outbox).where(eq(outbox.claimedBy, token)).orderBy(outbox.createdAt)
		})

		if (claimed.length === 0) return []

		// Group by ownerId for owner-sequential processing.
		// Null ownerId (events with no actor — e.g. BillingWebhookReceivedEvent)
		// gets a sentinel bucket so it dispatches in parallel with everything else.
		const ownerMap = new Map<string, OutboxRow[]>()
		for (const row of claimed) {
			const key = row.ownerId ?? '__no_owner__'
			const existing = ownerMap.get(key)
			if (existing) {
				existing.push(row)
			} else {
				ownerMap.set(key, [row])
			}
		}

		return Array.from(ownerMap.entries()).map(([ownerId, rows]) => ({ ownerId, rows }))
	}

	/**
	 * Phase 2: Process — Dispatch events OUTSIDE any database transaction.
	 * Sequential within each owner, parallel across owners. When an owner's event fails, the
	 * remaining events for that owner are skipped so they cannot overtake it.
	 *
	 * WHAT "owner-sequential" ACTUALLY GUARANTEES — read the qualifier before building on it.
	 * The guarantee is WITHIN A CLAIM BATCH: inside one claim, an owner's events are delivered in
	 * `created_at` order, and a failure skips that owner's successors in that same batch, which come
	 * back together because they share the failed row's lease. ACROSS batches the order is NOT
	 * guaranteed, in two reachable cases:
	 *   (i)  more than BATCH_SIZE rows pending in the lane — a later event of the same owner that
	 *        missed the batch carries no lease, so it is claimable on the next cycle while the
	 *        failed earlier one is still serving its 30s backoff;
	 *   (ii) an event written by a HANDLER during this same flush — it is born without a lease, so
	 *        the same inversion applies.
	 * Closing that would need per-owner leasing or a per-owner sequence column, i.e. a structural
	 * divergence from the Go protocol this adopts. Intra-batch is what kills the symptom this
	 * exists for; the unqualified promise is what misleads the next reader.
	 */
	private async processEvents(ownerBatches: OwnerBatch[]): Promise<DispatchResult> {
		const succeeded: string[] = []
		const failed: DispatchResult['failed'] = []
		const skipped: string[] = []

		const ownerWorker = async (batch: OwnerBatch): Promise<void> => {
			let hasFailed = false

			for (const row of batch.rows) {
				if (hasFailed) {
					// Prior event failed — skip remaining to preserve owner ordering
					skipped.push(row.id)
					continue
				}

				const outcome = await tryCatchAsync(async () => {
					const event = this.toBaseEvent(row.payload as Record<string, unknown>)
					// Integration events (name `integration.*`) cross bounded contexts / services — deliver
					// them via the ExternalMediator, whose real implementation fans them out in-process.
					// Domain events stay context-private on the InternalMediator.
					const mediator = event.name.startsWith('integration.') ? this.externalMediator : this.internalMediator
					await mediator.dispatch(event)
				})

				if (outcome.success) {
					succeeded.push(row.id)
				} else {
					failed.push({
						id: row.id,
						currentAttempts: row.attempts,
						error: String(outcome.error),
					})
					hasFailed = true
				}
			}
		}

		// Controlled parallelism: process in chunks of OWNER_CONCURRENCY
		for (let i = 0; i < ownerBatches.length; i += OWNER_CONCURRENCY) {
			const chunk = ownerBatches.slice(i, i + OWNER_CONCURRENCY)
			await Promise.all(chunk.map(ownerWorker))
		}

		return { succeeded, failed, skipped }
	}

	/**
	 * Phase 3: Finalize — one short write transaction.
	 *
	 * Success → TOMBSTONE (`processed_at` + release the token). The row is NOT deleted: the Go
	 * re-persist is `INSERT … ON CONFLICT(id) DO NOTHING`, so a deleted id is a re-insertable id,
	 * and delete + at-least-once delivery is re-dispatch.
	 *
	 * Failure below the ceiling → record `last_error` and NOTHING else. `attempts` was already
	 * charged at claim time (charging twice would halve the budget), and the lease is DELIBERATELY
	 * retained: holding it is the 30s backoff.
	 *
	 * Skip → record `last_error` and NOTHING else, for the same reason plus one more. The skipped
	 * rows came from the SAME claim as the row that failed, so they already carry the same token and
	 * the same lease; "keep the lease" is literally "do not write it". Releasing it would make the
	 * skipped SUCCESSOR claimable on the very next cycle (and `flush()` recurses immediately) while
	 * its failed PREDECESSOR is still leased — delivering a later event of owner X before the retry
	 * of the earlier one. That is a silent correctness regression, not a simplification.
	 */
	private async finalize({ succeeded, failed, skipped }: DispatchResult): Promise<void> {
		const now = new Date()
		await this.driver.transaction(async tx => {
			if (succeeded.length > 0) {
				await tx.update(outbox).set({ processedAt: now, claimedBy: null }).where(inArray(outbox.id, succeeded))
			}

			for (const fail of failed) {
				const deadLettered = fail.currentAttempts >= MAX_ATTEMPTS
				await tx
					.update(outbox)
					.set(
						deadLettered
							? { lastError: fail.error, processedAt: now, claimedBy: null }
							: // Lease deliberately retained → natural 30s backoff. Attempts already charged.
								{ lastError: fail.error },
					)
					.where(eq(outbox.id, fail.id))

				this.loggingService.error({
					content: {
						message: 'Failed to dispatch outbox event',
						outboxId: fail.id,
						attempts: fail.currentAttempts,
						maxReached: deadLettered,
						error: fail.error,
					},
				})
			}

			if (skipped.length > 0) {
				await tx.update(outbox).set({ lastError: 'skipped: predecessor failed' }).where(inArray(outbox.id, skipped))
			}
		})
	}

	/**
	 * Full cycle: claim → process → finalize.
	 * Recurses to drain events produced by handlers.
	 *
	 * TERMINATION now has two independent guarantees. (1) The lease: a failed row and its skipped
	 * successors stay leased for 30s, and a dead-lettered one becomes a tombstone — so no row from
	 * this batch returns to the pool immediately. (2) The crash-loop ceiling `attempts < MAX_ATTEMPTS`
	 * back in the claim. The iteration cap below is a third, defensive belt: if it ever trips, the
	 * bug is in one of the two above and the log line is the only way anyone would find out.
	 */
	async flush(depth = 0): Promise<void> {
		const MAX_FLUSH_DEPTH = 100
		if (depth >= MAX_FLUSH_DEPTH) {
			this.loggingService.error({
				content: {
					message: 'OutboxDispatcher flush hit its recursion ceiling — a claimed row is returning to the pool immediately',
					depth,
				},
			})
			return
		}

		const ownerBatches = await this.claimBatch()
		if (ownerBatches.length === 0) {
			this.lastProcessedCount = 0
			return
		}

		this.lastProcessedCount = ownerBatches.reduce((sum, b) => sum + b.rows.length, 0)
		const dispatched = await this.processEvents(ownerBatches)
		await this.finalize(dispatched)

		// Recurse to drain events produced by handlers
		await this.flush(depth + 1)
	}

	/**
	 * Validates that a JSON payload has the required BaseEvent shape.
	 * The outbox table is only written by BaseEvent.toJSON(), so the shape is guaranteed
	 * to contain name, id, time, and payload fields at runtime.
	 *
	 * Accepted deviation (cc-bp-04): The `as unknown as BaseEvent` cast is unavoidable because
	 * BaseEvent is an abstract class — JSON deserialization produces plain objects, not class
	 * instances, so structural compatibility cannot be achieved without this assertion.
	 * The type guard above validates the runtime shape before the cast.
	 */
	private toBaseEvent(payload: Record<string, unknown>): BaseEvent {
		if (typeof payload.name !== 'string' || typeof payload.id !== 'string' || typeof payload.time !== 'string') {
			throw new BaseError<BaseInfrastructureErrors>(
				'INVALID_OUTBOX_PAYLOAD',
				'Outbox payload is missing required BaseEvent fields (name, id, time). Outbox rows are only written by BaseEvent.toJSON() — this indicates data corruption or a manual insert bypassing the repository.',
			)
		}
		return payload as unknown as BaseEvent
	}
}
