import { describe, expect, it } from 'bun:test'
import { BATCH_ITEMS_MAX } from '@shared/objects'
import { BATCH_MIN_ITEMS, detectBatch } from './BatchDetector'

/**
 * THE BATCH, BY RULE (fase 4, item 5) — a message whose lines open with a list marker, at least three of them.
 *
 * Falsifier: match a number anywhere in the line and the sentence case below turns into a batch.
 */
describe('detectBatch — a listed message is a batch, prose is not', () => {
	it('reads a numbered list, numbering by position', () => {
		const text = [
			'pessoal, segue o que falta:',
			'1. trocar o texto do botão',
			'2) o rodapé da página de preços',
			'4 - refazer o logo',
		].join('\n')
		expect(detectBatch(text)).toEqual([
			{ n: 1, excerpt: 'trocar o texto do botão' },
			{ n: 2, excerpt: 'o rodapé da página de preços' },
			{ n: 3, excerpt: 'refazer o logo' },
		])
	})

	it('reads bullets, and a wrapped line continues the item above it until a blank line', () => {
		const text = ['- primeira coisa', '  que continua aqui', '* segunda', '• terceira', '', 'obrigado!'].join('\n')
		expect(detectBatch(text)).toEqual([
			{ n: 1, excerpt: 'primeira coisa que continua aqui' },
			{ n: 2, excerpt: 'segunda' },
			{ n: 3, excerpt: 'terceira' },
		])
	})

	it(`fewer than ${BATCH_MIN_ITEMS} items is not a batch`, () => {
		expect(detectBatch('1. uma\n2. duas')).toBeUndefined()
	})

	it('a sentence with numbers in it is not a list', () => {
		expect(detectBatch('preciso das 3 telas, dos 2 botões e de 1 rodapé novo')).toBeUndefined()
	})

	it(`more items than the wire carries (${BATCH_ITEMS_MAX}) goes the ordinary way`, () => {
		const text = Array.from({ length: BATCH_ITEMS_MAX + 1 }, (_, index) => `- item ${index + 1}`).join('\n')
		expect(detectBatch(text)).toBeUndefined()
	})
})
