import { injectable } from 'tsyringe-neo'
import { Handler, LoggingService, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { SupervisorVerdict, SuspicionReason } from '@codm/contracts-typescript/wire/enums'
import { ProductConfig } from '@shared/config/ProductConfig'
import { IssueBoardReader } from '@issue/services/IssueBoardReader'
import { IssueTimelineReader } from '@issue/services/IssueTimelineReader'
import { SuspectIssueReader, type SuspectIssue } from '../services/SuspectIssueReader'
import { IssueSupervisor, type SupervisorDecision } from '../services/IssueSupervisor'
import { QuotaStatusReader } from '../services/QuotaStatusReader'
import { SupervisorFallback } from '../enums/SupervisorFallback'
import { SupervisorMode } from '../enums/SupervisorMode'
import { SupervisorPassSkip } from '../enums/SupervisorPassSkip'
import { capVerdict } from '../utils/SupervisorCaps'
import { ActOnSupervisorVerdict } from './ActOnSupervisorVerdict'

/** One pass every 20 minutes (the objective asks 15–30) — the supervisor looks at what stayed stuck, not at every tick. */
export const SUPERVISOR_INTERVAL_MS = 20 * 60_000
/** The most tasks one pass looks at, oldest suspicion first — the measured worst day had 10 suspects (spec, 23/11). */
export const SUPERVISOR_MAX_PER_PASS = 5

/**
 * The mode when `CODM_AGENT_SUPERVISOR_MODE` is not set: `ACT` — the owner's decision of 20/11 (the supervisor acts
 * from the installation on, within its safety rails; `OBSERVE` and `OFF` stay as settings).
 */
export const SUPERVISOR_MODE_DEFAULT = SupervisorMode.ACT

export const SuperviseSuspectIssuesInputSchema = z.object({})
export const SuperviseSuspectIssuesOutputSchema = z.object({
	/** Why the pass looked at nothing, when it did not run at all. */
	skipped: z.enum(SupervisorPassSkip).optional(),
	/** Each task looked at this pass, and the verdict recorded for it. */
	reviewed: z.array(z.object({ issueId: z.uuid(), reason: z.enum(SuspicionReason), verdict: z.enum(SupervisorVerdict) })),
})

/**
 * THE SUPERVISOR (fase 5, item 3) — a job of the `agent` context that looks again at the tasks that stayed stuck after
 * everything automatic was tried: an open stall or provider error nobody answered, a loop of nudges, a live turn gone
 * quiet. Which tasks is a RULE (`SuspectIssueReader`); what to do is the provider's small model with NO tools
 * (`IssueSupervisor`, failing closed to `LEAVE`); carrying it out — and recording every verdict, acted or not, as
 * `agent.supervisor.reviewed`, the audit trail — is `ActOnSupervisorVerdict`, one task per transaction.
 *
 * ### What it may touch (`tests/architecture/supervisor-reach.test.ts`)
 * Only the ports listed in `SUPERVISOR_ALLOWED_PORTS`: readers (suspects, the board, the timeline, the quota), the
 * reviewer, and the verdict's executor (whose own reach is governed by the same rail). Never a publish, a send, a merge, a priority, an answer for a person, a message to
 * anyone. A live turn that went silent is only ever FLAGGED — the inactivity watchdog stays the one that kills.
 *
 * ### When a pass is skipped
 * `OFF`; the provider refusing the account (a review would be refused like every turn); the quota budget holding the
 * task lane for real (its spend waits with the tasks). Deviation from the plan, on purpose: `OFF` keeps the job
 * registered and skips the pass — jobs are composed unconditionally (`composition.generated.ts`), and a conditional
 * registration would be the first of its kind.
 *
 * ### The pass, and the queue's lease
 * Reviews run side by side, each bounded by `SUPERVISOR_TIMEOUT_MS` (below the job queue's 60 s lease), so one pass
 * ends inside one lease. The model runs OUTSIDE any transaction; each verdict is then carried out and recorded in its
 * own short transaction, so one task that fails never holds the others.
 */
@injectable()
export class SuperviseSuspectIssues extends Handler<typeof SuperviseSuspectIssuesInputSchema, typeof SuperviseSuspectIssuesOutputSchema> {
	readonly name = 'supervise_suspect_issues' as const
	readonly inputSchema = SuperviseSuspectIssuesInputSchema
	readonly outputSchema = SuperviseSuspectIssuesOutputSchema

	static readonly repeat = { every: SUPERVISOR_INTERVAL_MS }

	/** The configured mode — a field so a suite can set it. Empty reads as unset; a value outside the enum fails LOUD. */
	protected mode: SupervisorMode = z
		.enum(SupervisorMode)
		.default(SUPERVISOR_MODE_DEFAULT)
		.parse(ProductConfig.env.CODM_AGENT_SUPERVISOR_MODE || undefined)

	constructor(
		private readonly suspects: SuspectIssueReader,
		private readonly supervisor: IssueSupervisor,
		private readonly board: IssueBoardReader,
		private readonly timelines: IssueTimelineReader,
		private readonly quota: QuotaStatusReader,
		private readonly act: ActOnSupervisorVerdict,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(_input: this['input'], tx?: Transaction): Promise<this['output']> {
		if (this.mode === SupervisorMode.OFF) return { skipped: SupervisorPassSkip.OFF, reviewed: [] }
		if (this.quota.providerPausedUntil()) return { skipped: SupervisorPassSkip.PROVIDER_PAUSED, reviewed: [] }
		if (this.quota.holdsIssueLane()) return { skipped: SupervisorPassSkip.BUDGET_HELD, reviewed: [] }

		const now = new Date()
		const suspects = await this.suspects.suspects(now, SUPERVISOR_MAX_PER_PASS)
		if (suspects.length === 0) return { reviewed: [] }

		const decisions = await Promise.all(suspects.map(suspect => this.review(suspect, now)))
		const reviewed: this['output']['reviewed'] = []
		for (const [index, suspect] of suspects.entries()) {
			const decision = decisions[index] as SupervisorDecision
			try {
				const out = await this.act.execute({ suspect, decision, mode: this.mode, now }, tx)
				reviewed.push({ issueId: suspect.issueId, reason: suspect.reason, verdict: out.verdict })
			} catch (error) {
				this.logging.warn({
					content: {
						message: 'supervisor verdict not carried out — the task is left as it was',
						issueId: suspect.issueId,
						reason: error instanceof Error ? error.message : String(error),
					},
				})
			}
		}
		return { reviewed }
	}

	/**
	 * One suspect: what the board and the timeline say, the model's verdict, then the per-task daily ceilings — applied
	 * in every mode, so what is recorded is what WOULD be carried out. A reader that fails leaves the task alone.
	 */
	private async review(suspect: SuspectIssue, now: Date): Promise<SupervisorDecision> {
		try {
			const [board, timeline] = await Promise.all([
				this.board.boardOf(suspect.threadId, now),
				this.timelines.timelineOf(suspect.issueId, suspect.title),
			])
			const lifeState = board.find(row => row.issueId === suspect.issueId)?.lifeState
			const decision = await this.supervisor.review({ suspect, lifeState, timeline, now })
			const capped = capVerdict(decision.verdict, suspect.actedLastDay)
			return capped.fallback === undefined ? decision : { ...decision, ...capped }
		} catch (error) {
			this.logging.warn({
				content: {
					message: 'supervisor could not read a suspect task — left alone',
					issueId: suspect.issueId,
					reason: error instanceof Error ? error.message : String(error),
				},
			})
			return { verdict: SupervisorVerdict.LEAVE, fallback: SupervisorFallback.FAILED }
		}
	}
}
