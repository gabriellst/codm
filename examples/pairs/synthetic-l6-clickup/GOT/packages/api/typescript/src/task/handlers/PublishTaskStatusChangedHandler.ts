import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@template/core-typescript'
import { TaskStatusChangedEvent as TaskStatusChangedIntegrationEvent } from '@template/contracts-typescript/wire/events'
import { TaskStatusChangedEvent } from '../events'

@injectable()
export class PublishTaskStatusChangedHandler extends EventHandler<typeof TaskStatusChangedEvent> {
	readonly event = TaskStatusChangedEvent

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? event.payload.workspaceId ?? ''
		await this.mediator.publish(
			new TaskStatusChangedIntegrationEvent({
				ownerId,
				payload: {
					workspaceId: event.payload.workspaceId,
					taskId: event.payload.taskId,
					fromStatus: event.payload.fromStatus,
					toStatus: event.payload.toStatus,
				},
			}),
		)
	}
}
