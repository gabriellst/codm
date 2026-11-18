import { describe, expect, it } from 'bun:test'
import { AskAnswerKind, AskEffect, StopKind } from '@codm/contracts-typescript/wire/enums'
import { askDueAt, QUESTION_DEFAULT_MS, StopAsk, type StopAskProps } from './StopAsk'

const yesNo = [
	{ id: 'yes', label: 'Sim' },
	{ id: 'no', label: 'Não' },
]

const question = (overrides: Partial<StopAskProps> = {}): StopAskProps => ({
	requested: StopKind.QUESTION_ASKED,
	question: 'Uso o tema claro?',
	options: yesNo,
	default: { kind: AskAnswerKind.OPTION, optionId: 'yes' },
	effects: [],
	...overrides,
})

describe('StopAsk — the escalation rule has ONE owner', () => {
	it('a question with no effect stays a question', () => {
		expect(new StopAsk(question()).kind).toBe(StopKind.QUESTION_ASKED)
	})

	it('any declared effect escalates a question to a decision', () => {
		for (const effect of Object.values(AskEffect)) {
			expect(new StopAsk(question({ effects: [effect] })).kind).toBe(StopKind.DECISION_REQUESTED)
		}
	})

	it('a decision stays a decision with or without effects', () => {
		expect(new StopAsk(question({ requested: StopKind.DECISION_REQUESTED, default: undefined })).kind).toBe(StopKind.DECISION_REQUESTED)
	})

	it('toAsk is the wire shape — what the stop stores, without the requested kind', () => {
		const ask = new StopAsk(question({ addresseeId: 'participant-a' })).toAsk()
		expect(ask).toEqual({
			question: 'Uso o tema claro?',
			options: yesNo,
			default: { kind: AskAnswerKind.OPTION, optionId: 'yes' },
			effects: [],
			addresseeId: 'participant-a',
		})
		expect('requested' in ask).toBe(false)
	})
})

describe('StopAsk — the invariants the wire schema leaves out', () => {
	it('FALSEADOR — a question without a default does not exist', () => {
		expect(() => new StopAsk(question({ default: undefined }))).toThrow(expect.objectContaining({ name: 'ASK_DEFAULT_REQUIRED' }))
	})

	it('a question that escalates needs no default — a decision waits for a person', () => {
		expect(new StopAsk(question({ default: undefined, effects: [AskEffect.PUBLISH] })).kind).toBe(StopKind.DECISION_REQUESTED)
	})

	it('FALSEADOR — the same option id twice is refused', () => {
		expect(() => new StopAsk(question({ options: [...yesNo, { id: 'yes', label: 'Talvez' }] }))).toThrow(
			expect.objectContaining({ name: 'ASK_OPTIONS_DUPLICATED' }),
		)
	})

	it('FALSEADOR — an OPTION default must name an option of this ask', () => {
		expect(() => new StopAsk(question({ default: { kind: AskAnswerKind.OPTION, optionId: 'maybe' } }))).toThrow(
			expect.objectContaining({ name: 'ASK_OPTION_UNKNOWN' }),
		)
	})

	it('a TEXT default needs no options — a free-text question', () => {
		expect(new StopAsk(question({ options: [], default: { kind: AskAnswerKind.TEXT, text: 'sigo com o rascunho' } })).kind).toBe(
			StopKind.QUESTION_ASKED,
		)
	})
})

describe('askDueAt', () => {
	it('is the delivery instant plus the 15 minutes', () => {
		const delivered = new Date('2026-11-18T12:00:00.000Z')
		expect(askDueAt(delivered).getTime() - delivered.getTime()).toBe(QUESTION_DEFAULT_MS)
		expect(QUESTION_DEFAULT_MS).toBe(15 * 60 * 1000)
	})
})
