import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, CommandQueue, LoggingService, tryCatchAsync } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, MessageType, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { AGENT_SPEAKER } from '../objects'
import { MessageIngestedEvent } from '../events/MessageIngestedEvent'
import { CUE_ACKNOWLEDGED } from '../utils/ChannelCues'
import { OPERATOR_PARTICIPANT_ID } from '../entities/Thread'
import type { ReactToChannelMessage } from './ReactToChannelMessage'
import type { ApplicationErrors } from '../errors'

export const IngestChannelMessageInputSchema = z.object({
	threadId: z.uuid(),
	senderExternalId: z.string(),
	text: z.string(),
	/**
	 * MessageType of a MEDIA message (IMAGE | VIDEO | AUDIO | DOCUMENT | STICKER) — absent for plain
	 * text. Recorded on the entry so the prompt grammar can announce `tipo="audio"` without parsing
	 * the placeholder text.
	 */
	messageType: z.enum(MessageType).optional(),
	/**
	 * Absolute path of the gateway-downloaded media file in the shared data dir. The agent analyses it
	 * with its own tools; absent when the download failed (the entry degrades to its placeholder).
	 */
	mediaPath: z.string().optional(),
	quotedEntryId: z.string().optional(),
	receivedAt: z.date(),
	/**
	 * The PLATFORM id of the message being ingested — the handle the `👀` cue needs to hang itself off.
	 *
	 * OPTIONAL because it is not the ingest's business: every gate, the transcript entry and the turn
	 * are decided without it, and callers that have no platform message (the console, a test) simply
	 * do not pass one and get no cue. `ConsumeInboundMessage` is the caller that has it.
	 */
	platformMessageId: z.string().optional(),
})

export const IngestChannelMessageOutputSchema = z.object({
	entryId: z.uuid(),
	invocable: z.boolean(),
})

/**
 * C16 IngestChannelMessage — appends the inbound to the transcript + rolling context buffer
 * UNCONDITIONALLY (even from read-only participants), then evaluates the invocation gates
 * (paused? sender may invoke? mention tag present when the gate is on? sent recently enough?).
 * Returns `invocable` so the ingestion consumer knows whether to hand off to classification.
 *
 * The last of those gates is the FRESHNESS WINDOW (`INVOCATION_FRESHNESS_WINDOW_MS`), and it changes
 * nothing about the first half of this use case: a message from a gateway backlog replay is
 * transcribed, buffered and quotable like any other — it just does not enqueue a turn. Transcription
 * is observation; the mailbox item is invocation.
 */
