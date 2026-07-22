import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codedm/core-typescript'
import { ChannelMessageReceivedEvent } from '@codedm/contracts-typescript/wire/events'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { IngestChannelMessage } from '../usecases/IngestChannelMessage'
import { ClassifyMessage } from '../usecases/ClassifyMessage'

/**
 * The BC4 inbound ingestion consumer (phase-6 HARD GATE). Subscribes to the gateway's
 * `integration.channel_message.received`, which is delivered AT LEAST ONCE.
 *
 *   1. DEDUP FIRST — `ConsumedMessageRepository.claim` does `INSERT ... ON CONFLICT DO NOTHING` on
 *      `UNIQUE(channelId, platformMessageId)`. A redelivery of the same platform message returns
 *      `false` and the whole handler is a NO-OP: no transcript entry, no classification, no side
 *      effect. This is what turns at-least-once delivery into exactly-once PROCESSING.
 *   2. Resolve the thread bound to (channel, contact); an inbound for an unattached contact is
 *      recorded (consumed) and dropped.
 *   3. Ingest (buffer + transcript + gates) → and, when the sender may invoke, classify into an issue.
 *
 * Dedup is deliberately BEFORE ingestion so a duplicate never even reaches the transcript.
 */
@injectable()
export class ConsumeInboundMessage extends EventHandler<typeof ChannelMessageReceivedEvent> {
	readonly event = ChannelMessageReceivedEvent

	constructor(
		private readonly consumed: ConsumedMessageRepository,
		private readonly threads: ThreadRepository,
		private readonly ingest: IngestChannelMessage,
		private readonly classify: ClassifyMessage,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''
		const { channelId, messageId, contactExternalId, senderExternalId, text, quotedEntryId, receivedAt } = event.payload

		// 1. DEDUP FIRST — exactly-once latch. A redelivery is a no-op.
		const firstDelivery = await this.consumed.claim({ ownerId, channelId, platformMessageId: messageId })
		if (!firstDelivery) return

		// 2. Route to the thread bound to this (channel, contact). Unattached contact → drop.
		const thread = await this.threads.findByChannelContact(channelId, contactExternalId)
		if (!thread) return

		// 3. Ingest (always buffers + transcribes) then classify if the gates let it through.
		const ingested = await this.ingest.execute({
			threadId: thread.id.value,
			senderExternalId,
			text,
			quotedEntryId,
			receivedAt,
		})

		if (ingested.invocable) {
			await this.classify.execute({ threadId: thread.id.value, entryId: ingested.entryId })
		}
	}
}
