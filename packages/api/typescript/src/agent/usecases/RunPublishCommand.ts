import { injectable } from 'tsyringe-neo'
import { Handler, LoggingService, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import {
	IssueSignalLevel,
	IssueStatus,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	PublishFollowUpKind,
	PublishRunOutcome,
	RegretWindowOutcome,
	StopResolution,
} from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import type { PublishFollowUp } from '@shared/objects'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { THREAD_MESSAGES } from '@thread/i18n/messages'
import { TerminalLineRepository } from '@issue/repositories/TerminalLineRepository'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { PUBLISH_AUTHORIZED_BY } from '../objects'
import { PublishRanEvent } from '../events/PublishRanEvent'
import { IssueSpokeEvent } from '../events/IssueSpokeEvent'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { IssueAttributesRepository } from '../repositories/IssueAttributesRepository'
import { GitWorktreeProbe } from '../services/GitWorktreeProbe'
import { RegretWindowGate } from '../services/RegretWindowGate'
import {
	PUBLISH_COMMAND_TIMEOUT_MS,
	PublishCommandRunner,
	type PublishCommandResult,
	type RanOutcome,
} from '../services/PublishCommandRunner'
import { conversationLanguage } from '../utils/issueAsk'
import { DeclareIssueComplete } from './DeclareIssueComplete'

/** How much of the output's END the session is told when the run failed — enough to see the error. */
export const PUBLISH_FAILURE_TAIL_MAX = 4000

export const RunPublishCommandInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	key: z.string(),
	title: z.string(),
	/** The resolution that queued the item — DECLARED on its payload (`ResumeIssuePayloadSchema`), never the dedup key. */
	stopId: z.string(),
	resolution: z.enum(StopResolution),
})
/**
 * `ran: true` — the command ran (now or before, for this same authorization): the item is done, no session turn.
 * `ran: false` — the session wakes as before: not authorized, no command declared, no registered worktree, or the
 * regret window cancelled it.
 */
export const RunPublishCommandOutputSchema = z.object({
	ran: z.boolean(),
	outcome: z.enum(PublishRunOutcome).optional(),
})

/** A cancelled window, as the run's outcome — total over the window's cancelling outcomes. */
const CANCELLED_AS: Readonly<Record<RegretWindowOutcome, PublishRunOutcome | undefined>> = {
	[RegretWindowOutcome.PROCEEDED]: undefined,
	[RegretWindowOutcome.CANCELLED_BY_STEER]: PublishRunOutcome.CANCELLED_BY_STEER,
	[RegretWindowOutcome.CANCELLED_BY_PAUSE]: PublishRunOutcome.CANCELLED_BY_PAUSE,
}

/** Whether an outcome means the command RAN (the item is done) — total over `PublishRunOutcome`. */
const RAN: Readonly<Record<PublishRunOutcome, boolean>> = {
	[PublishRunOutcome.SUCCEEDED]: true,
	[PublishRunOutcome.FAILED]: true,
	[PublishRunOutcome.TIMED_OUT]: true,
	[PublishRunOutcome.CANCELLED_BY_STEER]: false,
	[PublishRunOutcome.CANCELLED_BY_PAUSE]: false,
}

/** What the session is told after a run — the outcome; the failure's output tail rides apart (`sessionOnly`). */
const RECADO_OF: Readonly<Record<RanOutcome, (key: string) => string>> = {
	[PublishRunOutcome.SUCCEEDED]: key =>
		`codm ran the workspace's publish command for ${key} and it succeeded (exit 0). Confirm what went live and continue this issue.`,
	[PublishRunOutcome.FAILED]: key =>
		`codm ran the workspace's publish command for ${key} and it FAILED. Fix the cause, then ask again before publishing.`,
	[PublishRunOutcome.TIMED_OUT]: key =>
		`codm ran the workspace's publish command for ${key} and it ran past its deadline — it was stopped. Find out why before asking to publish again.`,
}

