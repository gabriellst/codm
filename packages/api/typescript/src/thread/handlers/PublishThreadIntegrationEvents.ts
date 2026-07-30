import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import {
	ThreadAttachedEvent as ThreadAttachedIntegrationEvent,
	ThreadStopResolvedEvent as StopResolvedIntegrationEvent,
} from '@codedm/contracts-typescript/wire/events'
import { ThreadAttachedEvent } from '../events/ThreadAttachedEvent'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'

/**
 * The thread context's NAMED EXCEPTION (B3, decision 4): the ONE handler in this context authorized to
 * call `ExternalMediator.publish()`. Every other handler here is pure domain — it reacts and invokes
 * use cases, and never publishes integration events. Facts republished as their FROZEN contracts:
 *   thread.attached      → integration.thread.attached        (frozen fact; no TS consumer today — the
 *                                                              browser SSE surface forwards it)
 *   thread.stop_resolved → integration.thread.stop_resolved   (TAKE_OVER additionally pauses the thread)
 *
 * The stop branch arrived in B4 with the aggregate: `Thread.resolveStop` raises the fact, so this
 * context's publisher bridges it — it was `PublishIssueIntegrationEvents` while the Stop hung off
 * `Issue`.
 *
 * The `thread.direct_message_sent` branch is GONE (B3, decision 3): it translated a fact into
 * `integration.channel.delivery_requested`, i.e. it used an event to COMMAND. The order is now a
 * durable `deliver_channel_message` command enqueued inside `SendDirectMessage`'s own transaction, and
 * the fact stays as an audit record with no consumer.
 */
@injectable()
export class PublishThreadIntegrationEvents extends EventHandler<readonly [typeof ThreadAttachedEvent, typeof ThreadStopResolvedEvent]> {
	readonly event = [ThreadAttachedEvent, ThreadStopResolvedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		if (event instanceof ThreadAttachedEvent) {
			await this.mediator.publish(new ThreadAttachedIntegrationEvent({ ownerId, payload: { ...event.payload } }))
			return
		}

		await this.mediator.publish(
			new StopResolvedIntegrationEvent({
				ownerId,
				payload: {
					stopId: event.payload.stopId,
					issueId: event.payload.issueId,
					threadId: event.payload.threadId,
					resolution: event.payload.resolution,
				},
			}),
		)
	}
}
