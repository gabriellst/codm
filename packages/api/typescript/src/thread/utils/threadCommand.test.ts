import { describe, expect, it } from 'bun:test'
import { ThreadCommand } from '../enums'
import { BARE_ANSWERS } from './askAnswer'
import { CONTROL_WORDS } from './controlCommand'
import { parseThreadCommand, THREAD_COMMANDS } from './threadCommand'

/** `boletim` as the WHOLE message (fase 3, item 4) — never the first word of a sentence. */
describe('parseThreadCommand', () => {
	it.each(['boletim', 'Boletim', 'BOLETIM?', 'boletim!!', '@codm boletim', 'boletim @codm', 'boletim.'])('"%s" is the bulletin', text => {
		expect(parseThreadCommand(text)).toBe(ThreadCommand.REPORT)
	})

	// Revisão 25/11: the report is the orchestrator's again — these words are conversation, not a command.
	it.each(['relatorio', 'Relatório?', '@codm relatório', 'report', 'relatório do que fizeram ontem', 'manda o boletim', 'boletins', ''])(
		'"%s" is not a command',
		text => {
			expect(parseThreadCommand(text)).toBeUndefined()
		},
	)

	it('its words are neither control words nor bare answers — one message, one meaning', () => {
		const words = Object.values(THREAD_COMMANDS).flatMap(command => command.words)
		const others = [...Object.values(CONTROL_WORDS).flat(), ...Object.values(BARE_ANSWERS).flat()]
		expect(words.filter(word => others.includes(word))).toEqual([])
	})
})
