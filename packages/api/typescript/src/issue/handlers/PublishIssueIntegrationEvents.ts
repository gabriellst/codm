import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { IssueArchivedEvent as IssueArchivedIntegrationEvent, IssueStopResolvedEvent as IssueStopResolvedIntegrationEvent } from '@codedm/contracts-typescript/wire/events'
import { IssueArchivedEvent, IssueStopResolvedEvent } from '../events'

/**
 * Write-side bridge (EVT-02/03): BC5's control-plane facts → frozen integration events.
 *   issue.archived      → integration.issue.archived      (BC4 issue-list projections)
 *   issue.stop_resolved → integration.issue.stop_resolved (TAKE_OVER additionally pauses in BC4)
 */
@injectable()
export class PublishIssueIntegrationEvents extends EventHandler<readonly [typeof IssueArchivedEvent, typeof IssueStopResolvedEvent]> {
	readonly event = [IssueArchivedEvent, IssueStopResolvedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		if (event instanceof IssueArchivedEvent) {
			await this.mediator.publish(
				new IssueArchivedIntegrationEvent({
					ownerId,
					payload: { issueId: event.payload.issueId, threadId: event.payload.threadId, reason: event.payload.reason },
				}),
			)
			return
		}

		await this.mediator.publish(
			new IssueStopResolvedIntegrationEvent({
				ownerId,
				payload: { stopId: event.payload.stopId, issueId: event.payload.issueId, resolution: event.payload.resolution },
			}),
		)
	}
}
