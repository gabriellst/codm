# Money & Metric Vocabulary Alignment — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** One coherent money/metric vocabulary — `Money` VO, internal `MultiCurrencyMoney` VO, and a
read-side split into `NumberMetric` (ratios/counts) and `MoneyMetric` (currency-carrying money) — so
every money value reaching the frontend already carries its (single, converted) currency.

**Architecture:** Backend refactor + one SDK regen + the FE money-rendering consumer. A rename
(`MonetaryAmount`→`Money`) is one atomic task; a new internal VO (`MultiCurrencyMoney`) is additive;
the read vocabulary (`Metric`→`NumberMetric`, new `MoneyMetric`, reshaped `Tally`, deleted
multi-currency FE schemas) plus its BFF consumers (`GetPixelFunnel`, `GetDashboard`, `dashboard.ts`,
`ListQuickProductRanking`) is one atomic task because the deletions + `Tally` shape change couple all
consumers; then the SDK is regenerated; finally the only committed FE money consumer
(`AdditionalCostsSection`) is refactored onto an encapsulated `useMoney()` hook over a `Money` object.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, Zod, React, react-i18next

**Spec:** .specs/2026-06-03-money-metric-vocabulary.md
**Tasks:** 5
**Estimated minutes:** 215

---

## Task T1: The shared money VO is `Money`

Rename the `MonetaryAmount` value object to `Money` (and `MonetaryAmountSchema`→`MoneySchema`,
`SignedMonetaryAmountSchema`→`SignedMoneySchema`) everywhere. Pure rename — the wire shape
`{ amountCents, currency }` and the `≥0` invariant are unchanged (spec AC-1, AC-9, D4).

**Files to write:**
- Create: `packages/api/typescript/src/shared/objects/Money.ts` (renamed from `MonetaryAmount.ts`)
- Create: `packages/api/typescript/src/shared/objects/Money.test.ts` (renamed from `MonetaryAmount.test.ts`)
- Delete: `packages/api/typescript/src/shared/objects/MonetaryAmount.ts`
- Delete: `packages/api/typescript/src/shared/objects/MonetaryAmount.test.ts`
- Modify: `packages/api/typescript/src/shared/objects/index.ts` — export `Money`/`MoneySchema`/`SignedMoneySchema`
- Modify: `packages/api/typescript/src/sales/objects/OrderOverrideFields.ts` — rename import + `z.instance`
- Modify: `packages/api/typescript/src/sales/objects/OrderOverrideFields.test.ts`
- Modify: `packages/api/typescript/src/sales/usecases/UpdateOrderOverride.test.ts`
- Modify: `packages/api/typescript/src/catalog/objects/ProductCostOptionItem.ts`
- Modify: `packages/api/typescript/src/catalog/entities/ProductCost.ts` — comment(s)
- Modify: `packages/api/typescript/src/catalog/entities/ProductCost.test.ts` — comment(s)
- Modify: `packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.ts`
- Modify: `packages/api/typescript/src/finance/objects/GatewayFee.ts`
- Modify: `packages/api/typescript/src/finance/objects/ShippingFee.ts`
- Modify: `packages/api/typescript/src/finance/entities/OperationalCost.ts`
- Modify: `packages/api/typescript/src/finance/usecases/CreateOperationalCost.ts`
- Modify: `packages/api/typescript/src/finance/usecases/UpdateOperationalCost.ts`
- Modify: `packages/api/typescript/src/finance/usecases/UpdateFees.ts`
- Modify: `packages/api/typescript/src/analytics/entities/Goal.ts`
- Modify: `packages/api/typescript/src/analytics/usecases/CreateGoal.ts`
- Modify: `packages/api/typescript/src/analytics/usecases/UpdateGoal.ts`
- Modify: `packages/api/typescript/src/marketing/entities/AdSpendManual.ts`
- Modify: `packages/api/typescript/src/marketing/entities/AdSpendManual.test.ts`
- Modify: `packages/api/typescript/tests/flows/manual-override-publishes-integration-event.flow.test.ts`

