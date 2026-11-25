import { describe, expect, it } from 'bun:test'
import { slugify } from '@shared/utils/slug'
import { defaultIssueName, issueKeyOf, ISSUE_NAME_SLUG_MAX } from './issueKey'

/** Accents are dropped, not dashed; the cut falls between words (voz do grupo, 25/11). */
describe('slugify', () => {
	it.each([
		['Vídeo na landing', 'video-na-landing'],
		['conversação', 'conversacao'],
		['  Ação!! rápida  ', 'acao-rapida'],
		['Pix payment bug', 'pix-payment-bug'],
	])('"%s" → "%s"', (text, slug) => {
		expect(slugify(text, 'x')).toBe(slug)
	})

	it('cuts at a word boundary under the cap, and never returns empty', () => {
		expect(slugify('uma frase longa demais para caber', 'x', 15)).toBe('uma-frase-longa')
		expect(slugify('supercalifragilistico', 'x', 10)).toBe('supercalif')
		expect(slugify('!!!', 'fallback')).toBe('fallback')
	})
})

describe('issueKeyOf / defaultIssueName', () => {
	it('names the key by the name and the drawn number, the name capped at about three words', () => {
		expect(issueKeyOf('vídeo na landing', 19)).toBe('video-na-landing-19')
		expect(issueKeyOf('Triplicar a geração de pedidos do influenciador', 22).length).toBeLessThanOrEqual(ISSUE_NAME_SLUG_MAX + 3)
		expect(issueKeyOf('', 3)).toBe('tarefa-3')
	})

	it('a task with no name is named by the first words of its title', () => {
		expect(defaultIssueName('Vídeo do YouTube na landing, entre o celular e os embaixadores')).toBe('Vídeo do YouTube')
	})
})
