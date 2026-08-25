import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { MessageType } from '@codm/contracts-typescript/wire/enums'
// The IN-PROCESS materialization (wire/events/in-process): the same event, with `content` and
// `platformData` already joined into per-(platform, messageType) arms and every scalar still
// carrying its CONTRACT type. Binding to it is what lets this handler read `content?.text` instead
// of hand-parsing the slot — and what keeps `occurredAt` a `Date` for `IngestChannelMessage`.
import { ChannelMessageReceivedInProcessEvent } from '@codm/contracts-typescript/wire/events'
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
		//
		// APAGADA = DESCONFIGURADA (thread-deletion spec, decision 3), and it lands on the SAME line as
		// the unattached case because that is precisely what the decision says it is: a deleted thread's
		// contact is treated exactly like one that was never attached. The ledger row above is already
		// claimed, which is what we want — the message is consumed and dropped, so a redelivery does not
		// come back around hoping for a different answer. Nothing revives by accident; only `AttachThread`
		// revives (decision 4).
		const thread = await this.threads.findByChannelContact(channelId, remoteId)
		if (!thread || thread.deletedAt) return

		// 3. Discriminator narrowing — no parse. The union arms arrive pre-joined from the generated
		// in-process surface, so describing the inbound is a `messageType` switch and field reads.
		// TEXT keeps its old falsy guard (a gateway CAN emit `messageType: TEXT` with a missing text —
		// the whatsmeow mapper fills `content.text` only when the upstream field is non-nil), and MEDIA
		// kinds (IMAGE | VIDEO | AUDIO | DOCUMENT | STICKER) now flow: caption (or a placeholder) as the
		// entry text, plus the gateway-downloaded `mediaPath` the agent will analyse with its own tools.
		// Everything else (LOCATION | CONTACT | POLL | REACTION | ...) is recorded (consumed) and
		// dropped, exactly as before.
		const inbound = describeInbound(payload)
		if (!inbound) {
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
		// Narrowed on PLATFORM and TYPE, and the compiler insists: `contextInfo` exists on the WhatsApp
		// TEXT variant only — the gateway mapper extracts it for extended text, not for media — and not
		// on the INTERNAL one, because a quote is a WhatsApp concept. That is the in-process union
		// earning its keep — the old opaque slot would have needed a cast here.
		const stanzaId =
			payload.platform === 'WHATSAPP' && payload.messageType === MessageType.TEXT ? payload.content?.contextInfo?.stanzaId : undefined
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
			text: inbound.text,
			messageType: inbound.messageType,
			mediaPath: inbound.mediaPath,
			receivedAt: occurredAt,
			quotedEntryId: quoted?.entryId,
			// The wamid travels so the ingest can hang the `👀` cue off THIS message when — and only
			// when — it decides the message wakes the agent (streaming spec, decision 10). It is handed
			// down rather than looked up because this is the only layer that ever holds it: by step 6
			// below it is a ledger column, and the ingest has no business reading the ledger.
			platformMessageId: messageId,
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

/** What one inbound message contributes to the transcript: the entry text (caption or placeholder), and — for media — the type + downloaded path. */
interface InboundDescription {
	text: string
	messageType?: MessageType
	mediaPath?: string
}

/**
 * Narrows the (platform, messageType) union arm into what the transcript records. TEXT keeps the old
 * falsy-text drop; the five media kinds always ingest — a caption when the sender wrote one, a
 * placeholder (`[áudio 0:12]`, `[imagem]`, …) when not — with `mediaPath` riding along when the
 * gateway's download succeeded. Every other kind returns `undefined` and is consumed-and-dropped.
 */
function describeInbound(payload: InstanceType<typeof ChannelMessageReceivedInProcessEvent>['payload']): InboundDescription | undefined {
	switch (payload.messageType) {
		case MessageType.TEXT: {
			const text = payload.content?.text
			return text ? { text } : undefined
		}
		case MessageType.IMAGE: {
			const media = payload.content?.imageMessage
			return { text: media?.caption || '[imagem]', messageType: MessageType.IMAGE, mediaPath: media?.mediaPath }
		}
		case MessageType.VIDEO: {
			const media = payload.content?.videoMessage
			return {
				text: media?.caption || `[vídeo${durationSuffix(media?.seconds)}]`,
				messageType: MessageType.VIDEO,
				mediaPath: media?.mediaPath,
			}
		}
		case MessageType.AUDIO: {
			const media = payload.content?.audioMessage
			return { text: `[áudio${durationSuffix(media?.seconds)}]`, messageType: MessageType.AUDIO, mediaPath: media?.mediaPath }
		}
		case MessageType.DOCUMENT: {
			const media = payload.content?.documentMessage
			const label = media?.fileName ? `[documento ${media.fileName}]` : '[documento]'
			return { text: media?.caption || label, messageType: MessageType.DOCUMENT, mediaPath: media?.mediaPath }
		}
		case MessageType.STICKER: {
			return { text: '[figurinha]', messageType: MessageType.STICKER, mediaPath: payload.content?.stickerMessage?.mediaPath }
		}
		default:
			return undefined
	}
}

/** `0:07`, `1:23` — appended to a placeholder when the platform reported a duration. */
function durationSuffix(seconds: number | undefined): string {
	if (!seconds) return ''
	const m = Math.floor(seconds / 60)
	const s = seconds % 60
	return ` ${m}:${String(s).padStart(2, '0')}`
}