**Files to read:**
- `packages/api/typescript/src/shared/objects/MonetaryAmount.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object
**Depends on:** (none)

### Step T1.1 — Rename the test file's identifiers first (RED)

Rename `MonetaryAmount.test.ts` → `Money.test.ts`. Inside it, replace every identifier:
- `MonetaryAmount` → `Money`
- `MonetaryAmountSchema` → `MoneySchema`
- `SignedMonetaryAmountSchema` → `SignedMoneySchema`
- import path `'./MonetaryAmount'` → `'./Money'`

Do NOT change any assertion logic or values — this is a pure identifier rename of the existing 37 assertions.

### Step T1.2 — Run the test to verify it fails

Run: `cd packages/api/typescript && bun test src/shared/objects/Money.test.ts`
Expected: FAIL — `Cannot find module './Money'`.

### Step T1.3 — Create the renamed VO

Create `packages/api/typescript/src/shared/objects/Money.ts` (and delete `MonetaryAmount.ts`):

```typescript
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
```

### Step T1.4 — Update the barrel export

Modify `packages/api/typescript/src/shared/objects/index.ts`:

```diff
-export { MonetaryAmount, MonetaryAmountSchema, SignedMonetaryAmountSchema } from './MonetaryAmount'
+export { Money, MoneySchema, SignedMoneySchema } from './Money'
```

### Step T1.5 — Rename identifiers across all consumer files

In each consumer file listed under **Files to write** (excluding the VO + its test + the barrel,
already handled), apply these exact textual replacements:
- `MonetaryAmount` → `Money`
- `MonetaryAmountSchema` → `MoneySchema`
- `SignedMonetaryAmountSchema` → `SignedMoneySchema`

This covers `import { MonetaryAmount } from '../../shared/objects'` → `import { Money } from ...`,
every `z.instance(MonetaryAmount)` → `z.instance(Money)`, the `StoredMonetaryAmount` interface comment
in `DrizzleProductCostQueryService.ts` (rename to `StoredMoney`), and the doc comments in
`ProductCost.ts` / `ProductCost.test.ts`. Representative diff (`OrderOverrideFields.ts`):

```diff
-import { MonetaryAmount } from '../../shared/objects'
+import { Money } from '../../shared/objects'
@@
-	cost: z.instance(MonetaryAmount),
+	cost: z.instance(Money),
@@
-		revenue: z.instance(MonetaryAmount).optional(),
-		shipping: z.instance(MonetaryAmount).optional(),
-		fees: z.instance(MonetaryAmount).optional(),
-		taxes: z.instance(MonetaryAmount).optional(),
+		revenue: z.instance(Money).optional(),
+		shipping: z.instance(Money).optional(),
+		fees: z.instance(Money).optional(),
+		taxes: z.instance(Money).optional(),
```

Apply the same identifier rename in: `OrderOverrideFields.test.ts`, `UpdateOrderOverride.test.ts`,
`ProductCostOptionItem.ts`, `ProductCost.ts`, `ProductCost.test.ts`, `DrizzleProductCostQueryService.ts`,
`GatewayFee.ts`, `ShippingFee.ts`, `OperationalCost.ts`, `CreateOperationalCost.ts`,
`UpdateOperationalCost.ts`, `UpdateFees.ts`, `Goal.ts`, `CreateGoal.ts`, `UpdateGoal.ts`,
`AdSpendManual.ts`, `AdSpendManual.test.ts`, `manual-override-publishes-integration-event.flow.test.ts`.

### Step T1.6 — Run the renamed VO test (GREEN)

Run: `cd packages/api/typescript && bun test src/shared/objects/Money.test.ts`
Expected: PASS — all 37 assertions pass against `Money`.

### Step T1.7 — Type-check + lint + affected tests

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: 0 errors (no `MonetaryAmount` identifier remains anywhere).
Run: `cd packages/api/typescript && bun test src/sales src/catalog src/finance src/analytics src/marketing`
Expected: all green.

### Step T1.8 — Commit

```bash
git add packages/api/typescript/src/shared/objects/Money.ts \
        packages/api/typescript/src/shared/objects/Money.test.ts \
        packages/api/typescript/src/shared/objects/index.ts \
        packages/api/typescript/src/sales packages/api/typescript/src/catalog \
        packages/api/typescript/src/finance packages/api/typescript/src/analytics \
        packages/api/typescript/src/marketing \
        packages/api/typescript/tests/flows/manual-override-publishes-integration-event.flow.test.ts
git rm packages/api/typescript/src/shared/objects/MonetaryAmount.ts \
       packages/api/typescript/src/shared/objects/MonetaryAmount.test.ts
git commit -m "refactor(shared): rename MonetaryAmount value object to Money (Task T1)"
```

---

## Task T2: Internal multi-currency aggregation has a `MultiCurrencyMoney` VO

A new internal value object that holds `amountCents` per currency (a partial record) with calculation
+ conversion utilities — the pre-conversion accumulator in the pipeline (spec AC-4, D3, D8). Additive;
no consumer migration yet (`CurrencyAmountSchema` still exists until T3).

**Files to write:**
- Create: `packages/api/typescript/src/shared/objects/MultiCurrencyMoney.ts`
- Create: `packages/api/typescript/src/shared/objects/MultiCurrencyMoney.test.ts`
- Modify: `packages/api/typescript/src/shared/objects/index.ts` — export `MultiCurrencyMoney`/`MultiCurrencyMoneySchema`

**Files to read:**
- `packages/api/typescript/src/shared/objects/Money.ts` (after T1)
- `packages/api/typescript/core/src/objects/BasePrimitiveValueObject.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object
**Depends on:** T1

### Step T2.1 — Write the failing test (RED)

Create `packages/api/typescript/src/shared/objects/MultiCurrencyMoney.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
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
```

### Step T2.2 — Run the test to verify it fails

Run: `cd packages/api/typescript && bun test src/shared/objects/MultiCurrencyMoney.test.ts`
Expected: FAIL — `Cannot find module './MultiCurrencyMoney'`.

