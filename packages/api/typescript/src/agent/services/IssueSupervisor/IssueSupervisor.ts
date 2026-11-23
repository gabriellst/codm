import { type IssueLifeState, SupervisorVerdict, SuspicionReason } from '@codm/contracts-typescript/wire/enums'
import type { IssueTimelineItem } from '@shared/schemas'
import type { SupervisorFallback } from '../../enums/SupervisorFallback'
import type { SuspectIssue } from '../SuspectIssueReader'

/**
 * The budget of one review. Below the job queue's 60 s lease on purpose: the pass reviews its suspects side by side,
 * so the whole pass ends inside one lease and the repeat row is never claimed twice while a pass runs.
 */
export const SUPERVISOR_TIMEOUT_MS = 40_000

/** How many of the task's last moments the model sees, and how much of each text. */
export const SUPERVISOR_RECENT_MOMENTS = 12
export const SUPERVISOR_MOMENT_CHARS = 300

/**
 * THE VERDICTS EACH SUSPICION ADMITS (spec, item 3) — total over `SuspicionReason`. A verdict outside its row falls
 * back to `LEAVE`, whatever the model's confidence:
 *  - a loop of nudges is not cured by one more nudge — restart with the notes, escalate or leave;
 *  - a live turn gone quiet is never stopped by the supervisor (the owner's decision of 20/11: the inactivity
 *    watchdog is the only thing that kills a turn) — only flagged, or left.
 */
export const VERDICTS_BY_REASON: Readonly<Record<SuspicionReason, readonly SupervisorVerdict[]>> = {
	[SuspicionReason.STALLED_OPEN]: [
		SupervisorVerdict.NUDGE,
		SupervisorVerdict.RESTART_WITH_NOTES,
		SupervisorVerdict.ESCALATE,
		SupervisorVerdict.LEAVE,
	],
	[SuspicionReason.PROVIDER_ERROR_OPEN]: [
		SupervisorVerdict.NUDGE,
		SupervisorVerdict.RESTART_WITH_NOTES,
		SupervisorVerdict.ESCALATE,
		SupervisorVerdict.LEAVE,
	],
	[SuspicionReason.NUDGE_LOOP]: [SupervisorVerdict.RESTART_WITH_NOTES, SupervisorVerdict.ESCALATE, SupervisorVerdict.LEAVE],
	[SuspicionReason.SILENT_TURN]: [SupervisorVerdict.ESCALATE, SupervisorVerdict.LEAVE],
}

/**
 * How sure the model must be for each verdict to stand — total over `SupervisorVerdict`. The ones that start a turn ask
 * the most; leaving a task alone asks nothing (it is the fallback itself).
 */
export const SUPERVISOR_MIN_CONFIDENCE: Readonly<Record<SupervisorVerdict, number>> = {
	[SupervisorVerdict.NUDGE]: 0.6,
	[SupervisorVerdict.RESTART_WITH_NOTES]: 0.7,
	[SupervisorVerdict.ESCALATE]: 0.5,
	[SupervisorVerdict.LEAVE]: 0,
}

/** What the supervisor is handed about one suspect task — read by the job through the ports it may use. */
export interface SupervisorSubject {
	suspect: SuspectIssue
	/** Where the task stands now (`IssueBoardReader`), when the board says. */
	lifeState?: IssueLifeState
	/** The task's timeline, oldest first (`IssueTimelineReader`) — the reviewer keeps the last moments. */
	timeline: readonly IssueTimelineItem[]
	now: Date
}

/** The supervisor's answer: a verdict the suspicion admits, or `LEAVE` with why it fell back. */
export interface SupervisorDecision {
	verdict: SupervisorVerdict
	confidence?: number
	fallback?: SupervisorFallback
}

/**
 * WHAT SHOULD HAPPEN TO A SUSPECT TASK (fase 5, item 3) — the port the supervisor job asks. It decides; it never acts:
 * carrying the verdict out is the job's (and, from slice S5, only through the three doors the safety rails allow).
 * Fails CLOSED: anything but a clean, admitted, confident verdict is `LEAVE` with a `fallback`.
 */
export abstract class IssueSupervisor {
	abstract review(subject: SupervisorSubject): Promise<SupervisorDecision>
}

/**
 * Free text redacted before it leaves the machine (spec, item 3): runs of 8+ digits (phone numbers, document numbers,
 * account ids) and anything shaped like an address with `@` become `[omitido]`. Names stay — the model reads who said
 * what by name, as the triage does.
 */
export function redactForModel(text: string): string {
	return text.replace(/\S+@\S+/g, '[omitido]').replace(/\d(?:[\s.\-()/]*\d){7,}/g, '[omitido]')
}
