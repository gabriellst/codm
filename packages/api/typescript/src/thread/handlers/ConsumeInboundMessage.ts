import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codedm/core-typescript'
import { MessageType } from '@codedm/contracts-typescript/wire/enums'
// The IN-PROCESS materialization (wire/events/in-process): the same event, with `content` and
// `platformData` already joined into per-(platform, messageType) arms and every scalar still
// carrying its CONTRACT type. Binding to it is what lets this handler read `content?.text` instead
// of hand-parsing the slot — and what keeps `occurredAt` a `Date` for `IngestChannelMessage`.
import { ChannelMessageReceivedInProcessEvent } from '@codedm/contracts-typescript/wire/events'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { OPERATOR_PARTICIPANT_ID } from '../entities/Thread'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { IngestChannelMessage } from '../usecases/IngestChannelMessage'

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
 *      non-text message is recorded (consumed) and dropped.
 *   4. Resolve a reply-quote (`contextInfo.stanzaId` → our `entryId`) through the consumed ledger.
 *   5. Ingest (buffer + transcript + gates) → and, when the sender may invoke, classify into an issue.
 *   6. Close the ledger row with the entry it produced, so THIS message becomes quotable in turn.
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
		// `string | undefined` by type; the falsy guard also covers the RUNTIME case the type cannot,
		// since nothing zod-parses an integration payload on the mediator path (the envelope is
		// `new Cls(input)`, not a validated parse). A gateway that emits `messageType: TEXT` with a
		// missing, null or empty `text` — the whatsmeow mapper can, it fills `content.text` only when the
		// upstream field is non-nil — must drop here, exactly as the old per-variant `safeParse` did.
		// Without it, a `null` would reach `IngestChannelMessage` and become a thrown VALIDATION_ERROR,
		// burning outbox attempts on a message that is simply not for us.
		if (payload.messageType !== MessageType.TEXT) {
			return
		}

		const text = payload.content?.text

		if (!text) {
			return
		}

		// 4. RESOLVE THE REPLY-QUOTE, if the sender made one.
		//
		// WhatsApp reports it as `contextInfo.stanzaId` — the PLATFORM id of the quoted message — and the
		// router's shortcut needs our own `entryId`. The consumed ledger is exactly that map
		// (`UNIQUE(channelId, platformMessageId)` → `entryId`); its columns have existed since the table
		// was written and were never filled, which is why the shortcut documented as "authoritative,
		// wins over context matching, NO model call" has never fired outside the test ingress.
		//
		// A quote we cannot resolve is not an error: it points at a message from before this thread was
		// attached, or at one we dropped. It degrades to no quote, and classification proceeds normally.
		// Narrowed on PLATFORM, and the compiler insists: `contextInfo` exists on the WhatsApp text
		// variant and not on the INTERNAL one, because a quote is a WhatsApp concept. That is the
		// in-process union earning its keep — the old opaque slot would have needed a cast here.
		const stanzaId = payload.platform === 'WHATSAPP' ? payload.content?.contextInfo?.stanzaId : undefined
		const quoted = stanzaId ? await this.consumed.findEntry(channelId, stanzaId) : undefined

		// 5. Ingest — buffers, transcribes, and (when invocable) queues the orchestrator turn atomically.
		//
		// A message the owner typed is attributed to the OPERATOR roster id, not to their phone-number
		// JID. The gateway's group snapshot enumerates every participant with no self filter, so the
		// owner's own JID sits in the roster with `canInvoke: false` — and that check fires BEFORE the
		// mention gate, which would silently mute the owner in their own group. `fromMe` is the fact
		// that decides it; `author` will decide it once this product can send and `fromMe` alone stops
		// separating the owner from the product.
		const ingested = await this.ingest.execute({
			threadId: thread.id.value,
			senderExternalId: payload.fromMe ? OPERATOR_PARTICIPANT_ID : senderId,
			text,
			receivedAt: occurredAt,
			quotedEntryId: quoted?.entryId,
		})

		// 6. Close the ledger row now that the entry exists — this is what makes THIS message quotable in
		// turn, both by a human replying to it and by the agent citing it on the way out.
		await this.consumed.linkEntry({ channelId, platformMessageId: messageId, threadId: thread.id.value, entryId: ingested.entryId })

		// The turn is scheduled INSIDE `IngestChannelMessage`, in the same transaction as the entry
		// (§7.4). Nothing happens here any more, and that is the point: an enqueue at this level would
		// sit outside the ingest's transaction and re-open the window where a crash loses the message
		// after it is already visible in the operator's own chat history.
	}
}
