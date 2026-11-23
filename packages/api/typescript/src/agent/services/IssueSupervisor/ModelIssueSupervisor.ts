import { tmpdir } from 'node:os'
import { injectable } from 'tsyringe-neo'
import { LoggingService } from '@codm/core-typescript'
import {
	IssueTimelineItemKind,
	PermissionPosture,
	ProviderStatus,
	SupervisorVerdict,
	UsageRole,
} from '@codm/contracts-typescript/wire/enums'
import type { IssueTimelineItem } from '@shared/schemas'
import { smallModelFor } from '@catalog'
import { CloudSession } from '@shared/services/CloudSession'
import { SupervisorAgent, SupervisorOutputSchema } from '../../agents/SupervisorAgent'
import { SupervisorFallback } from '../../enums/SupervisorFallback'
import { AgentRunnerFactory } from '../AgentRunnerFactory'
import { ProviderDetector } from '../ProviderDetector'
import { SmallModelUsageRecorder } from '../SmallModelUsageRecorder'
import type { AgentRunResult } from '../../types/AgentRuntimeEvent'
import {
	IssueSupervisor,
	redactForModel,
	SUPERVISOR_MIN_CONFIDENCE,
	SUPERVISOR_MOMENT_CHARS,
	SUPERVISOR_RECENT_MOMENTS,
	SUPERVISOR_TIMEOUT_MS,
	VERDICTS_BY_REASON,
	type SupervisorDecision,
	type SupervisorSubject,
} from './IssueSupervisor'

