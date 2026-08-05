import { injectable } from 'tsyringe-neo'
import { Handler, LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { Loop } from '../entities/Loop'
import { LoopRepository } from '../repositories/LoopRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { SteerThread } from './SteerThread'

export const FireDueLoopsInputSchema = z.object({})
export const FireDueLoopsOutputSchema = z.object({
	/** The loops that actually whispered this tick. */
	firedLoopIds: z.array(z.uuid()),
	/** The loops whose turn came and went — paused conversation, deleted conversation, or too late. */
	skippedLoopIds: z.array(z.uuid()),
})

/**
 * How many loops one tick may fire.
 *
 * A bound, not a target: the sweep runs every minute and a single owner's conversations rarely have
 * more than a handful of loops due at the same minute. It matters after DOWNTIME — a laptop that was
 * shut for a week comes back with every loop overdue at once, and draining them across ticks keeps one
 * transaction from spanning all of them.
 */
const BATCH_SIZE = 50

/** How often the sweep runs. `thread/index.ts` registers the repeatable job with this cadence. */
export const FIRE_DUE_LOOPS_INTERVAL_MS = 60 * 1000

/**
 * C25 FireDueLoops — the sweep that turns a schedule into a whisper.
 *
 * ### It is a JOB, not a timer
 * Registered as a repeatable command (`thread/index.ts` → `jobs`), so the alarm lives in
 * `shared_scheduled_commands` in the same SQLite file as the loops themselves. A `setInterval` would
 * forget everything a restart, and this product restarts every time the desktop shell does.
 *
 * ### What it delivers is a WHISPER, through `SteerThread`
 * Not a re-implementation of one. A loop is the operator steering the conversation on a timer, and
 * `SteerThread` already IS that intention: it records the WHISPER line on the aggregate and enqueues
 * the mailbox item that makes the orchestrator (or every active issue) actually read it. Composing the
 * use case — `execute(input, tx)`, in this loop's own transaction — is the sanctioned shape (UC-P16's
 * sibling rule for orchestrating child use cases) and is what keeps "a scheduled steer" and "a steer"
 * from drifting into two behaviours.
 *
 * ### Every loop gets its own transaction, and its own failure
 * One bad loop must not roll back the whisper another conversation already earned, and must not stop
 * the rest of the batch. A failed loop keeps its `next_run_at` (its transaction rolled back), so it is
 * still due on the next tick and retries naturally — until its own schedule calls the run stale,
 * which is exactly the right outcome for a loop that has been failing for an hour.
 */
@injectable()
export class FireDueLoops extends Handler<typeof FireDueLoopsInputSchema, typeof FireDueLoopsOutputSchema> {
	readonly name = 'fire_due_loops' as const
	readonly inputSchema = FireDueLoopsInputSchema
	readonly outputSchema = FireDueLoopsOutputSchema

	constructor(
		private readonly loops: LoopRepository,
		private readonly threads: ThreadRepository,
		private readonly steer: SteerThread,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(_input: this['input'], tx?: Transaction): Promise<this['output']> {
		const now = new Date()
		const due = await this.loops.findDue(now, BATCH_SIZE)

		const firedLoopIds: string[] = []
		const skippedLoopIds: string[] = []

		for (const loop of due) {
			const reason = await this.skipReason(loop, now)
			if (reason) {
				// The skip still has to COMMIT — a loop whose run is skipped without advancing would be due
				// again in a second, and again, forever, whispering nothing and sweeping everything.
				await this.withTransaction(tx, async tx => {
					loop.skipRun(now)
					await this.loops.save(loop, tx)
				})
				this.logging.warn({ content: { message: `loop run skipped — ${reason}`, loopId: loop.id.value, threadId: loop.threadId } })
				skippedLoopIds.push(loop.id.value)
				continue
			}

			const outcome = await tryCatchAsync(async () =>
				this.withTransaction(tx, async tx => {
					await this.steer.execute({ ownerId: loop.ownerId, threadId: loop.threadId, text: loop.prompt }, tx)
					loop.markFired(now)
					await this.loops.save(loop, tx)
				}),
			)

			if (!outcome.success) {
				// Logged and stepped over, never rethrown: the sweep's job is to fire every loop that CAN
				// fire this minute. Rethrowing would abandon the loops after this one in the batch.
				this.logging.error({
					content: {
						message: 'loop run failed — it stays due and retries on the next sweep',
						loopId: loop.id.value,
						threadId: loop.threadId,
						error: outcome.error.message,
					},
				})
				continue
			}
			firedLoopIds.push(loop.id.value)
		}

		return { firedLoopIds, skippedLoopIds }
	}

	/** Why this loop must NOT whisper right now — `undefined` when it should. */
	private async skipReason(loop: Loop, now: Date): Promise<string | undefined> {
		// WHETHER a late run is still worth making is the SCHEDULE's question, not this sweep's: an hour
		// late breaks a promise about a moment of the day, and means nothing at all to "a cada 15
		// minutos". Asking the value object is what keeps that difference in one place.
		if (loop.nextRunAt && loop.schedule.isRunStale(loop.nextRunAt, now)) return 'the run is older than the grace window'

		const thread = await this.threads.findById(loop.threadId)
		// The conversation was deleted. Its loops are KEPT (deletion is soft and re-attach revives the
		// same row — see the thread-deletion spec), they simply have nothing to whisper into meanwhile.
		if (!thread || thread.ownerId !== loop.ownerId || thread.deletedAt) return 'the conversation no longer exists'
		// Paused means the agents are silent and the operator is speaking for themselves. A whisper here
		// would queue a turn the pause exists to prevent.
		if (thread.paused) return 'the conversation is paused'

		return undefined
	}
}
