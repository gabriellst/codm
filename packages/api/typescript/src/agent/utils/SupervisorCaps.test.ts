import { describe, expect, it } from 'bun:test'
import { SupervisorVerdict } from '@codm/contracts-typescript/wire/enums'
import { SupervisorFallback } from '../enums/SupervisorFallback'
import { capVerdict, SUPERVISOR_MAX_ACTIONS_PER_ISSUE_PER_DAY } from './SupervisorCaps'

const { NUDGE, RESTART_WITH_NOTES, ESCALATE, LEAVE } = SupervisorVerdict
const capped = (verdict: SupervisorVerdict) => ({ verdict, fallback: SupervisorFallback.CAPPED })

/**
 * The per-task daily ceilings (spec, item 3): NUDGE 2, RESTART 1, ESCALATE 1, at most 3 turn-making actions in all;
 * past any, escalate once, then leave. Falsifier: drop the per-verdict ceiling and a third nudge goes through.
 */
describe('capVerdict', () => {
	it('under every ceiling the verdict stands', () => {
		expect(capVerdict(NUDGE, [NUDGE])).toEqual({ verdict: NUDGE })
		expect(capVerdict(RESTART_WITH_NOTES, [NUDGE])).toEqual({ verdict: RESTART_WITH_NOTES })
		expect(capVerdict(LEAVE, [NUDGE, NUDGE, RESTART_WITH_NOTES, ESCALATE])).toEqual({ verdict: LEAVE })
	})

	it('past its own ceiling a verdict becomes the one escalation, then LEAVE', () => {
		expect(capVerdict(NUDGE, [NUDGE, NUDGE])).toEqual(capped(ESCALATE))
		expect(capVerdict(RESTART_WITH_NOTES, [RESTART_WITH_NOTES])).toEqual(capped(ESCALATE))
		expect(capVerdict(NUDGE, [NUDGE, NUDGE, ESCALATE])).toEqual(capped(LEAVE))
		expect(capVerdict(ESCALATE, [ESCALATE])).toEqual(capped(LEAVE))
	})

	it(`at most ${SUPERVISOR_MAX_ACTIONS_PER_ISSUE_PER_DAY} supervisor turns a day on one task`, () => {
		const worked = [NUDGE, NUDGE, RESTART_WITH_NOTES]
		expect(worked).toHaveLength(SUPERVISOR_MAX_ACTIONS_PER_ISSUE_PER_DAY)
		expect(capVerdict(NUDGE, worked)).toEqual(capped(ESCALATE))
		expect(capVerdict(RESTART_WITH_NOTES, worked)).toEqual(capped(ESCALATE))
		expect(capVerdict(NUDGE, [NUDGE, RESTART_WITH_NOTES])).toEqual({ verdict: NUDGE })
	})
})
