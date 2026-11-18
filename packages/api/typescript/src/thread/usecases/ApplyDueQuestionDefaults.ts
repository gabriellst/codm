import { injectable } from 'tsyringe-neo'
import { BaseError, CommandQueue, Handler, LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import { AskAnswerKind, IssueSignalLevel, PermissionPosture, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { resolveThreadLanguage } from '@shared/i18n/messages'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { IssueHold } from '@issue/services/IssueHold'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import type { Stop } from '../entities/Thread'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { THREAD_MESSAGES } from '../i18n/messages'
import { labelOfAnswer } from '../utils/askAnswer'
import { enqueueSignalDelivery, recordIssueSignal } from '../utils/issueSignal'
import type { DomainErrors } from '../errors'

export const ApplyDueQuestionDefaultsInputSchema = z.object({
	/** The instant the sweep judges against — handed in (the core has no clock), so a test never sleeps. */
	now: z.date().optional(),
})
export const ApplyDueQuestionDefaultsOutputSchema = z.object({
	/** The questions that went on with their default this tick. */
	appliedStopIds: z.array(z.uuid()),
	/** Due, but not now: the issue is held, the channel is down or just (re)connected, or an answer won. */
	waitingStopIds: z.array(z.uuid()),
})

/** How often the sweep runs — a question is due on a 15-minute scale, so 30 s late is the worst case. */
export const APPLY_DUE_QUESTION_DEFAULTS_INTERVAL_MS = 30 * 1000

/**
 * Nothing is applied this long after this daemon came to hear the channel (boot or reconnect): the backlog
 * a reconnect replays may carry the answer, and an answer is valid without the freshness window — it has to
 * get its chance to be ingested before the default overrides it.
 */
export const DEFAULT_GRACE_AFTER_CONNECT_MS = 2 * 60 * 1000

/** A default applied this long after its deadline is told as LATE — "codm was off when it passed". */
export const LATE_DEFAULT_AFTER_MS = 5 * 60 * 1000

/** Why a due question is not applied on this tick — it stays due and the next tick asks again. */
type Wait = 'HELD' | 'NOT_LISTENING' | 'GONE' | 'ANSWERED'

/**
 * THE 15-MINUTE DEFAULT (fase 3, item 1b; owner decision) — a question delivered to the group and left
 * unanswered goes on with the default the issue declared.
 *
 * ### Persisted state + a repeated sweep, never a timer (scheduler SCH-01/02/03a)
 * The deadline is a column (`issue_stops.due_at`, set once when the gateway accepted the message carrying
 * the question — `DeliverChannelMessage.recordOutbound`), and this job reads `findDueAsks(now)` every 30 s.
 * A restart forgets nothing: the next tick finds the same rows.
 *
 * ### A missed deadline is applied LATE, not skipped (SCH-04, decided in the spec)
 * Skipping would leave the issue stuck forever; the owner decided the question goes on by itself. The
 * transition is already distinct (`DEFAULT_APPLIED` ≠ `ANSWER`), and the line it leaves says it was late.
 *
 * ### What waits
 *  - an issue HELD (paused, or its group paused — `IssueHold`): the default is not an excuse to move held
 *    work; it applies on the first tick after the resume;
 *  - a channel not connected, or connected for less than `DEFAULT_GRACE_AFTER_CONNECT_MS` (boot included):
 *    the answer may be in the backlog the reconnect is replaying;
 *  - a question someone answered first — the stop is re-read in the write transaction, and the conditional
 *    UPDATE is the backstop (`STOP_ALREADY_RESOLVED` ⇒ lost the race, nothing of this attempt lands).
 *
 * ### What it leaves
 * The resolution (`thread.stop_resolved` → `ResumeIssueOnStopResolved` tells the session "nobody answered:
 * go on with <default>", queued even with other work pending) and ONE line of the issue at PROGRESS level
 * through the output policy (`recordIssueSignal`, in the same transaction as the resolution) — it routes it: the timeline only in the default mode, the
 * group in `EVERYTHING`. Every question in its own transaction, so one failure never holds the rest.
 */
@injectable()
export class ApplyDueQuestionDefaults extends Handler<
	typeof ApplyDueQuestionDefaultsInputSchema,
	typeof ApplyDueQuestionDefaultsOutputSchema
> {
	readonly name = 'apply_due_question_defaults' as const
	readonly inputSchema = ApplyDueQuestionDefaultsInputSchema
	readonly outputSchema = ApplyDueQuestionDefaultsOutputSchema

	/** The cadence, on the job it governs (T1.4). */
	static readonly repeat = { every: APPLY_DUE_QUESTION_DEFAULTS_INTERVAL_MS }

	constructor(
		private readonly threads: ThreadRepository,
		private readonly issues: IssueRepository,
		private readonly hold: IssueHold,
		private readonly connectivity: ChannelConnectivity,
		private readonly session: CloudSession,
		private readonly panel: PanelPublisher,
		private readonly commands: CommandQueue,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const now = input.now ?? new Date()
		const appliedStopIds: string[] = []
		const waitingStopIds: string[] = []
		for (const stop of await this.threads.findDueAsks(now)) {
			const outcome = await tryCatchAsync(() => this.apply(stop, now))
			if (outcome.success && outcome.data === 'APPLIED') {
				appliedStopIds.push(stop.stopId)
				continue
			}
			waitingStopIds.push(stop.stopId)
			if (
				!outcome.success &&
				!(outcome.error instanceof BaseError && outcome.error.name === ('STOP_ALREADY_RESOLVED' satisfies DomainErrors))
			) {
				this.logging.info({ content: { message: 'question default not applied', stopId: stop.stopId, reason: outcome.error.message } })
			}
		}
		return { appliedStopIds, waitingStopIds }
	}

	private async apply(due: Stop, now: Date): Promise<'APPLIED' | Wait> {
		if (!due.issueId || (await this.hold.isHeld(due.issueId))) return 'HELD'
		const thread = await this.threads.findById(due.threadId)
		const issue = await this.issues.findById(due.issueId)
		if (!thread || thread.deletedAt || !issue) return 'GONE'
		const since = await this.connectivity.connectedSince(thread.channelId)
		if (!since || now.getTime() - since.getTime() < DEFAULT_GRACE_AFTER_CONNECT_MS) return 'NOT_LISTENING'

		// Outside the transaction (the cloud session may do I/O), and never a reason not to apply: a session that
		// cannot answer leaves the default language.
		const identity = thread.language ? undefined : await tryCatchAsync(() => this.session.identity())
		const language = resolveThreadLanguage(thread.language, identity?.success ? identity.data?.user.language : undefined)

		return this.withTransaction(undefined, async tx => {
			const stop = await this.threads.findStop(due.stopId, tx)
			const current = await this.threads.findById(due.threadId, tx)
			if (!stop || stop.resolvedAt || !current) return 'ANSWERED'

			// Nobody answered: the default is nobody's answer, so the resume never elevates (AUTO).
			current.resolveStop(stop, StopResolution.DEFAULT_APPLIED, PermissionPosture.AUTO, { now })
			// The line it leaves — routed by the group's mode, recorded on the same aggregate and committed with
			// the resolution. The language was resolved before this transaction: no I/O under the write lock.
			const { entry, routing } = recordIssueSignal(
				current,
				{
					issue: { issueId: issue.id.value, key: issue.key, title: issue.title },
					level: IssueSignalLevel.PROGRESS,
					text: THREAD_MESSAGES.defaultApplied(language, {
						seq: stop.seq ?? 0,
						label: stop.ask?.default ? labelOfAnswer(stop.ask, { kind: AskAnswerKind.DEFAULT, default: stop.ask.default }) : '',
						late: stop.dueAt !== undefined && now.getTime() - stop.dueAt.getTime() > LATE_DEFAULT_AFTER_MS,
					}),
				},
				{ language, panelLink: this.panel.linkOf(current.id.value) },
			)
			await this.threads.save(current, tx)
			await enqueueSignalDelivery(this.commands, current, entry, routing, tx)
			await this.domainEventRepository.saveMany(current.pullDomainEvents(), tx)
			return 'APPLIED'
		})
	}
}
