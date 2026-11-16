import { injectable } from 'tsyringe-neo'

/** The handle of one running issue turn: its cancellation signal, and the call that unregisters it. */
export interface IssueTurnHandle {
	readonly signal: AbortSignal
	end(): void
}

/**
 * THE KILL SWITCH OF A RUNNING ISSUE TURN — what makes "pare" vale na hora (fase 2, item 2).
 *
 * `AgentRunRequest.signal` was honored by both runners (process-group kill) and created by nobody, so a
 * turn could only end on its own. This is the one place that holds an `AbortController` per issue whose
 * turn is in flight:
 *  - the mailbox dispatcher `begin`s it BEFORE it checks whether the issue is held, so a pause landing
 *    between that check and the spawn is not lost — the signal is already aborted when the turn starts;
 *  - `RunIssueTurn` reads the signal (`signalFor`) and hands it to the runner;
 *  - `AbortIssueTurnOnPause`, reacting to `issue.paused`, calls `abort`.
 *
 * IN MEMORY, one instance per process, and that is enough: the turn it kills lives in this process too.
 * It is an ACCELERATOR, never the hold itself — the `paused` flag is what the dispatcher and the tool
 * doors read, so a pause still holds if this never fires (handler late, daemon restarted).
 *
 * One live turn per issue is the dispatcher's own invariant (one lease per target); `end` only removes
 * the registration it created, so a late `end` from an abandoned turn cannot unregister its successor.
 */
@injectable()
export class IssueTurnAborter {
	private readonly running = new Map<string, AbortController>()

	begin(issueId: string): IssueTurnHandle {
		const controller = new AbortController()
		this.running.set(issueId, controller)
		return {
			signal: controller.signal,
			end: () => {
				if (this.running.get(issueId) === controller) this.running.delete(issueId)
			},
		}
	}

	/** The cancellation signal of the issue's running turn, when the dispatcher registered one. */
	signalFor(issueId: string): AbortSignal | undefined {
		return this.running.get(issueId)?.signal
	}

	/** Kill the issue's running turn. @returns whether there was one to kill. */
	abort(issueId: string): boolean {
		const controller = this.running.get(issueId)
		if (!controller) return false
		controller.abort()
		return true
	}
}