### Step T2.3 — Write the value object

Create `packages/api/typescript/src/shared/objects/MultiCurrencyMoney.ts`:

```typescript
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
```

### Step T2.4 — Export from the barrel

Modify `packages/api/typescript/src/shared/objects/index.ts` — add after the `Money` export:

```typescript
export { MultiCurrencyMoney, MultiCurrencyMoneySchema } from './MultiCurrencyMoney'
```

### Step T2.5 — Run the test to verify it passes

Run: `cd packages/api/typescript && bun test src/shared/objects/MultiCurrencyMoney.test.ts`
Expected: PASS — all assertions pass.

### Step T2.6 — Type-check + lint

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: 0 errors.

### Step T2.7 — Commit

```bash
git add packages/api/typescript/src/shared/objects/MultiCurrencyMoney.ts \
        packages/api/typescript/src/shared/objects/MultiCurrencyMoney.test.ts \
        packages/api/typescript/src/shared/objects/index.ts
git commit -m "feat(shared): MultiCurrencyMoney value object with calc + convert (Task T2)"
```

---

## Task T3: Read KPIs split into `NumberMetric` and `MoneyMetric`

Reshape `shared/schemas/Metric.ts` to the new vocabulary and migrate every consumer in one atomic
change (the `Tally` shape change + the deletion of `CurrencyMetric`/`ConsolidatedTally`/`CurrencyAmount`
couple all consumers). Money KPIs become `MoneyMetric` (currency-carrying); ratios/counts stay
`NumberMetric`; the FE no longer receives multi-currency (spec AC-2, AC-3, AC-5, AC-6, AC-7, D1, D5, D6, D7).

**Files to write:**
- Modify: `packages/api/typescript/src/shared/schemas/Metric.ts` — rewrite to new vocabulary
- Modify: `packages/api/typescript/src/shared/schemas/index.ts` — drop `MonetaryByCurrency` export
- Delete: `packages/api/typescript/src/shared/schemas/MonetaryByCurrency.ts`
- Modify: `packages/api/typescript/src/shared/testing/mock.ts` — add money-metric mocks
- Modify: `packages/api/typescript/src/tracking/usecases/GetPixelFunnel.ts`
- Modify: `packages/api/typescript/src/tracking/usecases/GetPixelFunnel.test.ts`
- Modify: `packages/api/typescript/src/ui/schemas/dashboard.ts` — rewrite money leaves
- Modify: `packages/api/typescript/src/ui/usecases/GetDashboard.ts` — faker emits converted money
- Modify: `packages/api/typescript/src/ui/usecases/GetDashboard.test.ts`
- Modify: `packages/api/typescript/src/ui/usecases/ListQuickProductRanking.ts`
- Modify: `packages/api/typescript/src/ui/usecases/ListQuickProductRanking.test.ts`

**Files to read:**
- `packages/api/typescript/src/shared/schemas/Metric.ts`
- `packages/api/typescript/src/ui/schemas/dashboard.ts`
- `packages/api/typescript/src/ui/usecases/GetDashboard.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema, /query, /test
**Depends on:** (none)

### Step T3.1 — Update the funnel test to expect MoneyMetric carts (RED)

Modify `packages/api/typescript/src/tracking/usecases/GetPixelFunnel.test.ts` — assert `carts.value`
is a `MoneyMetric` (money-shaped value):

```diff
 	it('returns a flat funnel that conforms to the schema (SINGLE)', async () => {
 		const out = await run(TenancyScope.SINGLE_STORE)
 		expect(() => GetPixelFunnelOutputSchema.parse(out)).not.toThrow()
 		expect(out.hasPixel).toBe(true)
 		expect(out.base).toHaveProperty('value')
 		expect(out.carts).toHaveProperty('count')
 		expect(out.carts).toHaveProperty('value')
+		// carts.value is now a MoneyMetric: value carries amountCents + currency
+		expect(out.carts.value.value).toHaveProperty('amountCents')
+		expect(out.carts.value.value).toHaveProperty('currency')
+		// base/steps/conversionRate stay NumberMetric (plain number value)
+		expect(typeof out.base.value).toBe('number')
 	})
```

### Step T3.2 — Run the funnel test to verify it fails

Run: `cd packages/api/typescript && bun test src/tracking/usecases/GetPixelFunnel.test.ts`
Expected: FAIL — `carts.value.value` is currently a number, has no `amountCents`.

### Step T3.3 — Rewrite the metric vocabulary

Replace the whole body of `packages/api/typescript/src/shared/schemas/Metric.ts` with:

```typescript
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
import { z } from '@template/core-typescript'
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
```

### Step T3.4 — Delete the dead MonetaryByCurrency schema

- Delete `packages/api/typescript/src/shared/schemas/MonetaryByCurrency.ts`.
- Modify `packages/api/typescript/src/shared/schemas/index.ts`:

```diff
-export { MonetaryByCurrencySchema } from './MonetaryByCurrency'
 export * from './Metric'
