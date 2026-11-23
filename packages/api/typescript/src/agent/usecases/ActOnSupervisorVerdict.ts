import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { NudgeSource, ProviderKind, SupervisorVerdict, SuspicionReason } from '@codm/contracts-typescript/wire/enums'
import { IssueHold } from '@issue/services/IssueHold'
import { ReopenIssue } from '@issue/usecases/ReopenIssue'
import { OpenIssuesReader } from '@thread/services/OpenIssuesReader'
import { ApplySupervisorRetry } from '@thread/usecases/ApplySupervisorRetry'
import { SupervisorRetryOutcome } from '@thread/enums/SupervisorRetryOutcome'
import { AgentSessionRepository } from '../repositories/AgentSessionRepository'
import { DeclaredWaitReader } from '../services/DeclaredWaitReader'
import { LiveTurnReader } from '../services/LiveTurnReader'
import { NudgeQueue } from '../services/NudgeQueue'
import { SUSPICION_OF_OPEN_STOP } from '../services/SuspectIssueReader'
import { AgentSupervisorReviewedEvent } from '../events/AgentSupervisorReviewedEvent'
import { NUDGES_BEFORE_STALL } from '../objects/NudgePayload'
import { SupervisorFallback } from '../enums/SupervisorFallback'
import { SupervisorMode } from '../enums/SupervisorMode'
import { VERDICT_STARTS_A_TURN } from '../utils/SupervisorCaps'

/**
 * WHETHER A MODE CARRIES THE VERDICT OUT — total over `SupervisorMode`. `ACT` executes within the safety rails (the
 * owner's decision of 20/11: the supervisor acts from the installation on); `OBSERVE` only records (`acted: false`);
 * `OFF` never gets here — the job skips the pass.
 */
export const MODE_ACTS: Readonly<Record<SupervisorMode, boolean>> = {
	[SupervisorMode.OFF]: false,
	[SupervisorMode.OBSERVE]: false,
	[SupervisorMode.ACT]: true,
}

/** Whether a verdict DOES something — `LEAVE` is only the fact, so it is never "acted" (nor on the timeline). */
export const VERDICT_ACTS: Readonly<Record<SupervisorVerdict, boolean>> = {
	[SupervisorVerdict.NUDGE]: true,
	[SupervisorVerdict.RESTART_WITH_NOTES]: true,
	[SupervisorVerdict.ESCALATE]: true,
	[SupervisorVerdict.LEAVE]: false,
}

/** Whether a suspicion is about an open stop (a stall, a provider error) — derived from the reader's own table. */
const reasonHasStop = (reason: SuspicionReason): boolean => Object.values(SUSPICION_OF_OPEN_STOP).includes(reason)

export const ActOnSupervisorVerdictInputSchema = z.object({
	suspect: z.object({
		issueId: z.uuid(),
		ownerId: z.uuid(),
		threadId: z.uuid(),
		key: z.string(),
		title: z.string(),
		provider: z.enum(ProviderKind),
		reason: z.enum(SuspicionReason),
	}),
	decision: z.object({
		verdict: z.enum(SupervisorVerdict),
		confidence: z.number().min(0).max(1).optional(),
		fallback: z.enum(SupervisorFallback).optional(),
	}),
	mode: z.enum(SupervisorMode),
	/** The pass's instant — handed in (the core has no clock). */
	now: z.date(),
})
export const ActOnSupervisorVerdictOutputSchema = z.object({
	/** The verdict recorded — `LEAVE` when a safety rail refused the one decided. */
	verdict: z.enum(SupervisorVerdict),
	acted: z.boolean(),
	fallback: z.enum(SupervisorFallback).optional(),
})

type Input = ActOnSupervisorVerdict['input']
/** What carrying a verdict out came to: done (with what the restart found), or refused by a named rail. */
type Carried = { acted: true; sessionRestarted?: boolean } | { acted: false; fallback: SupervisorFallback }

