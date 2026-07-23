import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { SenderIdentity } from '@codedm/contracts-typescript/wire/enums'
import {
	ThreadAttachedEvent as ThreadAttachedIntegrationEvent,
	MessageClassifiedEvent as MessageClassifiedIntegrationEvent,
	ChannelDeliveryRequestedEvent,
} from '@codedm/contracts-typescript/wire/events'
import { ThreadAttachedEvent } from '../events/ThreadAttachedEvent'
import { MessageClassifiedEvent } from '../events/MessageClassifiedEvent'
import { ClarificationRequestedEvent } from '../events/ClarificationRequestedEvent'
import { DirectMessageSentEvent } from '../events/DirectMessageSentEvent'

/**
 * Write-side bridge (EVT-02/03): BC4's context-private facts are republished as their FROZEN
 * integration events, born in `packages/contracts`:
 *   thread.attached            → integration.thread.attached            (frozen fact; NO consumer today — BC5 warm indexing is a pending cluster)
 *   thread.message_classified  → integration.message.classified        (BC4 → BC5 route into issue)
 *   thread.clarification_requested → integration.channel.delivery_requested (ROUTER — ask the question)
 *   thread.direct_message_sent → integration.channel.delivery_requested (OPERATOR — deliver as self)
 */
@injectable()
export class PublishThreadIntegrationEvents extends EventHandler<
	readonly [typeof ThreadAttachedEvent, typeof MessageClassifiedEvent, typeof ClarificationRequestedEvent, typeof DirectMessageSentEvent]
> {
	readonly event = [ThreadAttachedEvent, MessageClassifiedEvent, ClarificationRequestedEvent, DirectMessageSentEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		if (event instanceof ThreadAttachedEvent) {
			await this.mediator.publish(new ThreadAttachedIntegrationEvent({ ownerId, payload: { ...event.payload } }))
			return
		}

		if (event instanceof MessageClassifiedEvent) {
			await this.mediator.publish(
				new MessageClassifiedIntegrationEvent({
					ownerId,
					payload: {
						threadId: event.payload.threadId,
						entryId: event.payload.entryId,
						method: event.payload.method,
						issueId: event.payload.issueId,
					},
				}),
			)
			return
		}

		if (event instanceof ClarificationRequestedEvent) {
			await this.mediator.publish(
				new ChannelDeliveryRequestedEvent({
					ownerId,
					payload: {
						channelId: event.payload.channelId,
						contactExternalId: event.payload.contactExternalId,
						contactDisplayName: event.payload.contactDisplayName,
						contactKind: event.payload.contactKind,
						text: event.payload.question,
						senderIdentity: SenderIdentity.ROUTER,
					},
				}),
			)
			return
		}

		if (event instanceof DirectMessageSentEvent) {
			await this.mediator.publish(
				new ChannelDeliveryRequestedEvent({
					ownerId,
					payload: {
						channelId: event.payload.channelId,
						contactExternalId: event.payload.contactExternalId,
						contactDisplayName: event.payload.contactDisplayName,
						contactKind: event.payload.contactKind,
						text: event.payload.text,
						senderIdentity: SenderIdentity.OPERATOR,
					},
				}),
			)
		}
	}
}
