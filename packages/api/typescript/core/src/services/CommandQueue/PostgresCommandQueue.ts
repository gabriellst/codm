// Generic command-name type — apps narrow this in their own subclasses.
type UseCases = string
import { BaseError } from '../../types/BaseError'
import { Handler } from '../../types/Handler'
import type { Transaction } from '../UnitOfWork/UnitOfWork'
import { Config } from '../../utils/Config'
import { tryCatchAsync } from '../../utils/TryCatch'
import { DrizzleClient } from '../../db'
import { scheduledCommands } from '@codedm/contracts/db'
import { Id } from '../../objects'
import type { BaseInfrastructureErrors } from '../../errors/codes'
import { CommandQueue } from './CommandQueue'
import { eq, inArray, sql } from 'drizzle-orm'
import type { JobsOptions, Queue } from 'bullmq'
import { injectable } from 'tsyringe-neo'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import { describeValue } from '../../utils/Tracing'
import { LoggingService } from '../Logging'

/** One claimed row, as returned by the leasing CTE (snake_case — raw SQL, not the drizzle mapper). */
// The explicit index signature is what lets an INTERFACE satisfy drizzle's
// `execute<T extends Record<string, unknown>>` (interfaces have no implicit index signature).
interface ClaimedRow {
	id: string
	name: string
	input: Record<string, unknown>
	attempts: number
	max_attempts: number
	repeat_every_ms: number | null
	[column: string]: unknown
}

/** Resolve the query executor: the ambient transaction when threaded, else the base client.
 *  `Transaction` is intentionally `unknown` at the UnitOfWork layer; this is the one narrowed spot. */
function txClient(tx: Transaction | undefined, db: DrizzleClient): DrizzleClient {
	return (tx ?? db) as DrizzleClient
}

/**
 * Postgres-backed CommandQueue — the TRANSACTIONAL scheduling driver.
 *
 * Why it exists (vs BullMQ): `enqueueCommand(..., tx)` INSERTs into `shared.scheduled_commands`
 * inside the CALLER'S transaction, so scheduling a command commits or rolls back atomically with
 * the domain write that motivates it — no dual-write against an external broker. This is the
 * property money-adjacent scheduling needs (reconcile/dunning/expiry): the "alarm" lives in the
 * same database as the state, is visible via SQL, and cancels with a DELETE.
 *
 * Semantics (mirroring the BullMQ driver where they overlap):
 *  - `opts.delay`   → `run_at = now + delay`.
 *  - `opts.jobId`   → the row id (dedup: re-enqueueing the same jobId while pending is a no-op;
 *                     also the handle for `cancelCommand`).
 *  - `opts.repeat`  → `{ every }` upserts a deterministic `repeat:<name>` row that RE-ARMS itself
 *                     after each run (the periodic sweeps). `{ pattern }` (cron) is not implemented —
 *                     no job uses it; add a cron parser when one does.
 *  - failure        → exponential backoff (1s·2^attempts, mirroring BullMQ's default) up to
 *                     `max_attempts`, then dead-lettered (`dead_at` set, row kept for forensics).
 *
 * Execution: a single poller per process claims due rows with a CTE
 * `SELECT … FOR UPDATE SKIP LOCKED` + lease (`lease_until`), so N processes share the table without
 * contention and a crashed worker's rows become claimable again when the lease expires — handlers
 * must be idempotent (they already are: at-least-once is the outbox's contract too). The claimed
 * batch runs SEQUENTIALLY per process; scale out by running more processes (SKIP LOCKED partitions
 * the work), not by in-process parallelism.
 */
@injectable()
export class PostgresCommandQueue extends CommandQueue {
	// INSERT/DELETE on the caller's tx — scheduling commits with the domain write.
	readonly transactional = true
	/** How often the poller looks for due commands. */
	private static readonly POLL_INTERVAL_MS = 1_000
	/** Rows claimed per tick (per process). */
	private static readonly BATCH_SIZE = 25
	/** Crash-safety lease: a claimed row becomes re-claimable after this if the worker died mid-run. */
	private static readonly LEASE_MS = 60_000
	/** Mirrors the BullMQ driver's default retry budget (attempts: 3, exponential 1s). */
	private static readonly MAX_ATTEMPTS = 3
	private static readonly BACKOFF_BASE_MS = 1_000

