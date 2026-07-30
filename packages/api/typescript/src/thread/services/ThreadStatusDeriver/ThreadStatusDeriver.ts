import { ThreadStatus } from '@codedm/contracts-typescript/wire/enums'

/**
 * What a thread's operating status is DERIVED from. Deliberately three booleans and no database
 * handle: the rule is a precedence, and a caller that already holds these facts (the frame enricher,
 * which gathers them EXCLUDING the issue/stop the current event just resolved) can apply it directly.
 */
export interface ThreadOperatingFacts {
	/** The operator's own pause flag — `threads.paused`, the only part that is genuinely stored. */
	paused: boolean
	/** An unresolved stop on this thread. */
	hasOpenStop: boolean
	/** A non-archived issue in WORKING on this thread. */
	hasWorkingIssue: boolean
}

/**
 * A thread's operating status — DERIVED, never read from `threads.status`.
 *
 * ### Why the stored column cannot answer this
 * `threads.status` is written in exactly three places: `Thread.create()` → IDLE, `pause()` → PAUSED,
 * `resume()` → IDLE. (`setStatus` exists but has no caller.) Nothing stamps it when an issue starts
 * working or a stop is raised — so the column holds only IDLE or PAUSED, forever, and any consumer
 * filtering it for RUNNING or NEEDS_ATTENTION matches nothing, ever. That is precisely what emptied
 * the Home page's "Sessões ativas" block while the same page's headline said an agent was working:
 * the headline counts WORKING issues, the block filtered a column that never says RUNNING.
 *
 * Precedence, highest first: the operator's pause beats everything (they asked for silence); an open
 * stop beats work in flight (something is waiting on a human); work in flight beats nothing.
 *
 * ### Why this is a DI service and not the pure function it used to be (B4, spec decision 7)
 * The precedence was already centralized as `shared/services/threadStatus.ts`. What was NOT centralized
 * was the READING: each of the three call sites rewrote the same "is there an open stop / a working
 * issue" query, which is how the same question came to have two answers (the live SSE frame said RUNNING
 * while the REST read said IDLE). The seam owns both halves now — the reads, per-thread and batched per
 * owner, and the precedence — following the shape `ChannelConnectivity` already uses in this context.
 *
 * `derive` stays PUBLIC and concrete on the abstract class: it is language-level, not env-swapped, and
 * the one caller that cannot use the reads needs it. `BrowserFrameEnricher` computes its facts with an
 * EXCLUSION (the issue/stop the event being enriched just closed) so the frame reflects the transition
 * without waiting on a read-after-write; no read method can express that, so it gathers its own facts
 * and applies the precedence through here.
 */
export abstract class ThreadStatusDeriver {
	/** One thread. Three reads: the pause flag, an open stop, a WORKING non-archived issue. */
	abstract forThread(threadId: string): Promise<ThreadStatus>
	/**
	 * Every thread of an owner, batched — three queries total, not three per thread. The dashboard lists
	 * every conversation, and a per-thread call there would be an N+1 on the app's landing screen.
	 * Threads with no row in the stop/issue reads default to their pause flag.
	 */
	abstract forOwner(ownerId: string): Promise<Map<string, ThreadStatus>>

	/** The precedence itself, moved verbatim from `shared/services/threadStatus.ts`. */
	derive(facts: ThreadOperatingFacts): ThreadStatus {
		if (facts.paused) return ThreadStatus.PAUSED
		if (facts.hasOpenStop) return ThreadStatus.NEEDS_ATTENTION
		if (facts.hasWorkingIssue) return ThreadStatus.RUNNING
		return ThreadStatus.IDLE
	}
}
