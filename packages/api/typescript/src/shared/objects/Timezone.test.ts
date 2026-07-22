import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codedm/core-typescript'
import { Timezone } from './Timezone'

describe('Timezone value object', () => {
	it('accepts IANA zones and serializes as the bare string', () => {
		expect(new Timezone('America/Sao_Paulo').toString()).toBe('America/Sao_Paulo')
		expect(new Timezone('UTC').value).toBe('UTC')
		expect(JSON.stringify({ tz: new Timezone('UTC') })).toBe('{"tz":"UTC"}')
	})

	it('an invalid timezone never exists', () => {
		expect(() => new Timezone('Not/Real_Zone')).toThrow(BaseError)
		expect(Timezone.isValid('Not/Real_Zone')).toBe(false)
		expect(Timezone.isValid('Europe/Lisbon')).toBe(true)
	})
})