```

### Step T3.5 — Add money-metric mock helpers

Modify `packages/api/typescript/src/shared/testing/mock.ts` — add after `mockMetric` (keep `mockMetric`
for `NumberMetric`; import `CurrencyCode`):

```typescript
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'

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
```

### Step T3.6 — Migrate GetPixelFunnel

Modify `packages/api/typescript/src/tracking/usecases/GetPixelFunnel.ts`:

```diff
-import { MetricSchema, TallySchema } from '../../shared/schemas'
-import { faker, mockMetric } from '../../shared/testing/mock'
+import { NumberMetricSchema, TallySchema } from '../../shared/schemas'
+import { faker, mockMetric, mockMoneyMetric } from '../../shared/testing/mock'
@@
 export const GetPixelFunnelOutputSchema = z.object({
 	hasPixel: z.boolean(),
-	base: MetricSchema,
-	steps: z.enumRecord(PixelEventType, MetricSchema),
-	conversionRate: MetricSchema,
+	base: NumberMetricSchema,
+	steps: z.enumRecord(PixelEventType, NumberMetricSchema),
+	conversionRate: NumberMetricSchema,
 	carts: TallySchema,
 })
@@
 		return {
 			hasPixel: true,
 			base: mockMetric(),
 			steps: recordOf(PixelEventType, mockMetric),
 			conversionRate: mockMetric(),
-			carts: { count: mockMetric(), value: mockMetric() },
+			carts: { count: mockMetric(), value: mockMoneyMetric() },
 		}
```

### Step T3.7 — Migrate dashboard.ts read vocabulary

Replace the whole body of `packages/api/typescript/src/ui/schemas/dashboard.ts` with the version below.
Money leaves → `MoneyMetricSchema`; ratios/counts (`margin`, `unitsSold`, `roi`, `roas`, `cpa`) →
`NumberMetricSchema`; money breakdowns → `segmentedMoney`; `orders`/`paymentMethods`/`draftOrders` →
`TallySchema` (new shape). The `Consolidated*` variants use the same money shapes (converted single
currency, spec D7) — structurally retained.

```typescript
/**
 * Dashboard read vocabulary. Each Stat KPI is `{ metric, details? }`; AdditionalCost is its own
 * top-level breakdown. National adds `paymentMethods` (under Stat) and `draftOrders` (under
 * AdditionalCost). All money leaves are MoneyMetric (single converted currency, spec D1/D7);
 * ratios/counts are NumberMetric. Generic atoms come from @shared/schemas.
 */
import { z } from '@template/core-typescript'
import {
	CurrencyCode,
	CostKind,
	MarketingPlatform,
	AdAttribution,
	DisputeStatus,
	PaymentMethod,
	PaymentStatus,
	OperationalCostFlow,
	OperationalCostRecurrency,
} from '@template/contracts-typescript/wire/enums'
import { NumberMetricSchema, MoneyMetricSchema, TallySchema, segmentedNumber, segmentedMoney } from '../../shared/schemas'

// ---------------------------------------------------------------------------
// Operational cost item
// ---------------------------------------------------------------------------
export const OperationalCostItemSchema = z.object({
	id: z.string(),
	name: z.string(),
	flow: z.enum(OperationalCostFlow),
	frequency: z.enum(OperationalCostRecurrency),
	amountCents: z.number().int(), // D11 — cents, so the FE renders it through the same Money path
	currency: z.enum(CurrencyCode),
	startDate: z.iso.datetime({ offset: true }),
	endDate: z.iso.datetime({ offset: true }).nullable(),
})

// ---------------------------------------------------------------------------
// Stat — each KPI is `{ metric, details? }`. Money KPIs are MoneyMetric; ratios/counts
// (margin, roi, roas, unitsSold, cpa) are NumberMetric. orders carries count + money value (Tally).
// ---------------------------------------------------------------------------
export const StatSchema = z.object({
	revenue: z.object({ metric: MoneyMetricSchema }),
	profit: z.object({ metric: MoneyMetricSchema }),
	margin: z.object({ metric: NumberMetricSchema }),
	averageTicket: z.object({ metric: MoneyMetricSchema }),
	unitsSold: z.object({ metric: NumberMetricSchema }),
	roi: z.object({ metric: NumberMetricSchema }),
	roas: z.object({ metric: NumberMetricSchema }),
	costs: z.object({ metric: MoneyMetricSchema, details: segmentedMoney(CostKind) }),
	productCost: z.object({
		metric: MoneyMetricSchema,
		details: z.object({ product: MoneyMetricSchema, shipping: MoneyMetricSchema }),
	}),
	fees: z.object({
		metric: MoneyMetricSchema,
		details: z.object({ gateway: MoneyMetricSchema, checkout: MoneyMetricSchema, chargeback: MoneyMetricSchema }),
	}),
	ads: z.object({
		metric: MoneyMetricSchema,
		details: z.object({
			byPlatform: segmentedMoney(MarketingPlatform),
			byType: segmentedMoney(AdAttribution),
			tax: MoneyMetricSchema,
			cpa: NumberMetricSchema,
		}),
	}),
	orders: z.object({ metric: TallySchema, details: z.object({ generated: TallySchema, paid: TallySchema }) }),
})

