import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, CommandQueue, tryCatchAsync } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import {
	IssueControlSource,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	MessageAuthor,
	PanelActionKind,
	PanelActionOutcome,
	PermissionPosture,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { PauseIssue } from '@issue/usecases/PauseIssue'
import { ResumeIssue } from '@issue/usecases/ResumeIssue'
import { ReopenIssue } from '@issue/usecases/ReopenIssue'
import { CloudSession } from '@shared/services/CloudSession'
import { resolveThreadLanguage, type CatalogLanguage } from '@shared/i18n/messages'
import { PanelActionBodySchema, type PanelActionBody } from '@shared/schemas'
import type { Thread } from '../entities/Thread'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { PanelActionLedger } from '../repositories/PanelActionLedger'
import { OpenIssuesReader } from '../services/OpenIssuesReader'
import { PanelActionEcho } from '../enums'
import { THREAD_MESSAGES } from '../i18n/messages'
import { OFFERED_ON_PANEL } from '../utils/StopResolutions'
import type { ApplicationErrors, DomainErrors } from '../errors'
import { ResolveStop } from './ResolveStop'
import { AnswerStop } from './AnswerStop'
import { askCode } from '../utils/askAnswer'
import type { DeliverChannelMessage } from './DeliverChannelMessage'

export const ExecutePanelActionInputSchema = z.object({
	/** The cloud's action id — the exactly-once key. */
	actionId: z.uuid(),
	threadId: z.uuid(),
	/**
	 * Who asked, as the LIVE roster resolves the opaque `memberId` on this machine — never the name the
	 * cloud has. Absent: the member is no longer on the roster, and the action is refused.
	 */
	member: z
		.object({
			/** The WhatsApp address — local only, recorded as `requestedById`, never sent anywhere. */
			externalId: z.string().min(1),
			/** The roster id the grants are read under — the address, or `operator` for the account's own number. */
			participantId: z.string().min(1),
			/** The contact-book name (the one the panel lists) — what the echo and the facts say. */
			name: z.string().min(1),
		})
		.optional(),
	action: PanelActionBodySchema,
})
export const ExecutePanelActionOutputSchema = z.object({
	outcome: z.enum(PanelActionOutcome),
	code: z.string().optional(),
	/** False when the action id was already in the ledger — nothing was done this time. */
	executed: z.boolean(),
})

/** The echo verb of each answer to a stop — total over `StopResolution`. */
const ANSWER_ECHO: Readonly<Record<StopResolution, PanelActionEcho>> = {
	[StopResolution.APPROVE]: PanelActionEcho.APPROVED,
	[StopResolution.DENY]: PanelActionEcho.DENIED,
	[StopResolution.RETRY]: PanelActionEcho.ANSWERED,
	[StopResolution.REVIEW_AND_SEND]: PanelActionEcho.ANSWERED,
	[StopResolution.TAKE_OVER]: PanelActionEcho.ANSWERED,
	[StopResolution.ANSWER]: PanelActionEcho.ANSWERED,
	[StopResolution.DEFAULT_APPLIED]: PanelActionEcho.ANSWERED,
}

type ActionOf<K extends PanelActionKind> = Extract<PanelActionBody, { kind: K }>
type Member = NonNullable<ExecutePanelAction['input']['member']>
/** What the group's echo line says: the verb, and — for an answered ask — its number, so the line names the code. */
interface Echo {
	verb: PanelActionEcho
	seq?: number
}
interface Act {
	thread: Thread
	member: Member
	actionId: string
	/** The echo's language — resolved BEFORE the transaction, since it may ask the cloud session. */
	language: CatalogLanguage
}

/**
 * Execute ONE action a person asked for on the cloud panel (fase 2, item 6b), as THAT member — the daemon
 * is the authority, so every rule the cloud checked is checked again here against the state of now.
 *
 *  - PAUSE / RESUME → `PauseIssue` / `ResumeIssue` with source PANEL, `requestedBy` = the contact-book
 *    name, `requestedById` = the address (local). Same use cases the WhatsApp command and the console run.
 *  - STEER → the router's own path: a STEER mailbox item to the issue, signed `<name>: <text>`, under the
 *    member's posture (reopening a finished issue first, as `SteerIssueTurn` does). The issue timeline
 *    shows it with its sent/delivered/read instants.
 *  - ANSWER_STOP → `ResolveStop` under the member's posture — only for a member who may release NOW
 *    (`Thread.postureOf` is BYPASS), only an open stop of THIS issue, only an answer the panel offers.
 *  - ANSWER_ASK (fase 3) → `AnswerStop` as the member — an issue's decision or question answered with an
 *    option or free text, under the same ruler of who may answer as the group and the console; the echo
 *    names the ask's code ("Ana respondeu APP-12 · D1 pelo painel").
 *
 * PAUSE / RESUME / STEER also need the member to be someone who may act (`Thread.mayAct`): a muted
 * participant stays muted on the panel too.
 *
 * Exactly once: the ledger row (keyed by the cloud's action id) is written in the SAME transaction as
 * the effect and the echo, so a re-delivered action finds it and acts on nothing. A refusal (a
 * `BaseError` from any rule) rolls that transaction back and is recorded on its own, with its code; any
 * other failure records nothing and the cloud hands the action out again.
 *
 * The group sees ONE short line per executed action (decisão do dono): "Ana pausou APP-12 pelo painel" —
 * a SYSTEM entry linked to the issue plus its `deliver_channel_message`, the `NotifyProviderPaused`
 * shape. Never the steer's words: those went to the session, not to the room.
 */
@injectable()
export class ExecutePanelAction extends Handler<typeof ExecutePanelActionInputSchema, typeof ExecutePanelActionOutputSchema> {
	readonly name = 'execute_panel_action' as const
	readonly inputSchema = ExecutePanelActionInputSchema
	readonly outputSchema = ExecutePanelActionOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly ledger: PanelActionLedger,
		private readonly issues: IssueRepository,
		private readonly openIssues: OpenIssuesReader,
		private readonly mailbox: MailboxRepository,
		private readonly commands: CommandQueue,
		private readonly session: CloudSession,
		private readonly pauseIssue: PauseIssue,
		private readonly resumeIssue: ResumeIssue,
		private readonly reopenIssue: ReopenIssue,
		private readonly resolveStop: ResolveStop,
		private readonly answerStop: AnswerStop,
	) {
		super()
	}

	/** The effect of one action — a switch on the discriminant, so each case sees its own member; returns the echo verb. */
	private async effect(act: Act, action: PanelActionBody, tx: Transaction): Promise<Echo> {
		switch (action.kind) {
			case PanelActionKind.PAUSE:
				return { verb: await this.control(act, action.issueId, this.pauseIssue, PanelActionEcho.PAUSED, tx) }
			case PanelActionKind.RESUME:
				return { verb: await this.control(act, action.issueId, this.resumeIssue, PanelActionEcho.RESUMED, tx) }
			case PanelActionKind.STEER:
				return { verb: await this.steer(act, action, tx) }
			case PanelActionKind.ANSWER_STOP:
				return { verb: await this.answer(act, action, tx) }
			case PanelActionKind.ANSWER_ASK:
				return this.answerAsk(act, action, tx)
			default: {
				const unhandled: never = action
				return unhandled
			}
		}
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const prior = await this.ledger.find(input.actionId)
		if (prior) return { outcome: prior.outcome, code: prior.code, executed: false }

		const thread = await this.threads.findById(input.threadId)
		// Resolved outside the write transaction: the owner's language may come from the cloud session.
		const ownerLanguage = thread && !thread.language ? (await this.session.identity())?.user.language : undefined
		const language = resolveThreadLanguage(thread?.language, ownerLanguage)
		const attempt = await tryCatchAsync(() =>
			this.withTransaction(undefined, async tx => {
				if (!thread || thread.deletedAt) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
				if (!input.member) throw new BaseError<DomainErrors>('PARTICIPANT_NOT_FOUND', 'the member is no longer on the roster')
				const recorded = await this.ledger.record(
					{
						actionId: input.actionId,
						ownerId: thread.ownerId,
						threadId: thread.id.value,
						kind: input.action.kind,
						outcome: PanelActionOutcome.DONE,
						executedAt: new Date(),
					},
					tx,
				)
				// A concurrent run took the latch first: it owns the effect and the outcome.
				if (!recorded) return false
				const act = { thread, member: input.member, actionId: input.actionId, language }
				const echo = await this.effect(act, input.action, tx)
				await this.echo(act, input.action.issueId, echo, tx)
				return true
			}),
		)

		if (attempt.success) {
			if (attempt.data) return { outcome: PanelActionOutcome.DONE, executed: true }
			const winner = await this.ledger.find(input.actionId)
			return { outcome: winner?.outcome ?? PanelActionOutcome.DONE, code: winner?.code, executed: false }
		}
		// Only a NAMED refusal is an outcome; anything else (the database, the queue) is retried by re-delivery.
		if (!(attempt.error instanceof BaseError)) throw attempt.error
		const code = attempt.error.name
		await this.ledger.record({
			actionId: input.actionId,
			ownerId: thread?.ownerId ?? '',
			threadId: input.threadId,
			kind: input.action.kind,
			outcome: PanelActionOutcome.REFUSED,
			code,
			executedAt: new Date(),
		})
		return { outcome: PanelActionOutcome.REFUSED, code, executed: true }
	}

	/** Pause or resume — the issue must be one of THIS conversation's. */
	private async control(
		act: Act,
		issueId: string,
		useCase: PauseIssue | ResumeIssue,
		echo: PanelActionEcho,
		tx: Transaction,
	): Promise<PanelActionEcho> {
		this.mustAct(act)
		const issue = await this.issues.findById(issueId, tx)
		if (!issue || issue.threadId !== act.thread.id.value)
			throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${issueId} here`)
		await useCase.execute(
			{
				ownerId: act.thread.ownerId,
				issueId,
				source: IssueControlSource.PANEL,
				requestedBy: act.member.name,
				requestedById: act.member.externalId,
			},
			tx,
		)
		return echo
	}

	private async steer(act: Act, action: ActionOf<PanelActionKind.STEER>, tx: Transaction): Promise<PanelActionEcho> {
		this.mustAct(act)
		const target = await this.openIssues.steerableIssue(act.thread.id.value, action.issueId, tx)
		if (!target) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no steerable issue ${action.issueId} here`)
		// Same order as SteerIssueTurn: a finished issue is reopened in the SAME transaction as the enqueue.
		if (target.needsReopen) await this.reopenIssue.execute({ ownerId: act.thread.ownerId, issueId: action.issueId }, tx)
		await this.mailbox.enqueue(
			{
				ownerId: act.thread.ownerId,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: action.issueId,
				kind: MailboxItemKind.STEER,
				claimClass: MailboxClaimClass.STEER,
				posture: act.thread.postureOf(act.member.participantId),
				payload: {
					issueId: action.issueId,
					threadId: act.thread.id.value,
					key: target.key,
					title: target.title,
					text: `${act.member.name}: ${action.text}`,
				},
				dedupKey: `panel:${act.actionId}`,
			},
			tx,
		)
		return PanelActionEcho.STEERED
	}

	private async answer(act: Act, action: ActionOf<PanelActionKind.ANSWER_STOP>, tx: Transaction): Promise<PanelActionEcho> {
		// The grant, read NOW — the cloud's copy of the roster can be 15 s old.
		const posture = act.thread.postureOf(act.member.participantId)
		if (posture !== PermissionPosture.BYPASS) {
			throw new BaseError<ApplicationErrors>('PARTICIPANT_CANNOT_RELEASE', 'this member may not release a stop')
		}
		const open = await this.threads.openStops(act.thread.id.value, tx)
		if (!open.some(stop => stop.stopId === action.stopId && stop.issueId === action.issueId)) {
			throw new BaseError<ApplicationErrors>('STOP_NOT_FOUND', `no open stop ${action.stopId} on this issue`)
		}
		if (!OFFERED_ON_PANEL[action.resolution]) {
			throw new BaseError<DomainErrors>('RESOLUTION_NOT_APPLICABLE', `${action.resolution} is not offered on the panel`)
		}
		// Resolved as a caller confined to THIS thread, under the member's posture (Decision 7).
		await this.resolveStop.execute(
			{
				ownerId: act.thread.ownerId,
				stopId: action.stopId,
				resolution: action.resolution,
				runThreadId: act.thread.id.value,
				runPosture: posture,
			},
			tx,
		)
		return ANSWER_ECHO[action.resolution]
	}

	/**
	 * ANSWER_ASK (fase 3) — the panel's door into `AnswerStop`, the one door that carries an answer: the same
	 * ruler of who may answer (an ask with an effect only by someone who may release — PARTICIPANT_CANNOT_RELEASE;
	 * any other by anyone who may act — PARTICIPANT_CANNOT_ACT), the same "first answer wins", the same resume.
	 * Run as the member's roster id, confined to this conversation and — checked here, since `AnswerStop` only
	 * confines the thread — to THIS issue's open ask. The echo names the ask's code ("APP-12 · D1").
	 */
	private async answerAsk(act: Act, action: ActionOf<PanelActionKind.ANSWER_ASK>, tx: Transaction): Promise<Echo> {
		const stop = await this.threads.findStop(action.stopId, tx)
		if (!stop || stop.threadId !== act.thread.id.value || stop.issueId !== action.issueId) {
			throw new BaseError<ApplicationErrors>('STOP_NOT_FOUND', `no stop ${action.stopId} on this issue`)
		}
		await this.answerStop.execute(
			{
				ownerId: act.thread.ownerId,
				stopId: action.stopId,
				answer: action.answer,
				answeredBy: act.member.participantId,
				threadId: act.thread.id.value,
			},
			tx,
		)
		return { verb: PanelActionEcho.ANSWERED, seq: stop.seq }
	}

	private mustAct(act: Act): void {
		if (!act.thread.mayAct(act.member.participantId)) {
			throw new BaseError<ApplicationErrors>('PARTICIPANT_CANNOT_ACT', 'a muted participant may not act on the work')
		}
	}

	/** The one line the group gets — recorded linked to the issue and delivered like every SYSTEM line. */
	private async echo(act: Act, issueId: string, echo: Echo, tx: Transaction): Promise<void> {
		const issue = await this.issues.findById(issueId, tx)
		// Re-read inside the transaction: the effect above may have saved this same thread.
		const thread = (await this.threads.findById(act.thread.id.value, tx)) ?? act.thread
		const entry = thread.recordEntry({
			kind: TranscriptKind.SYSTEM,
			// The subject is the issue's key — or, for an answered ask, its code ("Ana respondeu APP-12 · D1 pelo painel").
			text: THREAD_MESSAGES.panelActionEcho(act.language, {
				name: act.member.name,
				key: askCode(issue?.key ?? '', echo.seq),
				echo: echo.verb,
			}),
			issueId,
		})
		await this.threads.save(thread, tx)
		await this.commands.enqueueCommand<DeliverChannelMessage>(
			'deliver_channel_message',
			{
				ownerId: thread.ownerId,
				channelId: thread.channelId,
				contactExternalId: thread.contactRef.externalId,
				text: entry.text,
				author: MessageAuthor.SYSTEM,
				replyEntryId: entry.entryId,
				replyThreadId: thread.id.value,
				reactionsEnabled: thread.reactionsEnabled,
			},
			{ jobId: entry.entryId },
			tx,
		)
	}
}
