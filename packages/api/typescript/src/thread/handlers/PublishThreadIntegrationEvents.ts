import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codm/core-typescript'
import {
	ThreadAttachedEvent as ThreadAttachedIntegrationEvent,
	ThreadStopResolvedEvent as StopResolvedIntegrationEvent,
	ThreadMessageIngestedEvent,
} from '@codm/contracts-typescript/wire/events'
import { ThreadAttachedEvent } from '../events/ThreadAttachedEvent'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'
import { MessageIngestedEvent } from '../events/MessageIngestedEvent'

/**
 * The thread context's NAMED EXCEPTION (B3, decision 4): the ONE handler in this context authorized to
 * call `ExternalMediator.publish()`. Every other handler here is pure domain — it reacts and invokes
 * use cases, and never publishes integration events. Facts republished as their FROZEN contracts:
 *   thread.attached         → integration.thread.attached         (frozen fact; no TS consumer today —
 *                                                                  the browser SSE surface forwards it)
 *   thread.stop_resolved    → integration.thread.stop_resolved    (TAKE_OVER additionally pauses the thread)
 *   thread.message_ingested → integration.thread.message_ingested (B5, decision 1 — the only new branch)
 *
 * The stop branch arrived in B4 with the aggregate: `Thread.resolveStop` raises the fact, so this
 * context's publisher bridges it — it was `PublishIssueIntegrationEvents` while the Stop hung off
 * `Issue`.
 *
 * The message_ingested branch (B5) closes the threadId gap `integration.channel_message.received`
 * cannot: that wire fact is addressed by `(channelId, remoteId)` — a WhatsApp JID — never by `threadId`,
 * so a browser console had no way to scope a live chat update to one thread without a server-side
 * JOIN. That JOIN used to live in `BrowserFrameEnricher.threadIdForContact` (`browser.thread_message_ingested`),
 * removed in the same frente this branch belongs to. `IngestChannelMessage` already resolves the thread
 * and stamps `threadId` on `MessageIngestedEvent` — nobody republished it until now.
 *
 * The `thread.direct_message_sent` branch is GONE (B3, decision 3): it translated a fact into
 * `integration.channel.delivery_requested`, i.e. it used an event to COMMAND. The order is now a
 * durable `deliver_channel_message` command enqueued inside `SendDirectMessage`'s own transaction, and
 * the fact stays as an audit record with no consumer.
 */
@injectable()
export class PublishThreadIntegrationEvents extends EventHandler<
	readonly [typeof ThreadAttachedEvent, typeof ThreadStopResolvedEvent, typeof MessageIngestedEvent]
> {
	readonly event = [ThreadAttachedEvent, ThreadStopResolvedEvent, MessageIngestedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		if (event instanceof ThreadAttachedEvent) {
			await this.mediator.publish(new ThreadAttachedIntegrationEvent({ ownerId, payload: { ...event.payload } }))
			return
		}

		if (event instanceof MessageIngestedEvent) {
			await this.mediator.publish(new ThreadMessageIngestedEvent({ ownerId, payload: { threadId: event.payload.threadId } }))
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
