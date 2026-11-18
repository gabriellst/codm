import { BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import type { ApplicationErrors } from '../../errors'

/**
 * IS THIS ISSUE'S WORK HELD RIGHT NOW? — the ONE check behind "pausa como comando" (fase 2, item 2).
 *
 * Held means the issue itself is paused (`PauseIssue`) OR its whole conversation is (the console's
 * "pausar grupo", `Thread.pause`). Two consumers ask it, and they must never disagree:
 *  - the mailbox dispatcher, before running an issue turn — held ⇒ the item is deferred, no attempt spent;
 *  - the doors of the EXTERNAL tools an issue's run can call (SendDirectMessage, SendArtifact, RaiseStop,
 *    AskOperator) — held ⇒ ISSUE_PAUSED. Only a call made BY an issue's run is gated: the console
 *    operator and the orchestrator carry no acting issue and pass through, which is what keeps
 *    SendDirectMessage usable as the operator's own voice while a group is paused.
 *
 * A read service over the issue + thread rows (same shape as `thread/services/OpenIssuesReader`), owned
 * here because `paused` is this context's column; the thread half rides the declared `reads.thread`.
 * It FAILS CLOSED on a read error by letting it out — a guard that cannot read must not say "go ahead".
 */
export abstract class IssueHold {
	abstract isHeld(issueId: string, tx?: Transaction): Promise<boolean>

	/**
	 * The tool-door form: no acting issue (console, orchestrator) ⇒ nothing to check; a held one ⇒
	 * ISSUE_PAUSED, before the tool does anything visible.
	 */
	async assertNotHeld(actingIssueId: string | undefined, tx?: Transaction): Promise<void> {
		if (!actingIssueId) return
		if (await this.isHeld(actingIssueId, tx)) {
			throw new BaseError<ApplicationErrors>(
				'ISSUE_PAUSED',
				`issue ${actingIssueId} is paused — its external tools refuse until it is resumed`,
			)
		}
	}
}
