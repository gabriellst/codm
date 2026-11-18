import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { IssueTurnAborter } from '@agent/services/IssueTurnAborter'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { IssueTurnInterruptRequestedEvent } from '../events/IssueTurnInterruptRequestedEvent'

/**
 * "agora" → cut the issue's running turn, so the steer leads the next one (fase 2, item 4).
 *
 * The steer item is already queued (same transaction as the entry); this only makes the queue hand it
 * over now instead of when the turn would have ended. The cut turn persists no conclusion (no
 * ISSUE_RESULT, no stop) but keeps its session, and the steer's turn resumes it (`RunIssueTurn`).
 *
 * Nothing to cut — the issue has no work waiting any more, the turn already ended, or the one running is
 * the steer's own (`interrupt` spares the turn carrying `entryId`) — is a no-op. Same shape as
 * `issue/handlers/AbortIssueTurnOnPause`: the owner of the fact reacts in its own context and commands
 * the agent's turn runtime through a declared edge (`thread → agent`, services surface).
 */
@injectable()
export class InterruptIssueTurnOnSteer extends EventHandler<typeof IssueTurnInterruptRequestedEvent> {
	readonly event = IssueTurnInterruptRequestedEvent

	constructor(
		private readonly aborter: IssueTurnAborter,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const { issueId, entryId } = event.payload
		// RE-READ before cutting, like `AbortIssueTurnOnPause`: the cut only makes sense while the steer is
		// still WAITING. Once it was claimed (its own turn — spared below anyway) or consumed, a late or
		// redelivered fact would otherwise cut some later, unrelated turn that nobody asked to stop.
		if (!(await this.mailbox.hasPending(MailboxTargetKind.ISSUE, issueId))) return
		this.aborter.interrupt(issueId, entryId)
	}
}
