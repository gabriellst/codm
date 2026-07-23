import { injectable } from 'tsyringe-neo'
import { EventHandler, LoggingService } from '@codedm/core-typescript'
import { MessageType } from '@codedm/contracts-typescript/wire/enums'
import { ChannelMessageReceivedEvent } from '@codedm/contracts-typescript/wire/events'
// Generated zod schemas from the OWNER service's client subpath (types/schemas ONLY — never the
// HTTP client): the only way this workspace knows the union variant shapes (union-slots spec §2.3).
import { internalTextContentSchema, whatsAppTextContentSchema } from '@codedm/client-typescript/go'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { IngestChannelMessage } from '../usecases/IngestChannelMessage'
import { ClassifyMessage } from '../usecases/ClassifyMessage'

type InboundPayload = InstanceType<typeof ChannelMessageReceivedEvent>['payload']

/**
 * Opportunistic union-slot narrowing (union-slots spec §2.5): this consumer reads ONLY the
 * TEXT content variants it ingests (WHATSAPP/TEXT, INTERNAL/TEXT), validating with the
 * generated schemas from the owner's client. Every other (platform, messageType) pair —
 * including discriminator values this build does not know — is treated as an opaque slot:
 * the message is still claimed (dedup ledger) and then dropped, never rejected, so new
 * variants can ship on the gateway without breaking this consumer.
 */
export function extractInboundText(payload: Pick<InboundPayload, 'platform' | 'messageType' | 'content'>): string | undefined {
	if (payload.messageType !== MessageType.TEXT) return undefined
	if (payload.platform === 'WHATSAPP') {
		const parsed = whatsAppTextContentSchema.safeParse(payload.content)
		return parsed.success ? parsed.data.text : undefined
	}
	if (payload.platform === 'INTERNAL') {
		const parsed = internalTextContentSchema.safeParse(payload.content)
		return parsed.success ? parsed.data.text : undefined
	}
	return undefined
}

/**
 * The BC4 inbound ingestion consumer (phase-6 HARD GATE). Subscribes to the gateway's
 * `integration.channel_message.received` — since the union-slots pilot, the VERBATIM gateway
 * payload (remoteId/senderId + opaque `content`/`platformData` slots) — delivered AT LEAST ONCE.
 *
 *   1. DEDUP FIRST — `ConsumedMessageRepository.claim` does `INSERT ... ON CONFLICT DO NOTHING` on
 *      `UNIQUE(channelId, platformMessageId)`. A redelivery of the same platform message returns
 *      `false` and the whole handler is a NO-OP: no transcript entry, no classification, no side
 *      effect. This is what turns at-least-once delivery into exactly-once PROCESSING.
 *   2. Resolve the thread bound to (channel, contact); an inbound for an unattached contact is
 *      recorded (consumed) and dropped.
 *   3. Narrow the `content` slot opportunistically (see `extractInboundText`) — a non-text or
 *      unknown-variant message is recorded (consumed) and dropped with a log line.
 *   4. Ingest (buffer + transcript + gates) → and, when the sender may invoke, classify into an issue.
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
		private readonly logging: LoggingService,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''
		const { channelId, messageId, remoteId, senderId, occurredAt } = event.payload

		// 1. DEDUP FIRST — exactly-once latch. A redelivery is a no-op.
		const firstDelivery = await this.consumed.claim({ ownerId, channelId, platformMessageId: messageId })
		if (!firstDelivery) return

		// 2. Route to the thread bound to this (channel, contact). Unattached contact → drop.
		const thread = await this.threads.findByChannelContact(channelId, remoteId)
		if (!thread) return

		// 3. Opportunistic slot narrowing — unknown variant → opaque passthrough (log + drop).
		const text = extractInboundText(event.payload)
		if (text === undefined) {
			this.logging.info({
				content: {
					message: 'inbound message dropped: content slot not a known text variant (forward-compat passthrough)',
					channelId,
					messageId,
					platform: event.payload.platform,
					messageType: event.payload.messageType,
				},
			})
			return
		}

		// 4. Ingest (always buffers + transcribes) then classify if the gates let it through.
		const ingested = await this.ingest.execute({
			threadId: thread.id.value,
			senderExternalId: senderId,
			text,
			receivedAt: occurredAt,
		})

		if (ingested.invocable) {
			await this.classify.execute({ threadId: thread.id.value, entryId: ingested.entryId })
		}
	}
}
