import { ThreadStatus } from '@codedm/contracts-typescript/wire/enums'

/**
 * What a thread's operating status is DERIVED from. Deliberately three booleans and no database
 * handle: the rule is a precedence, and every read model already holds these facts from queries it
 * makes anyway.
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
 * `BrowserFrameEnricher` already knew this and derived its own status for the SSE frames, which left
 * the system with two answers to one question — the live frame said RUNNING while the REST read said
 * IDLE. This is the single definition both now use.
 *
 * Precedence, highest first: the operator's pause beats everything (they asked for silence); an open
 * stop beats work in flight (something is waiting on a human); work in flight beats nothing.
 */
export function deriveThreadStatus(facts: ThreadOperatingFacts): ThreadStatus {
	if (facts.paused) return ThreadStatus.PAUSED
	if (facts.hasOpenStop) return ThreadStatus.NEEDS_ATTENTION
	if (facts.hasWorkingIssue) return ThreadStatus.RUNNING
	return ThreadStatus.IDLE
}
