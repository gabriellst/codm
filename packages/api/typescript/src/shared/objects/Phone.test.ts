import { describe, it, expect } from 'bun:test'
import { BaseError } from '@codedm/core-typescript'
import { Phone } from './Phone'

describe('Phone Value Object', () => {
	describe('Validation', () => {
		it('should accept phone with countryCode, areaCode, and number', () => {
			const phone = new Phone({ countryCode: '55', areaCode: '11', number: '999999999' })
			expect(phone.countryCode).toBe('55')
			expect(phone.areaCode).toBe('11')
			expect(phone.number).toBe('999999999')
		})

		it('should parse Brazilian phone from string format', () => {
			const phone = new Phone('+5511999999999')
			expect(phone.countryCode).toBe('55')
			expect(phone.areaCode).toBe('11')
			expect(phone.number).toBe('999999999')
		})

		it('should parse Brazilian phone without country code', () => {
			const phone = new Phone('11999999999')
			expect(phone.countryCode).toBe('55')
			expect(phone.areaCode).toBe('11')
			expect(phone.number).toBe('999999999')
		})

		it('should parse Brazilian phone with formatting', () => {
			const phone = new Phone('+55 (11) 99999-9999')
			expect(phone.countryCode).toBe('55')
			expect(phone.areaCode).toBe('11')
			expect(phone.number).toBe('999999999')
		})

		it('should reject invalid country code', () => {
			expect(() => new Phone({ countryCode: '', areaCode: '11', number: '999999999' })).toThrow(BaseError)
			expect(() => new Phone({ countryCode: '1234', areaCode: '11', number: '999999999' })).toThrow(BaseError)
		})

		it('should reject invalid area code', () => {
			expect(() => new Phone({ countryCode: '55', areaCode: '', number: '999999999' })).toThrow(BaseError)
			expect(() => new Phone({ countryCode: '55', areaCode: '1', number: '999999999' })).toThrow(BaseError)
			expect(() => new Phone({ countryCode: '55', areaCode: '1234', number: '999999999' })).toThrow(BaseError)
		})

		it('should reject invalid number', () => {
			expect(() => new Phone({ countryCode: '55', areaCode: '11', number: '' })).toThrow(BaseError)
			expect(() => new Phone({ countryCode: '55', areaCode: '11', number: '123456' })).toThrow(BaseError)
			expect(() => new Phone({ countryCode: '55', areaCode: '11', number: '1234567890' })).toThrow(BaseError)
		})

		it('should reject empty string', () => {
			expect(() => new Phone('')).toThrow(BaseError)
		})

		it('should reject invalid phone length', () => {
			expect(() => new Phone('123456789')).toThrow(BaseError)
			expect(() => new Phone('1234567890123456')).toThrow(BaseError)
		})
	})

	describe('Formatting', () => {
		it('should format as E.164', () => {
			const phone = new Phone({ countryCode: '55', areaCode: '11', number: '999999999' })
			expect(phone.format('e164')).toBe('+5511999999999')
		})

		it('should format as national', () => {
			const phone = new Phone({ countryCode: '55', areaCode: '11', number: '999999999' })
			expect(phone.format('national')).toBe('(11) 99999-9999')
		})

		it('should format as international', () => {
			const phone = new Phone({ countryCode: '55', areaCode: '11', number: '999999999' })
			expect(phone.format('international')).toBe('+55 (11) 99999-9999')
		})

		it('should format with 8-digit number', () => {
			const phone = new Phone({ countryCode: '55', areaCode: '11', number: '99999999' })
			expect(phone.format('national')).toBe('(11) 99999999')
		})
	})

	describe('Equality', () => {
		it('should consider two phones equal if they have the same values', () => {
			const phone1 = new Phone({ countryCode: '55', areaCode: '11', number: '999999999' })
			const phone2 = new Phone('+5511999999999')
			expect(phone1.equals(phone2)).toBe(true)
		})

		it('should consider two phones different if they have different values', () => {
			const phone1 = new Phone({ countryCode: '55', areaCode: '11', number: '999999999' })
			const phone2 = new Phone({ countryCode: '55', areaCode: '11', number: '888888888' })
			expect(phone1.equals(phone2)).toBe(false)
		})
	})

	describe('toString', () => {
		it('should return E.164 format', () => {
			const phone = new Phone({ countryCode: '55', areaCode: '11', number: '999999999' })
			expect(phone.toString()).toBe('+5511999999999')
		})
	})

	describe('builder', () => {
		it('builds a Phone from parts', () => {
			const phone = Phone.builder().withCountryCode('55').withAreaCode('11').withNumber('999999999').build()
			expect(phone.format('e164')).toBe('+5511999999999')
		})

		it('throws when parts are incomplete', () => {
			expect(() => Phone.builder().withAreaCode('11').build()).toThrow(BaseError)
		})
	})

	describe('isValid', () => {
		it('returns true for a valid phone and false otherwise', () => {
			expect(Phone.isValid('+5511999999999')).toBe(true)
			expect(Phone.isValid('garbage')).toBe(false)
			expect(Phone.isValid('')).toBe(false)
		})
	})
})
