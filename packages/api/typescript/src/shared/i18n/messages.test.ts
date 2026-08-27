import { describe, it, expect } from 'bun:test'
import { Language } from '@codm/contracts-typescript/wire/enums'
import { CUE_LANGUAGES, DEFAULT_CUE_LANGUAGE } from '@codm/contracts/cues'
import { defineMessages, resolveLanguage, resolveThreadLanguage, CATALOG_LANGUAGES, DEFAULT_LANGUAGE } from './messages'

describe('resolveLanguage', () => {
	it('keeps catalog languages as-is', () => {
		expect(resolveLanguage(Language.PT_BR)).toBe(Language.PT_BR)
		expect(resolveLanguage(Language.EN_US)).toBe(Language.EN_US)
	})

	// Every Language value is a catalog language (the enum ships exactly the locales the app
	// translates), so resolveLanguage's not-in-catalog branch is only reachable via null/undefined —
	// which is the fallback that matters. A product that widens Language without adding a catalog
	// re-exercises the unshipped branch; there is no unshipped member to test against today.
	it('falls back to the default when the language is absent', () => {
		expect(resolveLanguage(undefined)).toBe(DEFAULT_LANGUAGE)
		expect(resolveLanguage(null)).toBe(DEFAULT_LANGUAGE)
	})
})

describe('defineMessages', () => {
	const messages = defineMessages({
		[Language.PT_BR]: {
			greeting: (p: { name: string }) => `Olá, ${p.name}!`,
			paragraphs: () => ['primeiro', 'segundo'],
		},
		[Language.EN_US]: {
			greeting: (p: { name: string }) => `Hello, ${p.name}!`,
			paragraphs: () => ['first', 'second'],
		},
	})

	it('resolves each message key directly with the language as first argument', () => {
		expect(messages.greeting(Language.EN_US, { name: 'Ada' })).toBe('Hello, Ada!')
		expect(messages.greeting(Language.PT_BR, { name: 'Ada' })).toBe('Olá, Ada!')
	})

	it('falls back to PT (the default) when the language is absent', () => {
		expect(messages.greeting(undefined, { name: 'Ada' })).toBe('Olá, Ada!')
		expect(messages.greeting(null, { name: 'Ada' })).toBe('Olá, Ada!')
	})

	it('supports paragraph-list messages for email bodies', () => {
		expect(messages.paragraphs(Language.EN_US)).toEqual(['first', 'second'])
	})
})

describe('resolveThreadLanguage — declarado, senão o do dono, senão o padrão', () => {
	it('o que a conversa declarou vence o do dono', () => {
		expect(resolveThreadLanguage(Language.EN_US, Language.PT_BR)).toBe(Language.EN_US)
		expect(resolveThreadLanguage(Language.PT_BR, Language.EN_US)).toBe(Language.PT_BR)
	})
	it('sem declaração, vale o do dono — é isso que faz trocar o idioma da conta ALCANÇAR a conversa', () => {
		expect(resolveThreadLanguage(undefined, Language.EN_US)).toBe(Language.EN_US)
		expect(resolveThreadLanguage(null, Language.EN_US)).toBe(Language.EN_US)
	})
	it('sem nenhum dos dois, o padrão do produto', () => {
		expect(resolveThreadLanguage(undefined, undefined)).toBe(DEFAULT_LANGUAGE)
		expect(resolveThreadLanguage(null, null)).toBe(DEFAULT_LANGUAGE)
	})
	it('um locale que catálogo nenhum ship colapsa no padrão, venha de onde vier', () => {
		expect(resolveThreadLanguage('fr-CH' as Language, undefined)).toBe(DEFAULT_LANGUAGE)
		expect(resolveThreadLanguage(undefined, 'fr-CH' as Language)).toBe(DEFAULT_LANGUAGE)
	})
})

/**
 * O PINO entre os dois decks de idioma do produto.
 *
 * `@codm/contracts/cues` é MÓDULO FOLHA — o console o importa direto, então ele não pode importar
 * nada do daemon e declara o próprio conjunto de idiomas e o próprio default. Duas declarações de
 * "para onde cai um locale desconhecido" é exatamente a divergência que faria a linha de fase abrir
 * num idioma e a resposta sair noutro. `tsc` não vê isso; este teste vê.
 */
describe('o deck de cues e o catálogo de servidor concordam sobre o padrão', () => {
	it('DEFAULT_CUE_LANGUAGE === DEFAULT_LANGUAGE', () => {
		expect(DEFAULT_CUE_LANGUAGE).toBe(DEFAULT_LANGUAGE)
	})
	it('os dois shipam o MESMO conjunto de idiomas — nenhum lado fala um que o outro não fala', () => {
		expect([...CUE_LANGUAGES].sort()).toEqual([...CATALOG_LANGUAGES].sort())
	})
})
