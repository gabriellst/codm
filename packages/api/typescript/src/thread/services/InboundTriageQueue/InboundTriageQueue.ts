import { injectable } from 'tsyringe-neo'
import { LoggingService } from '@codm/core-typescript'

/**
 * How many triages run at once on this machine. Each one spawns a provider CLI on the small model, so this
 * bounds processes, not messages: a burst beyond it waits here (in memory) while the orchestrator's items
 * stay HELD in the mailbox — and a wait longer than the hold simply hands the message to the orchestrator.
 */
export const MAX_CONCURRENT_TRIAGES = 4

/** One message to triage: which one (for the log), and the work — `TriageChannelMessage.execute` for it. */
export interface TriageJob {
	threadId: string
	entryId: string
	/**
	 * The triage itself, as a thunk handed in by the caller. The pool is not a handler and nothing binds
	 * it to a container, so it never resolves a use case itself: the caller (`ConsumeInboundMessage`, a
	 * bound handler) passes its own bound `TriageChannelMessage` — the shape that keeps the use case able
	 * to open its transaction.
	 */
	run: () => Promise<unknown>
}

/**
 * THE PARALLEL TRIAGE'S POOL (fase 2) — a bounded in-process pool, not a mailbox lane.
 *
 * ### Why not a lane
 * A `TRIAGE` target kind would cost a contract enum, a CHECK-constraint table rebuild, and Go/SDK regen,
 * and it would still need the orchestrator's item to wait for it. The item the ingest already writes
 * carries the durability instead: it is enqueued HELD (`EnqueueMailboxItem.hold`) in the ingest's own
 * transaction, so a message can never be lost by this pool — a crash, a full pool or a slow model all end
 * the same way: the hold lapses (or the boot sweep frees it) and the orchestrator answers, as before.
 *
 * ### What it guarantees
 * At most `MAX_CONCURRENT_TRIAGES` in flight, FIFO beyond that, and NEVER a rejection: a submitted job is
 * fire-and-forget for its caller (an event handler that must not wait seconds for a model), so every
 * failure is logged here and the held item takes care of itself. `idle()` lets a test (or a shutdown)
 * wait for what is in flight.
 *
 * A singleton per process (`registry.ts`) — the pool IS the shared state.
 */
@injectable()
export class InboundTriageQueue {
	private running = 0
	private readonly waiting: TriageJob[] = []
	private readonly settled = new Set<() => void>()
	protected maxConcurrent = MAX_CONCURRENT_TRIAGES

	constructor(private readonly logging: LoggingService) {}

	/** Queue one message. Returns at once; never throws. */
	submit(job: TriageJob): void {
		this.waiting.push(job)
		this.pump()
	}

	/** Resolves when nothing is running or waiting. */
	async idle(): Promise<void> {
		if (this.running === 0 && this.waiting.length === 0) return
		await new Promise<void>(resolve => this.settled.add(resolve))
	}

	private pump(): void {
		while (this.running < this.maxConcurrent && this.waiting.length > 0) {
			const job = this.waiting.shift()
			if (!job) break
			this.running += 1
			void this.run(job).finally(() => {
				this.running -= 1
				this.pump()
				if (this.running === 0 && this.waiting.length === 0) {
					for (const resolve of this.settled) resolve()
					this.settled.clear()
				}
			})
		}
	}

	private async run(job: TriageJob): Promise<void> {
		try {
			await job.run()
		} catch (error) {
			// The held item is the safety net: it lapses into the orchestrator's queue on its own.
			this.logging.warn({
				content: {
					message: 'triage did not settle — the held item falls to the orchestrator',
					threadId: job.threadId,
					entryId: job.entryId,
					error: error instanceof Error ? error.message : String(error),
				},
			})
		}
	}
}
