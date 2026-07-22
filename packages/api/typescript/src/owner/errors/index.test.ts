import { describe, expect, it } from 'bun:test'
import { BaseError, GlobalErrorMapper, HttpStatusCode } from '@codedm/core-typescript'
import type { ApplicationErrors, DomainErrors, Errors, InterfaceErrors } from './index'
import './index'

describe('Owner context error glossary', () => {
	it('BaseError accepts an Owner domain code', () => {
		const err = new BaseError<Errors>('INVALID_TIMEZONE', 'bad timezone')
		expect(err.name).toBe('INVALID_TIMEZONE')
		expect(err.message).toBe('bad timezone')
	})

	it('BaseError accepts an Owner application code', () => {
		const err = new BaseError<Errors>('OWNER_NOT_FOUND')
		expect(err.name).toBe('OWNER_NOT_FOUND')
	})

	it('rejects unknown codes at compile time via union narrowing', () => {
		// @ts-expect-error — 'NOT_REAL_CODE' is not in the Errors union
		new BaseError<Errors>('NOT_REAL_CODE')
	})

	it('rejects Owner domain codes when typed as InterfaceErrors', () => {
		// @ts-expect-error — 'INVALID_TIMEZONE' is DomainErrors, not InterfaceErrors
		new BaseError<InterfaceErrors>('INVALID_TIMEZONE')
	})

	it('side-effect import registered every Owner code with GlobalErrorMapper', () => {
		const expected: [ApplicationErrors | DomainErrors, HttpStatusCode][] = [
			['OWNER_NOT_FOUND', HttpStatusCode.NOT_FOUND],
			['OWNER_ALREADY_DISABLED', HttpStatusCode.UNPROCESSABLE_ENTITY],
			['OWNER_NOT_DISABLED', HttpStatusCode.UNPROCESSABLE_ENTITY],
			['INVALID_TIMEZONE', HttpStatusCode.BAD_REQUEST],
		]
		for (const [code, status] of expected) {
			expect(GlobalErrorMapper[code]).toBe(status)
		}
	})
})
