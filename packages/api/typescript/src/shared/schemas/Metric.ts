/**
 * Generic, domain-agnostic KPI atoms shared across BFF query use cases.
 * Context-specific shapes (Stat, breakdowns, dashboard details, …) live in the
 * owning context's `schemas/` folder, NOT here.
 *
 * NumberMetric = ratios / counts / percentages (plain number).
 * MoneyMetric  = money values, already converted to a single currency the value carries.
 * Money on the wire is always single-currency (spec D1) — multi-currency stays internal
 * in the MultiCurrencyMoney value object.
 */
import { z } from '@codedm/core-typescript'
import { SignedMoneySchema } from '../objects'

/** KPI atom: numeric value + period-over-period delta fraction (null = no prior period). */
export const NumberMetricSchema = z.object({
	value: z.number(),
	deltaPct: z.number().nullable(),
})

/** KPI atom whose value is a (signed, single-currency) money amount + delta fraction. */
export const MoneyMetricSchema = z.object({
	value: SignedMoneySchema,
	deltaPct: z.number().nullable(),
})

/** Count of things (NumberMetric) + their money value (MoneyMetric), each with its own delta. */
export const TallySchema = z.object({
	count: NumberMetricSchema,
	value: MoneyMetricSchema,
})

/** Decomposition helper: `{ total, segments: { [enumMember]: NumberMetric } }` (enum-keyed). */
export function segmentedNumber<T extends Record<string, string>>(enumObject: T) {
	return z.object({
		total: NumberMetricSchema,
		segments: z.enumRecord(enumObject, NumberMetricSchema),
	})
}

/** Decomposition helper for money breakdowns: `{ total, segments: { [enumMember]: MoneyMetric } }`. */
export function segmentedMoney<T extends Record<string, string>>(enumObject: T) {
	return z.object({
		total: MoneyMetricSchema,
		segments: z.enumRecord(enumObject, MoneyMetricSchema),
	})
}
