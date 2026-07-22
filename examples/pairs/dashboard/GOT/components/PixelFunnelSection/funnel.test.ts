// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/routes/(app)/dashboard/-components/PixelFunnelSection/funnel.test.ts
// role:    bun:test unit spec for funnel.ts (attenuate/buildStageRows/FUNNEL_STAGES)
// Verbatim copy kept as corpus reference — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'bun:test'
import type { GetPixelFunnelQueryResponse } from '@codedm/client-typescript/typescript'
import { FUNNEL_STAGES, attenuate, buildStageRows } from './funnel'

const numMetric = (value: number) => ({ value, deltaPct: null })

const response = (): GetPixelFunnelQueryResponse => ({
	hasPixel: true,
	base: numMetric(1000),
	steps: {
		PAGE_VIEWED: numMetric(1000),
		PRODUCT_VIEWED: numMetric(750),
		PRODUCT_ADDED_TO_CART: numMetric(200),
		PRODUCT_REMOVED_FROM_CART: numMetric(50),
		CART_VIEWED: numMetric(180),
		CHECKOUT_STARTED: numMetric(150),
		CHECKOUT_CONTACT_INFO_SUBMITTED: numMetric(120),
		CHECKOUT_COMPLETED: numMetric(100),
	},
	conversionRate: numMetric(0.1),
	carts: { count: numMetric(80), value: { value: { amountCents: 0, currency: 'BRL' }, deltaPct: null } },
})

describe('FUNNEL_STAGES', () => {
	it('is the 5-stage ordered subset', () => {
		expect(FUNNEL_STAGES).toEqual(['PAGE_VIEWED', 'PRODUCT_VIEWED', 'PRODUCT_ADDED_TO_CART', 'CHECKOUT_STARTED', 'CHECKOUT_COMPLETED'])
	})
})

describe('attenuate', () => {
	it('maps 0 -> 0 and 1 -> 1', () => {
		expect(attenuate(0)).toBeCloseTo(0)
		expect(attenuate(1)).toBeCloseTo(1)
	})
	it('lifts small ratios above the linear value', () => {
		expect(attenuate(0.1)).toBeGreaterThan(0.1)
		expect(attenuate(0.2)).toBeGreaterThan(0.2)
	})
	it('is monotonic and clamps out-of-range input', () => {
		expect(attenuate(0.5)).toBeGreaterThan(attenuate(0.2))
		expect(attenuate(-1)).toBe(0)
		expect(attenuate(2)).toBe(1)
	})
})

describe('buildStageRows', () => {
	it('returns one row per curated stage, in order, with the next stage value', () => {
		const rows = buildStageRows(response())
		expect(rows.map(r => r.key)).toEqual([...FUNNEL_STAGES])
		expect(rows[0]).toMatchObject({ value: 1000, base: 1000, nextValue: 750 })
		expect(rows[2]).toMatchObject({ value: 200, base: 1000, nextValue: 150 })
	})
	it('uses 0 as nextValue for the last stage', () => {
		expect(buildStageRows(response()).at(-1)).toMatchObject({ key: 'CHECKOUT_COMPLETED', value: 100, nextValue: 0 })
	})
})
