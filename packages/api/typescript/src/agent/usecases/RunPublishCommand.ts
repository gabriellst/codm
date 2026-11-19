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
import { PublishStartedEvent } from '../events/PublishStartedEvent'
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
 * `ran: true` — the command ran, or MAY have run (`UNKNOWN`), now or before, for this same authorization: the item is
 * done, no session turn.
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
	// Maybe it ran: never again for this answer (at most once) — the session is told to check instead.
	[PublishRunOutcome.UNKNOWN]: true,
}

/** The outcomes that END a run that was started — what the runner reports, or `UNKNOWN` when nobody saw it end. */
type SettledOutcome = RanOutcome | PublishRunOutcome.UNKNOWN

/** What the session is told after a run — the outcome; the failure's output tail rides apart (`sessionOnly`). */
const RECADO_OF: Readonly<Record<SettledOutcome, (key: string) => string>> = {
	[PublishRunOutcome.SUCCEEDED]: key =>
		`codm ran the workspace's publish command for ${key} and it succeeded (exit 0). Confirm what went live and continue this issue.`,
	[PublishRunOutcome.FAILED]: key =>
		`codm ran the workspace's publish command for ${key} and it FAILED. Fix the cause, then ask again before publishing.`,
	[PublishRunOutcome.TIMED_OUT]: key =>
		`codm ran the workspace's publish command for ${key} and it ran past its deadline — it was stopped. Find out why before asking to publish again.`,
	[PublishRunOutcome.UNKNOWN]: key =>
		`codm started the workspace's publish command for ${key}, but codm itself stopped (a crash or a restart) before it could record how the command ended — the outcome is UNKNOWN, and it was NOT run again. Before anything else, check whether it went live (the deploy, the PR, the release, whatever the command publishes) and say what you found; if it did not, ask again before publishing.`,
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
 *
 * AT MOST ONCE, EVEN ACROSS A CRASH: a publish is irreversible, and running it twice is worse than not knowing. So
 * the authorization is CONSUMED before the spawn — `agent.publish.started` (keyed by the stop), committed in its own
 * transaction that first re-checks nothing started it — and only then the command runs. A start with no outcome
 * (the daemon stopped between the spawn and the record) is never run again: the next attempt — checked FIRST, before
 * the stop, the command, the worktree or the window could send it anywhere else — records `UNKNOWN`, says in the
 * group (FEEDBACK) that the publish was interrupted and its result must be checked, and wakes the session with a
 * recado to verify it.
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
		// Started and never recorded: the daemon stopped mid-run. Before anything else — a pause or a removed command
		// now must not turn a run that may have happened into a session holding a bare "pode publicar".
		if (await this.startedFor(input.stopId)) return this.interrupted(input)

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

		// CONSUMES the authorization, committed BEFORE the spawn: from here on this answer never spawns again.
		if (!(await this.withTransaction(undefined, tx => this.start(input, tx)))) {
			this.logging.warn({ content: { message: 'publish already started for this authorization — not run again', issueId: input.issueId } })
			return { ran: true }
		}
		let result: PublishCommandResult
		try {
			result = await this.runner.run({ argv: command.argv, cwd, timeoutMs: PUBLISH_COMMAND_TIMEOUT_MS })
		} catch {
			// The runner never throws by contract; if it does anyway, the command may have started — nobody saw it end.
			return this.interrupted(input)
		}
		// The command RAN: from here nothing may send the item back to the queue (that would run it again). A write that
		// fails is logged — its message never carries the argv nor the output — and the item is still done.
		try {
			await this.withTransaction(undefined, tx =>
				this.settle(
					input,
					{ outcome: result.outcome, exitCode: result.exitCode, durationMs: result.durationMs },
					result.output,
					stop.ask?.onPublished,
					tx,
				),
			)
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

	/** Whether the command was already started for this authorization — the start fact is keyed by the stop. */
	private async startedFor(stopId: string, tx?: Transaction): Promise<boolean> {
		return (await this.domainEventRepository.findLatestByEntityIdAndName(stopId, PublishStartedEvent.name, tx)) !== undefined
	}

	/** Consumes the authorization: `false` when something already started it (re-checked inside the transaction). */
	private async start(input: this['input'], tx: Transaction): Promise<boolean> {
		if (await this.startedFor(input.stopId, tx)) return false
		await this.domainEventRepository.save(
			new PublishStartedEvent({
				entityId: input.stopId,
				ownerId: input.ownerId,
				payload: { issueId: input.issueId, threadId: input.threadId, stopId: input.stopId },
			}),
			tx,
		)
		return true
	}

	/**
	 * Started, never recorded: the outcome is `UNKNOWN` — recorded, said in the group, and the session told to check.
	 * Never re-run, and never thrown: a throw would wake the session with the authorizing answer as if nothing had run.
	 */
	private async interrupted(input: this['input']): Promise<this['output']> {
		this.logging.warn({
			content: { message: 'publish command was started and never recorded — not run again, outcome UNKNOWN', issueId: input.issueId },
		})
		try {
			await this.withTransaction(undefined, tx => this.settle(input, { outcome: PublishRunOutcome.UNKNOWN }, undefined, undefined, tx))
		} catch (error) {
			this.logging.error({
				content: {
					message: 'interrupted publish could not be recorded — the item is done anyway',
					issueId: input.issueId,
					error: error instanceof Error ? error.name : 'unknown',
				},
			})
		}
		return { ran: true, outcome: PublishRunOutcome.UNKNOWN }
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
		run: { outcome: PublishRunOutcome; exitCode?: number; durationMs?: number },
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

	/**
	 * How a started run ended, in one transaction: the fact, the output (when there is one) in the task's terminal log
	 * linked to it, the FEEDBACK line for the group, and the follow-up. `output` is absent for `UNKNOWN` — nobody saw it.
	 */
	private async settle(
		input: this['input'],
		run: { outcome: SettledOutcome; exitCode?: number; durationMs?: number },
		output: string | undefined,
		onPublished: PublishFollowUp | undefined,
		tx: Transaction,
	): Promise<void> {
		const fact = await this.record(input, run, tx)
		if (output !== undefined) {
			const lines = output.split('\n').filter(line => line.length > 0)
			await this.terminalLines.appendOfTimelineItem(input.issueId, input.ownerId, fact.id, lines, tx)
		}

		const language = await conversationLanguage(this.threads, this.session, input.threadId)
		await this.domainEventRepository.save(
			new IssueSpokeEvent({
				entityId: input.issueId,
				ownerId: input.ownerId,
				payload: {
					issueId: input.issueId,
					threadId: input.threadId,
					level: IssueSignalLevel.FEEDBACK,
					text: THREAD_MESSAGES.publishRan(language, { outcome: run.outcome, key: input.key }),
					artifactIds: [],
				},
			}),
			tx,
		)

		if (run.outcome === PublishRunOutcome.SUCCEEDED && onPublished?.kind === PublishFollowUpKind.COMPLETE) {
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
					text: RECADO_OF[run.outcome](input.key),
					// The output's tail is the SESSION's (it has to fix the failure) — never the timeline's: `text` is what
					// the timeline and the cloud panel render, this field only the turn's prompt.
					...(output !== undefined && run.outcome !== PublishRunOutcome.SUCCEEDED && { sessionOnly: tailOf(output) }),
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
