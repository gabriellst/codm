import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codedm/core-typescript'
import { LanguageTag } from './LanguageTag'

describe('LanguageTag value object', () => {
	it('accepts well-formed BCP-47 tags and serializes as the bare string', () => {
		expect(new LanguageTag('pt-BR').toString()).toBe('pt-BR')
		expect(new LanguageTag('en').value).toBe('en')
		expect(new LanguageTag('zh-Hans-CN').toString()).toBe('zh-Hans-CN')
		expect(JSON.stringify({ lang: new LanguageTag('en-US') })).toBe('{"lang":"en-US"}')
	})

	it('an invalid tag never exists', () => {
		expect(() => new LanguageTag('not a language')).toThrow(BaseError)
		expect(LanguageTag.isValid('x')).toBe(false)
		expect(LanguageTag.isValid('pt-BR')).toBe(true)
	})
})
