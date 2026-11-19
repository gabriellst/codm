import { injectable } from 'tsyringe-neo'
import { LoggingService } from '@codm/core-typescript'
import { PermissionPosture, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { smallModelFor } from '@catalog'
import { CloudSession } from '@shared/services/CloudSession'
import { TriageAgent, TriageOutputSchema } from '../../agents/TriageAgent'
import { TriageDecision } from '../../enums'
import { AgentRunnerFactory } from '../AgentRunnerFactory'
import { ProviderDetector } from '../ProviderDetector'
import { TriageUsageRecorder } from '../TriageUsageRecorder'
import type { AgentRunResult } from '../../types/AgentRuntimeEvent'
import {
	InboundTriage,
	TRIAGE_HOLD_MS,
	TRIAGE_NO_ACTION_MIN_CONFIDENCE,
	TRIAGE_STEER_MIN_CONFIDENCE,
	TRIAGE_TIMEOUT_MS,
	type InboundTriageRequest,
	type TriageVerdict,
} from './InboundTriage'

/**
 * The confidence floor of each decision the triage may act on by itself. `NEW_TASK` and `ORCHESTRATOR`
 * both go to the orchestrator whatever the confidence, so they have none — a closed map over the enum,
 * so a new decision fails compilation here until somebody says how sure it must be.
 */
const MIN_CONFIDENCE: Readonly<Record<TriageDecision, number>> = {
	[TriageDecision.STEER]: TRIAGE_STEER_MIN_CONFIDENCE,
	[TriageDecision.NO_ACTION]: TRIAGE_NO_ACTION_MIN_CONFIDENCE,
	[TriageDecision.NEW_TASK]: 0,
	[TriageDecision.ORCHESTRATOR]: 0,
}

/**
 * The triage over a real `TriageAgent` run — bound in `real`, and by every suite that exercises the
 * triage (over a stub runner factory; never a real CLI).
 */
@injectable()
export class ModelInboundTriage extends InboundTriage {
	readonly holdMs: number | undefined = TRIAGE_HOLD_MS
	/** The run's budget. A field so a suite can shorten it; production reads the named constant. */
	protected timeoutMs = TRIAGE_TIMEOUT_MS

	constructor(
		private readonly agent: TriageAgent,
		private readonly runners: AgentRunnerFactory,
		private readonly detector: ProviderDetector,
		private readonly cloudSession: CloudSession,
		private readonly logging: LoggingService,
		private readonly usage: TriageUsageRecorder,
	) {
		super()
	}

	async decide(request: InboundTriageRequest): Promise<TriageVerdict> {
		const startedAt = Date.now()
		const toOrchestrator = (fallback: string, confidence?: number): TriageVerdict => ({
			decision: TriageDecision.ORCHESTRATOR,
			confidence,
			latencyMs: Date.now() - startedAt,
			fallback,
		})

		// WHAT THE RUN SPENT (fase 4, S1) — recorded as `role: TRIAGE` the moment the run finishes, whatever its verdict
		// (a run that failed validation spent its tokens all the same). Awaited before answering when the run finished
		// in time; a run the budget abandoned records whenever it ends, in the background.
		let recording: Promise<void> | undefined
		const account = (provider: InboundTriageRequest['provider'], model: ReturnType<typeof smallModelFor>) => (result: AgentRunResult) => {
			recording = this.usage
				.record({ ownerId: request.ownerId, threadId: request.threadId, provider, model, result })
				.catch((error: unknown) => {
					this.logging.warn({
						content: {
							message: 'triage usage not recorded',
							threadId: request.threadId,
							reason: error instanceof Error ? error.message : String(error),
						},
					})
				})
		}

		try {
			// The dispatcher's login gate does not cover this path, so it is asked here: an install that is
			// not entitled spawns no CLI — the orchestrator's item simply waits for the login like every other.
			if (!(await this.cloudSession.isEntitled())) return toOrchestrator('not entitled')
			const detection = await this.detector.resolve(request.provider)
			if (!detection || detection.status !== ProviderStatus.DETECTED) return toOrchestrator('provider not detected')
			const runner = this.runners.for(request.provider)
			const model = smallModelFor(request.provider)

			const output = await this.withTimeout(signal =>
				this.agent.triage(
					runner,
					{
						ownerId: request.ownerId,
						threadId: request.threadId,
						cwd: request.cwd,
						// LEAST PRIVILEGE, never the sender's: the run declares no tools, but a CLI still has its
						// own, and a triage has no business being allowed anything.
						posture: PermissionPosture.AUTO,
						message: request.message,
						openIssues: request.openIssues,
						recent: request.recent,
						now: request.now,
						model,
						binaryPath: detection.binaryPath,
						caps: detection.caps,
					},
					{ signal, onFinished: account(request.provider, model) },
				),
			)
			if (output === undefined) return toOrchestrator(`timeout after ${this.timeoutMs} ms`)

			// RE-VALIDATED, not trusted: `collect()` casts what the runner reports, and a stand-in runner
			// reports `{}` for any schema. Anything that is not a verdict is the orchestrator's.
			const parsed = TriageOutputSchema.safeParse(output)
			if (!parsed.success) return toOrchestrator('unparseable verdict')
			const { confidence, verdict } = parsed.data
			if (confidence < MIN_CONFIDENCE[verdict.decision]) return toOrchestrator(`low confidence for ${verdict.decision}`, confidence)

			return { ...verdict, confidence, latencyMs: Date.now() - startedAt }
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error)
			this.logging.info({ content: { message: 'triage failed — the orchestrator answers', threadId: request.threadId, reason } })
			return toOrchestrator(`failed: ${reason}`)
		} finally {
			await recording
		}
	}

	/**
	 * Race the run against the budget. On timeout the run is ABORTED (the runner kills the CLI's process
	 * group) AND abandoned — a runner that ignores the signal cannot hold the verdict past the budget.
	 * `undefined` ⇒ the budget won.
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
		// An abandoned run that rejects later must not become an unhandled rejection.
		running.catch(() => undefined)
		try {
			return await Promise.race([running, expired])
		} finally {
			clearTimeout(timer)
		}
	}
}
