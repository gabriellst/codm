import { describe, it, expect } from 'bun:test'
import { CurrencyCode } from '@codedm/contracts-typescript/wire/enums'
import { Money } from './Money'
import { MultiCurrencyMoney } from './MultiCurrencyMoney'

describe('MultiCurrencyMoney', () => {
	it('reads amounts per currency, defaulting absent currencies to 0', () => {
		const bag = new MultiCurrencyMoney({ [CurrencyCode.BRL]: 1500, [CurrencyCode.USD]: 200 })
		expect(bag.get(CurrencyCode.BRL)).toBe(1500)
		expect(bag.get(CurrencyCode.USD)).toBe(200)
		expect(bag.get(CurrencyCode.EUR)).toBe(0)
		expect(bag.currencies().sort()).toEqual([CurrencyCode.BRL, CurrencyCode.USD].sort())
		expect(bag.isEmpty()).toBe(false)
		expect(new MultiCurrencyMoney({}).isEmpty()).toBe(true)
	})

	it('add and plus fold amounts in immutably', () => {
		const a = new MultiCurrencyMoney({ [CurrencyCode.BRL]: 1000 })
		const b = a.add(CurrencyCode.BRL, 500).add(CurrencyCode.USD, 200)
		expect(a.get(CurrencyCode.BRL)).toBe(1000) // original untouched
		expect(b.get(CurrencyCode.BRL)).toBe(1500)
		expect(b.get(CurrencyCode.USD)).toBe(200)

		const c = b.plus(new Money({ amountCents: 100, currency: CurrencyCode.BRL }))
		expect(c.get(CurrencyCode.BRL)).toBe(1600)
	})

	it('merge and static sum combine bags per currency', () => {
		const x = new MultiCurrencyMoney({ [CurrencyCode.BRL]: 1000, [CurrencyCode.USD]: 50 })
		const y = new MultiCurrencyMoney({ [CurrencyCode.BRL]: 250 })
		expect(x.merge(y).get(CurrencyCode.BRL)).toBe(1250)
		const total = MultiCurrencyMoney.sum([x, y, new MultiCurrencyMoney({ [CurrencyCode.USD]: 50 })])
		expect(total.get(CurrencyCode.BRL)).toBe(1250)
		expect(total.get(CurrencyCode.USD)).toBe(100)
	})

	it('converts every currency into a single target Money using a rate table', () => {
		const bag = new MultiCurrencyMoney({ [CurrencyCode.BRL]: 1000, [CurrencyCode.USD]: 200 })
		// rates expressed as "cents-in-target per cent-in-source"
		const money = bag.convert({ [CurrencyCode.BRL]: 1, [CurrencyCode.USD]: 5 }, CurrencyCode.BRL)
		expect(money).toBeInstanceOf(Money)
		expect(money.currency).toBe(CurrencyCode.BRL)
		expect(money.amountCents).toBe(1000 * 1 + 200 * 5) // 2000
	})

	it('throws when a present currency has no rate', () => {
		const bag = new MultiCurrencyMoney({ [CurrencyCode.BRL]: 1000, [CurrencyCode.USD]: 200 })
		expect(() => bag.convert({ [CurrencyCode.BRL]: 1 }, CurrencyCode.BRL)).toThrow()
	})

	it('equals compares bags by value', () => {
		const a = new MultiCurrencyMoney({ [CurrencyCode.BRL]: 1000 })
		const b = new MultiCurrencyMoney({ [CurrencyCode.BRL]: 1000 })
		expect(a.equals(b)).toBe(true)
		expect(a.equals(new MultiCurrencyMoney({ [CurrencyCode.BRL]: 999 }))).toBe(false)
	})
})
