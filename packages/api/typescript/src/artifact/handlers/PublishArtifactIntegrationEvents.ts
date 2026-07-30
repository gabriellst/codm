import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codm/core-typescript'
import { ArtifactRecordedEvent as ArtifactRecordedIntegrationEvent } from '@codm/contracts-typescript/wire/events'
import { ArtifactRecordedEvent } from '../events'

/** Write-side bridge: `artifact.recorded` → frozen `integration.artifact.recorded` (dashboard SSE). */
@injectable()
export class PublishArtifactIntegrationEvents extends EventHandler<readonly [typeof ArtifactRecordedEvent]> {
	readonly event = [ArtifactRecordedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		await this.mediator.publish(
			new ArtifactRecordedIntegrationEvent({
				ownerId: event.ownerId ?? '',
				payload: {
					artifactId: event.payload.artifactId,
					threadId: event.payload.threadId,
					issueId: event.payload.issueId,
					kind: event.payload.kind,
					artifactName: event.payload.name,
				},
			}),
		)
	}
}
