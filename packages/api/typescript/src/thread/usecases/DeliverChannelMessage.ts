import { injectable } from 'tsyringe-neo'
import { CommandQueue, Handler, LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MessageAuthor } from '@codm/contracts-typescript/wire/enums'
import { ChannelSender } from '../services/ChannelSender'
import { ReplyStreamer, streamKey } from '../services/ReplyStreamer'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { typingBeatJobIds } from '../utils'
import type { SustainTypingPresence } from './SustainTypingPresence'

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
		private readonly streams: ReplyStreamer,
		private readonly consumed: ConsumedMessageRepository,
		private readonly commands: CommandQueue,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const { ownerId, channelId, contactExternalId, text, author } = input

		// THE LAST EDIT OF A STREAMED REPLY (streaming spec, decision 7), when this conversation has one
		// in flight. It is the same delivery it always was — the words still arrive here, and this is
		// still the only place that decides the reply is DONE — but a reply the contact has been watching
		// grow must be COMPLETED, not repeated: sending here would put the answer in the conversation
		// twice. The stream is found by the conversation alone, so nothing had to be threaded through the
		// event, the handler or this command's schema.
		if (await this.finishStreamedReply(input, tx)) return

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

		await this.stopTypingPresence(channelId, contactExternalId)

		this.logging.info({ content: { message: 'channel message delivered', channelId, messageId, author } })
	}

	/**
	 * Finish a reply the contact has been watching grow, and report whether there was one.
	 *
	 * ### The text delivered here is the CANONICAL text (AC-3)
	 * `input.text` is the transcript entry's own text — the same string `RecordOrchestratorReply` wrote
	 * and `RunOrchestratorTurn` parsed the sentinel out of. The intermediate cuts came from the model's
	 * incremental frames, which is a DIFFERENT accumulation and may end anywhere; this one is the
	 * conversation's own record. Ending on it is what makes "what the channel shows" and "what the
	 * transcript says" the same string rather than two texts that happen to agree.
	 *
	 * That is also the whole of decision 7's self-correction: whatever the intermediate edits did or
	 * failed to do, this one overwrites the message with the complete and final answer.
	 *
	 * ### The window may have closed while the reply was still growing
	 * Then the remainder continues in a NEW message (decision 4) carrying only what the expired one does
	 * not already show, so the two balloons concatenate to the whole reply instead of repeating it.
	 */
	private async finishStreamedReply(input: this['input'], tx?: Transaction): Promise<boolean> {
		const { ownerId, channelId, contactExternalId, text, author } = input
		const key = streamKey(channelId, contactExternalId)
		const verdict = this.streams.claimFinal(key, Date.now())

		if (verdict.action === 'NONE') return false

		if (verdict.action === 'EDIT') {
			await this.sender.edit(
				{ channelId, remoteId: contactExternalId, messageId: verdict.messageId, text: text.slice(verdict.baseOffset) },
				ownerId,
			)
			this.logging.info({ content: { message: 'streamed reply completed by edit', channelId, messageId: verdict.messageId } })
			return true
		}

		// Only what the expired message does NOT already show — `baseOffset` here is where the screen
		// currently ENDS, so the two balloons concatenate to the whole reply instead of repeating it.
		const remainder = text.slice(verdict.baseOffset)
		if (remainder.length === 0) return true

		const { messageId } = await this.sender.send({ channelId, remoteId: contactExternalId, text: remainder }, ownerId)
		// The continuation is a message this account sent, so it needs the same echo claim the plain
		// delivery path takes — otherwise its echo comes back as inbound speech.
		if (author === MessageAuthor.SYSTEM) {
			await this.withTransaction(tx, tx => this.consumed.claim({ ownerId, channelId, platformMessageId: messageId }, tx))
		}
		this.logging.info({ content: { message: 'streamed reply continued in a new message (edit window closed)', channelId, messageId } })
		return true
	}

	/**
	 * "Cessa quando o primeiro texto sai" (streaming spec, AC-10) — the typing loop's LAST line of
	 * defence, not its guarantee.
	 *
	 * ### Why the canceller is here and not where the loop started
	 * This is the moment the words land, and the words are what replace the signal — on WhatsApp a
	 * message arriving clears the sender's "digitando…" on its own. So the only thing left to do is
	 * stop paying for beats nobody will see, and the handles are DERIVED from the conversation
	 * (`typingBeatJobIds`), which means this use case can stop a loop it never started and was never
	 * told about. Nothing had to be plumbed through the turn.
	 *
	 * ### Why AFTER the send, and why swallowed
	 * After, because until the send returns we are still generating as far as the contact is concerned,
	 * and a send that throws is retried — the indicator should stay lit across that retry. Swallowed,
	 * because a cue may never fail a delivery (decision 12): the reply is already on the channel by
	 * this line, and `SustainTypingPresence` is built so that failing to cancel costs at most one beat
	 * interval, with the platform's own ~10s expiry and the loop's ceiling behind it.
	 */
	private async stopTypingPresence(channelId: string, remoteId: string): Promise<void> {
		for (const jobId of typingBeatJobIds(channelId, remoteId)) {
			const outcome = await tryCatchAsync(() =>
				this.commands.cancelCommand('sustain_typing_presence' satisfies SustainTypingPresence['name'], jobId),
			)
			if (!outcome.success) {
				this.logging.info({ content: { message: 'typing presence not cancelled (best-effort)', channelId, reason: outcome.error.message } })
			}
		}
	}
}
