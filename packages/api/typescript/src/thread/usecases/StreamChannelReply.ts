import { injectable } from 'tsyringe-neo'
import { CommandQueue, Handler, LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { ChannelSender } from '../services/ChannelSender'
import { ReplyStreamer, streamKey } from '../services/ReplyStreamer'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { typingBeatJobIds } from '../utils/ChannelCues'
import type { SustainTypingPresence } from './SustainTypingPresence'

export const StreamChannelReplyInputSchema = z.object({
	ownerId: z.uuid(),
	channelId: z.string(),
	remoteId: z.string(),
	/** The WHOLE reply so far, never a delta — see `ChannelSender.edit` and decision 7. */
	text: z.string().min(1),
	/**
	 * The monotonic position of this cut within its reply (decision 6).
	 *
	 * Carried in the PAYLOAD rather than inferred from arrival order, because arrival order is exactly
	 * what cannot be trusted: a cut whose gateway call failed is retried ~1s later, by which time newer
	 * cuts have landed. The number is what lets the late one be recognised and dropped.
	 */
	sequence: z.number().int().positive(),
	/**
	 * The transcript entry this reply ANSWERS, when the turn imposed one (founder: "ao finalizar uma
	 * tarefa, deve responder a mensagem que a criou").
	 *
	 * OPTIONAL, and that is also the whole migration story: this is a DURABLE payload
	 * (`shared_scheduled_commands.input`), so rows enqueued before the field existed parse with it absent
	 * and open their message unquoted — exactly today's behaviour. No backfill, no in-flight row failing
	 * validation, and a cut is seconds old in any case.
	 *
	 * The ENTRY id, not the platform id: it is resolved to a wamid below, in the context that owns the
	 * ledger, at the one moment a message is actually being opened.
	 */
	replyToEntryId: z.string().optional(),
})

export const StreamChannelReplyOutputSchema = z.void()

/**
 * ONE cut of a streamed reply on its way to the channel (streaming spec, decisions 2 and 8).
 *
 * Same lineage as `deliver_channel_message`, and deliberately so: a durable row in
 * `shared_scheduled_commands`, leased, retried and dead-lettered rather than dropped. Streaming is an
 * improvement on the WAIT and must not become a new way to lose the answer.
 *
 * ### The first cut SENDS; every later one EDITS
 * Decision 8's "o primeiro envio está no caminho crítico" is a sequencing fact, not a bypass: until a
 * send returns, there is no `messageId` for an edit to address. That ordering is not left to the queue
 * — `ReplyStreamer.claimCut` answers `SEND` whenever no message exists yet, so a cut that somehow
 * overtakes the first one simply becomes the first one, and the overtaken cut is then discarded by the
 * sequence guard. The stream is self-correcting in ORDER as well as in CONTENT.
 *
 * ### Why the capability check is here and not at the turn
 * A channel that cannot edit must never have a stream OPENED against it (AC-6): the first send would
 * land carrying half a sentence, and the final delivery would have no way to complete it. Refusing
 * here — at the one place that holds the port — means the whole streaming path silently degrades to
 * "one message at the end", which is exactly today's behaviour, with no platform switch anywhere and
 * without the turn needing to know a channel port exists.
 *
 * ### Best-effort in ONE direction only
 * A failed cut is retried like any command, because a half-finished reply on someone's screen is a
 * real defect. But it may never fail the TURN, and it never can: the turn only enqueues (see
 * `ReplyStreamer.begin`), and `deliver_channel_message` still carries the canonical text at the end
 * regardless of how many cuts made it.
 */
@injectable()
export class StreamChannelReply extends Handler<typeof StreamChannelReplyInputSchema, typeof StreamChannelReplyOutputSchema> {
	readonly name = 'stream_channel_reply' as const
	readonly inputSchema = StreamChannelReplyInputSchema
	readonly outputSchema = StreamChannelReplyOutputSchema

	constructor(
		private readonly sender: ChannelSender,
		private readonly streams: ReplyStreamer,
		private readonly consumed: ConsumedMessageRepository,
		private readonly commands: CommandQueue,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input'], _tx?: Transaction): Promise<void> {
		const { ownerId, channelId, remoteId, text, sequence, replyToEntryId } = input

		// AC-6, AND THE FALSEADOR'S TARGET. Drop the two lines below and a send-only channel gets a
		// PARTIAL first message that nothing can ever complete.
		if (!this.sender.capabilities.edit) return

		const key = streamKey(channelId, remoteId)
		const verdict = this.streams.claimCut(key, sequence, Date.now())

		switch (verdict.action) {
			case 'DISCARD':
				// THE TEXT NEVER REGRESSES (AC-4). Logged at debug because it is expected traffic on a retry,
				// not an anomaly — but logged, because a stream that discards everything is worth seeing.
				this.logging.debug({ content: { message: 'stale reply-stream cut discarded', channelId, sequence } })
				return

			case 'SEND':
				// THE ONE MESSAGE THAT MAY CARRY THE CITATION. This is the balloon that OPENS the reply, so
				// it is the only one for which "this answers that" is true of the whole utterance — and the
				// only one that can say it at all, since every later cut is an edit and an edit has no quote
				// field. Resolved here rather than at `begin` because the ledger belongs to this context, and
				// resolved only on this branch because no other branch opens the reply.
				await this.openMessage(key, {
					ownerId,
					channelId,
					remoteId,
					text: text,
					sequence,
					baseOffset: 0,
					quotedMessageId: await this.resolveQuote(replyToEntryId),
				})
				// The first words are on the wire — the indicator has done its job (AC-10).
				await this.stopTypingPresence(channelId, remoteId)
				return

			case 'CONTINUE':
				// THE WINDOW CLOSED MID-REPLY (decision 4). The rest goes out as a NEW message rather than as
				// a failed edit, and `baseOffset` is what keeps the two balloons from repeating each other.
				//
				// DELIBERATELY UNQUOTED. A citation anchors an UTTERANCE, and this utterance is already
				// anchored by the balloon above — the one the `SEND` branch opened and quoted. Repeating the
				// quote would staple the same bubble to two consecutive messages, which reads as two separate
				// replies to one question instead of one answer that ran past a platform limit.
				await this.openMessage(key, { ownerId, channelId, remoteId, text, sequence, baseOffset: verdict.baseOffset })
				return

			case 'EDIT':
				await this.sender.edit({ channelId, remoteId, messageId: verdict.messageId, text: text.slice(verdict.baseOffset) }, ownerId)
				this.streams.applied(key, sequence, text.length)
				return
		}
	}

	/**
	 * Put a NEW message on the channel and make it the one the stream now grows.
	 *
	 * The ledger claim rides along for the same reason `DeliverChannelMessage` carries one: WhatsApp
	 * echoes back everything this account sends, and the echo of a STREAMED message arrives while the
	 * turn is still generating. Without the claim here, the agent would hear its own half-finished
	 * sentence as inbound speech.
	 */
	private async openMessage(
		key: string,
		message: {
			ownerId: string
			channelId: string
			remoteId: string
			text: string
			sequence: number
			baseOffset: number
			quotedMessageId?: string
		},
		tx?: Transaction,
	): Promise<void> {
		const body = message.text.slice(message.baseOffset)
		// A continuation whose remainder is empty has nothing to say — sending it would put a blank
		// balloon in the conversation.
		if (body.length === 0) return

		const { messageId } = await this.sender.send(
			{ channelId: message.channelId, remoteId: message.remoteId, text: body, quotedMessageId: message.quotedMessageId },
			message.ownerId,
		)

		this.streams.opened(key, {
			ownerId: message.ownerId,
			messageId,
			sentAtEpochMs: Date.now(),
			sequence: message.sequence,
			baseOffset: message.baseOffset,
			deliveredLength: message.text.length,
		})

		await this.withTransaction(tx, tx =>
			this.consumed.claim({ ownerId: message.ownerId, channelId: message.channelId, platformMessageId: messageId }, tx),
		)
	}

	/**
	 * The anchor entry → the platform id a WhatsApp quote actually needs.
	 *
	 * The SAME inverse lookup `RecordOrchestratorReply` performs for the unstreamed reply, deliberately
	 * spelled the same way and degrading the same way: an entry with no ledger row — one from before the
	 * thread was attached, or one that never reached the channel — yields `undefined`, the message opens
	 * unquoted, and the reply still lands. An unquoted answer is worth far more than a silence, and a
	 * citation is never worth failing a command that is already on the critical path of the first words.
	 *
	 * Read HERE and not at `begin` for two reasons: the ledger is this context's, and a cut is the only
	 * moment we know a message is actually being opened — resolving eagerly for every turn would pay a
	 * query for the majority of cuts, which only ever edit.
	 */
	private async resolveQuote(replyToEntryId?: string): Promise<string | undefined> {
		if (!replyToEntryId) return undefined
		return this.consumed.findPlatformId(replyToEntryId)
	}

	/** Same derived handles `DeliverChannelMessage` cancels, and swallowed for the same reason (decision 12). */
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