/**
 * CARRY THE SUPERVISOR'S VERDICT OUT (fase 5, item 3 — slice S5), and record it. The ONE writer of
 * `agent.supervisor.reviewed`: the action and its fact share one transaction, so the per-task ceilings (which count
 * the facts) can never miss an action nor count one that rolled back.
 *
 * ### The three doors — and nothing else (`tests/architecture/supervisor-reach.test.ts`)
 *  - `NUDGE` ⇒ `thread/usecases/ApplySupervisorRetry` resolves the open stall / provider-error stop with `AUTO_RETRY`
 *    and the task goes back to WORKING (`ReopenIssue`, as a steer does);
 *    the resume is the LAST nudge of the episode (`REMINDER`, AUTO, `ordinal = NUDGES_BEFORE_STALL`) — one automatic
 *    turn, and if it goes nowhere the reconciler raises `STALLED` straight away (owner, 20/11).
 *  - `RESTART_WITH_NOTES` ⇒ the task's session is asked to restart (`AgentSession.requestHandoff`: the next turn opens a
 *    fresh session seeded with the handoff notes), then the same retry when there is a stop; with NO stop (a loop of
 *    nudges) the agent queues the last nudge itself through `NudgeQueue`. A task with no session row has nothing to
 *    restart — its next turn is fresh anyway — and the fact says so (`sessionRestarted: false`).
 *  - `ESCALATE` ⇒ nothing but the fact: the timeline shows it and the card carries the badge (`escalatedAt`). Nobody is
 *    written to — the block notice already went to the group once.
 * Never a merge, a publish, a priority, an answer for a person, a message to anyone; no model text reaches a session.
 *
 * ### The rails, re-checked HERE (the model call sat between the rule and now)
 * Never on a task completed or archived since (`CLOSED`), a paused issue or conversation (`HELD`), a task that asked for feedback (`WAITING`), a person's stop
 * (`PERSON_STOP`); a verdict that starts a turn never runs beside a live turn or queued / deferred work (`LIVE_TURN`)
 * — a silent live turn is only ever flagged, the inactivity watchdog stays the one that kills. A refusal leaves the
 * task alone and is recorded as `LEAVE` with the rail's name, `acted: false`.
 */
@injectable()
export class ActOnSupervisorVerdict extends Handler<typeof ActOnSupervisorVerdictInputSchema, typeof ActOnSupervisorVerdictOutputSchema> {
	readonly name = 'act_on_supervisor_verdict' as const
	readonly inputSchema = ActOnSupervisorVerdictInputSchema
	readonly outputSchema = ActOnSupervisorVerdictOutputSchema

	/** Each verdict's door — dispatched by the verdict, never a chain of `if`s. `LEAVE` never opens one. */
	private readonly doors: Readonly<Record<SupervisorVerdict, (input: Input, tx: Transaction) => Promise<Carried>>> = {
		[SupervisorVerdict.NUDGE]: (input, tx) => this.retry(input, tx),
		[SupervisorVerdict.RESTART_WITH_NOTES]: (input, tx) => this.restart(input, tx),
		[SupervisorVerdict.ESCALATE]: async () => ({ acted: true }),
		[SupervisorVerdict.LEAVE]: async () => ({ acted: false, fallback: SupervisorFallback.FAILED }),
	}

	constructor(
		private readonly hold: IssueHold,
		private readonly declared: DeclaredWaitReader,
		private readonly turns: LiveTurnReader,
		private readonly nudges: NudgeQueue,
		private readonly sessions: AgentSessionRepository,
		private readonly applyRetry: ApplySupervisorRetry,
		private readonly openIssues: OpenIssuesReader,
		private readonly reopenIssue: ReopenIssue,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const { suspect, decision, mode } = input
		return this.withTransaction(tx, async tx => {
			const carried = MODE_ACTS[mode] && VERDICT_ACTS[decision.verdict] ? await this.carryOut(input, tx) : undefined
			const refused = carried && !carried.acted ? carried.fallback : undefined
			const verdict = refused ? SupervisorVerdict.LEAVE : decision.verdict
			const fallback = refused ?? decision.fallback
			const acted = carried?.acted ?? false
			await this.domainEventRepository.save(
				new AgentSupervisorReviewedEvent({
					entityId: suspect.issueId,
					ownerId: suspect.ownerId,
					payload: {
						issueId: suspect.issueId,
						reason: suspect.reason,
						verdict,
						...(decision.confidence !== undefined && { confidence: decision.confidence }),
						mode,
						acted,
						...(fallback !== undefined && { fallback }),
						...(carried?.acted && carried.sessionRestarted !== undefined && { sessionRestarted: carried.sessionRestarted }),
					},
				}),
				tx,
			)
			return { verdict, acted, ...(fallback !== undefined && { fallback }) }
		})
	}

