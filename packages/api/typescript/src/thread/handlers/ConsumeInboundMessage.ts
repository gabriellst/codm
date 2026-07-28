import { injectable } from 'tsyringe-neo'
import { EventHandler, LoggingService } from '@codedm/core-typescript'
import { MessageType } from '@codedm/contracts-typescript/wire/enums'
// The IN-PROCESS materialization (wire/events/in-process): the same event, with `content` and
// `platformData` already joined into per-(platform, messageType) arms and every scalar still
// carrying its CONTRACT type. Binding to it is what lets this handler read `content?.text` instead
// of hand-parsing the slot — and what keeps `occurredAt` a `Date` for `IngestChannelMessage`.
import { ChannelMessageReceivedInProcessEvent } from '@codedm/contracts-typescript/wire/events'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { IngestChannelMessage } from '../usecases/IngestChannelMessage'
import { ClassifyMessage } from '../usecases/ClassifyMessage'

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
 *   3. Narrow the union slot by its DISCRIMINATOR — the arms arrive pre-joined from the generated
 *      in-process surface, so this is a `messageType` check and a field read, never a parse. A
 *      non-text message is recorded (consumed) and dropped with a log line.
 *   4. Ingest (buffer + transcript + gates) → and, when the sender may invoke, classify into an issue.
 *
 * Dedup is deliberately BEFORE ingestion so a duplicate never even reaches the transcript.
 */
@injectable()
export class ConsumeInboundMessage extends EventHandler<typeof ChannelMessageReceivedInProcessEvent> {
	readonly event = ChannelMessageReceivedInProcessEvent

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
		// The union LOCAL, kept whole: narrowing happens on `payload` so the arm — and with it the
		// `content` variant — stays correlated with the `messageType` guard below.
		const payload = event.payload
		const { channelId, messageId, remoteId, senderId, occurredAt } = payload

		// 1. DEDUP FIRST — exactly-once latch. A redelivery is a no-op.
		const firstDelivery = await this.consumed.claim({ ownerId, channelId, platformMessageId: messageId })
		if (!firstDelivery) return

		// 2. Route to the thread bound to this (channel, contact). Unattached contact → drop.
		const thread = await this.threads.findByChannelContact(channelId, remoteId)
		if (!thread) return

		// 3. Discriminator narrowing — no parse. `content` is `.optional()` on every arm, so this is
		// `string | undefined` by type; the `typeof` guard also covers the RUNTIME case the type cannot,
		// since nothing zod-parses an integration payload on the mediator path (the envelope is
		// `new Cls(input)`, not a validated parse). A gateway that emits `messageType: TEXT` with a
		// missing or non-string `text` — the whatsmeow mapper can, it fills `content.text` only when the
		// upstream field is non-nil — must drop here, exactly as the old per-variant `safeParse` did.
		// Without the `typeof`, a `null` would sail past an `=== undefined` check and become a
		// VALIDATION_ERROR thrown out of `IngestChannelMessage`, burning outbox attempts on a message
		// that is simply not for us.
		const text = payload.messageType === MessageType.TEXT ? payload.content?.text : undefined
		if (typeof text !== 'string') {
			this.logging.info({
				content: {
					message: 'inbound message dropped: not a text variant, or the text slot was absent (forward-compat passthrough)',
					channelId,
					messageId,
					platform: payload.platform,
					messageType: payload.messageType,
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
