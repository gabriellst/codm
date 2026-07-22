import { injectable } from 'tsyringe-neo'
import { DrizzleClient } from '../../db'
import { outbox } from '@template/contracts/db'
import { InternalMediator, ExternalMediator } from '../Mediator'
import { OutboxDispatcher } from './OutboxDispatcher'
import { BaseEvent } from '../../types/BaseEvent'
import { BaseError } from '../../types/BaseError'
import type { BaseInfrastructureErrors } from '../../errors/codes'
import { eq, sql, inArray } from 'drizzle-orm'
import { tryCatchAsync } from '../../utils/TryCatch'
import { LoggingService } from '../Logging'

// ─── Configuration ───────────────────────────────────────────────────────────
const BATCH_SIZE = 50
const MAX_ATTEMPTS = 5
const OWNER_CONCURRENCY = 10

// Adaptive polling bounds
const POLL_MIN_MS = 100
const POLL_MAX_MS = 30_000
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
export class DrizzleOutboxDispatcher extends OutboxDispatcher {
	private timer: ReturnType<typeof setInterval> | null = null
	private isProcessing = false
	private stopping = false
	private pollIntervalMs = POLL_MIN_MS
	private lastProcessedCount = 0

	constructor(
		private db: DrizzleClient,
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
	 * Phase 1: Claim — Short DB transaction using FOR UPDATE SKIP LOCKED.
	 * Marks rows with processedAt so other workers skip them.
	 */
	private async claimBatch(): Promise<OwnerBatch[]> {
		const now = new Date()

		const claimed = await this.db.transaction(async tx => {
			const rows = await tx
				.select()
				.from(outbox)
				.where(sql`${outbox.processedAt} IS NULL AND ${outbox.attempts} < ${MAX_ATTEMPTS}`)
				.orderBy(outbox.ownerId, outbox.createdAt)
				.limit(BATCH_SIZE)
				.for('update', { skipLocked: true })

			if (rows.length === 0) return []

			const ids = rows.map(r => r.id)
			await tx.update(outbox).set({ processedAt: now }).where(inArray(outbox.id, ids))

			return rows
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
	 * Sequential within each tenant (preserves ordering), parallel across tenants.
	 * When a tenant event fails, remaining events for that tenant are skipped (not retried with incremented attempts).
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

				const result = await tryCatchAsync(async () => {
					const event = this.toBaseEvent(row.payload as Record<string, unknown>)
					// Integration events (name `integration.*`) cross bounded contexts / services — deliver
					// them via the ExternalMediator (in-process EventEmitter2 by default; RedisExternalMediator
					// once a product splits services). Domain events stay context-private on the InternalMediator.
					const mediator = event.name.startsWith('integration.') ? this.externalMediator : this.internalMediator
					await mediator.dispatch(event)
				})

				if (result.success) {
					succeeded.push(row.id)
				} else {
					failed.push({
						id: row.id,
						currentAttempts: row.attempts,
						error: String(result.error),
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
	 * Phase 3: Finalize — Short DB transaction.
	 * Delete succeeded rows, increment attempts on failed, release skipped for retry.
	 */
	private async finalize({ succeeded, failed, skipped }: DispatchResult): Promise<void> {
		await this.db.transaction(async tx => {
			// Delete successfully dispatched rows
			if (succeeded.length > 0) {
				await tx.delete(outbox).where(inArray(outbox.id, succeeded))
			}

			// Failed rows: increment attempts, dead-letter if max reached
			for (const fail of failed) {
				const newAttempts = fail.currentAttempts + 1
				await tx
					.update(outbox)
					.set({
						attempts: newAttempts,
						processedAt: newAttempts >= MAX_ATTEMPTS ? new Date() : null,
					})
					.where(eq(outbox.id, fail.id))

				this.loggingService.error({
					content: {
						message: 'Failed to dispatch outbox event',
						outboxId: fail.id,
						attempts: newAttempts,
						maxReached: newAttempts >= MAX_ATTEMPTS,
						error: fail.error,
					},
				})
			}

			// Skipped rows: release back for next cycle (clear processedAt, don't touch attempts)
			if (skipped.length > 0) {
				await tx.update(outbox).set({ processedAt: null }).where(inArray(outbox.id, skipped))
			}
		})
	}

	/**
	 * Full cycle: claim → process → finalize.
	 * Recurses to drain events produced by handlers.
	 */
	async flush(): Promise<void> {
		const ownerBatches = await this.claimBatch()
		if (ownerBatches.length === 0) {
			this.lastProcessedCount = 0
			return
		}

		this.lastProcessedCount = ownerBatches.reduce((sum, b) => sum + b.rows.length, 0)
		const result = await this.processEvents(ownerBatches)
		await this.finalize(result)

		// Recurse to drain events produced by handlers
		await this.flush()
	}

	/**
	 * Validates that a JSONB payload has the required BaseEvent shape.
	 * The outbox table is only written by BaseEvent.toJSON(), so the shape is guaranteed
	 * to contain name, id, time, and payload fields at runtime.
	 *
	 * Accepted deviation (cc-bp-04): The `as unknown as BaseEvent` cast is unavoidable because
	 * BaseEvent is an abstract class — JSONB deserialization produces plain objects, not class
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