/**
 * "PODE PUBLICAR" WITHOUT WAKING THE SESSION (fase 4, item 6c) — the dispatcher calls this when it claims a
 * `DECISION_ANSWER` item, in place of the session turn.
 *
 *  1. Only when the answer AUTHORIZES publishing by declared data (`PUBLISH_AUTHORIZED_BY` over the stop's ask and
 *     answer) AND the workspace declares a command AND the task has a REGISTERED worktree that git still lists for
 *     the workspace (never the main one). Any of these missing ⇒ `ran: false`, the session wakes — as before.
 *  2. The regret window (`RegretWindowGate`, the rule of the fase 2 hook): a pause or an unread steer cancels it ⇒
 *     `PUBLISH_RAN` with the cancelled outcome, `ran: false` (the session wakes with the answer and the steer).
 *  3. Runs it (`PublishCommandRunner`: argv, no shell, `PUBLISH_COMMAND_TIMEOUT_MS`), then in one transaction: the
 *     fact `agent.publish.ran` (the timeline's `PUBLISH_RAN` — outcome, exit, duration; no argv, no output), the
 *     output in the task's local terminal log linked to it, the FEEDBACK line for the group (the output policy
 *     decides where it goes) and the follow-up: a failure or a timeout ⇒ a recado to the session with the output's
 *     tail; a success ⇒ the ask's `onPublished` (`COMPLETE` concludes the task by the declared completion, no turn;
 *     `CONTINUE` / absent ⇒ a recado).
 *
 * ONE RUN PER AUTHORIZATION: a fact for this stop already recorded (a claim after a crash, a retry of the session
 * turn that followed a cancel) is answered from that fact — the command never runs twice for one answer.
 */
@injectable()
export class RunPublishCommand extends Handler<typeof RunPublishCommandInputSchema, typeof RunPublishCommandOutputSchema> {
	readonly name = 'run_publish_command' as const
	readonly inputSchema = RunPublishCommandInputSchema
	readonly outputSchema = RunPublishCommandOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly workspaces: WorkspaceRepository,
		private readonly attributes: IssueAttributesRepository,
		private readonly probe: GitWorktreeProbe,
		private readonly gate: RegretWindowGate,
		private readonly runner: PublishCommandRunner,
		private readonly terminalLines: TerminalLineRepository,
		private readonly mailbox: MailboxRepository,
		private readonly declareComplete: DeclareIssueComplete,
		private readonly session: CloudSession,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const before = await this.recorded(input)
		if (before) return { ran: RAN[before], outcome: before }

		const stop = await this.threads.findStop(input.stopId)
		if (!stop || !PUBLISH_AUTHORIZED_BY[input.resolution](stop)) return { ran: false }
		const thread = await this.threads.findById(input.threadId)
		const workspace = thread ? await this.workspaces.findById(thread.workspaceId) : undefined
		const command = workspace?.publishCommand
		if (!workspace || !command) return { ran: false }
		const cwd = await this.worktreeOf(input.issueId, workspace.path)
		if (!cwd) {
			this.logging.info({
				content: { message: 'publish authorized but the task has no registered worktree — the session wakes', issueId: input.issueId },
			})
			return { ran: false }
		}

		const window = await this.gate.window(input.issueId)
		const cancelled = CANCELLED_AS[window.outcome]
		if (cancelled) {
			await this.withTransaction(undefined, tx => this.record(input, { outcome: cancelled, durationMs: window.waitedMs }, tx))
			return { ran: false, outcome: cancelled }
		}

