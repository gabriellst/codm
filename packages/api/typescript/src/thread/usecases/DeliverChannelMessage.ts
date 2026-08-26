import { injectable } from 'tsyringe-neo'
import { CommandQueue, Handler, LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MessageAuthor } from '@codm/contracts-typescript/wire/enums'
import { ChannelSender } from '../services/ChannelSender'
import { ReplyStreamer, streamKey } from '../services/ReplyStreamer'
import { endTypingPresence } from '../services/TypingPresence'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { CUE_REPLIED } from '../utils/ChannelCues'
import type { ReactToChannelMessage } from './ReactToChannelMessage'

export const DeliverChannelMessageInputSchema = z.object({
	// The gateway scopes every write by owner and must never be handed a forged one — so the owner is
	// VALIDATED here rather than defensively dropped downstream (the shape the EventHandler had to use,
	// because an envelope owner is optional at the wire).
	ownerId: z.uuid(),
	channelId: z.string(),
	contactExternalId: z.string(),
	text: z.string().min(1),
	author: z.enum(MessageAuthor),
	// These travel because the PRODUCERS resolve them (F1's inverse lookup: `RecordOrchestratorReply`
	// turns an entry id into the platform id a WhatsApp quote needs, and names the entry the outbound
	// message IS). `replyEntryId`/`replyThreadId` are what let this leg BIND the sent message to that
	// entry — this is the only layer that can, because the platform id does not exist until the send
	// returns.
	//
	// `replyThreadId` is CARRIED rather than derived. This use case could reach the thread through
	// (channelId, contactExternalId), the way `ConsumeInboundMessage` does, but the producer already
	// holds the aggregate and its answer is the TRUE one: the entry belongs to THAT thread by
	// construction, while a contact since re-attached would make the lookup name a different one. An
	// optional field costs no read and cannot be wrong. Older command rows enqueued before this field
	// existed simply carry no link — they are single messages already delivered, and they self-heal by
	// being replaced with the next reply.
	//
	// `quotedMessageId` is the OTHER direction, and it now reaches the wire: it is handed to
	// `ChannelSender.send`, which is what makes "ao finalizar uma tarefa, responde a mensagem que a
	// criou" visible to the contact instead of merely durable. It used to stop at this schema — the send
	// destructured `text` and dropped it — and the reason that survived so long is worth keeping written
	// down: the tests that claimed to cover it asserted on the enqueued COMMAND ROW, one hop short of
	// the wire, so the chain was measured up to the row and declared finished.
	quotedMessageId: z.string().optional(),
	replyEntryId: z.string().optional(),
	replyThreadId: z.string().optional(),
	/**
	 * The thread's `reactionsEnabled` setting, PASSED THROUGH by the producer rather than looked up here
	 * (reactions/streaming spec). This command carries no thread id to read one — only
	 * `channelId`/`contactExternalId` — and this leg already runs on the hot delivery path, so the
	 * producer that DOES hold the aggregate (`RecordOrchestratorReply`) hands the value across instead of
	 * this use case paying for a second `ThreadRepository.findById`. Optional because a command row
	 * enqueued before this field existed carries none and must default to the pre-existing always-on
	 * behaviour — see `recordOutbound`'s `?? true`.
	 */
	reactionsEnabled: z.boolean().optional(),
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
 *      handler is a no-op before any thread lookup. The row is also LINKED to the entry it is (see
 *      `recordOutbound`), which is a different job from the claim and is what makes a human's reply to
 *      the agent resolvable at all.
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
		const { ownerId, channelId, contactExternalId, text, author, quotedMessageId } = input

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
		//
		// THE CITATION TRAVELS (founder, 31-jul). `quotedMessageId` is the platform id
		// `RecordOrchestratorReply` resolved out of the ledger, and handing it to the port is the last
		// step of "ao finalizar uma tarefa, deve responder a mensagem que a criou": the anchor is imposed
		// by `RunOrchestratorTurn` (D6), resolved by the producer, carried by the command row, forwarded by
		// `GatewayChannelSender` — and, until now, dropped precisely here.
		//
		// `undefined` is a REAL and expected value, not a defect: an entry from before the thread was
		// attached has no ledger row, so `findPlatformId` answers nothing and the reply goes out unquoted.
		// `GatewayChannelSender` spreads the field conditionally, so it never reaches the wire as a null,
		// and an unquoted answer is worth far more than a silence.
		const { messageId } = await this.sender.send({ channelId, remoteId: contactExternalId, text, quotedMessageId }, ownerId)

		await this.recordOutbound(messageId, input, tx)

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
	 *
	 * ### THE CITATION IS ALREADY ON THE SCREEN BY THE TIME THIS RUNS
	 * Nothing here quotes, and nothing here needs to. An edit REPLACES text and nothing else
	 * (`ChannelSender.edit` takes `{channelId, remoteId, messageId, text}`; the gateway's
	 * `PUT /messages/edit` has no quote field), so a citation could never be ADDED at the end — which is
	 * precisely why it is added at the START: `ReplyStreamer.begin` carries the anchor and
	 * `StreamChannelReply` puts it on the balloon that OPENS the reply. By the time the final text lands
	 * here, the message being completed is already the quoted one.
	 *
	 * The continuation below stays unquoted for the same reason — see the note there.
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
			// THE STREAMED MESSAGE IS THE AGENT'S REPLY, and this is where it finally gets a name. The id
			// was minted one use case away — by `StreamChannelReply` when the first cut opened the message —
			// so this leg never sent it and, before the link existed, never recorded it as anything either.
			// Binding it HERE is what makes a reply to the balloon the contact watched grow resolve to the
			// same entry a reply to a plain send resolves to. Without this line the whole fix covers only
			// short replies: every reply long enough to stream stays as broken as it was.
			await this.recordOutbound(verdict.messageId, input, tx)
			this.logging.info({ content: { message: 'streamed reply completed by edit', channelId, messageId: verdict.messageId } })
			return true
		}

		// Only what the expired message does NOT already show — `baseOffset` here is where the screen
		// currently ENDS, so the two balloons concatenate to the whole reply instead of repeating it.
		const remainder = text.slice(verdict.baseOffset)
		if (remainder.length === 0) return true

		// DELIBERATELY UNQUOTED, and this is the decision rather than an omission.
		//
		// A continuation is the REST of one utterance whose head is already on the contact's screen, and
		// that head now CARRIES the citation (`StreamChannelReply` quotes the balloon it opens). So the
		// utterance is already anchored: repeating the quote here would staple the same bubble to two
		// consecutive messages, which reads as two separate replies to one question instead of one answer
		// that ran past a platform limit. Quem cita é a mensagem, uma vez.
		//
		// It would also make the citation's presence depend on whether the 14-minute window happened to
		// expire mid-reply — a timing accident deciding what the contact sees.
		const { messageId } = await this.sender.send({ channelId, remoteId: contactExternalId, text: remainder }, ownerId)
		// The continuation is a message this account sent, so it needs the same echo claim the plain
		// delivery path takes — otherwise its echo comes back as inbound speech — and the same link, so a
		// reply to it reaches the entry too.
		//
		// It is the LAST balloon of this reply that carries the name: the earlier one, opened while the
		// edit window was still open, keeps the bare claim `StreamChannelReply` gave it. Quoting the tail
		// of an answer is the reflex anyway (it is the part still on screen), and linking both would put
		// two rows on one entry, which `findPlatformId`'s single-row lookup has no way to choose between.
		await this.recordOutbound(messageId, input, tx)
		this.logging.info({ content: { message: 'streamed reply continued in a new message (edit window closed)', channelId, messageId } })
		return true
	}

	/**
	 * Record the platform message this account just put on the channel: CLAIM it against its own echo,
	 * and BIND it to the transcript entry it is. Two writes, one transaction, and each part is load-bearing.
	 *
	 * ### `claim` and `linkEntry` are two different jobs, and neither one subsumes the other
	 * `claim` is the exactly-once LATCH — `INSERT ... ON CONFLICT DO NOTHING` on
	 * `UNIQUE(channelId, platformMessageId)` — whose RETURN VALUE ("was this the first delivery?") is what
	 * makes the echo of our own message a no-op in `ConsumeInboundMessage`, before any thread lookup.
	 * `linkEntry` is an UPDATE filling that row's `threadId`/`entryId`: the MAP, read back by `findEntry`.
	 * This leg only ever did the first, so the agent's own speech sat in the ledger as an UNATTRIBUTED
	 * row — enough to recognise the echo, never enough to answer "which entry is this?". That is the
	 * whole bug: `findEntry` returned undefined for it, so `IngestChannelMessage` scored every reply to
	 * the agent as `repliesToAgent: false` and the mention gate kept demanding a tag.
	 *
	 * They cannot be collapsed into one call, and the streamed path is the reason. `claim` does accept
	 * `threadId`/`entryId` and would insert a row born linked — but ON CONFLICT DO NOTHING means it writes
	 * NOTHING when a row already exists, and on the streamed path one always does: `StreamChannelReply`
	 * claimed it when the first cut opened the message. A link that was only ever an insert would silently
	 * skip every streamed reply. The converse fails harder: `linkEntry` alone creates nothing, so dropping
	 * the claim would delete the echo defence outright and the agent would start answering itself. Claim
	 * then link — the first guarantees the row and the latch, the second gives it a name.
	 *
	 * ### ONE transaction, because the retry exposure must not grow
	 * The send above is external I/O and is already committed on the wire by the time we get here. If this
	 * commit fails, the `CommandQueue` re-executes the whole command and the contact gets the message a
	 * SECOND time. That hazard is not new, and it is NOT repaired here — repairing it needs a platform id
	 * minted before the wire call, which is the gateway change the class doc names as the RESIDUAL. What
	 * matters is that it is not made worse: both writes ride the single `withTransaction` the claim
	 * already used, so there is exactly ONE commit after the send, exactly as before. Adding a second,
	 * independent write would have been a second way to lose that race.
	 *
	 * Both statements are idempotent under that retry anyway — the claim conflicts into a no-op, the
	 * update rewrites the same two columns with the same two values.
	 *
	 * ### Only what the PRODUCT said (layer 2, THE AUTHOR)
	 * A `HUMAN` message is the owner's own speech, forwarded. It is deliberately not claimed — claiming it
	 * would make the transcript miss the words they actually said on the channel — and for the same reason
	 * it is not linked: its echo is ingested as a real inbound and `ConsumeInboundMessage` binds the row to
	 * the entry THAT produces. Two owners for one row would be a race with no winner worth having.
	 */
	private async recordOutbound(messageId: string, input: this['input'], tx?: Transaction): Promise<void> {
		const { ownerId, channelId, author, replyEntryId, replyThreadId } = input
		if (author !== MessageAuthor.SYSTEM) return

		await this.withTransaction(tx, async tx => {
			await this.consumed.claim({ ownerId, channelId, platformMessageId: messageId }, tx)
			// A delivery with no entry behind it still claims, it just stays unnamed — exactly as every
			// outbound row was until now. Reachable by a command row enqueued before these fields existed.
			if (replyEntryId && replyThreadId) {
				await this.consumed.linkEntry({ channelId, platformMessageId: messageId, threadId: replyThreadId, entryId: replyEntryId }, tx)
			}

			// THE `🤖` (founder, 2026-08-25) — the agent's finished reply is stamped as the agent's, on the
			// same transaction as its claim: `recordOutbound` is the ONE gate every final delivery leg
			// passes through (plain send, streamed edit, continuation balloon) and nothing else does, so
			// the placeholder and the intermediate cuts stay bare. `fromMe: true` because WhatsApp
			// addresses a reaction by the whole message key and this account is the sender. Best-effort
			// like the `👀` (streaming spec, decision 12): a cue is never allowed to fail a delivery that
			// is already on the contact's screen. `jobId` derives from the message, so a redelivered
			// command conflicts and reacts nothing twice.
			//
			// PER-THREAD OPT-OUT (reactions/streaming spec) — `input.reactionsEnabled ?? true` so a command
			// row enqueued before this field existed keeps the pre-existing always-on behaviour. The
			// `claim`/`linkEntry` above stay unconditional; only this enqueue is gated.
			if (input.reactionsEnabled ?? true) {
				const cue = await tryCatchAsync(() =>
					this.commands.enqueueCommand<ReactToChannelMessage>(
						'react_to_channel_message',
						{ ownerId, channelId, remoteId: input.contactExternalId, messageId, fromMe: true, reaction: CUE_REPLIED },
						{ jobId: `cue:reply:${messageId}` },
						tx,
					),
				)
				if (!cue.success) {
					this.logging.info({
						content: { message: 'reply cue not scheduled (best-effort)', channelId, messageId, reason: cue.error.message },
					})
				}
			}
		})
	}

	/**
	 * "Cessa quando o primeiro texto sai" (streaming spec, AC-10) — the typing loop's LAST line of
	 * defence, not its guarantee.
	 *
	 * ### Why the canceller is here and not where the loop started
	 * This is the moment the words land, and the words are what replace the signal — on WhatsApp a
	 * message arriving clears the sender's "digitando…" on its own. So the only thing left to do is
	 * stop paying for beats nobody will see, and the handles are DERIVED from the conversation
	 * (`endTypingPresence`, `thread/services/TypingPresence` — the seam `beginTypingPresence` shares),
	 * which means this use case can stop a loop it never started and was never told about. Nothing had
	 * to be plumbed through the turn.
	 *
	 * ### Why AFTER the send, and why swallowed
	 * After, because until the send returns we are still generating as far as the contact is concerned,
	 * and a send that throws is retried — the indicator should stay lit across that retry. Swallowed,
	 * because a cue may never fail a delivery (decision 12): the reply is already on the channel by
	 * this line, and `SustainTypingPresence` is built so that failing to cancel costs at most one beat
	 * interval, with the platform's own ~10s expiry and the loop's ceiling behind it.
	 *
	 * ### This is an OPTIMISATION on the DELIVERY path only — audited, not yet closed on the ERROR path
	 * A turn that ends WITHOUT delivering (throws, or completes with no reply) never calls this, and
	 * nothing else does either — the loop then runs to its own ceiling (`TYPING_MAX_DURATION_MS`,
	 * currently five minutes) before self-terminating, which is a real, measured "digitando…" that
	 * outlives the turn by minutes rather than seconds. `endTypingPresence` was extracted to
	 * `thread/services/TypingPresence` (this method used to hold the only copy, private, unreachable
	 * from outside `thread/usecases`) precisely so a non-delivering terminal path can call it too — see
	 * `SustainTypingPresence.test.ts` for the falseador. Wiring that call is agent-context work
	 * (`RunOrchestratorTurn`'s non-completion return), out of this audit's scope.
	 */
	private async stopTypingPresence(channelId: string, remoteId: string): Promise<void> {
		await endTypingPresence({ commands: this.commands, logging: this.logging, channelId, remoteId })
	}
}
