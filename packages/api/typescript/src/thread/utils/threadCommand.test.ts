import { describe, expect, it } from 'bun:test'
import { ThreadCommand } from '../enums'
import { BARE_ANSWERS } from './askAnswer'
import { CONTROL_WORDS } from './controlCommand'
import { parseThreadCommand, THREAD_COMMANDS } from './threadCommand'

/** `relatorio` as the WHOLE message (fase 3, item 4) — never the first word of a sentence. */
describe('parseThreadCommand', () => {
	it.each(['relatorio', 'Relatório', 'RELATÓRIO?', 'relatorio!!', '@codm relatório', 'relatório @codm', 'report', 'boletim.'])(
		'"%s" is the report',
		text => {
			expect(parseThreadCommand(text)).toBe(ThreadCommand.REPORT)
		},
	)

	it.each(['relatório do que fizeram ontem', 'manda o relatório', 'relatorios', 'relatório APP-12', ''])('"%s" is not a command', text => {
		expect(parseThreadCommand(text)).toBeUndefined()
	})

	it('its words are neither control words nor bare answers — one message, one meaning', () => {
		const words = Object.values(THREAD_COMMANDS).flatMap(command => command.words)
		const others = [...Object.values(CONTROL_WORDS).flat(), ...Object.values(BARE_ANSWERS).flat()]
		expect(words.filter(word => others.includes(word))).toEqual([])
	})
})