		const result = await this.runner.run({ argv: command.argv, cwd, timeoutMs: PUBLISH_COMMAND_TIMEOUT_MS })
		// The command RAN: from here nothing may send the item back to the queue (that would run it again). A write that
		// fails is logged — its message never carries the argv nor the output — and the item is still done.
		try {
			await this.withTransaction(undefined, tx => this.afterRun(input, result, stop.ask?.onPublished, tx))
		} catch (error) {
			this.logging.error({
				content: {
					message: 'publish command ran but its record failed — the item is done anyway',
					issueId: input.issueId,
					outcome: result.outcome,
					error: error instanceof Error ? error.name : 'unknown',
				},
			})
		}
		return { ran: true, outcome: result.outcome }
	}

	/** The outcome already recorded for THIS authorization, if any. */
	private async recorded(input: this['input']): Promise<PublishRunOutcome | undefined> {
		const latest = await this.domainEventRepository.findLatestByEntityIdAndName(input.issueId, PublishRanEvent.name)
		const parsed = PublishRanEvent.schema.shape.payload.safeParse(latest?.payload)
		return parsed.success && parsed.data.stopId === input.stopId ? parsed.data.outcome : undefined
	}

	/** The task's registered worktree, if git still lists it for the workspace — never the main worktree. */
	private async worktreeOf(issueId: string, workspacePath: string): Promise<string | undefined> {
		const recorded = (await this.attributes.findByIssueId(issueId))?.worktreePath
		if (!recorded) return undefined
		const listed = (await this.probe.worktrees(workspacePath)) ?? []
		return listed.some(worktree => !worktree.main && worktree.path === recorded) ? recorded : undefined
	}

	private async record(
		input: this['input'],
		run: { outcome: PublishRunOutcome; exitCode?: number; durationMs: number },
		tx: Transaction,
	): Promise<PublishRanEvent> {
		const fact = new PublishRanEvent({
			entityId: input.issueId,
			ownerId: input.ownerId,
			payload: { issueId: input.issueId, threadId: input.threadId, stopId: input.stopId, ...run },
		})
		await this.domainEventRepository.save(fact, tx)
		return fact
	}

	private async afterRun(
		input: this['input'],
		result: PublishCommandResult,
		onPublished: PublishFollowUp | undefined,
		tx: Transaction,
	): Promise<void> {
		const fact = await this.record(input, { outcome: result.outcome, exitCode: result.exitCode, durationMs: result.durationMs }, tx)
		const lines = result.output.split('\n').filter(line => line.length > 0)
		await this.terminalLines.appendOfTimelineItem(input.issueId, input.ownerId, fact.id, lines, tx)

		const language = await conversationLanguage(this.threads, this.session, input.threadId)
		await this.domainEventRepository.save(
			new IssueSpokeEvent({
				entityId: input.issueId,
				ownerId: input.ownerId,
				payload: {
					issueId: input.issueId,
					threadId: input.threadId,
					level: IssueSignalLevel.FEEDBACK,
					text: THREAD_MESSAGES.publishRan(language, { outcome: result.outcome, key: input.key }),
					artifactIds: [],
				},
			}),
			tx,
		)

		if (result.outcome === PublishRunOutcome.SUCCEEDED && onPublished?.kind === PublishFollowUpKind.COMPLETE) {
			await this.declareComplete.execute(
				{
					ownerId: input.ownerId,
					issueId: input.issueId,
					threadId: input.threadId,
					status: IssueStatus.COMPLETED,
					summary: onPublished.summary,
					key: input.key,
				},
				tx,
			)
			return
		}
		await this.mailbox.enqueue(
			{
				ownerId: input.ownerId,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: input.issueId,
				kind: MailboxItemKind.STEER,
				// codm telling the session, not a person: never ahead of anybody's message, never merged with a steer.
				claimClass: MailboxClaimClass.REMINDER,
				posture: PermissionPosture.AUTO,
				payload: {
					issueId: input.issueId,
					threadId: input.threadId,
					key: input.key,
					title: input.title,
					text: RECADO_OF[result.outcome](input.key),
					// The output's tail is the SESSION's (it has to fix the failure) — never the timeline's: `text` is what
					// the timeline and the cloud panel render, this field only the turn's prompt.
					...(result.outcome !== PublishRunOutcome.SUCCEEDED && { sessionOnly: tailOf(result.output) }),
				},
				dedupKey: `publish:${fact.id}`,
			},
			tx,
		)
	}
}

/** The end of the output, at most `PUBLISH_FAILURE_TAIL_MAX` characters. */
function tailOf(output: string): string {
	const tail = output.length > PUBLISH_FAILURE_TAIL_MAX ? output.slice(-PUBLISH_FAILURE_TAIL_MAX) : output
	return `The command's output (its end):\n${tail.trim() || '(no output)'}`
}
