import { describe, expect, it } from 'bun:test'
import { BlockCause, GroupOutputMode, IssueSignalLevel, OutputRouting, StopKind } from '@codm/contracts-typescript/wire/enums'
import {
	CAUSE_DEDUPES,
	CAUSE_OF_STOP,
	causeAlreadyTold,
	DELIVERED_AS,
	LEVEL_OF_STOP,
	ROUTING_BY_MODE,
	routeSignal,
	SENDS_NOW,
} from './OutputPolicy'

const modes = Object.values(GroupOutputMode)
const levels = Object.values(IssueSignalLevel)
const routings = Object.values(OutputRouting)

describe('OutputPolicy — the tables are total and say what the owner decided', () => {
	it('every level × mode has a routing from the closed set', () => {
		for (const mode of modes) {
			for (const level of levels) expect(routings).toContain(ROUTING_BY_MODE[mode][level])
		}
	})

	it('a decision and a block notice reach the group in every mode', () => {
		for (const mode of modes) {
			expect(ROUTING_BY_MODE[mode][IssueSignalLevel.DECISION]).toBe(OutputRouting.GROUP)
			expect(ROUTING_BY_MODE[mode][IssueSignalLevel.BLOCK_NOTICE]).toBe(OutputRouting.GROUP)
		}
	})

	it('DECISIONS_ONLY keeps the questions in the group; EVERYTHING alone brings progress there', () => {
		expect(ROUTING_BY_MODE[GroupOutputMode.DECISIONS_ONLY][IssueSignalLevel.QUESTION]).not.toBe(OutputRouting.PANEL)
		expect(ROUTING_BY_MODE[GroupOutputMode.DECISIONS_ONLY][IssueSignalLevel.FEEDBACK]).toBe(OutputRouting.PANEL)
		expect(ROUTING_BY_MODE[GroupOutputMode.DECISIONS_AND_LIVE][IssueSignalLevel.PROGRESS]).toBe(OutputRouting.PANEL)
		expect(ROUTING_BY_MODE[GroupOutputMode.EVERYTHING][IssueSignalLevel.PROGRESS]).toBe(OutputRouting.GROUP)
	})

	it('until the digest flush exists (S5b) a DIGEST signal is carried as its own message, and only GROUP sends now', () => {
		expect(DELIVERED_AS[OutputRouting.DIGEST]).toBe(OutputRouting.GROUP)
		expect(routings.filter(routing => SENDS_NOW[routing])).toEqual([OutputRouting.GROUP])
		expect(routeSignal(GroupOutputMode.DECISIONS_AND_LIVE, IssueSignalLevel.QUESTION)).toBe(OutputRouting.GROUP)
		expect(routeSignal(GroupOutputMode.DECISIONS_AND_LIVE, IssueSignalLevel.PROGRESS)).toBe(OutputRouting.PANEL)
	})

	it('LEVEL_OF_STOP: the asks are decisions/questions, the blocks are notices, the legacy kinds stay silent', () => {
		expect(LEVEL_OF_STOP[StopKind.DECISION_REQUESTED]).toBe(IssueSignalLevel.DECISION)
		expect(LEVEL_OF_STOP[StopKind.QUESTION_ASKED]).toBe(IssueSignalLevel.QUESTION)
		expect(LEVEL_OF_STOP[StopKind.PERMISSION_DENIED]).toBe(IssueSignalLevel.DECISION)
		expect(LEVEL_OF_STOP[StopKind.STALLED]).toBe(IssueSignalLevel.BLOCK_NOTICE)
		expect(LEVEL_OF_STOP[StopKind.HUMAN_REQUESTED]).toBeNull()
		expect(LEVEL_OF_STOP[StopKind.APPROVAL_NEEDED]).toBeNull()
	})

	it('every stop that has a cause is a block notice, and every block-notice stop has a cause', () => {
		for (const kind of Object.values(StopKind)) {
			expect(CAUSE_OF_STOP[kind] !== null).toBe(LEVEL_OF_STOP[kind] === IssueSignalLevel.BLOCK_NOTICE)
		}
	})
})

describe('OutputPolicy — one notice per cause', () => {
	it('a provider error already told by another open stop goes to the panel; a stall never groups', () => {
		expect(causeAlreadyTold(StopKind.SERVER_ERROR, [StopKind.SERVER_ERROR])).toBe(true)
		expect(causeAlreadyTold(StopKind.AUTH_REQUIRED, [StopKind.SERVER_ERROR])).toBe(false)
		expect(causeAlreadyTold(StopKind.SERVER_ERROR, [])).toBe(false)
		expect(causeAlreadyTold(StopKind.STALLED, [StopKind.STALLED])).toBe(false)
		expect(causeAlreadyTold(StopKind.DECISION_REQUESTED, [StopKind.DECISION_REQUESTED])).toBe(false)
	})

	it('the grouping causes are the system-wide ones', () => {
		expect(Object.values(BlockCause).filter(cause => CAUSE_DEDUPES[cause])).toEqual([
			BlockCause.PROVIDER_LIMIT,
			BlockCause.PROVIDER_ERROR,
			BlockCause.CLI_LOGIN,
		])
	})

	it('a cause already told routes to the panel whatever the mode', () => {
		for (const mode of modes) expect(routeSignal(mode, IssueSignalLevel.BLOCK_NOTICE, true)).toBe(OutputRouting.PANEL)
	})
})
