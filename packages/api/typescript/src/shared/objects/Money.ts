import { BaseValueObject } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import Z from 'zod'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'

export const MoneySchema = z.object({
	amountCents: z.number().int().nonnegative(),
	currency: z.enum(CurrencyCode),
})

/**
 * Signed variant for computed reporting figures (gross margin, profit, …) that
 * can legitimately be negative. NOT a stored Money value object — it's the
 * read-side shape for analytics outputs, so it drops the `.nonnegative()`.
 */
export const SignedMoneySchema = z.object({
	amountCents: z.number().int(),
	currency: z.enum(CurrencyCode),
})

export class Money extends BaseValueObject<typeof MoneySchema> {
	static override schema = MoneySchema

	equals(other: Money): boolean {
		return this.amountCents === other.amountCents && this.currency === other.currency
	}
}

export interface Money extends Z.infer<typeof MoneySchema> {}
