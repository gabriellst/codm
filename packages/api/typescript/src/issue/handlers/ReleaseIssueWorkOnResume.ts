import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { DEFER_RELEASE } from '@agent/objects'
import { IssueHold } from '../services/IssueHold'
import { IssueResumedEvent } from '../events/IssueResumedEvent'

/**
 * `issue.resumed` → release the work the dispatcher held for this issue, so it continues NOW (fase 2,
 * item 2) instead of at the next hold re-check.
 *
 * Only while the issue is no longer held: a resumed issue whose conversation is still paused stays held
 * (`IssueHold`), and releasing its items would only have the dispatcher claim and defer them again.
 *
 * Which deferrals a resume ends is the agent's declared table (`DEFER_RELEASE`, fase 5): the pause's own (`HOLD`) and
 * the provider's (`PROVIDER_LIMIT` — harmless, the dispatcher's pause gate claims nothing until the limit clears),
 * never a retry waiting its schedule (`RETRY` — resuming is no reason to spend the attempt early). The mailbox is a QUEUE, not another context's write model
 * (the stance `ResumeIssueOnStopResolved` documents), reached through the declared agent edge.
 */
@injectable()
export class ReleaseIssueWorkOnResume extends EventHandler<typeof IssueResumedEvent> {
	readonly event = IssueResumedEvent

	constructor(
		private readonly hold: IssueHold,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const { issueId } = event.payload
		if (await this.hold.isHeld(issueId)) return
		const ids = (await this.mailbox.deferred())
			.filter(item => item.targetKind === MailboxTargetKind.ISSUE && item.targetId === issueId && DEFER_RELEASE[item.cause].onIssueResume)
			.map(item => item.id)
		await this.mailbox.releaseDeferred(ids)
	}
}