const PaymentMethodsStatSchema = z.object({
	metric: TallySchema,
	details: z.object({
		byMethod: z.enumRecord(PaymentMethod, z.object({ total: TallySchema, byStatus: z.enumRecord(PaymentStatus, TallySchema) })),
	}),
})

/** NATIONAL adds the payment-method breakdown as a Stat entry. */
export const StatNationalSchema = StatSchema.extend({ paymentMethods: PaymentMethodsStatSchema })

/** Per-store Stat keyed by StoreIntegrationId (UUID string). */
export const PerStoreStatSchema = z.record(z.string(), StatSchema)

// ---------------------------------------------------------------------------
// Consolidated Stat (multi-store) — money already converted to a single currency (spec D7),
// so the shapes equal the non-consolidated ones; retained as distinct union members.
// ---------------------------------------------------------------------------
export const ConsolidatedStatSchema = StatSchema
export const ConsolidatedStatNationalSchema = StatNationalSchema

// ---------------------------------------------------------------------------
// AdditionalCost — its own top-level. `draftOrders` only in *_NATIONAL.
// ---------------------------------------------------------------------------
export const AdditionalCostSchema = z.object({
	chargeback: z.object({ byStatus: segmentedMoney(DisputeStatus), fees: MoneyMetricSchema }),
	refund: MoneyMetricSchema,
	taxes: z.object({ ads: MoneyMetricSchema, others: MoneyMetricSchema }),
	operational: z.object({ total: MoneyMetricSchema, items: z.array(OperationalCostItemSchema) }),
	warranty: MoneyMetricSchema,
})

export const AdditionalCostNationalSchema = AdditionalCostSchema.extend({ draftOrders: TallySchema })

export const ConsolidatedAdditionalCostSchema = AdditionalCostSchema
export const ConsolidatedAdditionalCostNationalSchema = AdditionalCostNationalSchema
```

> `segmentedNumber` is exported from `@shared/schemas` for future number breakdowns; the dashboard
> currently has none, so it is intentionally not referenced here.

### Step T3.8 — Migrate GetDashboard faker

Modify `packages/api/typescript/src/ui/usecases/GetDashboard.ts`. Update the metric imports, drop the
multi-currency fakers, and emit money KPIs via `mockMoneyMetric`:

```diff
-import { MetricSchema, CurrencyMetricSchema, CurrencyAmountSchema, TallySchema, ConsolidatedTallySchema } from '../../shared/schemas'
+import { NumberMetricSchema, MoneyMetricSchema, TallySchema } from '../../shared/schemas'
+import { mockMoneyMetric } from '../../shared/testing/mock'
```

- Remove the `fakeCurrencyAmount`, `fakeCurrencyMetric`, and `fakeConsolidatedTally` helpers entirely.
- `fakeMetric()` stays (it feeds `NumberMetric` leaves — margin/roi/roas/unitsSold/cpa).
- `fakeTally()` becomes `{ count: fakeMetric(), value: mockMoneyMetric() }`.
- Every place that built a money KPI as `fakeMetric()` or a `CurrencyMetric`/`ConsolidatedTally` now
  builds `mockMoneyMetric()` / `fakeTally()` so the object satisfies the rewritten `StatSchema` /
  `AdditionalCostSchema` (money leaves are `MoneyMetric`). Because `Consolidated*` schemas now equal
  their base schemas, the consolidated and national branches build the same money shapes.

Anchor diff for the tally helper:

```diff
-const fakeTally = () => ({ count: fakeMetric(), value: fakeMetric() })
+const fakeTally = () => ({ count: fakeMetric(), value: mockMoneyMetric() })
```

Operational-cost-item faker: rename the money field to `amountCents` and emit cents (D11):

```diff
-		amount: faker.number.float({ min: 0, max: 5_000, fractionDigits: 2 }),
+		amountCents: faker.number.int({ min: 0, max: 500_000 }),
 		currency: pick(Object.values(CurrencyCode)),
