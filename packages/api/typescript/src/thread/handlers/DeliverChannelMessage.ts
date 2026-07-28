import { injectable } from 'tsyringe-neo'
import { EventHandler, LoggingService } from '@codedm/core-typescript'
import { ChannelDeliveryRequestedEvent } from '@codedm/contracts-typescript/wire/events'
import { MessageAuthor } from '@codedm/contracts-typescript/wire/enums'
import { ChannelSender } from '../services/ChannelSender'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'

/**
 * The delivery leg — the one that makes "the agent answers" mean "answers in WhatsApp".
 *
 * `integration.channel.delivery_requested` has always been the contract for "put this text on the
 * channel"; it simply had no consumer, so a clarification question and an operator's direct message
 * were composed, persisted and then went nowhere. This handler is that consumer, and every producer
 * converges on it — one delivery path, not one per reason to speak.
 *
 * ### The transport, and why it is an HTTP call rather than an outbox lane
 * The gateway's `sendText` already exists end to end, quoted replies included, with no caller. Riding
 * the outbox to it instead would mean a new `integration:gateway` lane — a member of `OutboxSource`,
 * whose values are frozen because rows discriminated by them already exist in user databases. The S2S
 * rule (founder-ratified 22-jul) permits calling another SERVICE's SDK, and `ChannelSender` keeps the
 * socket behind a per-env binding so no test opens one.
 *
 * ### THE LOOP, and the three things standing in its way
 * WhatsApp echoes back everything this account sends, and the gateway now bridges from-me messages
 * INBOUND (that is how the owner's own words are heard). So a reply we send returns as speech, and a
 * consumer that cannot recognise it answers itself, forever.
 *
 *   1. THE CLAIM, and it is the structural one. The send returns the platform message id; we write it
 *      into the same exactly-once ledger `ConsumeInboundMessage` consults FIRST. When the echo
 *      arrives — from either Go emission site, both carrying that id — `claim` finds the row and the
 *      whole handler is a no-op before any thread lookup. No new table: this is the latch that
 *      already turns at-least-once delivery into exactly-once processing.
 *   2. THE AUTHOR. A SYSTEM message is the product speaking; recording it under the ledger is what
 *      makes the id known, and the field is what will let the send path stamp provenance truthfully
 *      once anything else needs to tell the two apart.
 *   3. THE MENTION GATE. Even if the two above failed, an echoed reply carries no citation, so
 *      `Thread.canInvoke` refuses it. This is the WEAKEST of the three — the agent could quote the
 *      tag, and the gate is disableable — which is exactly why it is listed last and not relied on.
 *
 * RESIDUAL, stated rather than hidden: the claim is written AFTER the send returns, so there is a
 * window of one HTTP round-trip in which the gateway's outbox poll could publish the echo first. The
 * structural fix is to pre-mint the message id before the wire call (whatsmeow honours a
 * caller-supplied `req.ID`) and claim it first; that is a gateway change and is deliberately not
 * bundled here. Until then layer 3 covers the window.
 */
@injectable()
export class DeliverChannelMessage extends EventHandler<typeof ChannelDeliveryRequestedEvent> {
	readonly event = ChannelDeliveryRequestedEvent

	constructor(
		private readonly sender: ChannelSender,
		private readonly consumed: ConsumedMessageRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId
		// An envelope without an owner is undeliverable — the gateway scopes every write by owner and
		// must never be handed a forged one.
		if (!ownerId) return

		const { channelId, contactExternalId, text, author } = event.payload

		const { messageId } = await this.sender.send({ channelId, remoteId: contactExternalId, text }, ownerId)

		// LAYER 1 — claim our own message before its echo can be heard. `claim` is the same
		// `INSERT ... ON CONFLICT DO NOTHING` the inbound consumer runs first, so the echo returns
		// `false` there and the handler stops before touching a thread.
		if (author === MessageAuthor.SYSTEM) {
			await this.consumed.claim({ ownerId, channelId, platformMessageId: messageId })
		}

		this.logging.info({ content: { message: 'channel message delivered', channelId, messageId, author } })
	}
}
