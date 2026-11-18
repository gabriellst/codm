import { describe, expect, it } from 'bun:test'
import { SteerUrgency } from '../enums'
import { parseSteerUrgency } from './steerUrgency'

/**
 * "AGORA" AFTER THE TARGET (fase 2, item 4) — the word that turns a routed steer into a cut.
 *
 * Falsifier: drop the ADDRESSING strip and "APP-12 agora …" reads as NEXT_STEP; drop the `rest` check
 * and a bare "agora" cuts a running turn with nothing to say.
 */
describe('parseSteerUrgency', () => {
	it.each([
		['agora tira o rodapé', 'tira o rodapé'],
		['Agora, tira o rodapé', 'tira o rodapé'],
		['APP-12 agora tira o rodapé', 'tira o rodapé'],
		['APP-12: AGORA: tira o rodapé', 'tira o rodapé'],
		['@codm APP-12 agora tira o rodapé', 'tira o rodapé'],
		['now use the blue one', 'use the blue one'],
	])('%p is NOW', (text, instruction) => {
		expect(parseSteerUrgency(text)).toEqual({ urgency: SteerUrgency.NOW, text: instruction })
	})

	it.each([
		'tira o rodapé agora',
		'agora',
		'APP-12 agora',
		'agorinha tira o rodapé',
		'APP-12 usa o azul',
		// A reaction to the work, not an order — cutting the turn would throw the work away.
		'agora sim, ficou ótimo',
		'Agora ficou bom',
		'APP-12 agora deu certo',
		'agora está perfeito',
	])('%p stays NEXT_STEP, text untouched', text => {
		expect(parseSteerUrgency(text)).toEqual({ urgency: SteerUrgency.NEXT_STEP, text })
	})
})
