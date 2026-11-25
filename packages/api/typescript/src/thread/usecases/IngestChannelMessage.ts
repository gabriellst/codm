import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, CommandQueue, LoggingService, tryCatchAsync } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import {
	ClassificationMethod,
	IssueControlSource,
	IssueStatus,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	MessageAuthor,
	MessageType,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { resolveThreadLanguage } from '@shared/i18n/messages'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { InboundTriage, TRIAGE_HOLDER } from '@agent/services/InboundTriage'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { PauseIssue } from '@issue/usecases/PauseIssue'
import { ResumeIssue } from '@issue/usecases/ResumeIssue'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { RuleRouter, type AnswerTarget } from '../services/RuleRouter'
import { RoutedSteer } from '../services/RoutedSteer'
import { BatchSequence } from '../services/BatchSequence'
import { BatchRepository } from '../repositories/BatchRepository'
import { Batch } from '../entities/Batch'
import { detectBatch } from '../utils/BatchDetector'
import { BoardBulletin } from '../services/BoardBulletin'
import { BulletinSentEvent } from '../events/BulletinSentEvent'
import { parseThreadCommand } from '../utils/threadCommand'
import { derivedId } from '../utils/derivedId'
import { AGENT_SPEAKER } from '../objects'
import { MessageIngestedEvent } from '../events/MessageIngestedEvent'
import { CUE_ACKNOWLEDGED, CUE_PAUSED, CUE_RESUMED } from '../utils/ChannelCues'
import { parseControlCommand } from '../utils/controlCommand'
import { BareAnswer, IssueControlCommand, ReplyAnswerWay, ThreadCommand } from '../enums'
import type { Stop, Thread, TranscriptEntry } from '../entities/Thread'
import type { ApplicationErrors } from '../errors'
import { AnswerDisambiguationAskedEvent } from '../events/AnswerDisambiguationAskedEvent'
import { THREAD_MESSAGES } from '../i18n/messages'
import { answeredInGroupAs, mayAnswer, seenByTheGroup, YES_NO_RESOLUTION } from '../utils/answerRules'
import { optionForBare, parseAskAnswer, parseBareAnswer } from '../utils/askAnswer'
import { AnswerStop } from './AnswerStop'
import { ResolveStop } from './ResolveStop'
import type { DeliverChannelMessage } from './DeliverChannelMessage'

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
	/**
	 * The orchestrator's item was queued HELD for the parallel triage (fase 2) — the caller hands the entry
	 * to `InboundTriageQueue` after this commit. False on every other path: routed, not invocable, media, or
	 * an env that does not triage.
	 */
	triage: z.boolean(),
})

/**
 * How long one person's bare answers stay quiet after the group was asked "which one?" (fase 3, item 3): a
 * second bare "sim" from them in this window asks nothing again and takes the usual path (the orchestrator).
 */
export const DISAMBIGUATION_QUIET_MS = 10 * 60 * 1000

/**
 * Does a bare yes / no answer this open stop? By how a reply answers its kind: an ask only when one of its
 * options IS that yes / no (a free-text question is not answered by "sim"); a permission always.
 */
const BARE_ANSWERS_STOP: Readonly<Record<ReplyAnswerWay, (stop: Stop, bare: BareAnswer) => boolean>> = {
	[ReplyAnswerWay.ASK]: (stop, bare) => stop.ask !== undefined && optionForBare(stop.ask, bare) !== undefined,
	[ReplyAnswerWay.YES_NO]: () => true,
}

/** What a control word does to an issue as it stands: run the use case, only acknowledge, or not apply. */
type ControlAction = 'APPLY' | 'ACKNOWLEDGE' | 'IGNORE'

/**
 * Per command: whether it applies to the issue as it stands, and the cue that acknowledges it (fase 2,
 * item 2). A closed map over the command enum — a new command fails compilation until it is given both.
 *
 * PAUSE applies to work that can still move; on an issue already paused it is a redelivery (or a second
 * "pare") and is acknowledged without running anything. RESUME applies only to a paused issue.
 */
const CONTROL_EFFECT: Readonly<
	Record<
		IssueControlCommand,
		{ cue: string; decide: (issue: { paused: boolean; archived: boolean; status: IssueStatus }) => ControlAction }
	>