```

> The use case's own `OutputSchema` (discriminated union of the four dashboard variants) is unchanged
> structurally; only the leaf builders change so the faker output parses against the rewritten schemas.

### Step T3.9 — Migrate ListQuickProductRanking

Modify `packages/api/typescript/src/ui/usecases/ListQuickProductRanking.ts`:

```diff
-import { faker, mockId, mockMetric, mockSeries } from '../../shared/testing/mock'
+import { faker, mockId, mockMetric, mockMoneyMetric, mockSeries } from '../../shared/testing/mock'
@@
-	sales: { count: mockMetric(), value: mockMetric() },
+	sales: { count: mockMetric(), value: mockMoneyMetric() },
```

The `sales: TallySchema` field now resolves to the new Tally shape automatically (count = NumberMetric,
value = MoneyMetric). If `ListQuickProductRanking.test.ts` asserts `sales.value.value` is a number,
update it to read `sales.value.value.amountCents` (money) and keep the ranking sort on that field:

```diff
-		.sort((a, b) => b.sales.value.value - a.sales.value.value)
+		.sort((a, b) => b.sales.value.value.amountCents - a.sales.value.value.amountCents)
```

(Apply the same `.amountCents` access in `ListQuickProductRanking.ts` if it sorts on `sales.value.value`.)

### Step T3.10 — Run the migrated tests (GREEN)

Run: `cd packages/api/typescript && bun test src/tracking/usecases/GetPixelFunnel.test.ts src/ui/usecases/GetDashboard.test.ts src/ui/usecases/ListQuickProductRanking.test.ts`
Expected: PASS — funnel carts are MoneyMetric; dashboard + ranking parse against the new schemas.

### Step T3.11 — Type-check + lint

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: 0 errors — no reference to `MetricSchema`, `CurrencyMetricSchema`, `ConsolidatedTallySchema`,
`CurrencyAmountSchema`, `MonetaryByCurrencySchema`, or `segmented`/`segmentedCurrency` remains.

### Step T3.12 — Commit

```bash
git add packages/api/typescript/src/shared/schemas/Metric.ts \
        packages/api/typescript/src/shared/schemas/index.ts \
        packages/api/typescript/src/shared/testing/mock.ts \
        packages/api/typescript/src/tracking/usecases/GetPixelFunnel.ts \
        packages/api/typescript/src/tracking/usecases/GetPixelFunnel.test.ts \
        packages/api/typescript/src/ui/schemas/dashboard.ts \
        packages/api/typescript/src/ui/usecases/GetDashboard.ts \
        packages/api/typescript/src/ui/usecases/GetDashboard.test.ts \
        packages/api/typescript/src/ui/usecases/ListQuickProductRanking.ts \
        packages/api/typescript/src/ui/usecases/ListQuickProductRanking.test.ts
git rm packages/api/typescript/src/shared/schemas/MonetaryByCurrency.ts
git commit -m "refactor(shared): NumberMetric/MoneyMetric read vocabulary; convert money before FE (Task T3)"
```

---

## Task T4: Contract Lock — SDK regen

The metric reshape (T3) changed BFF output schemas (`GetPixelFunnel` carts → MoneyMetric, dashboard
money leaves → MoneyMetric, removal of multi-currency). Regenerate OpenAPI + the TypeScript SDK so the
wire contract matches (spec AC-8, D9).

**Files to write:**
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/**`

**Files to read:**
- `packages/api/typescript/src/tracking/controllers/GetPixelFunnel.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T3

### Step T4.1 — Regenerate OpenAPI + SDK

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun emit-openapi && bun sdk`
Expected: completes without error.

### Step T4.2 — Verify the regen reflects the new shapes

Run: `git diff --stat packages/client/dist/ packages/api/typescript/public/docs/openapi.json`
Expected: `openapi.json` changed; the `GetPixelFunnel` types/zod under `packages/client/dist/typescript`
now show `carts.value.value` as a money object (`amountCents` + `currency`); dashboard output types show
money leaves as money objects; no `CurrencyAmount`/multi-currency metric types remain for these endpoints.

### Step T4.3 — Type-check across workspaces after regen

Run: `bun tsc`
Expected: 0 errors across all workspaces (no committed frontend consumes the changed BFF types — the
funnel is unbuilt and the dashboard route is a mock shell).

### Step T4.4 — Commit

```bash
git add packages/api/typescript/public/docs/openapi.json packages/client/dist/
git commit -m "chore(sdk): regenerate openapi+sdk for money/metric vocabulary (Task T4)"
```

---

## Task T5: The frontend renders money from a `Money` object via an encapsulated hook

Rework `lib/format.ts` to a cents-aware, single-currency money API; add a `useMoney()` hook that
infers the locale internally; refactor `AdditionalCostsSection` to render every money through it —
removing `DEFAULT_CURRENCY`, the `i18n.language` locale ternary, and per-`kind` currency selection
(spec AC-10, AC-11, D10, D11).

**Files to write:**
- Modify: `packages/app/react/src/lib/format.ts` — rework to `formatMoney`/`sumMoney` over `Money`
- Create: `packages/app/react/src/lib/format.test.ts`
- Create: `packages/app/react/src/hooks/useMoney.ts`
- Modify: `packages/app/react/src/hooks/index.ts` — export `useMoney`
- Modify: `packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/index.tsx`

**Files to read:**
- `packages/app/react/src/lib/format.ts`
- `packages/app/react/src/hooks/index.ts`
- `packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/index.tsx`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /component
**Depends on:** T4

### Step T5.1 — Write the failing test for the money formatters (RED)

