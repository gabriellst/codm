import { injectable } from 'tsyringe-neo'
import { TurnAbortReason } from '../../enums/TurnAbortReason'

/** The handle of one running issue turn: its cancellation signal, and the call that unregisters it. */
export interface IssueTurnHandle {
	readonly signal: AbortSignal
	end(): void
}

interface RunningTurn {
	controller: AbortController
	/** The transcript entry the running turn's item carries (a routed steer), when it carries one. */
	carrying: string | undefined
	/** The completion declared during this turn answers `carrying` — the closing is that person's reply. */
	answeredByClosing: boolean
}

/**
 * Why `signal` was aborted. An abort with no reason of ours (or none at all) reads as a PAUSE: holding
 * the work is the conservative reading — nothing is persisted and the item comes back.
 */
export const abortReasonOf = (signal: AbortSignal): TurnAbortReason =>
	signal.reason === TurnAbortReason.INTERRUPT ? TurnAbortReason.INTERRUPT : TurnAbortReason.PAUSE

/**
 * THE KILL SWITCH OF A RUNNING ISSUE TURN — what makes "pare" (fase 2, item 2) and "agora" (item 4)
 * vale na hora.
 *
 * `AgentRunRequest.signal` was honored by both runners (process-group kill) and created by nobody, so a
 * turn could only end on its own. This is the one place that holds an `AbortController` per issue whose
 * turn is in flight:
 *  - the mailbox dispatcher `begin`s it BEFORE it checks whether the issue is held, so a pause landing
 *    between that check and the spawn is not lost — the signal is already aborted when the turn starts;
 *  - `RunIssueTurn` reads the signal (`signalFor`) and hands it to the runner;
 *  - `AbortIssueTurnOnPause`, reacting to `issue.paused`, calls `abort` (reason `PAUSE`);
 *  - `InterruptIssueTurnOnSteer`, reacting to an "agora" steer, calls `interrupt` (reason `INTERRUPT`);
 *  - `DeclareIssueComplete` asks which person's message the running turn answers (`answerWithClosing`), and
 *    `RunIssueTurn` reads at its end whether the closing already answered it (`answeredByClosing`).
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
	private readonly running = new Map<string, RunningTurn>()

	/** @param carrying the transcript entry the turn's item came from, so an "agora" never kills its own turn. */
	begin(issueId: string, carrying?: string): IssueTurnHandle {
		const controller = new AbortController()
		this.running.set(issueId, { controller, carrying, answeredByClosing: false })
		return {
			signal: controller.signal,
			end: () => {
				if (this.running.get(issueId)?.controller === controller) this.running.delete(issueId)
			},
		}
	}

	/** The cancellation signal of the issue's running turn, when the dispatcher registered one. */
	signalFor(issueId: string): AbortSignal | undefined {
		return this.running.get(issueId)?.controller.signal
	}

	/** Kill the issue's running turn because it was PAUSED. @returns whether there was one to kill. */
	abort(issueId: string): boolean {
		const turn = this.running.get(issueId)
		if (!turn) return false
		turn.controller.abort(TurnAbortReason.PAUSE)
		return true
	}

	/**
	 * ONE MESSAGE FOR A TURN THAT ANSWERS A PERSON AND FINISHES THE TASK (fase 3) — the completion declared
	 * during a running turn that carries a routed steer takes that person's message as the one its closing
	 * answers. Returns the entry (the closing quotes it), or `undefined` when the issue's running turn carries
	 * none — then the closing quotes the request, as always. The turn reads it back at its end
	 * (`answeredByClosing`) and does not send its own reply as well: one message, not two.
	 *
	 * In memory like the rest of this class, and that is enough: a turn and the tool call it makes live in this
	 * process. Lost on a restart, the worst case is the old one — the closing AND the reply.
	 */
	answerWithClosing(issueId: string): string | undefined {
		const turn = this.running.get(issueId)
		if (!turn?.carrying) return undefined
		turn.answeredByClosing = true
		return turn.carrying
	}

	/** Whether the closing already answered `entryId` for the issue's running turn (see `answerWithClosing`). */
	answeredByClosing(issueId: string, entryId: string): boolean {
		const turn = this.running.get(issueId)
		return turn?.carrying === entryId && turn.answeredByClosing
	}

	/**
	 * Kill the issue's running turn so the steer from `entryId` can lead the next one ("agora").
	 *
	 * SPARES the turn that is already carrying that steer: the fact reaches here through the outbox, and
	 * by then the turn it wanted to cut may have ended on its own and the steer's OWN turn be running —
	 * killing that one would interrupt the very message that asked for the interruption.
	 *
	 * @returns whether a turn was interrupted.
	 */
	interrupt(issueId: string, entryId: string): boolean {
		const turn = this.running.get(issueId)
		if (!turn || turn.carrying === entryId || turn.controller.signal.aborted) return false
		turn.controller.abort(TurnAbortReason.INTERRUPT)
		return true
	}
}
