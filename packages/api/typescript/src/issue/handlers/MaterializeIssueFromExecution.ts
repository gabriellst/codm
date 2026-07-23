import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codedm/core-typescript'
import { IssueOpenedEvent, IssueCompletedEvent, IssueStopRaisedEvent } from '@codedm/contracts-typescript/wire/events'
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
	readonly [typeof IssueOpenedEvent, typeof IssueCompletedEvent, typeof IssueStopRaisedEvent]
> {
	readonly event = [IssueOpenedEvent, IssueCompletedEvent, IssueStopRaisedEvent] as const

	constructor(
		private readonly openIssue: OpenIssue,
		private readonly completeIssue: CompleteIssue,
		private readonly raiseStop: RaiseStop,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

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
			await this.completeIssue.execute({ issueId: event.payload.issueId })
			return
		}

		if (event instanceof IssueStopRaisedEvent) {
			try {
				await this.raiseStop.execute({
					stopId: event.payload.stopId || Id.value(),
					issueId: event.payload.issueId,
					kind: event.payload.kind,
					title: STOP_TITLES[event.payload.kind] ?? 'The agent needs you',
					detail: '',
				})
			} catch {
				// STOP_CRITERION_DISABLED / ISSUE_ARCHIVED / ISSUE_NOT_FOUND — the stop is simply not recorded.
			}
		}
	}
}