Create `packages/app/react/src/lib/format.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { formatMoney, sumMoney } from './format'

describe('formatMoney', () => {
	it('formats cents as currency in the given locale', () => {
		expect(formatMoney({ amountCents: 0, currency: 'BRL' }, 'pt-BR')).toBe('R$ 0,00')
		expect(formatMoney({ amountCents: 123450, currency: 'BRL' }, 'pt-BR')).toBe('R$ 1.234,50')
		expect(formatMoney({ amountCents: 123450, currency: 'USD' }, 'en-US')).toBe('$1,234.50')
	})
})

describe('sumMoney', () => {
	it('sums same-currency cents into one Money', () => {
		expect(sumMoney([{ amountCents: 100, currency: 'BRL' }, { amountCents: 250, currency: 'BRL' }]))
			.toEqual({ amountCents: 350, currency: 'BRL' })
	})

	it('returns a zero Money for an empty list', () => {
		expect(sumMoney([])).toEqual({ amountCents: 0, currency: 'BRL' })
	})
})
```

### Step T5.2 — Run the test to verify it fails

Run: `cd packages/app/react && bun test src/lib/format.test.ts`
Expected: FAIL — `formatMoney`/`sumMoney` not exported (only the old `formatCurrency`/`formatMoneyValue` exist).

### Step T5.3 — Rework the money formatters

Replace the whole body of `packages/app/react/src/lib/format.ts` with:

```typescript
/**
 * Money formatting for display strings. Components render money by passing a Money
 * (cents + currency) to the useMoney() hook — they never pick a currency or a locale.
 * Money on the wire is always single-currency (converted server-side).
 */
export interface Money {
	amountCents: number
	currency: string
}

/** Format a single-currency money value (cents) in the given locale: {1234,'BRL'} -> "R$ 12,34". */
export function formatMoney(money: Money, locale = 'pt-BR'): string {
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: money.currency,
		minimumFractionDigits: 2,
	}).format(money.amountCents / 100)
}

/** Sum same-currency money values into one Money carrying the shared currency. */
export function sumMoney(items: Money[]): Money {
	if (items.length === 0) return { amountCents: 0, currency: 'BRL' }
	return { amountCents: items.reduce((acc, m) => acc + m.amountCents, 0), currency: items[0]!.currency }
}
```

> The old `MoneyValue` union, `formatMoneyValue`, and the major-unit `formatCurrency` are gone — FE
> money is always single-currency cents after the backend conversion (D1/D10). Cents are divided by
> 100 with 2 fraction digits (the codebase's universal cents convention; zero-decimal currencies like
> JPY are a known limitation, out of scope).

### Step T5.4 — Add the useMoney hook

Create `packages/app/react/src/hooks/useMoney.ts`:

```typescript
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { formatMoney, type Money } from '@/lib/format'

/**
 * Returns a money formatter bound to the active locale (inferred from i18n). Encapsulates locale
 * inference so components just pass a Money and get a finished string — no DEFAULT_CURRENCY, no
 * `i18n.language` ternary at the call site.
 */
export function useMoney() {
	const { i18n } = useTranslation()
	const locale = i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR'
	return useCallback((money: Money) => formatMoney(money, locale), [locale])
}
```

Modify `packages/app/react/src/hooks/index.ts` — add:

```typescript
export { useMoney } from './useMoney'
```

### Step T5.5 — Refactor AdditionalCostsSection onto useMoney

Modify `packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/index.tsx`:

- Imports: drop `formatCurrency, formatMoneyValue, type MoneyValue` from `@/lib/format`; keep/import
  `sumMoney, type Money`; add `import { useMoney } from '@/hooks'`.
- Delete the `const DEFAULT_CURRENCY = 'BRL'` line.
- `const { t, i18n } = useTranslation()` → `const { t } = useTranslation()`; add `const formatMoney = useMoney()`.
- Delete `const locale = i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR'`.
- Delete `const currency = data.kind === 'SINGLE_GLOBAL' || ... ? data.store.currency : DEFAULT_CURRENCY`.
- `const money = (value: MoneyValue) => formatMoneyValue(value, currency, locale)` → `const money = (m: Money) => formatMoney(m)`.
- `byKey` value type `total: MoneyValue` → `total: Money` (each `ac.*.value` is now a `MoneyMetric` value, i.e. `{ amountCents, currency }`).
- Operational items: replace `value: formatCurrency(item.amount, item.currency, locale)` with
  `value: money({ amountCents: item.amountCents, currency: item.currency })`.
