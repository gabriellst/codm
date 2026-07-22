import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codedm/core-typescript'
import { LanguageTag, Timezone } from '@shared/objects'
import { UserProfile } from './UserProfile'

describe('UserProfile aggregate', () => {
	it('creates with minimal fields', () => {
		const u = UserProfile.create({ userId: 'auth-user-1' })
		expect(u.userId.value).toBe('auth-user-1')
		expect(u.timezone).toBeUndefined()
		expect(u.language).toBeUndefined()
	})

	it('binds entity id to userId (FK invariant for auth.users)', () => {
		const u = UserProfile.create({ userId: 'auth-user-42' })
		expect(u.id.value).toBe('auth-user-42')
		expect(u.id.value).toBe(u.userId.value)
	})

	it('accepts a known IANA timezone, hydrated as a Timezone value object', () => {
		const u = UserProfile.create({ userId: 'u1' })
		u.updateProfile({ timezone: 'America/Sao_Paulo' })
		expect(u.timezone).toBeInstanceOf(Timezone)
		expect(u.timezone?.toString()).toBe('America/Sao_Paulo')
	})

	it('accepts a UTC alias', () => {
		const u = UserProfile.create({ userId: 'u1' })
		u.updateProfile({ timezone: 'UTC' })
		expect(u.timezone?.toString()).toBe('UTC')
	})

	it('rejects unknown IANA timezone with INVALID_TIMEZONE (raised by the Timezone VO)', () => {
		const u = UserProfile.create({ userId: 'u1' })
		expect(() => u.updateProfile({ timezone: 'Not/Real_Zone' })).toThrow(BaseError)
		expect(() => new Timezone('Not/Real_Zone')).toThrow(BaseError)
	})

	it('accepts a well-formed BCP-47 language, hydrated as a LanguageTag value object', () => {
		const u = UserProfile.create({ userId: 'u1' })
		u.updateProfile({ language: 'pt-BR' })
		expect(u.language).toBeInstanceOf(LanguageTag)
		expect(u.language?.toString()).toBe('pt-BR')
	})

	it('rejects malformed BCP-47 language with INVALID_LANGUAGE (raised by the LanguageTag VO)', () => {
		const u = UserProfile.create({ userId: 'u1' })
		expect(() => u.updateProfile({ language: 'not a language' })).toThrow(BaseError)
		expect(() => new LanguageTag('not a language')).toThrow(BaseError)
	})

	it('does not mutate unspecified fields in updateProfile', () => {
		const u = UserProfile.create({
			userId: 'u1',
			timezone: 'America/Sao_Paulo',
			language: 'pt-BR',
		})
		expect(u.timezone?.toString()).toBe('America/Sao_Paulo')
		expect(u.language?.toString()).toBe('pt-BR')
	})
})
