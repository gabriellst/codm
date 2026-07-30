import { BasePrimitiveValueObject } from '@codm/core-typescript'
import { z } from '@codm/core-typescript'
import type { DomainErrors } from '@auth/errors'

export const EmailSchema = z
	.string()
	.transform((email: string) => email.toLocaleLowerCase().trim())
	.refine(
		(email: string) => {
			if (!email || typeof email !== 'string') return false
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
			return emailRegex.test(email)
		},
		{ error: 'INVALID_EMAIL_FORMAT' as DomainErrors },
	)

export class Email extends BasePrimitiveValueObject<typeof EmailSchema> {
	static override schema = EmailSchema

	static isValid(v: string): boolean {
		return EmailSchema.safeParse(v).success
	}

	equals(other: Email): boolean {
		return this.value === other.value
	}

	override toString(): string {
		return this.value
	}
}