- The no-costs fallback `value: money(0)` → `value: money({ amountCents: 0, currency: ac.refund.value.currency })`
  (derive the zero's currency from a sibling money leaf — no constant).
- `useMemo` deps `[data, t, locale]` → `[data, t, formatMoney]`.

Representative diff (head + money helper):

```diff
-import { formatCurrency, formatMoneyValue, sumMoney, type MoneyValue } from '@/lib/format'
+import { sumMoney, type Money } from '@/lib/format'
 import { cn } from '@/lib/utils'
 import { useTenancyStore } from '@/stores'
+import { useMoney } from '@/hooks'
@@
-const DEFAULT_CURRENCY = 'BRL'
@@
-	const { t, i18n } = useTranslation()
-	const locale = i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR'
+	const { t } = useTranslation()
+	const formatMoney = useMoney()
@@
-		const currency = data.kind === 'SINGLE_GLOBAL' || data.kind === 'SINGLE_NATIONAL' ? data.store.currency : DEFAULT_CURRENCY
-		const money = (value: MoneyValue) => formatMoneyValue(value, currency, locale)
+		const money = (m: Money) => formatMoney(m)
```

### Step T5.6 — Run the formatter test (GREEN) + type-check + lint

Run: `cd packages/app/react && bun test src/lib/format.test.ts`
Expected: PASS.
Run: `cd packages/app/react && bun x tsc --noEmit && bun lint`
Expected: 0 errors — `AdditionalCostsSection` has no `DEFAULT_CURRENCY`, no `i18n.language` ternary,
no `data.store.currency` selection; every money renders via `useMoney()`.

### Step T5.7 — Commit

```bash
git add packages/app/react/src/lib/format.ts packages/app/react/src/lib/format.test.ts \
        packages/app/react/src/hooks/useMoney.ts packages/app/react/src/hooks/index.ts \
        "packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/index.tsx"
git commit -m "refactor(app): render money via encapsulated useMoney hook over Money objects (Task T5)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean across workspaces
- [ ] `bun lint` — lint clean
- [ ] `bun test affected --base=dev` — affected tests pass (Money, MultiCurrencyMoney, GetPixelFunnel, GetDashboard, ListQuickProductRanking, and the renamed entity/usecase suites)
- [ ] AC mapping (every spec AC → ≥1 test / gate):
  - AC-1 (Money replaces MonetaryAmount) → `T1` `src/shared/objects/Money.test.ts` + `T1.7` tsc (no `MonetaryAmount` remains)
  - AC-2 (Metric.ts exports new vocab; old gone) → `T3.11` tsc + `T3.3`/`T3.4`
  - AC-3 (MonetaryByCurrency deleted) → `T3.4` + `T3.11` tsc
  - AC-4 (MultiCurrencyMoney + utils, each tested) → `T2` `src/shared/objects/MultiCurrencyMoney.test.ts`
  - AC-5 (funnel: NumberMetric steps, MoneyMetric carts) → `T3` `GetPixelFunnel.test.ts:"returns a flat funnel that conforms to the schema (SINGLE)"`
  - AC-6 (dashboard money→MoneyMetric, ratios→NumberMetric, Consolidated converts) → `T3` `GetDashboard.test.ts` + `T3.7`
  - AC-7 (ListQuickProductRanking new Tally) → `T3` `ListQuickProductRanking.test.ts`
  - AC-8 (SDK regenerated, tsc clean) → `T4.3` `bun tsc` + `T4.2`
  - AC-9 (z.instance(Money), still rejects negatives) → `T1` `Money.test.ts` (nonnegative assertions)
  - AC-10 (formatMoney/sumMoney over Money; useMoney infers locale) → `T5` `src/lib/format.test.ts` + `T5.4`
  - AC-11 (AdditionalCostsSection via useMoney; no DEFAULT_CURRENCY/locale ternary; OperationalCostItem amountCents) → `T5.5`/`T5.6` (tsc) + `T3.7`
- [ ] `git status` clean (T1–T5 commits landed)

## Notes

- **Frontend in scope (T5 only).** The single committed FE money consumer after a clean tree is
  `AdditionalCostsSection`; T5 refactors it onto `useMoney()`. The dashboard route shell and the
  unbuilt funnel consume nothing money-shaped yet. The paused funnel plan
  (`.plans/2026-06-03-pixel-funnel-section.md`) is revised AFTER this lands — `carts.value` becomes a
  `MoneyMetric` carrying its currency, and the funnel renders it via `useMoney()` (dropping the
  `useGetUserInfo` currency lookup). The funnel plan's earlier `formatCurrency` in `lib/utils.ts` is
  superseded by `lib/format.ts`'s `formatMoney` + the `useMoney` hook.
- **Clean tree first (prerequisite).** The "Additional Costs Card" work is currently uncommitted and
  IS the file T5 refactors. Commit it before `/build` so T5 modifies a tracked file and T4's regen +
  tsc gate reflect only this change.
- **`useMoney` divides cents by 100 with 2 fraction digits** (the codebase's universal cents
  convention). Zero-decimal currencies (JPY) are a known limitation, out of scope here.
- **`convert()` missing-rate** throws a plain `Error` (internal precondition), not a registered domain
  error — deliberately avoids touching the error registry + i18n (the spec's `MISSING_FX_RATE` note is
  simplified; the FX rate source itself is out of scope, spec D8/OQ-2).
- **`GetDashboard` union near-duplication** (`Consolidated*` == base after conversion) is intentional
  (spec D7); collapsing the 4-variant union is the deferred OQ-1, not part of this plan.
- **Run with bun on PATH:** `export PATH="$HOME/.bun/bin:$PATH"`. Backend type-check that excludes
  `bun:test` noise: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`.
