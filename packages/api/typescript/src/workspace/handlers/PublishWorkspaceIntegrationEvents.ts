import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codm/core-typescript'
import { WorkspaceRemovedEvent as WorkspaceRemovedIntegrationEvent } from '@codm/contracts-typescript/wire/events'
import { WorkspaceRemovedEvent } from '../events/WorkspaceRemovedEvent'

/**
 * Write-side bridge (EVT-02/03): the context-private `workspace.removed` fact is republished as the
 * FROZEN `integration.workspace.removed`. NO consumer subscribes today — the detach/workspace-
 * invalidation reactions are the pending C15 cluster; the fact is published because it is contract
 * (frozen wire), not because a reaction exists. Only removal crosses — additions never invalidate
 * downstream refs, so there is no `workspace.added` integration event.
 */
@injectable()
export class PublishWorkspaceIntegrationEvents extends EventHandler<readonly [typeof WorkspaceRemovedEvent]> {
	readonly event = [WorkspaceRemovedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		await this.mediator.publish(
			new WorkspaceRemovedIntegrationEvent({
				ownerId: event.ownerId ?? '',
				payload: { workspaceId: event.payload.workspaceId, path: event.payload.path },
			}),
		)
	}
}
