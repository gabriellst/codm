import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { IssueOpenedEvent, IssueCreatedEvent, IssueCompletedEvent } from '@codm/contracts-typescript/wire/events'
import { OpenIssue } from '../usecases/OpenIssue'
import { CompleteIssue } from '../usecases/CompleteIssue'

/**
 * BC5's read-side materialization from the terminal engine's EXECUTION facts (the engine owns these
 * frozen integration events; BC5 reacts to keep its Issue aggregate in sync):
 *   integration.issue.opened     → OpenIssue (materialize the aggregate, idempotent)
 *   integration.issue.created    → OpenIssue (same idempotent path — §6.2 reconciles both on one row)
 *   integration.issue.completed  → CompleteIssue (stamp COMPLETED + start the 24h clock)
 *
 * The stop fact left with the aggregate that owns it (B4, spec decision 4) — it is handled by
 * `thread/handlers/RecordStopFromExecution` now, and the swallow list for the disabled-criterion /
 * archived-issue cases went with it.
 */
@injectable()
export class MaterializeIssueFromExecution extends EventHandler<
	readonly [typeof IssueOpenedEvent, typeof IssueCreatedEvent, typeof IssueCompletedEvent]
> {
	readonly event = [IssueOpenedEvent, IssueCreatedEvent, IssueCompletedEvent] as const

	constructor(
		private readonly openIssue: OpenIssue,
		private readonly completeIssue: CompleteIssue,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		// THE FORK (§7.2) — an issue born because the operator asked for it, carrying the provenance the
		// finished answer will quote. Routed to the SAME idempotent use case as `issue.opened`: the two
		// paths can reconcile on one row (§6.2), and `OpenIssue` returns early when it already exists, so
		// whichever arrives second cannot clobber the first.
		if (event instanceof IssueCreatedEvent) {
			await this.openIssue.execute({
				issueId: event.payload.issueId,
				ownerId,
				threadId: event.payload.threadId,
				key: event.payload.key,
				title: event.payload.title,
				provider: event.payload.provider,
				originEntryId: event.payload.originEntryId,
				goal: event.payload.goal,
			})
			return
		}

		if (event instanceof IssueOpenedEvent) {
			await this.openIssue.execute({
				issueId: event.payload.issueId,
				ownerId,
				threadId: event.payload.threadId,
				key: event.payload.key,
				title: event.payload.title,
				provider: event.payload.provider,
			})
			return
		}

		if (event instanceof IssueCompletedEvent) {
			// The declared summary becomes the issue's `meta` — the console's answer to "why did it close?".
			await this.completeIssue.execute({ issueId: event.payload.issueId, meta: event.payload.summary })
			return
		}
	}
}