	/** The rails first, then the verdict's door. */
	private async carryOut(input: Input, tx: Transaction): Promise<Carried> {
		const { issueId, threadId } = input.suspect
		// Completed or archived since the rule saw it: nothing to supervise any more.
		const open = await this.openIssues.openIssues(threadId)
		if (!open.some(issue => issue.issueId === issueId)) return { acted: false, fallback: SupervisorFallback.CLOSED }
		if (await this.hold.isHeld(issueId)) return { acted: false, fallback: SupervisorFallback.HELD }
		if ((await this.declared.waiting([issueId], tx)).has(issueId)) return { acted: false, fallback: SupervisorFallback.WAITING }
		if (VERDICT_STARTS_A_TURN[input.decision.verdict]) {
			const busy = this.turns.liveTurn(issueId) !== undefined || (await this.nudges.hasWork(issueId, tx))
			if (busy) return { acted: false, fallback: SupervisorFallback.LIVE_TURN }
		}
		return this.doors[input.decision.verdict](input, tx)
	}

	/**
	 * `NUDGE`: the thread's retry of the open stall / provider error — the rule and the resume are the thread's. A retried
	 * task goes back to WORK, the way a steer reopens it (`ReopenIssue`, the issue's own transition): the stop had made
	 * it `NEEDS_INPUT`, and left there a quiet resumed turn would never reach the reconciler — the "one automatic turn,
	 * then blocked" of the owner's decision (20/11) needs the sweep to see it and raise `STALLED` straight away.
	 */
	private async retry(input: Input, tx: Transaction): Promise<Carried> {
		const { issueId, threadId, ownerId } = input.suspect
		const { outcome } = await this.applyRetry.execute({ issueId, now: input.now }, tx)
		const carried = RETRY_CARRIED[outcome]
		if (carried.acted && (await this.openIssues.steerableIssue(threadId, issueId, tx))?.needsReopen) {
			await this.reopenIssue.execute({ ownerId, issueId }, tx)
		}
		return carried
	}

	/**
	 * `RESTART_WITH_NOTES`: the retry when the suspicion is about a stop; the last nudge, queued here, when it is not (a
	 * loop of nudges). A suspicion about a stop that found none (someone resolved it first) does nothing — the person's
	 * resolution already has its turn. Then the session's restart request, when there is a session.
	 */
	private async restart(input: Input, tx: Transaction): Promise<Carried> {
		const { suspect, now } = input
		const retried = await this.retry(input, tx)
		const stopless = !retried.acted && retried.fallback === SupervisorFallback.NO_STOP && !reasonHasStop(suspect.reason)
		if (stopless) {
			await this.nudges.enqueueNudge(
				suspect,
				{ ordinal: NUDGES_BEFORE_STALL, source: NudgeSource.SUPERVISOR },
				`supervisor-nudge:${suspect.issueId}:${now.getTime()}`,
				tx,
			)
		} else if (!retried.acted) {
			return retried
		}
		const session = await this.sessions.findByIssueId(suspect.issueId, tx)
		if (session) {
			session.requestHandoff(now)
			await this.sessions.save(session, tx)
		}
		return { acted: true, sessionRestarted: session !== undefined }
	}
}

/** What the thread's retry outcome means for the supervisor — total over `SupervisorRetryOutcome`. */
const RETRY_CARRIED: Readonly<Record<SupervisorRetryOutcome, Carried>> = {
	[SupervisorRetryOutcome.APPLIED]: { acted: true },
	[SupervisorRetryOutcome.NO_STOP]: { acted: false, fallback: SupervisorFallback.NO_STOP },
	[SupervisorRetryOutcome.PERSON_STOP]: { acted: false, fallback: SupervisorFallback.PERSON_STOP },
}