	private readonly handlers = new Map<string, Handler>()
	private pollTimer: ReturnType<typeof setInterval> | null = null
	/** Serializes ticks — a slow batch must not overlap the next interval firing. */
	private ticking = false
	/**
	 * Graceful-shutdown signal. Aborting is COOPERATIVE at item granularity: the in-flight handler
	 * finishes (its work is transactional and idempotent — killing it mid-run would just burn an
	 * attempt), then the batch loop checks the signal, releases the leases of the still-unrun claimed
	 * rows (immediately re-claimable elsewhere, no 60s lease wait), and stops. Aborting mid-HANDLER
	 * would require plumbing the signal through the Handler API — deferred until a handler actually
	 * runs long enough to need it. One-way: an aborted instance never polls again (fresh deploys get
	 * fresh instances).
	 */
	private readonly abortController = new AbortController()
	/** The in-flight tick, so close() can await the current item's completion. */
	private currentTick: Promise<void> | null = null

	constructor(
		private db: DrizzleClient,
		private loggingService: LoggingService,
	) {
		super()
	}

	async enqueueCommand<T extends Handler>(commandName: T['name'], input: T['input'], opts?: JobsOptions, tx?: Transaction): Promise<void> {
		const tracer = trace.getTracer(Config.name)
		const span = tracer.startSpan(`enqueue ${commandName}`, { root: true })
		span.setAttribute('queue.command', commandName)
		span.setAttribute('queue.operation', 'enqueue')
		span.setAttribute('queue.driver', 'postgres')
		span.setAttribute('queue.input', describeValue(input))
		if (opts?.delay) span.setAttribute('queue.delay', opts.delay)

		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const dbClient = txClient(tx, this.db)
				const now = Date.now()

				if (opts?.repeat) {
					if (!('every' in opts.repeat) || typeof opts.repeat.every !== 'number') {
						throw new BaseError<BaseInfrastructureErrors>(
							'NOT_IMPLEMENTED',
							'PostgresCommandQueue supports repeat.every only — no job uses cron patterns; add a cron parser when one does.',
						)
					}
					// Deterministic id → boot re-registration UPSERTS the schedule instead of duplicating it
					// (and self-heals a changed interval, e.g. sandbox 60s vs prod 1h).
					const every = opts.repeat.every
					await dbClient
						.insert(scheduledCommands)
						.values({
							id: `repeat:${commandName}`,
							name: commandName,
							input: (input ?? {}) as Record<string, unknown>,
							runAt: new Date(now + every),
							repeatEveryMs: every,
							maxAttempts: opts.attempts ?? PostgresCommandQueue.MAX_ATTEMPTS,
						})
						.onConflictDoUpdate({
							target: scheduledCommands.id,
							set: {
								repeatEveryMs: every,
								// PRESERVE the standing schedule on a plain re-registration: every process boot
								// re-registers every job, and resetting run_at to now+every here pushed the next
								// run out by a full interval per deploy — restarts more frequent than the
								// interval starved ALL sweeps forever (no renewals, no dunning, no reconcile),
								// silently. Only an interval CHANGE re-anchors the schedule; nothing else is
								// touched (clearing lease/attempts on boot could steal a live instance's lease
								// mid-rolling-deploy).
								runAt: sql`CASE WHEN scheduled_commands.repeat_every_ms IS DISTINCT FROM excluded.repeat_every_ms THEN excluded.run_at ELSE scheduled_commands.run_at END`,
								updatedAt: new Date(),
							},
						})
					span.setAttribute('queue.job_id', `repeat:${commandName}`)
					span.setStatus({ code: SpanStatusCode.OK })
					return
				}

				const id = opts?.jobId ?? new Id().value
				// jobId dedup (BullMQ parity): a pending row with the same id makes this a no-op.
				await dbClient
					.insert(scheduledCommands)
					.values({
						id,
						name: commandName,
						input: (input ?? {}) as Record<string, unknown>,
						runAt: new Date(now + (opts?.delay ?? 0)),
						maxAttempts: opts?.attempts ?? PostgresCommandQueue.MAX_ATTEMPTS,
					})
					.onConflictDoNothing({ target: scheduledCommands.id })
				span.setAttribute('queue.job_id', id)
				span.setStatus({ code: SpanStatusCode.OK })
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error))
				span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
				span.recordException(err)
				throw error
			} finally {
				span.end()
			}
		})
	}

	// Cancel = DELETE the pending row — tx-aware, so "settle the charge AND cancel its reconcile alarm"
	// commits atomically. Best-effort for a job already leased/executing (idempotent handlers no-op).
	async cancelCommand(_commandName: string, jobId: string, tx?: Transaction): Promise<void> {
		await txClient(tx, this.db).delete(scheduledCommands).where(eq(scheduledCommands.id, jobId))
	}

	getCommandQueue(_commandName: UseCases): Queue {
		throw new BaseError<BaseInfrastructureErrors>(
			'NOT_IMPLEMENTED',
			'PostgresCommandQueue is not Bull-backed — getCommandQueue is only meaningful for the BullMQ implementation.',
		)
	}

	async registerCommandHandler(handler: Handler): Promise<void> {
		if (this.handlers.has(handler.name)) {
			this.loggingService.warn({
				content: { message: 'handler already registered on PostgresCommandQueue, skipping', handler: handler.name },
			})
			return
		}
		this.handlers.set(handler.name, handler)
		this.startPolling()
	}

	async removeAllCommandHandlers(): Promise<void> {
		this.stopPolling()
		this.handlers.clear()
	}

	/**
	 * Graceful shutdown: stop scheduling new ticks, signal the batch loop to stop between items, wait
	 * for the in-flight item to finish, then drop the handlers. Safe to call more than once.
	 */
	async close(): Promise<void> {
		this.abort()
		if (this.currentTick) await this.currentTick.catch(() => {})
		await this.removeAllCommandHandlers()
	}

	/** Signal-only half of close(): stop polling and mark the instance aborted (see abortController doc). */
	abort(): void {
		this.stopPolling()
		this.abortController.abort()
	}

	startPolling(): void {
		// An aborted instance is permanently stopped — a late registerCommandHandler must not revive it.
		if (this.pollTimer || this.abortController.signal.aborted) return
		this.pollTimer = setInterval(() => {
			void this.tick()
		}, PostgresCommandQueue.POLL_INTERVAL_MS)
		// Don't hold the process open just to poll (mirrors worker daemons that exit with the app).
		this.pollTimer.unref?.()
	}

	stopPolling(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}
	}

	/**
	 * One poll pass: claim due rows (lease them) and execute. Public so tests drive it deterministically
	 * and ops can force a pass. Overlap-safe: concurrent ticks in one process are serialized here, and
	 * across processes by the SKIP LOCKED + lease claim.
	 */
	async tick(): Promise<void> {
		if (this.ticking || this.handlers.size === 0 || this.abortController.signal.aborted) return
		this.ticking = true
		this.currentTick = this.runBatch()
		try {
			await this.currentTick
		} finally {
			this.currentTick = null
			this.ticking = false
		}
	}

	private async runBatch(): Promise<void> {
		const remaining = await this.claimDueBatch()
		while (remaining.length > 0) {
			// Cooperative abort BETWEEN items: the current handler always finishes; the rest of the batch
			// gives its leases back so another process (or the next deploy) picks them up immediately.
			if (this.abortController.signal.aborted) {
				await this.releaseLeases(remaining.map(row => row.id))
				return
			}
			const row = remaining.shift()
			if (row) await this.runOne(row)
		}
	}

	private async releaseLeases(ids: string[]): Promise<void> {
		if (ids.length === 0) return
		await this.db.update(scheduledCommands).set({ leaseUntil: null, updatedAt: new Date() }).where(inArray(scheduledCommands.id, ids))
	}

	private async claimDueBatch(): Promise<ClaimedRow[]> {
		const names = [...this.handlers.keys()]
		const namesList = sql.join(
			names.map(n => sql`${n}`),
			sql`, `,
		)

		// Crash-loop escape hatch: a one-shot whose EXECUTION kills the process never reaches
		// finalizeFailure — but the claim below already counted the attempt, so once the budget is
		// burned and the lease expired, dead-letter it here instead of re-claiming into another crash,
		// forever. Repeatables are exempt (a sweep must survive; its attempts reset on every re-arm).
		await this.db.execute(sql`
			UPDATE ${scheduledCommands}
			SET dead_at = now(), lease_until = NULL, updated_at = now()
			WHERE ${scheduledCommands.deadAt} IS NULL
				AND ${scheduledCommands.repeatEveryMs} IS NULL
				AND ${scheduledCommands.attempts} >= ${scheduledCommands.maxAttempts}
				AND (${scheduledCommands.leaseUntil} IS NULL OR ${scheduledCommands.leaseUntil} < now())
				AND ${scheduledCommands.name} IN (${namesList})
		`)

		// Atomic claim: select due+unleased rows (skipping ones another process holds locked) and lease
		// them in one statement. The lease — not the lock — is what survives a crash mid-execution.
		// The claim ALSO counts the attempt (attempts + 1): incrementing only on a returned error
		// missed hard crashes (OOM mid-execute), which re-claimed at attempts=0 after every lease
		// expiry — an unbreakable crash loop with no dead-letter. `attempts` therefore means
		// "executions STARTED"; RETURNING yields the post-bump value.
		const result = await this.db.execute<ClaimedRow>(sql`
			WITH due AS (
				SELECT id FROM ${scheduledCommands}
				WHERE ${scheduledCommands.deadAt} IS NULL
					AND ${scheduledCommands.runAt} <= now()
					AND (${scheduledCommands.leaseUntil} IS NULL OR ${scheduledCommands.leaseUntil} < now())
					AND (${scheduledCommands.repeatEveryMs} IS NOT NULL OR ${scheduledCommands.attempts} < ${scheduledCommands.maxAttempts})
					AND ${scheduledCommands.name} IN (${namesList})
				ORDER BY ${scheduledCommands.runAt}
				LIMIT ${PostgresCommandQueue.BATCH_SIZE}
				FOR UPDATE SKIP LOCKED
			)
			UPDATE ${scheduledCommands} sc
			SET lease_until = now() + (${PostgresCommandQueue.LEASE_MS} * interval '1 millisecond'), attempts = sc.attempts + 1, updated_at = now()
			FROM due
			WHERE sc.id = due.id
			RETURNING sc.id, sc.name, sc.input, sc.attempts, sc.max_attempts, sc.repeat_every_ms
		`)
		return result.rows
	}

	private async runOne(row: ClaimedRow): Promise<void> {
		const handler = this.handlers.get(row.name)
		if (!handler) {
			// Claimed a name this process doesn't serve (shouldn't happen — the claim filters by our
			// names — but a release beats a stuck lease if registration raced).
			await this.db.update(scheduledCommands).set({ leaseUntil: null, updatedAt: new Date() }).where(eq(scheduledCommands.id, row.id))
			return
		}

		const tracer = trace.getTracer(Config.name)
		const span = tracer.startSpan(`process ${row.name}`, { root: true })
		span.setAttribute('queue.command', row.name)
		span.setAttribute('queue.operation', 'process')
		span.setAttribute('queue.driver', 'postgres')
		span.setAttribute('queue.job_id', row.id)
		// The claim already counted this execution — row.attempts IS the current attempt number.
		span.setAttribute('queue.attempt', row.attempts)

		await context.with(trace.setSpan(context.active(), span), async () => {
			const result = await tryCatchAsync(() => handler.execute(row.input))
			if (result.success) {
				span.setStatus({ code: SpanStatusCode.OK })
				await this.finalizeSuccess(row)
			} else {
				const err = result.error
				span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
				span.recordException(err)
				this.loggingService.error({
					content: { message: 'PostgresCommandQueue job failed', jobId: row.id, command: row.name, error: err.message },
				})
				await this.finalizeFailure(row)
			}
			span.end()
		})
	}

	private async finalizeSuccess(row: ClaimedRow): Promise<void> {
		if (row.repeat_every_ms != null) {
			// Repeatable: RE-ARM for the next interval instead of deleting.
			await this.db
				.update(scheduledCommands)
				.set({ runAt: new Date(Date.now() + row.repeat_every_ms), attempts: 0, leaseUntil: null, updatedAt: new Date() })
				.where(eq(scheduledCommands.id, row.id))
			return
		}
		// One-shot: consumed → gone (transient queue, mirrors the outbox's delete-on-dispatch).
		await this.db.delete(scheduledCommands).where(eq(scheduledCommands.id, row.id))
	}

	private async finalizeFailure(row: ClaimedRow): Promise<void> {
		if (row.repeat_every_ms != null) {
			// Repeatable sweeps are self-healing (the next interval re-scans) — re-arm, don't dead-letter.
			// attempts resets too: the claim bumps it per execution, and a sweep's budget is per-run.
			await this.db
				.update(scheduledCommands)
				.set({ runAt: new Date(Date.now() + row.repeat_every_ms), attempts: 0, leaseUntil: null, updatedAt: new Date() })
				.where(eq(scheduledCommands.id, row.id))
			return
		}
		// The claim already counted this execution — row.attempts is the attempt that just failed.
		if (row.attempts >= row.max_attempts) {
			// Dead-letter: keep the row (forensics/replay-by-hand), never re-claimed (dead_at filter).
			await this.db
				.update(scheduledCommands)
				.set({ deadAt: new Date(), leaseUntil: null, updatedAt: new Date() })
				.where(eq(scheduledCommands.id, row.id))
			return
		}
		// Exponential backoff, mirroring the BullMQ driver's default (1s base).
		const backoffMs = PostgresCommandQueue.BACKOFF_BASE_MS * 2 ** (row.attempts - 1)
		await this.db
			.update(scheduledCommands)
			.set({ runAt: new Date(Date.now() + backoffMs), leaseUntil: null, updatedAt: new Date() })
			.where(eq(scheduledCommands.id, row.id))
	}
}
