import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { ThreadAttachedEvent as ThreadAttachedIntegrationEvent } from '@codedm/contracts-typescript/wire/events'
import { ThreadAttachedEvent } from '../events/ThreadAttachedEvent'

/**
 * The thread context's NAMED EXCEPTION (B3, decision 4): the ONE handler in this context authorized to
 * call `ExternalMediator.publish()`. Every other handler here is pure domain — it reacts and invokes
 * use cases, and never publishes integration events. Facts republished as their FROZEN contracts:
 *   thread.attached → integration.thread.attached   (frozen fact; no TS consumer today — the browser
 *                                                    SSE surface forwards it, BC5 warm indexing is pending)
 *
 * The `thread.direct_message_sent` branch is GONE (decision 3): it translated a fact into
 * `integration.channel.delivery_requested`, i.e. it used an event to COMMAND. The order is now a
 * durable `deliver_channel_message` command enqueued inside `SendDirectMessage`'s own transaction, and
 * the fact stays as an audit record with no consumer.
 *
 * The subscription stays a readonly TUPLE rather than collapsing to a single class: this is the
 * context's publisher, one per CONTEXT by design, and B5 adds the next fact to it.
 */
@injectable()
export class PublishThreadIntegrationEvents extends EventHandler<readonly [typeof ThreadAttachedEvent]> {
	readonly event = [ThreadAttachedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		if (event instanceof ThreadAttachedEvent) {
			await this.mediator.publish(new ThreadAttachedIntegrationEvent({ ownerId, payload: { ...event.payload } }))
		}
	}
}
