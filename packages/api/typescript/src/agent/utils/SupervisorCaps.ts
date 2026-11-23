import { SupervisorVerdict } from '@codm/contracts-typescript/wire/enums'
import { SupervisorFallback } from '../enums/SupervisorFallback'

/**
 * How many times a day the supervisor may CARRY OUT each verdict on one task (spec, item 3 — "teto por tarefa"); `null`
 * is no ceiling (leaving a task alone costs nothing). Total over `SupervisorVerdict`.
 */
export const SUPERVISOR_ACTIONS_PER_DAY: Readonly<Record<SupervisorVerdict, number | null>> = {
	[SupervisorVerdict.NUDGE]: 2,
	[SupervisorVerdict.RESTART_WITH_NOTES]: 1,
	[SupervisorVerdict.ESCALATE]: 1,
	[SupervisorVerdict.LEAVE]: null,
}

/** Whether carrying the verdict out starts a turn of the task — what the total ceiling counts. */
export const VERDICT_STARTS_A_TURN: Readonly<Record<SupervisorVerdict, boolean>> = {
	[SupervisorVerdict.NUDGE]: true,
	[SupervisorVerdict.RESTART_WITH_NOTES]: true,
	[SupervisorVerdict.ESCALATE]: false,
	[SupervisorVerdict.LEAVE]: false,
}

/**
 * The most automatic turns the supervisor may start on one task in 24 h, whatever the verdicts — so the most a task
 * gets per day is three supervisor turns, each followed at most by one `STALLED`.
 */
export const SUPERVISOR_MAX_ACTIONS_PER_ISSUE_PER_DAY = 3

/**
 * THE CEILINGS APPLIED TO A VERDICT, given what was already carried out on the task in the last 24 h (`acted: true`):
 * past any ceiling, the task is escalated ONCE (a badge and a timeline moment — nobody is written to), then left. Pure,
 * so the rule is testable on its own; the job applies it before recording, in every mode.
 */
export function capVerdict(
	verdict: SupervisorVerdict,
	actedLastDay: readonly SupervisorVerdict[],
): { verdict: SupervisorVerdict; fallback?: SupervisorFallback } {
	const times = (of: SupervisorVerdict) => actedLastDay.filter(acted => acted === of).length
	const turns = actedLastDay.filter(acted => VERDICT_STARTS_A_TURN[acted]).length
	const overCeiling = (of: SupervisorVerdict): boolean => {
		const ceiling = SUPERVISOR_ACTIONS_PER_DAY[of]
		return (ceiling !== null && times(of) >= ceiling) || (VERDICT_STARTS_A_TURN[of] && turns >= SUPERVISOR_MAX_ACTIONS_PER_ISSUE_PER_DAY)
	}
	if (!overCeiling(verdict)) return { verdict }
	if (!overCeiling(SupervisorVerdict.ESCALATE)) return { verdict: SupervisorVerdict.ESCALATE, fallback: SupervisorFallback.CAPPED }
	return { verdict: SupervisorVerdict.LEAVE, fallback: SupervisorFallback.CAPPED }
}
