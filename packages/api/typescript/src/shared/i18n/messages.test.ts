import { describe, it, expect } from 'bun:test'
import { Language } from '@codm/contracts-typescript/wire/enums'
import { defineMessages, resolveLanguage, DEFAULT_LANGUAGE } from './messages'

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
