import { injectable } from 'tsyringe-neo'
import { Handler, LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { DIGEST_WINDOW_MS } from '../utils/OutputPolicy'
import { FlushSignalDigest } from './FlushSignalDigest'

export const FlushOverdueDigestsInputSchema = z.object({
	/** The instant the sweep judges against — handed in (the core has no clock), so a test never sleeps. */
	now: z.date().optional(),
})
export const FlushOverdueDigestsOutputSchema = z.object({
	/** How many waiting signals this sweep sent. */
	flushed: z.number().int().nonnegative(),
})

/** How often the sweep runs — the digest is a 60-second window, so the worst case is a signal ~90 s late. */
export const FLUSH_OVERDUE_DIGESTS_INTERVAL_MS = 30 * 1000

/**
 * Past the window, how long the window's own flush (`flush_signal_digest`, scheduled with it) gets before the
 * sweep steps in — so the sweep never races the normal path, it only picks up what that path left behind.
 */
export const DIGEST_OVERDUE_GRACE_MS = 30 * 1000

/**
 * THE NET UNDER THE PER-PERSON DIGEST (fase 3, item 2) — no signal waits forever.
 *
 * The digest's normal path is one delayed `flush_signal_digest` per person per window. That command is a
 * timer, and a timer can miss: a signal of a window recorded while that window's flush was already running
 * (its job id still taken, so its own enqueue was a no-op) is read by nobody; a flush that burned its
 * attempts is dead-lettered with the signal still waiting. Either way the question or the feedback never
 * reached the group.
 *
 * The state that matters is already persisted — the entry itself, `routing = DIGEST` with no digest
 * carrying it — so this sweep (scheduler SCH-01/02: persisted state + a repeated sweep) reads it: every
 * person with a signal waiting longer than the window plus a grace is flushed. Flushing is idempotent (the
 * patch is conditional on the signal still waiting, `SIGNAL_ALREADY_FLUSHED` sends nothing), so the sweep
 * and a late normal flush can never both send. A restart forgets nothing: the next tick finds the same rows.
 * Each person in its own call, so one failure never holds the rest.
 */
@injectable()
export class FlushOverdueDigests extends Handler<typeof FlushOverdueDigestsInputSchema, typeof FlushOverdueDigestsOutputSchema> {
	readonly name = 'flush_overdue_digests' as const
	readonly inputSchema = FlushOverdueDigestsInputSchema
	readonly outputSchema = FlushOverdueDigestsOutputSchema

	/** The cadence, on the job it governs (T1.4). */
	static readonly repeat = { every: FLUSH_OVERDUE_DIGESTS_INTERVAL_MS }

	constructor(
		private readonly threads: ThreadRepository,
		private readonly flush: FlushSignalDigest,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const now = input.now ?? new Date()
		const cutoff = new Date(now.getTime() - DIGEST_WINDOW_MS - DIGEST_OVERDUE_GRACE_MS)
		let flushed = 0
		for (const overdue of await this.threads.overdueDigests(cutoff)) {
			const outcome = await tryCatchAsync(() => this.flush.execute(overdue))
			if (outcome.success) {
				flushed += outcome.data.flushed
				continue
			}
			this.logging.warn({
				content: {
					message: 'overdue digest not flushed — the next sweep tries again',
					threadId: overdue.threadId,
					reason: outcome.error.message,
				},
			})
		}
		return { flushed }
	}
}
