import { BasePrimitiveValueObject, z } from '@template/core-typescript'
import Z from 'zod'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { Money } from './Money'

/** Partial record of ISO-4217 currency → integer amount in cents. Internal
 *  accumulator used to sum money across currencies before converting to a single
 *  reporting currency. Never sent to the frontend. */
export const MultiCurrencyMoneySchema = z.partialRecord(z.enum(CurrencyCode), z.number().int())

type Amounts = Z.infer<typeof MultiCurrencyMoneySchema>

/**
 * MultiCurrencyMoney — immutable bag of per-currency cents with calc + conversion
 * utilities. Every mutator returns a new instance. `convert` collapses the bag into
 * a single {@link Money} using a caller-supplied rate table (cents-in-target per
 * cent-in-source); the FX rate source is out of scope here (spec D8).
 */
export class MultiCurrencyMoney extends BasePrimitiveValueObject<typeof MultiCurrencyMoneySchema> {
	static override schema = MultiCurrencyMoneySchema

	get(currency: CurrencyCode): number {
		return this.value[currency] ?? 0
	}

	currencies(): CurrencyCode[] {
		return Object.keys(this.value) as CurrencyCode[]
	}

	isEmpty(): boolean {
		return this.currencies().every(c => this.get(c) === 0)
	}

	add(currency: CurrencyCode, cents: number): MultiCurrencyMoney {
		return new MultiCurrencyMoney({ ...this.value, [currency]: this.get(currency) + cents })
	}

	plus(money: Money): MultiCurrencyMoney {
		return this.add(money.currency, money.amountCents)
	}

	merge(other: MultiCurrencyMoney): MultiCurrencyMoney {
		return other.currencies().reduce<MultiCurrencyMoney>((acc, c) => acc.add(c, other.get(c)), this)
	}

	static sum(items: MultiCurrencyMoney[]): MultiCurrencyMoney {
		return items.reduce((acc, item) => acc.merge(item), new MultiCurrencyMoney({}))
	}

	convert(rates: Partial<Record<CurrencyCode, number>>, target: CurrencyCode): Money {
		const amountCents = this.currencies().reduce((sum, c) => {
			const rate = rates[c]
			if (rate === undefined) throw new Error(`MultiCurrencyMoney.convert: missing FX rate for ${c}`)
			return sum + Math.round(this.get(c) * rate)
		}, 0)
		return new Money({ amountCents, currency: target })
	}

	equals(other: MultiCurrencyMoney): boolean {
		const keys = new Set([...this.currencies(), ...other.currencies()])
		for (const c of keys) if (this.get(c) !== other.get(c)) return false
		return true
	}
}

export interface MultiCurrencyMoney {
	readonly value: Amounts
}
