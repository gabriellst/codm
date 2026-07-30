import { injectable } from 'tsyringe-neo'
import { Handler, LoggingService, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MessageAuthor } from '@codm/contracts-typescript/wire/enums'
import { ChannelSender } from '../services/ChannelSender'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'

export const DeliverChannelMessageInputSchema = z.object({
	// The gateway scopes every write by owner and must never be handed a forged one — so the owner is
	// VALIDATED here rather than defensively dropped downstream (the shape the EventHandler had to use,
	// because an envelope owner is optional at the wire).
	ownerId: z.uuid(),
	channelId: z.string(),
	contactExternalId: z.string(),
	text: z.string().min(1),
	author: z.enum(MessageAuthor),
	// Both fields travel because the PRODUCERS resolve them (F1's inverse lookup:
	// `RecordOrchestratorReply` turns an entry id into the platform id a WhatsApp quote needs, and the
	// entry the outbound message IS). This executor's use of them is UNCHANGED from the EventHandler it
	// replaces — the gateway send has never received the quote. Fixing that is a behaviour change B3
	// does not make; it is registered as an observation in the plan's Notes.
	quotedMessageId: z.string().optional(),
	replyEntryId: z.string().optional(),
})

export const DeliverChannelMessageOutputSchema = z.void()

/**
 * The delivery leg — the one that makes "the agent answers" mean "answers in WhatsApp".
 *
 * ### Why a COMMAND and not an event (B3, decision 2)
 * `integration.channel.delivery_requested` modelled "put this text on the channel" as a fact anyone
 * could react to, but there was exactly one consumer and it did not react to anything — it EXECUTED.
 * Worse, the transport carrying it (`SqlExternalMediator.publish`) wrote no row, so the retry the name
 * promised never existed: a dead gateway or a dead process lost the message silently. As a command it
 * is a durable row in `shared_scheduled_commands`, enqueued in the SAME transaction as the transcript
 * entry that motivates it, retried by the `CommandQueue` worker (3 attempts, exponential backoff, 60s
 * lease) and dead-lettered — never dropped.
 *
 * ### THE LOOP, and the three things standing in its way
 * WhatsApp echoes back everything this account sends, and the gateway bridges from-me messages
 * INBOUND (that is how the owner's own words are heard). So a reply we send returns as speech, and a
 * consumer that cannot recognise it answers itself, forever.
 *
 *   1. THE CLAIM, and it is the structural one. The send returns the platform message id; we write it
 *      into the same exactly-once ledger `ConsumeInboundMessage` consults FIRST. When the echo arrives
 *      — from either Go emission site, both carrying that id — `claim` finds the row and the whole
 *      handler is a no-op before any thread lookup.
 *   2. THE AUTHOR. A SYSTEM message is the product speaking; recording it under the ledger is what
 *      makes the id known. A HUMAN message is the owner's own speech — claiming it would make the
 *      transcript miss the words they actually said on the channel.
 *   3. THE MENTION GATE. An echoed reply carries no citation, so `Thread.canInvoke` refuses it. The
 *      WEAKEST of the three, which is why it is listed last and not relied on.
 *
 * RESIDUAL, stated rather than hidden: the claim is written AFTER the send returns, so there is a
 * window of one HTTP round-trip in which the gateway's outbox poll could publish the echo first. The
 * structural fix is to pre-mint the message id before the wire call; that is a gateway change and is
 * deliberately not bundled here. Until then layer 3 covers the window.
 */
@injectable()
export class DeliverChannelMessage extends Handler<typeof DeliverChannelMessageInputSchema, typeof DeliverChannelMessageOutputSchema> {
	readonly name = 'deliver_channel_message' as const
	readonly inputSchema = DeliverChannelMessageInputSchema
	readonly outputSchema = DeliverChannelMessageOutputSchema

	constructor(
		private readonly sender: ChannelSender,
		private readonly consumed: ConsumedMessageRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const { ownerId, channelId, contactExternalId, text, author } = input

		// EXTERNAL I/O OUTSIDE ANY TRANSACTION — the sanctioned shape (cc-bp-24's named exception):
		// holding the single SQLite write lock across an HTTP round-trip would block every other writer,
		// and a failure here must roll nothing back. The queue's lease IS the retry.
		const { messageId } = await this.sender.send({ channelId, remoteId: contactExternalId, text }, ownerId)

		// LAYER 1 — claim our own message before its echo can be heard. `claim` is the same
		// `INSERT ... ON CONFLICT DO NOTHING` the inbound consumer runs first, so the echo returns `false`
		// there and the handler stops before touching a thread. Idempotent by construction: a retried
		// command re-claims the same id and the conflict makes it a no-op.
		if (author === MessageAuthor.SYSTEM) {
			await this.withTransaction(tx, tx => this.consumed.claim({ ownerId, channelId, platformMessageId: messageId }, tx))
		}

		this.logging.info({ content: { message: 'channel message delivered', channelId, messageId, author } })
	}
}
