import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codm/core-typescript'
import { IssueArchivedEvent as IssueArchivedIntegrationEvent } from '@codm/contracts-typescript/wire/events'
import { IssueArchivedEvent } from '../events'

/**
 * Write-side bridge (EVT-02/03): BC5's control-plane facts → frozen integration events.
 *   issue.archived → integration.issue.archived (BC4 issue-list projections)
 *
 * `issue.stop_resolved` left in B4 (spec decision 4): the Stop is a child of `Thread`, the fact is
 * raised by `Thread.resolveStop`, and it is bridged by `PublishThreadIntegrationEvents`. The
 * subscription stays a readonly TUPLE with one member — this is the context's publisher, one per
 * CONTEXT by design, and collapsing it to a bare class would have to be undone by the next fact.
 */
@injectable()
export class PublishIssueIntegrationEvents extends EventHandler<readonly [typeof IssueArchivedEvent]> {
	readonly event = [IssueArchivedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		await this.mediator.publish(
			new IssueArchivedIntegrationEvent({
				ownerId,
				payload: { issueId: event.payload.issueId, threadId: event.payload.threadId, reason: event.payload.reason },
			}),
		)
	}
}
