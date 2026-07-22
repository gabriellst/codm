// Ported from v1.8 (packages/api/src/shared/objects/Phone.ts), imports adapted to
// the polyglot `@template/core-typescript` barrel. Brazilian-centric parsing: a bare
// 10/11-digit number assumes country code 55. INVALID_PHONE is registered in
// @auth/errors (the consumer context — User identity).
import { BaseValueObject, BaseError, z } from '@template/core-typescript'
import type { BaseDomainErrors } from '@template/core-typescript'
import Z from 'zod'

// INVALID_PHONE is registered with the runtime error registry in @auth/errors
// (the consumer context). Phone lives in shared/, so it can't import auth's
// error union — cast the code to the core base type for the compile-time signature.
const INVALID_PHONE = 'INVALID_PHONE' as BaseDomainErrors

export const PhonePlainSchema = z
	.string()
	.min(10)
	.max(20)
	.refine(
		phone => {
			const cleaned = phone.replace(/\D/g, '')
			return cleaned.length >= 10 && cleaned.length <= 15
		},
		{ error: INVALID_PHONE },
	)

export const PhonePartsSchema = z.object({
	countryCode: z
		.string()
		.transform(v => v.replace(/\D/g, ''))
		.refine(v => v.length >= 1 && v.length <= 3, { error: INVALID_PHONE }),
	areaCode: z
		.string()
		.transform(v => v.replace(/\D/g, ''))
		.refine(v => v.length >= 2 && v.length <= 3, { error: INVALID_PHONE }),
	number: z
		.string()
		.transform(v => v.replace(/\D/g, ''))
		.refine(v => v.length >= 7 && v.length <= 9, { error: INVALID_PHONE }),
})

export type PhoneProps = Z.input<typeof PhonePartsSchema>

export class Phone extends BaseValueObject<typeof PhonePartsSchema> {
	static override schema = PhonePartsSchema

	constructor(data: PhoneProps | string) {
		const props = typeof data === 'string' ? Phone.parsePhone(data) : data
		super(props)
	}

	static parsePhone(phone: string): { countryCode: string; areaCode: string; number: string } {
		if (!phone || typeof phone !== 'string') {
			throw new BaseError<BaseDomainErrors>(INVALID_PHONE)
		}

		// Remove all non-digit characters
		const cleaned = phone.replace(/\D/g, '')

		if (cleaned.length < 10 || cleaned.length > 15) {
			throw new BaseError<BaseDomainErrors>(INVALID_PHONE)
		}

		// Brazilian format: +55 (countryCode) + 11 (area code) + 999999999 (9 digits)
		if (cleaned.length >= 12 && cleaned.startsWith('55')) {
			const countryCode = cleaned.substring(0, 2)
			const areaCode = cleaned.substring(2, 4)
			const number = cleaned.substring(4)
			return { countryCode, areaCode, number }
		} else if (cleaned.length === 11) {
			// Brazilian format without countryCode: 11 (area code) + 999999999 (9 digits)
			const areaCode = cleaned.substring(0, 2)
			const number = cleaned.substring(2)
			return { countryCode: '55', areaCode, number }
		} else if (cleaned.length === 10) {
			// Brazilian format without countryCode and with 8-digit number
			const areaCode = cleaned.substring(0, 2)
			const number = cleaned.substring(2)
			return { countryCode: '55', areaCode, number }
		} else {
			if (cleaned.length <= 11) {
				const areaCode = cleaned.substring(0, 2)
				const number = cleaned.substring(2)
				return { countryCode: '55', areaCode, number }
			} else {
				const countryCode = cleaned.substring(0, cleaned.length - 10)
				const areaCode = cleaned.substring(countryCode.length, countryCode.length + 2)
				const number = cleaned.substring(countryCode.length + areaCode.length)
				return { countryCode, areaCode, number }
			}
		}
	}

	format(format: 'international' | 'national' | 'e164' = 'international'): string {
		switch (format) {
			case 'e164':
				return `+${this.countryCode}${this.areaCode}${this.number}`
			case 'national':
				if (this.number.length === 9) {
					return `(${this.areaCode}) ${this.number.substring(0, 5)}-${this.number.substring(5)}`
				}
				return `(${this.areaCode}) ${this.number}`
			default:
				if (this.number.length === 9) {
					return `+${this.countryCode} (${this.areaCode}) ${this.number.substring(0, 5)}-${this.number.substring(5)}`
				}
				return `+${this.countryCode} (${this.areaCode}) ${this.number}`
		}
	}

	equals(other: Phone): boolean {
		return this.countryCode === other.countryCode && this.areaCode === other.areaCode && this.number === other.number
	}

	override toString(): string {
		return this.format('e164')
	}

	static builder(): PhoneBuilder {
		return new PhoneBuilder()
	}

	static isValid(phone: string): boolean {
		if (!phone || typeof phone !== 'string') {
			return false
		}

		const cleaned = phone.replace(/\D/g, '')
		if (cleaned.length < 10 || cleaned.length > 15) {
			return false
		}

		try {
			new Phone(phone)
			return true
		} catch {
			return false
		}
	}
}

export interface Phone extends Z.infer<typeof PhonePartsSchema> {}

// Builder class for fluent Phone construction
export class PhoneBuilder {
	private countryCode?: string
	private areaCode?: string
	private number?: string

	withCountryCode(countryCode: string): this {
		this.countryCode = countryCode
		return this
	}

	withAreaCode(areaCode: string): this {
		this.areaCode = areaCode
		return this
	}

	withNumber(number: string): this {
		this.number = number
		return this
	}

	build(): Phone {
		if (!this.countryCode || !this.areaCode || !this.number) {
			throw new BaseError<BaseDomainErrors>(INVALID_PHONE)
		}

		return new Phone({
			countryCode: this.countryCode,
			areaCode: this.areaCode,
			number: this.number,
		})
	}
}
