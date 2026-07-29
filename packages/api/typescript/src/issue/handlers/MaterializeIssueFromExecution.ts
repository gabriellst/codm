import { injectable } from 'tsyringe-neo'
import { BaseError, EventHandler } from '@codedm/core-typescript'
import { IssueOpenedEvent, IssueCreatedEvent, IssueCompletedEvent, IssueStopRaisedEvent } from '@codedm/contracts-typescript/wire/events'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { Id } from '@codedm/core-typescript'
import { OpenIssue } from '../usecases/OpenIssue'
import { CompleteIssue } from '../usecases/CompleteIssue'
import { RaiseStop } from '../usecases/RaiseStop'

const STOP_TITLES: Record<StopKind, string> = {
	[StopKind.SERVER_ERROR]: 'Server error — the agent hit an API limit or outage',
	[StopKind.BLOCKED_BY_CLASSIFICATION]: 'Reply blocked by classification',
	[StopKind.HUMAN_REQUESTED]: 'A participant asked for a human',
	[StopKind.APPROVAL_NEEDED]: 'An action needs your approval',
	[StopKind.AUTH_REQUIRED]: 'The agent CLI needs you to sign in again',
}

/**
 * BC5's read-side materialization from the terminal engine's EXECUTION facts (the engine owns
 * these frozen integration events; BC5 reacts to keep its Issue aggregate + stops in sync):
 *   integration.issue.opened     → OpenIssue (materialize the aggregate, idempotent)
 *   integration.issue.completed  → CompleteIssue (stamp COMPLETED + start the 24h clock)
 *   integration.issue.stop_raised→ RaiseStop (record the stop IF the criterion is enabled)
 * The disabled-criterion / archived-issue cases are swallowed here (a no-op), not surfaced.
 */
@injectable()
export class MaterializeIssueFromExecution extends EventHandler<
	readonly [typeof IssueOpenedEvent, typeof IssueCreatedEvent, typeof IssueCompletedEvent, typeof IssueStopRaisedEvent]
> {
	readonly event = [IssueOpenedEvent, IssueCreatedEvent, IssueCompletedEvent, IssueStopRaisedEvent] as const

	constructor(
		private readonly openIssue: OpenIssue,
		private readonly completeIssue: CompleteIssue,
		private readonly raiseStop: RaiseStop,
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

		if (event instanceof IssueStopRaisedEvent) {
			try {
				// `detail` is the agent's OWN words, additive on the frozen event since Fase 6 (§4.4 item
				// (i)) — before it existed this was hardcoded `''` and every Needs-you card rendered the
				// generic `STOP_TITLES` line with no body.
				//
				// HUMAN_REQUESTED is the one kind whose title is the text: it is what `AskOperator` raises,
				// and the operator needs to read the QUESTION on the card, not "A participant asked for a
				// human". The other four keep the generic title, which describes a condition rather than a
				// sentence somebody wrote. Empty `detail` falls back so a producer that carries no text
				// still renders something.
				const detail = event.payload.detail
				const title =
					event.payload.kind === StopKind.HUMAN_REQUESTED && detail.length > 0
						? detail
						: (STOP_TITLES[event.payload.kind] ?? 'The agent needs you')
				await this.raiseStop.execute({
					stopId: event.payload.stopId || Id.value(),
					issueId: event.payload.issueId,
					kind: event.payload.kind,
					title,
					detail,
				})
			} catch (error) {
				// ONLY the sanctioned no-op outcomes are swallowed (the stop is simply not recorded).
				// Anything else — a DB outage included — must rethrow so the outbox retries instead of
				// silently eating the needs-you signal.
				const swallowed: readonly string[] = ['STOP_CRITERION_DISABLED', 'ISSUE_ARCHIVED', 'ISSUE_NOT_FOUND']
				if (error instanceof BaseError && swallowed.includes(error.name)) return
				throw error
			}
		}
	}
}