/** "12 min" / "3 h" / "2 d" — an age the model can weigh without a clock or a timezone. */
function ageOf(at: Date, now: Date): string {
	const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000))
	if (minutes < 60) return `${minutes} min`
	const hours = Math.round(minutes / 60)
	return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`
}

/** A free text as it may leave the machine: redacted, then cut. */
const outbound = (text: string): string => {
	const clean = redactForModel(text.replace(/\s+/g, ' ').trim())
	return clean.length > SUPERVISOR_MOMENT_CHARS ? `${clean.slice(0, SUPERVISOR_MOMENT_CHARS)}…` : clean
}

/**
 * One timeline moment in words — names, kinds and redacted texts only; never an id, an address or a path. A plain
 * `switch` over the union, exhaustive, so a new moment fails compilation here until somebody says how to tell it.
 */
export function describeMoment(item: IssueTimelineItem): string {
	switch (item.kind) {
		case IssueTimelineItemKind.CREATED:
			return 'the task was created'
		case IssueTimelineItemKind.TURN_STARTED:
			return 'a turn started'
		case IssueTimelineItemKind.MESSAGE:
			return `${item.transcriptKind}: ${outbound(item.text)}`
		case IssueTimelineItemKind.STEER:
			return `a message to the task: ${outbound(item.text)}`
		case IssueTimelineItemKind.ARTIFACT:
			return `recorded a ${item.artifactKind}: ${outbound(item.name)}`
		case IssueTimelineItemKind.STOP_RAISED:
			return `stopped (${item.stopKind}): ${outbound([item.title, item.ask?.question].filter(Boolean).join(' — '))}`
		case IssueTimelineItemKind.STOP_RESOLVED:
			return `the stop was resolved (${item.resolution})`
		case IssueTimelineItemKind.COMPLETED:
			return 'the task was completed'
		case IssueTimelineItemKind.ARCHIVED:
			return 'the task was archived'
		case IssueTimelineItemKind.PAUSED:
			return 'the task was paused'
		case IssueTimelineItemKind.RESUMED:
			return 'the task was resumed'
		case IssueTimelineItemKind.REGRET_WINDOW:
			return `an irreversible action waited in its regret window (${item.outcome})`
		case IssueTimelineItemKind.BATCH_LINKED:
			return 'linked to a batch'
		case IssueTimelineItemKind.PUBLISH_RAN:
			return `the publish command ran (${item.outcome})`
		case IssueTimelineItemKind.NUDGED:
			return `nudged (${item.ordinal} of 2) to declare where it stands`
		case IssueTimelineItemKind.RETRY_SCHEDULED:
			return `the provider failed; retry ${item.attempt} of ${item.maxAttempts} scheduled`
		case IssueTimelineItemKind.SUPERVISOR_REVIEWED:
			return `the supervisor chose ${item.verdict} (${item.reason})`
		default: {
			const unknown: never = item
			return String(unknown)
		}
	}
}

/**
 * The supervisor over a real `SupervisorAgent` run — bound in `real`, and by every suite that exercises the review
 * (over a stub runner factory; never a real CLI). The molde of `ModelInboundTriage`: the same entitlement and detector
 * gates, the same timeout race, the same spend recorded on finish (as `SUPERVISOR`), the same re-validation — and it
 * fails closed to `LEAVE` where the triage falls back to the orchestrator.
 */
@injectable()
export class ModelIssueSupervisor extends IssueSupervisor {
	/** The run's budget. A field so a suite can shorten it; production reads the named constant. */
	protected timeoutMs = SUPERVISOR_TIMEOUT_MS

	constructor(
		private readonly agent: SupervisorAgent,
		private readonly runners: AgentRunnerFactory,
		private readonly detector: ProviderDetector,
		private readonly cloudSession: CloudSession,
		private readonly logging: LoggingService,
		private readonly usage: SmallModelUsageRecorder,
	) {
		super()
	}

	async review({ suspect, lifeState, timeline, now }: SupervisorSubject): Promise<SupervisorDecision> {
		const leave = (fallback: SupervisorFallback, confidence?: number): SupervisorDecision => ({
			verdict: SupervisorVerdict.LEAVE,
			fallback,
			...(confidence !== undefined && { confidence }),
		})

		// WHAT THE RUN SPENT — `role: SUPERVISOR`, the moment it finishes, whatever its verdict, so the quota budget sees
		// it inside the orchestrator's reserve (`RESERVED_ROLES`). A run the budget abandoned records when it ends.
		let recording: Promise<void> | undefined
		const account = (model: ReturnType<typeof smallModelFor>) => (result: AgentRunResult) => {
			recording = this.usage
				.record({
					ownerId: suspect.ownerId,
					entityId: suspect.issueId,
					role: UsageRole.SUPERVISOR,
					provider: suspect.provider,
					model,
					result,
				})
				.catch((error: unknown) => {
					this.logging.warn({
						content: {
							message: 'supervisor usage not recorded',
							issueId: suspect.issueId,
							reason: error instanceof Error ? error.message : String(error),
						},
					})
				})
		}

		try {
			if (!(await this.cloudSession.isEntitled())) return leave(SupervisorFallback.NOT_ENTITLED)
			const detection = await this.detector.resolve(suspect.provider)
			if (!detection || detection.status !== ProviderStatus.DETECTED) return leave(SupervisorFallback.PROVIDER_NOT_DETECTED)
			const runner = this.runners.for(suspect.provider)
			const model = smallModelFor(suspect.provider)
			const admitted = VERDICTS_BY_REASON[suspect.reason]

			const output = await this.withTimeout(signal =>
				this.agent.review(
					runner,
					{
						ownerId: suspect.ownerId,
						threadId: suspect.threadId,
						// A tool-less run reads nothing from disk: a neutral directory keeps a project's memory files out of the
						// small model's context.
						cwd: tmpdir(),
						// LEAST PRIVILEGE: the run declares no tools, but a CLI still has its own, and a review needs none.
						posture: PermissionPosture.AUTO,
						issue: { key: suspect.key, title: outbound(suspect.title) },
						reason: suspect.reason,
						suspectFor: ageOf(suspect.since, now),
						lifeState,
						admitted: [...admitted],
						nudgesLastDay: suspect.nudgesLastDay,
						recent: timeline.slice(-SUPERVISOR_RECENT_MOMENTS).map(item => ({
							ago: ageOf(new Date(item.at), now),
							what: describeMoment(item),
						})),
						model,
						binaryPath: detection.binaryPath,
						caps: detection.caps,
					},
					{ signal, onFinished: account(model) },
				),
			)
			if (output === undefined) return leave(SupervisorFallback.TIMEOUT)

			// RE-VALIDATED, not trusted: `collect()` casts what the runner reports.
			const parsed = SupervisorOutputSchema.safeParse(output)
			if (!parsed.success) return leave(SupervisorFallback.UNPARSEABLE)
			const { verdict, confidence } = parsed.data
			if (!admitted.includes(verdict)) return leave(SupervisorFallback.NOT_ADMITTED, confidence)
			if (confidence < SUPERVISOR_MIN_CONFIDENCE[verdict]) return leave(SupervisorFallback.LOW_CONFIDENCE, confidence)
			return { verdict, confidence }
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error)
			this.logging.info({ content: { message: 'supervisor review failed — left alone', issueId: suspect.issueId, reason } })
			return leave(SupervisorFallback.FAILED)
		} finally {
			await recording
		}
	}

	/**
	 * Race the run against the budget. On timeout the run is ABORTED (the runner kills the CLI's process group) AND
	 * abandoned. `undefined` ⇒ the budget won.
	 */
	private async withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
		const controller = new AbortController()
		let timer: ReturnType<typeof setTimeout> | undefined
		const expired = new Promise<undefined>(resolve => {
			timer = setTimeout(() => {
				controller.abort()
				resolve(undefined)
			}, this.timeoutMs)
		})
		const running = run(controller.signal)
		running.catch(() => undefined)
		try {
			return await Promise.race([running, expired])
		} finally {
			clearTimeout(timer)
		}
	}
}
