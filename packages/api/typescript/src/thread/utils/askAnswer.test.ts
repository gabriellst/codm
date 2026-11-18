import { describe, expect, it } from 'bun:test'
import { AskAnswerKind } from '@codm/contracts-typescript/wire/enums'
import type { StopAsk } from '@shared/objects'
import { BareAnswer } from '../enums'
import { BARE_ANSWERS, labelOfAnswer, parseAskAnswer, parseAskCode, parseBareAnswer } from './askAnswer'
import { CONTROL_WORDS } from './controlCommand'

const yesNo: StopAsk = {
	question: 'Publico?',
	options: [
		{ id: 'yes', label: 'Sim' },
		{ id: 'no', label: 'Não' },
	],
	effects: [],
}
const colors: StopAsk = {
	question: 'Qual cor?',
	options: [
		{ id: 'blue', label: 'Azul' },
		{ id: 'green', label: 'Verde' },
	],
	effects: [],
}

describe('askAnswer — reading an answer without a model', () => {
	it('BARE_ANSWERS and CONTROL_WORDS are disjoint — "pare"/"segue" alone stay commands', () => {
		const bare = new Set(Object.values(BARE_ANSWERS).flat())
		const control = Object.values(CONTROL_WORDS).flat()
		expect(control.filter(word => bare.has(word))).toEqual([])
	})

	it('a bare answer is the WHOLE message, case/accent/punctuation/mention folded', () => {
		expect(parseBareAnswer('Sim!')).toBe(BareAnswer.YES)
		expect(parseBareAnswer('@codm  NÃO.')).toBe(BareAnswer.NO)
		expect(parseBareAnswer('pode publicar')).toBe(BareAnswer.YES)
		expect(parseBareAnswer('sim, mas muda o título')).toBeUndefined()
		expect(parseBareAnswer('simples')).toBeUndefined()
	})

	it('reads one code — with or without the key — and refuses two different ones', () => {
		expect(parseAskCode('APP-12 · D1 sim')).toMatchObject({ key: 'APP-12', seq: 1 })
		expect(parseAskCode('d2 azul')).toMatchObject({ key: undefined, seq: 2 })
		expect(parseAskCode('D1 sim e D2 não')).toBeUndefined()
		expect(parseAskCode('vendas D2C subiram')).toBeUndefined()
	})

	it('an answer is the option by number, by label, by yes/no polarity — else free text', () => {
		expect(parseAskAnswer('2', colors)).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'green' })
		expect(parseAskAnswer(' — azul', colors)).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'blue' })
		expect(parseAskAnswer('pode sim', yesNo)).toEqual({ kind: AskAnswerKind.OPTION, optionId: 'yes' })
		expect(parseAskAnswer('roxo, por favor', colors)).toEqual({ kind: AskAnswerKind.TEXT, text: 'roxo, por favor' })
		expect(parseAskAnswer('  ', colors)).toBeUndefined()
	})

	it('labels an answer as people read it — option label, text, or the default it applied', () => {
		expect(labelOfAnswer(colors, { kind: AskAnswerKind.OPTION, optionId: 'green' })).toBe('Verde')
		expect(labelOfAnswer(colors, { kind: AskAnswerKind.DEFAULT, default: { kind: AskAnswerKind.TEXT, text: 'cinza' } })).toBe('cinza')
	})
})