> = {
	[IssueControlCommand.PAUSE]: {
		cue: CUE_PAUSED,
		decide: issue => (issue.paused ? 'ACKNOWLEDGE' : issue.archived || issue.status === IssueStatus.COMPLETED ? 'IGNORE' : 'APPLY'),
	},
	[IssueControlCommand.RESUME]: {
		cue: CUE_RESUMED,
		decide: issue => (issue.paused ? 'APPLY' : 'IGNORE'),
	},
}

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
		private readonly routedSteer: RoutedSteer,
		private readonly triage: InboundTriage,
		private readonly router: RuleRouter,
		private readonly issues: IssueRepository,
		private readonly pauseIssue: PauseIssue,
		private readonly resumeIssue: ResumeIssue,
		private readonly answerStop: AnswerStop,
		private readonly resolveStop: ResolveStop,
		private readonly commands: CommandQueue,
		private readonly session: CloudSession,
		private readonly bulletin: BoardBulletin,
		private readonly logging: LoggingService,
		private readonly batches: BatchRepository,
		private readonly batchSequence: BatchSequence,
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
		const language = await this.disambiguationLanguage(thread)
		// A CONVERSATION COMMAND (fase 3, item 4 — `boletim`): its answer is composed HERE, before the
		// transaction — reads only (the board, the open asks, the language, which may ask the cloud session) —
		// and only for the message that is one; every other message pays a regex.
		const command = parseThreadCommand(thread.textWithoutMention(input.text))
		const prepared = command ? await this.prepareCommand(thread, command) : undefined

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

			// AN ANSWER TO AN ASK (fase 3, item 3) — decided FIRST: before the control words ("segue" quoting a
			// question is an answer, not a RESUME) and before the issue-quote routing (a quote of a question is
			// more specific than a quote of its issue). Anything short of a clean answer — nothing to answer, a
			// person the ruler does not let answer, an answer already given (a late reply) — returns `undefined`
			// and the message takes the paths below, unchanged.
			const answered = await this.answer(thread, input, { quoted, repliesToAgent, language }, tx)
			if (answered) return answered

			// "boletim" (fase 3, item 4): after the answers (a quoted question answered "boletim" is an answer),
			// before the control words. Anyone who may command the agent gets the bulletin, with no model turn.
			if (prepared) {
				const reported = await this.runCommand(thread, input, prepared, repliesToAgent, tx)
				if (reported) return reported
			}

			// A CONTROL WORD WITH A TARGET (fase 2, item 2 — "pare APP-12", "continue" quoting an issue) is
			// handled here, BEFORE the invocation gate: it must work while the conversation is paused, and it
			// never becomes an orchestrator turn. Anything short of a clean command — no control word, no
			// target, a sender who may not address the agent, an issue the word does not apply to — returns
			// `undefined` and the message takes the usual path below, unchanged.
			const control = parseControlCommand(thread.textWithoutMention(input.text))
			if (control) {
				const controlled = await this.control(thread, input, { command: control, quoted, repliesToAgent }, tx)
				if (controlled) return controlled
			}

			// THE RULE LAYER (fase 2, item 1): does this message belong to one RUNNING issue — by quoting one
			// of its messages, or by naming it by key? Decided before recording, so the entry carries the link.
			const routed = await this.router.route({ threadId: thread.id.value, quotedIssueId: quoted?.issueId, text: input.text }, tx)

			// Always buffer + transcribe, even when the sender can't invoke (observation ≠ invocation).
			const entry = thread.recordEntry({
				kind: TranscriptKind.CONTACT,
				text: input.text,
				senderExternalId: input.senderExternalId,
				quotedEntry: quoted ? { entryId: quoted.entryId, threadId: quoted.threadId } : undefined,
				// A REPLY TO AN ISSUE'S MESSAGE IS ABOUT THAT ISSUE. Measured on a real install: more than half
				// of what people write in a group quotes one of the agent's messages, and the agent's messages
				// carry the issue they speak for — so the quote alone says where this message belongs. A message
				// that names a running issue by key belongs to it too.
				issueId: quoted?.issueId ?? routed?.issue.issueId,
				classification: quoted?.issueId ? ClassificationMethod.REPLY_QUOTE : undefined,
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
			// Held for the parallel triage (fase 2) — decided below, read by the return.
			let triage = false
			if (invocable && routed) {
				// STRAIGHT TO THE ISSUE: the message becomes a steer of its session, with no orchestrator turn in
				// between (measured: a message waited a median 24 s, p90 110 s, and up to 1h30 behind that queue).
				// The group gets only the 👀; the issue's timeline shows the message as sent, delivered, read.
				const interrupt = await this.routedSteer.enqueue(
					{
						thread,
						message: {
							threadId: thread.id.value,
							senderExternalId: input.senderExternalId,
							platformMessageId: input.platformMessageId,
							entryId: entry.entryId,
							text: input.text,
							replyingTo: quoted && routed.via === 'REPLY_QUOTE' ? quoted.text : undefined,
						},
						issue: routed.issue,
					},
					tx,
				)
				if (interrupt) await this.domainEventRepository.save(interrupt, tx)
				// "agora" cuts the turn — nothing to wait for; any other steer waits for the step to end, and says so.
				if (!interrupt)
					await this.noticeBusy(
						thread,
						input,
						entry.entryId,
						{ kind: MailboxTargetKind.ISSUE, id: routed.issue.issueId, key: routed.issue.key },
						language,
						tx,
					)
			} else if (invocable) {
				// THE PARALLEL TRIAGE (fase 2) — the rule layer could not route this, so a stateless triage on the
				// provider's small model decides, in parallel with every other message, whether it is a steer of
				// one open issue, needs no work, or is the orchestrator's after all. The item is written NOW, in
				// this transaction, HELD for the triage: durable from the first instant, and claimable by the
				// orchestrator the moment the hold lapses or this daemon dies (`EnqueueMailboxItem.hold`). A
				// media message is not triaged — the model would read only its placeholder. Nor is a message the
				// rule layer already TIED to an issue and left to the orchestrator on purpose (a reply quoting a
				// waiting or finished issue: reopening, or answering its question, is the orchestrator's call).
				//
				// A BATCH (fase 4, item 5) — a message that LISTS several requests — is decided here, by rule, and never
				// goes to the triage: the triage reads one message without state, and a batch needs the orchestrator
				// to give every item a destination. The batch is opened in this transaction, with the item.
				const listed = input.messageType === undefined ? detectBatch(thread.textWithoutMention(input.text)) : undefined
				const batch = listed
					? Batch.open({
							ownerId: thread.ownerId,
							threadId: thread.id.value,
							seq: await this.batchSequence.next(thread.id.value, tx),
							sourceEntryId: entry.entryId,
							items: listed,
						})
					: undefined
				if (batch) await this.batches.save(batch, tx)
				const triageable = input.messageType === undefined && !entry.issueId && !batch
				const holdMs = triageable ? this.triage.holdMs : undefined
				triage = holdMs !== undefined
				await this.mailbox.enqueue(
					{
						ownerId: thread.ownerId,
						targetKind: MailboxTargetKind.THREAD,
						targetId: thread.id.value,
						kind: MailboxItemKind.OPERATOR_MESSAGE,
						claimClass: MailboxClaimClass.OPERATOR,
						// WHO SENT IT decides how far the turn may go (Decision 4): the sender's `canElevate`.
						posture: thread.postureOf(input.senderExternalId),
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
							// The batch this message is, with every item still owed a destination (`RecordBatch`).
							batch: batch ? { batchCode: batch.code, total: batch.items.length, pending: listed ?? [] } : undefined,
						},
						dedupKey: entry.entryId,
						...(holdMs !== undefined && { hold: { holder: TRIAGE_HOLDER, until: new Date(Date.now() + holdMs) } }),
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
				await this.routedSteer.cue(thread, input, entry.entryId, CUE_ACKNOWLEDGED, tx)
				await this.noticeBusy(thread, input, entry.entryId, { kind: MailboxTargetKind.THREAD, id: thread.id.value }, language, tx)
			}

			await this.domainEventRepository.save(
				new MessageIngestedEvent({
					entityId: thread.id.value,
					ownerId: thread.ownerId,
					payload: { threadId: thread.id.value, entryId: entry.entryId, senderExternalId: input.senderExternalId, invocable },
				}),
				tx,
			)

			return { entryId: entry.entryId, invocable, triage }
		})
	}

	/**
	 * THE ANSWER RULES (fase 3, item 3 — spec rules 1 to 4), in order:
	 *  1. a QUOTE of the message that put an ask to the group, and 2. an ask's CODE in the text
	 *     (`RuleRouter.answerTarget`) — under `Thread.mayAct` alone, WITHOUT the freshness window or the mention
	 *     gate: the answer is tied to one open ask, so a message ingested late still answers it (that is what
	 *     gives the 15-minute default its grace after a reconnect);
	 *  3. a BARE yes / no with no quote and no code — under the whole `canInvoke` (mention gate and
	 *     freshness): in a gated group an unaddressed "sim" between two people must not approve a publication.
	 *     Exactly one open ask this person may answer with that yes / no ⇒ answered; several ⇒ ONE question
	 *     back ("which one?"), and a second bare answer from them within `DISAMBIGUATION_QUIET_MS` goes on;
	 *  4. a quote or code of an ask ALREADY answered (late, or someone else was first) ⇒ nothing here: the
	 *     message takes the usual path, where a quote of an issue's message steers that issue.
	 *
	 * Who may answer is `ANSWER_GATE` (an ask with an effect, or a permission, only by someone who may
	 * release). Every read is inside the ingest's transaction, which holds the write lock from its first
	 * statement (`BEGIN IMMEDIATE`), so an ask read open here cannot be answered by anyone else before this
	 * commits — the rule never loses the race inside its own transaction, and a throw here would lose the
	 * message (the inbound ledger is claimed before the ingest).
	 */
	private async answer(
		thread: Thread,
		input: this['input'],
		ctx: { quoted?: TranscriptEntry; repliesToAgent: boolean; language: ReturnType<typeof resolveThreadLanguage> },
		tx: Transaction,
	): Promise<this['output'] | undefined> {
		const sender = input.senderExternalId
		const target = await this.router.answerTarget(
			{ threadId: thread.id.value, quotedEntryId: ctx.quoted?.entryId, quotedIssueId: ctx.quoted?.issueId, text: input.text },
			tx,
		)
		if (target) {
			const [only] = target.stops
			if (target.stops.length === 1 && only) return this.give(thread, input, ctx.quoted, only, target.answerText, tx)
			// A digest quoted without a code: the asks in it this person could still answer.
			return this.disambiguate(thread, input, this.answerable(thread, target, sender), ctx.language, tx)
		}

		const bare = ctx.quoted ? undefined : parseBareAnswer(thread.textWithoutMention(input.text))
		if (!bare) return undefined
		const addressed = thread.canInvoke({
			senderExternalId: sender,
			text: input.text,
			repliesToAgent: ctx.repliesToAgent,
			sentAt: input.receivedAt,
			now: new Date(),
		})
		if (!addressed) return undefined
		const open = (await this.threads.openStops(thread.id.value, tx)).filter(stop => {
			const way = answeredInGroupAs(stop)
			return way !== undefined && seenByTheGroup(stop) && BARE_ANSWERS_STOP[way](stop, bare) && mayAnswer(thread, stop, sender)
		})
		const [single] = open
		if (open.length === 1 && single) return this.give(thread, input, undefined, single, input.text, tx)
		return this.disambiguate(thread, input, open, ctx.language, tx)
	}

	/**
	 * The language of the one line this path may write itself — the "which one?" of a bare answer. ASKED ONLY
	 * WHEN IT CAN BE USED (the `RaiseStop` rule): the conversation declares none AND it has two or more open
	 * stops; every other message pays nothing. Resolved BEFORE the transaction (the cloud session may do I/O),
	 * and a session that cannot answer falls back to the default language — a lookup must never lose a message
	 * whose inbound ledger row is already claimed.
	 */
	private async disambiguationLanguage(thread: Thread): Promise<ReturnType<typeof resolveThreadLanguage>> {
		if (thread.language) return resolveThreadLanguage(thread.language, undefined)
		if ((await this.threads.openStops(thread.id.value)).length < 2) return resolveThreadLanguage(undefined, undefined)
		const identity = await tryCatchAsync(() => this.session.identity())
		return resolveThreadLanguage(undefined, identity.success ? identity.data?.user.language : undefined)
	}

	/** The open stops of a target this person may answer. */
	private answerable(thread: Thread, target: AnswerTarget, sender: string): Stop[] {
		return target.stops.filter(stop => !stop.resolvedAt && mayAnswer(thread, stop, sender))
	}

	/**
	 * Answer ONE stop with this message — or `undefined` when it is not this message's to answer: already
	 * answered (rule 4), a person the ruler refuses, or nothing readable as an answer. The entry is recorded on
	 * the stop's issue, the answer goes through the same use case every door uses, and the only reply in the
	 * group is the 👀 — the session hears the answer through `ResumeIssueOnStopResolved`.
	 */
	private async give(
		thread: Thread,
		input: this['input'],
		quoted: TranscriptEntry | undefined,
		stop: Stop,
		answerText: string,
		tx: Transaction,
	): Promise<this['output'] | undefined> {
		const sender = input.senderExternalId
		const way = answeredInGroupAs(stop)
		if (stop.resolvedAt || way === undefined || !mayAnswer(thread, stop, sender)) return undefined

		const resolve = this.reading(thread, stop, way, sender, answerText)
		if (!resolve) return undefined

		const entry = thread.recordEntry({
			kind: TranscriptKind.CONTACT,
			text: input.text,
			senderExternalId: sender,
			quotedEntry: quoted ? { entryId: quoted.entryId, threadId: quoted.threadId } : undefined,
			issueId: stop.issueId,
			classification: quoted?.issueId ? ClassificationMethod.REPLY_QUOTE : undefined,
			messageType: input.messageType,
			mediaPath: input.mediaPath,
			at: input.receivedAt,
		})
		await this.threads.save(thread, tx)
		await resolve(tx)
		await this.routedSteer.cue(thread, input, entry.entryId, CUE_ACKNOWLEDGED, tx)
		return this.ingested(thread, input, entry, tx)
	}

	/**
	 * How this message resolves the stop, by how a reply answers its kind — `undefined` when the text says
	 * nothing an answer can be read from. An ask is answered through `AnswerStop`; a permission by a bare yes /
	 * no through `ResolveStop` (`YES_NO_RESOLUTION`), confined to this conversation, under the sender's posture.
	 */
	private reading(
		thread: Thread,
		stop: Stop,
		way: ReplyAnswerWay,
		sender: string,
		answerText: string,
	): ((tx: Transaction) => Promise<void>) | undefined {
		switch (way) {
			case ReplyAnswerWay.ASK: {
				const answer = stop.ask ? parseAskAnswer(thread.textWithoutMention(answerText), stop.ask) : undefined
				if (!answer) return undefined
				return async tx => {
					await this.answerStop.execute(
						{ ownerId: thread.ownerId, stopId: stop.stopId, answer, answeredBy: sender, threadId: thread.id.value },
						tx,
					)
				}
			}
			case ReplyAnswerWay.YES_NO: {
				const bare = parseBareAnswer(thread.textWithoutMention(answerText))
				if (!bare) return undefined
				return async tx => {
					await this.resolveStop.execute(
						{
							ownerId: thread.ownerId,
							stopId: stop.stopId,
							resolution: YES_NO_RESOLUTION[bare],
							runThreadId: thread.id.value,
							runPosture: thread.postureOf(sender),
						},
						tx,
					)
				}
			}
			default: {
				const unhandled: never = way
				return unhandled
			}
		}
	}

	/**
	 * Several open asks this message could be for: ask the group ONE question — "which one?", with the codes —
	 * and remember it (`AnswerDisambiguationAskedEvent`). Nothing to choose between, or this person was already
	 * asked within `DISAMBIGUATION_QUIET_MS` ⇒ `undefined`: the message goes on to the orchestrator.
	 */
	private async disambiguate(
		thread: Thread,
		input: this['input'],
		stops: Stop[],
		language: ReturnType<typeof resolveThreadLanguage>,
		tx: Transaction,
	): Promise<this['output'] | undefined> {
		if (stops.length < 2) return undefined
		const sender = input.senderExternalId
		const since = new Date(Date.now() - DISAMBIGUATION_QUIET_MS)
		const asked = await this.domainEventRepository.listByNameSince(AnswerDisambiguationAskedEvent.name, since, tx)
		const quiet = asked.some(fact => {
			const payload = fact.payload as { threadId?: string; participantId?: string }
			return payload.threadId === thread.id.value && payload.participantId === sender
		})
		if (quiet) return undefined

		const asks = await Promise.all(
			stops.map(async stop => {
				const issue = stop.issueId ? await this.issues.findById(stop.issueId, tx) : undefined
				return { key: issue?.key ?? '', question: stop.ask?.question ?? stop.title }
			}),
		)
		const entry = thread.recordEntry({
			kind: TranscriptKind.CONTACT,
			text: input.text,
			senderExternalId: sender,
			messageType: input.messageType,
			mediaPath: input.mediaPath,
			at: input.receivedAt,
		})
		const question = thread.recordEntry({
			kind: TranscriptKind.SYSTEM,
			text: THREAD_MESSAGES.answerDisambiguation(language, { asks }),
			addresseeId: sender,
		})
		await this.threads.save(thread, tx)
		await this.commands.enqueueCommand<DeliverChannelMessage>(
			'deliver_channel_message',
			{
				ownerId: thread.ownerId,
				channelId: thread.channelId,
				contactExternalId: thread.contactRef.externalId,
				text: question.text,
				author: MessageAuthor.SYSTEM,
				replyEntryId: question.entryId,
				replyThreadId: thread.id.value,
				reactionsEnabled: thread.reactionsEnabled,
			},
			{ jobId: question.entryId },
			tx,
		)
		await this.domainEventRepository.save(
			new AnswerDisambiguationAskedEvent({
				entityId: thread.id.value,
				ownerId: thread.ownerId,
				payload: {
					threadId: thread.id.value,
					participantId: sender,
					entryId: entry.entryId,
					questionEntryId: question.entryId,
					stopIds: stops.map(stop => stop.stopId),
				},
			}),
			tx,
		)
		return this.ingested(thread, input, entry, tx)
	}

	/**
	 * "ESTOU RESPONDENDO OUTRA" (voz do grupo, 25/11) — a message that lands while a turn is still answering another
	 * for the same target waits in the queue (the orchestrator answers one message per turn; a task reads its steers
	 * when its step ends). The person is told so, by rule, quoting their message — ONCE per running turn: the notice's
	 * entry id is derived from the running item, so a second message in the same turn finds it and says nothing.
	 * Only on the branches that wake a turn (the same ones as the 👀), never on the answer path.
	 */
	private async noticeBusy(
		thread: Thread,
		input: this['input'],
		entryId: string,
		target: { kind: MailboxTargetKind; id: string; key?: string },
		language: ReturnType<typeof resolveThreadLanguage>,
		tx: Transaction,
	): Promise<void> {
		const running = await this.mailbox.runningItem(target.kind, target.id, tx)
		if (!running) return
		const noticeId = derivedId('busy', running.id)
		if (await this.threads.findEntry(noticeId, tx)) return
		const text =
			target.key === undefined ? THREAD_MESSAGES.busyOrchestrator(language) : THREAD_MESSAGES.busyIssue(language, { key: target.key })
		const notice = thread.recordEntry({
			entryId: noticeId,
			kind: TranscriptKind.SYSTEM,
			text,
			quotedEntry: { entryId, threadId: thread.id.value },
		})
		await this.threads.save(thread, tx)
		await this.commands.enqueueCommand<DeliverChannelMessage>(
			'deliver_channel_message',
			{
				ownerId: thread.ownerId,
				channelId: thread.channelId,
				contactExternalId: thread.contactRef.externalId,
				text,
				author: MessageAuthor.SYSTEM,
				quotedMessageId: input.platformMessageId,
				replyEntryId: notice.entryId,
				replyThreadId: thread.id.value,
				reactionsEnabled: thread.reactionsEnabled,
			},
			{ jobId: notice.entryId },
			tx,
		)
	}

	/**
	 * What each conversation command answers, composed before the ingest's transaction — total over
	 * `ThreadCommand`, so a new command needs its answer here.
	 */
	private commandAnswer(): Readonly<Record<ThreadCommand, (thread: Thread) => Promise<string>>> {
		return {
			[ThreadCommand.REPORT]: async thread => this.bulletin.compose(thread, await this.conversationLanguage(thread), new Date()),
		}
	}

	/**
	 * The command's answer, or `undefined` when it cannot be composed — then the message is NOT a command and
	 * takes the usual path (the orchestrator answers it). A read that fails must never lose a message whose
	 * inbound ledger row is already claimed.
	 */
	private async prepareCommand(thread: Thread, command: ThreadCommand): Promise<{ command: ThreadCommand; text: string } | undefined> {
		const answer = await tryCatchAsync(() => this.commandAnswer()[command](thread))
		if (answer.success) return { command, text: answer.data }
		this.logging.warn({
			content: { message: 'conversation command not answered — the message takes the usual path', command, reason: answer.error.message },
		})
		return undefined
	}

	/**
	 * The conversation's language for a line this path writes itself: the declared one, else the account's —
	 * a session that cannot answer falls back to the default (a lookup must never lose a message whose inbound
	 * ledger row is already claimed).
	 */
	private async conversationLanguage(thread: Thread): Promise<ReturnType<typeof resolveThreadLanguage>> {
		if (thread.language) return resolveThreadLanguage(thread.language, undefined)
		const identity = await tryCatchAsync(() => this.session.identity())
		return resolveThreadLanguage(undefined, identity.success ? identity.data?.user.language : undefined)
	}

	/**
	 * A CONVERSATION COMMAND (fase 3, item 4) — `boletim` answered by rule (`relatorio` is the orchestrator's since 25/11): the message is recorded, the
	 * answer prepared before the transaction is recorded and delivered (quoting the message that asked), and
	 * `thread.bulletin_sent` counts it. NO model turn — no mailbox item. Only for a sender who may command the
	 * agent (`Thread.canCommand`: the mention gate and the freshness window — a backlog replay of a week-old
	 * "boletim" answers nothing); anyone else's "boletim" takes the usual path.
	 */
	private async runCommand(
		thread: Thread,
		input: this['input'],
		prepared: { command: ThreadCommand; text: string },
		repliesToAgent: boolean,
		tx: Transaction,
	): Promise<this['output'] | undefined> {
		const allowed = thread.canCommand({
			senderExternalId: input.senderExternalId,
			text: input.text,
			repliesToAgent,
			sentAt: input.receivedAt,
			now: new Date(),
		})
		if (!allowed) return undefined

		const entry = thread.recordEntry({
			kind: TranscriptKind.CONTACT,
			text: input.text,
			senderExternalId: input.senderExternalId,
			messageType: input.messageType,
			mediaPath: input.mediaPath,
			at: input.receivedAt,
		})
		const answer = thread.recordEntry({
			kind: TranscriptKind.SYSTEM,
			text: prepared.text,
			quotedEntry: { entryId: entry.entryId, threadId: thread.id.value },
		})
		await this.threads.save(thread, tx)
		await this.commands.enqueueCommand<DeliverChannelMessage>(
			'deliver_channel_message',
			{
				ownerId: thread.ownerId,
				channelId: thread.channelId,
				contactExternalId: thread.contactRef.externalId,
				text: answer.text,
				author: MessageAuthor.SYSTEM,
				quotedMessageId: input.platformMessageId,
				replyEntryId: answer.entryId,
				replyThreadId: thread.id.value,
				reactionsEnabled: thread.reactionsEnabled,
			},
			{ jobId: answer.entryId },
			tx,
		)
		await this.domainEventRepository.save(
			new BulletinSentEvent({
				entityId: thread.id.value,
				ownerId: thread.ownerId,
				payload: { threadId: thread.id.value, entryId: entry.entryId, bulletinEntryId: answer.entryId },
			}),
			tx,
		)
		return this.ingested(thread, input, entry, tx)
	}

	/** The fact every ingest ends with, for a message that started no turn. */
	private async ingested(thread: Thread, input: this['input'], entry: TranscriptEntry, tx: Transaction): Promise<this['output']> {
		await this.domainEventRepository.save(
			new MessageIngestedEvent({
				entityId: thread.id.value,
				ownerId: thread.ownerId,
				payload: { threadId: thread.id.value, entryId: entry.entryId, senderExternalId: input.senderExternalId, invocable: false },
			}),
			tx,
		)
		return { entryId: entry.entryId, invocable: false, triage: false }
	}

	/**
	 * A CONTROL WORD — pause or resume one issue, now, with no turn in between (fase 2, item 2).
	 *
	 * Taken only when ALL of these hold, and each failure falls through to the usual path (`undefined`):
	 *  - a TARGET: a quoted message linked to an issue, or exactly one issue key — any non-archived issue,
	 *    not only a WORKING one (`RuleRouter.target`);
	 *  - the sender could address the agent, minus the thread's own pause (`Thread.canCommand`): a muted
	 *    participant cannot pause anyone's work, and a backlog replay cannot either;
	 *  - the word APPLIES to the issue as it stands (`CONTROL_EFFECT`). A "continue" on an issue that is
	 *    not paused is not a command — it is somebody saying "continue with X", which is a steer.
	 *
	 * IDEMPOTENT under redelivery: a "pare" on an issue already paused is acknowledged and recorded but runs
	 * nothing, so a redelivered gateway event never throws ISSUE_ALREADY_PAUSED inside this transaction and
	 * rolls the transcript entry back with it.
	 *
	 * The entry is recorded linked to the issue (the issue's timeline shows the message), the pause/resume
	 * runs in THIS transaction (entry and hold commit together), and the only reply is the reaction cue.
	 */
	/** The use case each command runs — dispatched by the command, never branched on it. */
	private controlUseCase(): Readonly<Record<IssueControlCommand, PauseIssue | ResumeIssue>> {
		return { [IssueControlCommand.PAUSE]: this.pauseIssue, [IssueControlCommand.RESUME]: this.resumeIssue }
	}

	private async control(
		thread: Thread,
		input: this['input'],
		ctx: {
			command: IssueControlCommand
			quoted: Awaited<ReturnType<ThreadRepository['findEntry']>>
			repliesToAgent: boolean
		},
		tx: Transaction,
	): Promise<this['output'] | undefined> {
		const target = await this.router.target({ threadId: thread.id.value, quotedIssueId: ctx.quoted?.issueId, text: input.text }, tx)
		if (!target) return undefined
		const allowed = thread.canCommand({
			senderExternalId: input.senderExternalId,
			text: input.text,
			repliesToAgent: ctx.repliesToAgent,
			sentAt: input.receivedAt,
			now: new Date(),
		})
		if (!allowed) return undefined
		const issue = await this.issues.findById(target.issue.issueId, tx)
		if (!issue) return undefined

		const effect = CONTROL_EFFECT[ctx.command]
		const action = effect.decide(issue)
		if (action === 'IGNORE') return undefined

		const entry = thread.recordEntry({
			kind: TranscriptKind.CONTACT,
			text: input.text,
			senderExternalId: input.senderExternalId,
			quotedEntry: ctx.quoted ? { entryId: ctx.quoted.entryId, threadId: ctx.quoted.threadId } : undefined,
			issueId: issue.id.value,
			classification: ctx.quoted?.issueId ? ClassificationMethod.REPLY_QUOTE : undefined,
			messageType: input.messageType,
			mediaPath: input.mediaPath,
			at: input.receivedAt,
		})
		await this.threads.save(thread, tx)

		if (action === 'APPLY') {
			const request = {
				ownerId: thread.ownerId,
				issueId: issue.id.value,
				source: IssueControlSource.WHATSAPP,
				requestedBy: thread.displayNameOf(input.senderExternalId),
				requestedById: input.senderExternalId,
			}
			await this.controlUseCase()[ctx.command].execute(request, tx)
		}

		await this.routedSteer.cue(thread, input, entry.entryId, effect.cue, tx)

		await this.domainEventRepository.save(
			new MessageIngestedEvent({
				entityId: thread.id.value,
				ownerId: thread.ownerId,
				payload: { threadId: thread.id.value, entryId: entry.entryId, senderExternalId: input.senderExternalId, invocable: false },
			}),
			tx,
		)
		return { entryId: entry.entryId, invocable: false, triage: false }
	}
}