@injectable()
export class IngestChannelMessage extends Handler<typeof IngestChannelMessageInputSchema, typeof IngestChannelMessageOutputSchema> {
	readonly name = 'ingest_channel_message' as const
	readonly inputSchema = IngestChannelMessageInputSchema
	readonly outputSchema = IngestChannelMessageOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly mailbox: MailboxRepository,
		private readonly commands: CommandQueue,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// A deleted thread is not a thread this use case may write to (thread-deletion spec, decision 3),
		// so it answers with the code it already has for "there is nothing here to ingest into".
		//
		// This is the FLOOR, not the gate: `ConsumeInboundMessage` drops the message before ever calling
		// here, which is where the decision's "ignora, sem side-effects" actually lives. The guard exists
		// so the invariant holds for any future caller too — an ingest that silently appended to an
		// apagada conversation would put words in a chat the console answers THREAD_NOT_FOUND for.
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.deletedAt) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		return this.withTransaction(tx, async tx => {
			// THE CITATION, RESOLVED FIRST (B4, decision D-B). This lookup already existed — it is how
			// `repliesToAgent` is decided — and it now serves two purposes with one query: it tells us
			// whether the quote addresses the agent, and it is the PROOF of thread membership that
			// `recordEntry` demands. A quote that does not resolve degrades to no quote rather than being
			// written blind at a `quoted_entry_id` pointing nowhere, which is what happened before.
			const quoted = input.quotedEntryId ? await this.threads.findEntry(input.quotedEntryId, tx) : undefined

			// Is this a REPLY to something the agent itself said? `SYSTEM` is the kind
			// `RecordOrchestratorReply` writes, so it is exactly "the agent's own words", and quoting
			// those is addressing it — the mention gate stands down for that case (see `Thread.canInvoke`).
			// A quote that resolves to anyone else's message, or does not resolve at all, is not one.
			const repliesToAgent = quoted?.kind === TranscriptKind.SYSTEM

			// Always buffer + transcribe, even when the sender can't invoke (observation ≠ invocation).
			const entry = thread.recordEntry({
				kind: TranscriptKind.CONTACT,
				text: input.text,
				senderExternalId: input.senderExternalId,
				quotedEntry: quoted ? { entryId: quoted.entryId, threadId: quoted.threadId } : undefined,
				messageType: input.messageType,
				mediaPath: input.mediaPath,
				at: input.receivedAt,
			})
			await this.threads.save(thread, tx)

			// THE CLOCK, READ ONCE AND HANDED DOWN. `Thread.canInvoke` owns the freshness policy and its
			// threshold; the entity just refuses to read a clock, so the instant of reference is supplied
			// from here — the one place on this path allowed to know what time it is.
			//
			// `input.receivedAt` is the event's `occurredAt`: WHEN THE PLATFORM SAYS THE MESSAGE WAS SENT,
			// not when the gateway heard about it. That distinction IS the rule — on a reconnect replay
			// `observedAt` is "now" for the whole backlog and would let every message through.
			const invocable = thread.canInvoke({
				senderExternalId: input.senderExternalId,
				text: input.text,
				repliesToAgent,
				sentAt: input.receivedAt,
				now: new Date(),
			})

			// THE REPOINT (orchestrator pivot §7.4). An invocable message schedules a turn of the thread's
			// orchestrator, and the item is written IN THIS TRANSACTION — the same one that created the
			// entry it refers to.
			//
			// That is what closes the window the design review named a swallow-hole: with the enqueue
			// outside, a crash between "the entry is committed" and "the turn is queued" loses the message
			// silently — the operator sees it in their own chat history and never gets an answer. Committed
			// together, either both exist or neither does.
			//
			// `dedupKey` is the ENTRY id, so a redelivered gateway event re-inserts, conflicts on the
			// unique index, and queues nothing. This use case does NOT ask whether a turn is already
			// running: producers only insert, and the dispatcher's per-target lease decides what runs (§3).
			if (invocable) {
				await this.mailbox.enqueue(
					{
						ownerId: thread.ownerId,
						targetKind: MailboxTargetKind.THREAD,
						targetId: thread.id.value,
						kind: MailboxItemKind.OPERATOR_MESSAGE,
						payload: {
							kind: MailboxItemKind.OPERATOR_MESSAGE,
							entryId: entry.entryId,
							// The NAME, resolved off the roster — not the raw JID this used to send. The prompt puts
							// the author in an attribute, and the conversation window has always resolved the same id
							// to the same name, so sending the JID here made one person appear twice under two
							// identities in one prompt.
							speaker: thread.displayNameOf(input.senderExternalId),
							text: thread.textWithoutMention(input.text),
							// The media facts travel WITH the item because a fresh turn renders the item, not the
							// entry row — without them the agent would see the placeholder and never the file.
							messageType: input.messageType,
							mediaPath: input.mediaPath,
							// WHAT THIS MESSAGE IS ANSWERING — carried for ANY resolved quote, not only the agent's.
							//
							// It used to ride on `repliesToAgent`, and that was the gate's verdict wearing a second
							// hat: quoting the agent lowers the mention gate, so the quote only survived when it had
							// already done that other job. A reply to ANOTHER PERSON in the room reaches the agent
							// too (the tag, or a group where everything does) and is exactly as unreadable without
							// its antecedent — "depois", "o segundo", "pode" mean nothing on their own, and mean
							// something WRONG against the wrong line.
							//
							// The author and the instant travel with the text because the prompt renders this as
							// `responde: <autor>, <hora> — «…»`: a quote attributed to nobody reads as the speaker's
							// own words. It costs no extra read — `quoted` was already resolved above for the gate,
							// and the row it returned carries both.
							//
							// NOT run through `textWithoutMention`: this is somebody's line as the transcript keeps
							// it, and the excerpt is quoted, not spoken.
							quoted: quoted
								? {
										speaker: quoted.kind === TranscriptKind.SYSTEM ? AGENT_SPEAKER : thread.displayNameOf(quoted.senderExternalId),
										at: quoted.at,
										text: quoted.text,
									}
								: undefined,
						},
						dedupKey: entry.entryId,
					},
					tx,
				)

				// THE `👀`, ON THE SAME BRANCH AS THE TURN (streaming spec, decision 10) — and the shared
				// branch IS the decision, not a convenience.
				//
				// The cue promises "I saw this and I am on it". Reacting to a message that will NOT wake the
				// agent — the mention gate closed, the sender read-only, the thread paused, or the message
				// outside the 5-minute freshness window — turns that promise into a lie the operator has no
				// way to detect: they get an acknowledgement and then silence, forever, and nothing anywhere
				// says why. So the cue is not enqueued NEAR the turn; it is enqueued INSIDE the same `if`, on
				// the same `canInvoke` verdict, in the same transaction. A future gate is inherited for free.
				//
				// It rides this transaction for the same reason the mailbox item does — the enqueue commits
				// with the entry that motivates it. `jobId` is derived from the entry, so a redelivered
				// gateway event conflicts and re-reacts nothing.
				// PER-THREAD OPT-OUT (reactions/streaming spec) — `thread.reactionsEnabled` gates the cue the
				// same way `thinkingIndicatorEnabled` gates the "Pensando" placeholder: the entry and the
				// mailbox item above are written exactly as always, only the 👀 itself is skipped.
				if (input.platformMessageId && thread.reactionsEnabled) {
					await this.enqueueCue(thread.ownerId, thread.channelId, thread.contactRef.externalId, input, entry.entryId, tx)
				}
			}

			await this.domainEventRepository.save(
				new MessageIngestedEvent({
					entityId: thread.id.value,
					ownerId: thread.ownerId,
					payload: { threadId: thread.id.value, entryId: entry.entryId, senderExternalId: input.senderExternalId, invocable },
				}),
				tx,
			)

			return { entryId: entry.entryId, invocable }
		})
	}

	/**
	 * Schedule the `👀` — and REFUSE to let it break the ingest (streaming spec, decision 12).
	 *
	 * The guard is not defensive habit; it names a real caller. `CommandQueue.enqueueCommand` is
	 * transactional only on the SQLite driver — the broker-backed one declares `transactional = false`
	 * and its enqueue is NETWORK I/O, which core's own contract says callers on a critical path must
	 * tolerate failing. An ingest is exactly such a path, and more consequential than most: losing it
	 * costs the operator the message they can already see in their own chat history, with no answer and
	 * no trace. A decoration is not allowed to buy that.
	 *
	 * So the asymmetry is deliberate: no cue is a shrug, no ingest is the worst bug this file has. By
	 * the time we get here the entry and the mailbox item are already written into this transaction —
	 * swallowing is what keeps that commit intact.
	 */
	private async enqueueCue(
		ownerId: string,
		channelId: string,
		remoteId: string,
		input: this['input'],
		entryId: string,
		tx: Transaction,
	): Promise<void> {
		// The owner's own words arrive under the OPERATOR roster id (`ConsumeInboundMessage` rewrites the
		// sender when the gateway reports `fromMe`), and WhatsApp addresses a reaction by the whole
		// message key — so the sentinel that already encodes "this account said it" is precisely the fact
		// the gateway needs, read where it is unambiguous. Read ONCE, because the same comparison also
		// decides whether there is an author to send (below).
		const fromMe = input.senderExternalId === OPERATOR_PARTICIPANT_ID

		const outcome = await tryCatchAsync(() =>
			this.commands.enqueueCommand<ReactToChannelMessage>(
				'react_to_channel_message',
				{
					ownerId,
					channelId,
					remoteId,
					messageId: input.platformMessageId ?? '',
					fromMe,
					// THE AUTHOR, and the whole reason a `👀` used to vanish in a group. `remoteId` is the GROUP
					// jid there, never the person's, so without this the gateway could only fill the message
					// key's `participant` slot with the chat — a key that addresses no message, and an emoji
					// nobody in the room ever sees. In a DM the two coincide, which is why it looked fine.
					//
					// Withheld when `fromMe`, because there the id is `OPERATOR_PARTICIPANT_ID` — a SENTINEL,
					// not a JID. Sending it would have the gateway parse `operator` into a nonsense JID and
					// break the one case that already works; the device's own id is what answers that case.
					senderExternalId: fromMe ? undefined : input.senderExternalId,
					reaction: CUE_ACKNOWLEDGED,
				},
				// Derived from the ENTRY, like the mailbox item's own dedup key: a redelivered gateway event
				// conflicts on the same id and reacts nothing twice.
				{ jobId: `cue:${entryId}` },
				tx,
			),
		)

		if (!outcome.success) {
			this.logging.info({
				content: { message: 'ack cue not scheduled (best-effort)', threadId: input.threadId, reason: outcome.error.message },
			})
		}
	}
}
