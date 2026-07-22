// Deterministic faker helpers for mocked BFF controllers. A fixed seed makes
// every server boot produce the same fixtures, so SDK output and frontend
// snapshots stay stable. Swap a usecase's body for a real query and delete the
// faker calls — nothing else changes.
import { faker } from '@faker-js/faker'
import { CurrencyCode } from '@codedm/contracts-typescript/wire/enums'

faker.seed(1)

export { faker }

export const mockId = (): string => faker.string.uuid()

/** Raw monetary value (not cents) in the display currency. */
export const mockMoney = (): number => faker.number.float({ min: 0, max: 100_000, fractionDigits: 2 })

/** A KPI NumberMetric: value + period-over-period delta fraction (-1..1, sometimes null). */
export const mockMetric = (): { value: number; deltaPct: number | null } => ({
	value: faker.number.float({ min: 0, max: 100_000, fractionDigits: 2 }),
	deltaPct: faker.datatype.boolean() ? faker.number.float({ min: -1, max: 1, fractionDigits: 2 }) : null,
})

/** A signed money amount in a fixed display currency (BRL), cents. */
export const mockSignedMoney = (): { amountCents: number; currency: CurrencyCode } => ({
	amountCents: faker.number.int({ min: -50_000, max: 10_000_000 }),
	currency: CurrencyCode.BRL,
})

/** A MoneyMetric: money value + period-over-period delta fraction. */
export const mockMoneyMetric = (): { value: { amountCents: number; currency: CurrencyCode }; deltaPct: number | null } => ({
	value: mockSignedMoney(),
	deltaPct: faker.datatype.boolean() ? faker.number.float({ min: -1, max: 1, fractionDigits: 2 }) : null,
})

export const mockSeries = <T>(n: number, fn: (index: number) => T): T[] => Array.from({ length: n }, (_, i) => fn(i))

/** Recent ISO-8601 timestamp. */
export const mockIsoDate = (): string => faker.date.recent({ days: 30 }).toISOString()

export const pick = <T>(values: readonly T[]): T => faker.helpers.arrayElement(values)
