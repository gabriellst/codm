import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { IssueHold } from '../services/IssueHold'
import { IssueResumedEvent } from '../events/IssueResumedEvent'

/**
 * `issue.resumed` → release the work the dispatcher held for this issue, so it continues NOW (fase 2,
 * item 2) instead of at the next hold re-check.
 *
 * Only while the issue is no longer held: a resumed issue whose conversation is still paused stays held
 * (`IssueHold`), and releasing its items would only have the dispatcher claim and defer them again.
 *
 * Releasing a deferred item the provider's usage limit parked is harmless — the dispatcher's own pause
 * gate claims nothing until the limit clears. The mailbox is a QUEUE, not another context's write model
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
			.filter(item => item.targetKind === MailboxTargetKind.ISSUE && item.targetId === issueId)
			.map(item => item.id)
		await this.mailbox.releaseDeferred(ids)
	}
}
