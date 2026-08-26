// IANA timezone value object — an invalid timezone never exists (SRP: the format rule lives
// HERE, not inline in whichever entity happens to carry a timezone field). Primitive VO: it IS
// a single string, so it serializes as the bare string on events/rows. INVALID_TIMEZONE is
// registered with the runtime error registry in @auth/errors (the consumer context); Timezone
// lives in shared/, so the code is cast to the core base type for the compile-time signature.
import { BasePrimitiveValueObject, tryCatch, z } from '@codm/core-typescript'
import type { BaseDomainErrors } from '@codm/core-typescript'

const INVALID_TIMEZONE = 'INVALID_TIMEZONE' as BaseDomainErrors

const isValidIanaTimezone = (tz: string): boolean =>
	tryCatch(() => new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())).success

export const TimezoneSchema = z.string().refine(isValidIanaTimezone, { error: INVALID_TIMEZONE })

export class Timezone extends BasePrimitiveValueObject<typeof TimezoneSchema> {
	static override schema = TimezoneSchema

	static isValid(tz: string): boolean {
		return isValidIanaTimezone(tz)
	}

	override toString(): string {
		return this.value
	}
}
