import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { WorkspaceRemovedEvent as WorkspaceRemovedIntegrationEvent } from '@codedm/contracts-typescript/wire/events'
import { WorkspaceRemovedEvent } from '../events/WorkspaceRemovedEvent'

/**
 * Write-side bridge (EVT-02/03): the context-private `workspace.removed` fact is republished as the
 * FROZEN `integration.workspace.removed` so BC4/BC5 invalidate references. Only removal crosses —
 * additions never invalidate downstream refs, so there is no `workspace.added` integration event.
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
