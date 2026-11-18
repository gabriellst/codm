import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import {
	ClassificationMethod,
	IssueControlSource,
	IssueStatus,
	MailboxItemKind,
	MailboxTargetKind,
	MessageType,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { InboundTriage, TRIAGE_HOLDER } from '@agent/services/InboundTriage'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { PauseIssue } from '@issue/usecases/PauseIssue'
import { ResumeIssue } from '@issue/usecases/ResumeIssue'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { RuleRouter } from '../services/RuleRouter'
import { RoutedSteer } from '../services/RoutedSteer'
import { AGENT_SPEAKER } from '../objects'
import { MessageIngestedEvent } from '../events/MessageIngestedEvent'
import { CUE_ACKNOWLEDGED, CUE_PAUSED, CUE_RESUMED } from '../utils/ChannelCues'
import { parseControlCommand } from '../utils/controlCommand'
import { IssueControlCommand } from '../enums'
import type { Thread } from '../entities/Thread'
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
	/**
	 * The orchestrator's item was queued HELD for the parallel triage (fase 2) — the caller hands the entry
	 * to `InboundTriageQueue` after this commit. False on every other path: routed, not invocable, media, or
	 * an env that does not triage.
	 */
	triage: z.boolean(),
})

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

			// A CONTROL WORD WITH A TARGET (fase 2, item 2 — "pare APP-12", "continue" quoting an issue) is
			// handled here, BEFORE the invocation gate: it must work while the conversation is paused, and it
			// never becomes an orchestrator turn. Anything short of a clean command — no control word, no
			// target, a sender who may not address the agent, an issue the word does not apply to — returns
			// `undefined` and the message takes the usual path below, unchanged.
			const command = parseControlCommand(thread.textWithoutMention(input.text))
			if (command) {
				const controlled = await this.control(thread, input, { command, quoted, repliesToAgent }, tx)
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
			} else if (invocable) {
				// THE PARALLEL TRIAGE (fase 2) — the rule layer could not route this, so a stateless triage on the
				// provider's small model decides, in parallel with every other message, whether it is a steer of
				// one open issue, needs no work, or is the orchestrator's after all. The item is written NOW, in
				// this transaction, HELD for the triage: durable from the first instant, and claimable by the
				// orchestrator the moment the hold lapses or this daemon dies (`EnqueueMailboxItem.hold`). A
				// media message is not triaged — the model would read only its placeholder.
				const holdMs = input.messageType === undefined ? this.triage.holdMs : undefined
				triage = holdMs !== undefined
				await this.mailbox.enqueue(
					{
						ownerId: thread.ownerId,
						targetKind: MailboxTargetKind.THREAD,
						targetId: thread.id.value,
						kind: MailboxItemKind.OPERATOR_MESSAGE,
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
