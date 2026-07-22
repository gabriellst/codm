# Fees, Taxes & Product-Cost Timeline Model — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Model fees, taxes, and product-cost configuration with per-entry time-effective timelines backed by one shared abstraction (`z.historical` + `Timeline<T>`), killing every `z.unknown()` on the fee config and splitting taxes into revenue + marketing timelines.

**Architecture:** A new core Zod extension `z.historical(shapeOrSchema)` adds a `{ startDate, endDate }` window (via `z.coerce.date()`, so jsonb ISO strings rehydrate) plus a `startDate < endDate` refine. A shared `Timeline<T>` value object performs last-write-wins **interval painting** — `place()` trims/splits/removes overlapping entries to keep a sorted, non-overlapping series. Finance's `FeesConfiguration` becomes one row per store holding typed per-key fee timelines (gateway per platform×method, single checkout, single shipping); `Taxes` becomes `TaxConfiguration` with `revenueTax` + `marketingTax` timelines. Catalog's `ProductCostOption` reuses `z.historical`. The per-tab write use cases/controllers (today MOCK) become real and persist via `Timeline.place`; reads stay mock except for mechanical fixes. `GatewayFeeKind` is dropped entirely (analytics breakdown reworked to explicit fixed/variable fields).

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod v4, TypeSpec contracts

**Spec:** .specs/2026-06-02-fees-taxes-timeline-model-design.md
**Tasks:** 11 (T7–T9 removed — the per-tab mock writers they targeted were deleted by the intervening `b637d550` BFF-conventions refactor; fee placement folded into T10)
**Estimated minutes:** 430

---

## Phase 0 — Foundation & Contract Lock

`z.historical` (T1) and `Timeline<T>` (T2) are the shared keystone every later Task depends on. The ShippingCostMode rename (T3) is the contract lock the finance fee VOs (T5) consume. These three have no dependency on each other and may run in parallel.

## Task T1: A schema gains a validated time window via `z.historical`

**Files to write:**
- Modify: `packages/api/typescript/core/src/utils/schema/ExtraTypes.ts` — add `historical()` + register in `ExtraSchemaTypes`
- Test: `packages/api/typescript/core/src/utils/schema/historical.test.ts`

**Files to read:**
- `packages/api/typescript/core/src/utils/schema/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema, /test
**Depends on:** (none)

### Step T1.1 — Write the failing test

```typescript
import { describe, it, expect } from 'bun:test'
import { z } from './index'

describe('z.historical', () => {
	it('adds a window to a raw shape and defaults endDate to null', () => {
		const schema = z.historical({ rate: z.number() })
		const parsed = schema.parse({ rate: 0.1, startDate: new Date('2026-01-01') })
		expect(parsed.endDate).toBeNull()
		expect(parsed.startDate).toBeInstanceOf(Date)
	})

	it('coerces ISO-string dates (jsonb round-trip)', () => {
		const schema = z.historical({ rate: z.number() })
		const parsed = schema.parse({ rate: 0.1, startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-02-01T00:00:00.000Z' })
		expect(parsed.startDate).toBeInstanceOf(Date)
		expect(parsed.endDate).toBeInstanceOf(Date)
	})

	it('rejects startDate >= endDate with INVALID_DATE_RANGE', () => {
		const schema = z.historical({ rate: z.number() })
		const r = schema.safeParse({ rate: 0.1, startDate: new Date('2026-02-01'), endDate: new Date('2026-01-01') })
		expect(r.success).toBe(false)
		if (!r.success) expect(r.error.issues[0]!.message).toBe('INVALID_DATE_RANGE')
	})

	it('applies the window per-variant on a discriminated union and stays narrowable', () => {
		const schema = z.historical(
			z.discriminatedUnion('mode', [
				z.object({ mode: z.literal('NONE') }),
				z.object({ mode: z.literal('FLAT'), value: z.number() }),
			]),
		)
		const flat = schema.parse({ mode: 'FLAT', value: 5, startDate: new Date('2026-01-01') })
		expect(flat.mode).toBe('FLAT')
		expect(flat.endDate).toBeNull()
		const none = schema.parse({ mode: 'NONE', startDate: new Date('2026-01-01') })
		expect(none.mode).toBe('NONE')
	})
})
```

### Step T1.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test core/src/utils/schema/historical.test.ts`
Expected: FAIL with `z.historical is not a function`.

### Step T1.3 — Implement `historical` in ExtraTypes.ts

Modify `packages/api/typescript/core/src/utils/schema/ExtraTypes.ts`. Add near the other builders (before `ExtraSchemaTypes`):

```typescript
// Time-effective window appended to any schema by `z.historical`. `endDate`
// null = open-ended / currently active. `z.coerce.date()` lets jsonb-stored
// ISO strings rehydrate to Date on read without manual parsing.
const TimeWindowShape = {
	startDate: z.coerce.date(),
	endDate: z.coerce.date().nullable().default(null),
}

const windowIsValid = (w: { startDate: Date; endDate: Date | null }) => w.endDate === null || w.startDate < w.endDate
const INVALID_RANGE = { error: 'INVALID_DATE_RANGE' } as const

/**
 * Extends a schema with a validated `[startDate, endDate)` window.
 * Accepts a raw shape, a ZodObject, or a discriminated union (window
 * applied per-variant so the discriminator stays narrowable).
 */
export function historical<T extends ZodRawShape>(shape: T): ZodObject<T & typeof TimeWindowShape>
export function historical<T extends ZodTypeAny>(schema: T): ZodTypeAny
export function historical(input: ZodRawShape | ZodTypeAny): ZodTypeAny {
	if (!('_zod' in (input as object))) {
		return z.object(input as ZodRawShape).extend(TimeWindowShape).refine(windowIsValid, INVALID_RANGE) as unknown as ZodTypeAny
	}
	const schema = input as ZodTypeAny
	const def = (schema as { def?: { type?: string; discriminator?: string; options?: ZodObject<ZodRawShape>[] } }).def
	if (def?.type === 'discriminated_union' && def.discriminator && def.options) {
		const widened = def.options.map(o => o.extend(TimeWindowShape))
		return z.discriminatedUnion(def.discriminator, widened as never).refine(windowIsValid, INVALID_RANGE)
	}
	return (schema as ZodObject<ZodRawShape>).extend(TimeWindowShape).refine(windowIsValid, INVALID_RANGE)
}
```

Then register it. Modify the `ExtraSchemaTypes` export:

```diff
 export const ExtraSchemaTypes = {
 	paginatedQuery,
 	paginatedResponse,
 	baseEvent,
 	domainEvent,
 	integrationEvent,
 	instance,
+	historical,
 }
```

> Zod v4 introspection note: if `schema.def.type` is not the literal `'discriminated_union'` in this Zod build, log `schema.def` once and switch the guard to the actual discriminant (e.g. `instanceof z.ZodDiscriminatedUnion`). The T1.4 union test pins correct behavior.

### Step T1.4 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test core/src/utils/schema/historical.test.ts`
Expected: PASS — 4 tests pass.

### Step T1.5 — Type check + lint

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: 0 errors.

### Step T1.6 — Commit

```bash
git add packages/api/typescript/core/src/utils/schema/ExtraTypes.ts \
        packages/api/typescript/core/src/utils/schema/historical.test.ts
git commit -m "feat(core): z.historical time-window schema combinator (Task T1)"
```

---

## Task T2: A series of windowed entries paints last-write-wins via `Timeline.place`

**Files to write:**
- Create: `packages/api/typescript/src/shared/objects/Timeline.ts`
- Modify: `packages/api/typescript/src/shared/objects/index.ts` — export `Timeline`
- Test: `packages/api/typescript/src/shared/objects/Timeline.test.ts`

**Files to read:**
- `packages/api/typescript/src/shared/objects/MonetaryAmount.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object, /test
**Depends on:** (none)

### Step T2.1 — Write the failing test (the definitive AC-15 suite)

```typescript
import { describe, it, expect } from 'bun:test'
import { Timeline } from './Timeline'

type Fee = { rate: number; startDate: Date; endDate: Date | null }
const d = (n: number) => new Date(2026, 0, 1 + n) // day-n anchor
const fee = (rate: number, s: number, e: number | null): Fee => ({ rate, startDate: d(s), endDate: e === null ? null : d(e) })
const spans = (t: Timeline<Fee>) => t.entries.map(en => [en.startDate.getDate() - 1, en.endDate === null ? null : en.endDate.getDate() - 1, en.rate])

describe('Timeline.place (interval paint)', () => {
	it('(a) paints over the front of an entry → trims to the right remainder', () => {
		const t = Timeline.empty<Fee>().place(fee(1, 0, 10)).place(fee(2, 0, 5))
		expect(spans(t)).toEqual([[0, 5, 2], [5, 10, 1]])
	})

	it('(b) paint covering all entries removes them', () => {
		const t = Timeline.empty<Fee>().place(fee(2, 0, 5)).place(fee(1, 5, 10)).place(fee(3, 0, 11))
		expect(spans(t)).toEqual([[0, 11, 3]])
	})

	it('(c) paint strictly inside an entry splits it 3 ways', () => {
		const t = Timeline.empty<Fee>().place(fee(1, 0, 11)).place(fee(2, 4, 8))
		expect(spans(t)).toEqual([[0, 4, 1], [4, 8, 2], [8, 11, 1]])
	})

	it('(d) open-ended paint trims the prior open entry', () => {
		const t = Timeline.empty<Fee>().place(fee(1, 0, null)).place(fee(2, 5, null))
		expect(spans(t)).toEqual([[0, 5, 1], [5, null, 2]])
	})

	it('(e) non-overlapping paint leaves a gap (no entry at uncovered instants)', () => {
		const t = Timeline.empty<Fee>().place(fee(1, 0, 3)).place(fee(2, 6, 9))
		expect(t.activeAt(d(4))).toBeUndefined()
		expect(t.activeAt(d(7))?.rate).toBe(2)
	})

	it('(f) exact-boundary adjacency produces no zero-length entries', () => {
		const t = Timeline.empty<Fee>().place(fee(1, 0, 10)).place(fee(2, 0, 10))
		expect(spans(t)).toEqual([[0, 10, 2]])
	})

	it('(g) place is immutable — the source timeline is unchanged', () => {
		const base = Timeline.empty<Fee>().place(fee(1, 0, 10))
		const next = base.place(fee(2, 4, 8))
		expect(spans(base)).toEqual([[0, 10, 1]])
		expect(next.entries.length).toBe(3)
	})

	it('current() returns the unique open-ended entry; activeAt finds by half-open window', () => {
		const t = Timeline.empty<Fee>().place(fee(1, 0, null))
		expect(t.current()?.rate).toBe(1)
		expect(t.activeAt(d(0))?.rate).toBe(1)
	})
})
```

### Step T2.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/shared/objects/Timeline.test.ts`
Expected: FAIL with `Cannot find module './Timeline'`.

### Step T2.3 — Implement Timeline

Create `packages/api/typescript/src/shared/objects/Timeline.ts`:

```typescript
import { BaseError, type BaseDomainErrors } from '@template/core-typescript'

/** Anything carrying a half-open `[startDate, endDate)` window. `endDate` null = +∞. */
export interface TimeWindowed {
	startDate: Date
	endDate: Date | null
}

/**
 * Immutable last-write-wins interval series. `place(entry)` overwrites exactly
 * `[entry.startDate, entry.endDate)` and trims/splits/removes overlapping
 * entries so the series stays sorted and non-overlapping. Entries are plain
 * windowed objects (the `z.historical`-inferred shapes), cloned via spread on
 * trim/split. Scope a Timeline per logical key (e.g. one per gateway
 * platform×method) — placing into one Timeline never affects another.
 */
export class Timeline<T extends TimeWindowed> {
	constructor(public readonly entries: readonly T[]) {
		const sorted = [...entries].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
		for (let i = 1; i < sorted.length; i++) {
			const prev = sorted[i - 1]!
			const cur = sorted[i]!
			if (prev.endDate === null || prev.endDate > cur.startDate) {
				throw new BaseError<BaseDomainErrors>('INVALID_DATE_RANGE' as BaseDomainErrors)
			}
		}
		this.entries = sorted
	}

	static empty<T extends TimeWindowed>(): Timeline<T> {
		return new Timeline<T>([])
	}

	place(entry: T): Timeline<T> {
		const s = entry.startDate
		const e = entry.endDate
		const next: T[] = []
		for (const ex of this.entries) {
			const a = ex.startDate
			const b = ex.endDate
			const noOverlap = (b !== null && b <= s) || (e !== null && a >= e)
			if (noOverlap) {
				next.push(ex)
				continue
			}
			if (a < s) next.push({ ...ex, startDate: a, endDate: s })
			if (e !== null && (b === null || e < b)) next.push({ ...ex, startDate: e, endDate: b })
		}
		next.push(entry)
		return new Timeline<T>(next)
	}

	activeAt(date: Date): T | undefined {
		return this.entries.find(en => en.startDate <= date && (en.endDate === null || date < en.endDate))
	}

	current(): T | undefined {
		return this.entries.find(en => en.endDate === null)
	}
}
```

### Step T2.4 — Export from barrel

Modify `packages/api/typescript/src/shared/objects/index.ts`:

```diff
 export { MonetaryAmount, MonetaryAmountSchema, SignedMonetaryAmountSchema } from './MonetaryAmount'
 export { Phone, PhoneBuilder, PhonePlainSchema, PhonePartsSchema } from './Phone'
 export type { PhoneProps } from './Phone'
+export { Timeline, type TimeWindowed } from './Timeline'
```

### Step T2.5 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test src/shared/objects/Timeline.test.ts`
Expected: PASS — 8 tests pass.

### Step T2.6 — Type check + lint, then commit

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: 0 errors.

```bash
git add packages/api/typescript/src/shared/objects/Timeline.ts \
        packages/api/typescript/src/shared/objects/Timeline.test.ts \
        packages/api/typescript/src/shared/objects/index.ts
git commit -m "feat(shared): Timeline interval-paint value object (Task T2)"
```

---

## Task T3: Contract Lock #1 — rename ShippingCostType → ShippingCostMode

**Files to write:**
- Rename: `packages/contracts/wire/enums/shipping-cost-type.tsp` → `packages/contracts/wire/enums/shipping-cost-mode.tsp` (new enum name + values)
- Modify: `packages/contracts/wire/main.tsp` — import path
- Regen: `packages/contracts/generated/typescript/src/wire/enums/**`, `packages/contracts/generated/go/wire/enums.go`

**Files to read:**
- `packages/contracts/wire/enums/shipping-cost-type.tsp`
- `packages/contracts/wire/main.tsp`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /sdk
**Depends on:** (none)

### Step T3.1 — Replace the enum file

Delete `packages/contracts/wire/enums/shipping-cost-type.tsp` and create `packages/contracts/wire/enums/shipping-cost-mode.tsp`:

```typespec
namespace TemplateContracts;

@doc("Strategy a Store uses to attribute shipping cost. Discriminator for the ShippingFee value union on the FeesConfiguration aggregate. NONE = no shipping cost; PAID_BY_CUSTOMER_AT_CHECKOUT reads order.shippingTotal (informational); AVERAGE_PER_SALE = flat amount per order; BY_PRODUCT_QUANTITY = amount × total item quantity.")
enum ShippingCostMode {
  NONE: "NONE",
  AVERAGE_PER_SALE: "AVERAGE_PER_SALE",
  PAID_BY_CUSTOMER_AT_CHECKOUT: "PAID_BY_CUSTOMER_AT_CHECKOUT",
  BY_PRODUCT_QUANTITY: "BY_PRODUCT_QUANTITY",
}
```

### Step T3.2 — Update the main.tsp import

Modify `packages/contracts/wire/main.tsp`:

```diff
-import "./enums/shipping-cost-type.tsp";
+import "./enums/shipping-cost-mode.tsp";
```

### Step T3.3 — Regenerate bindings

Run: `bun contracts`
Expected: regenerates `generated/typescript/src/wire/enums/shipping-cost-mode.ts` (and removes/ignores the old file), `generated/go/wire/enums.go` now declares `ShippingCostMode`. The old `shipping-cost-type.ts` generated file is removed by the emitter; if it lingers, delete it manually.

### Step T3.4 — Verify rename propagated, no stale refs

Run: `rg -n "ShippingCostType|shipping-cost-type" packages/ --glob '!**/node_modules/**'`
Expected: no matches (only `ShippingCostMode` / `shipping-cost-mode`). The `finance.ts` schema comment referencing the old name is updated in T6.

### Step T3.5 — Type-check + commit

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: 0 errors (no TS src consumed `ShippingCostType` directly).

```bash
git add packages/contracts/wire/ packages/contracts/generated/
git commit -m "chore(contracts): rename ShippingCostType -> ShippingCostMode (Task T3)"
```

---

## Phase 1 — Behavior Slices

## Task T4: Product-cost options reuse the shared time window

**Files to write:**
- Modify: `packages/api/typescript/src/catalog/objects/ProductCostOption.ts` — schema via `z.historical`, dates → coerced `Date`, endDate nullable
- Modify: `packages/api/typescript/src/catalog/entities/ProductCost.ts` — `create`/`update` map option windows; `ProductCostOptionInputSchema` keeps `z.iso.date()` at the wire boundary
- Modify: `packages/api/typescript/src/catalog/repositories/ProductCostRepository/DrizzleProductCostRepository.ts` — confirm jsonb date round-trip (coerce handles it)
- Test: `packages/api/typescript/src/catalog/entities/ProductCost.test.ts` — adjust any `startDate === endDate` fixtures (now invalid under strict `<`)

**Files to read:**
- `packages/api/typescript/src/catalog/objects/ProductCostOption.ts`
- `packages/api/typescript/src/catalog/objects/ProductCostOptionItem.ts`
- `packages/api/typescript/src/catalog/entities/ProductCost.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object, /entity, /test
**Depends on:** T1

### Step T4.1 — Adjust the failing test first

In `packages/api/typescript/src/catalog/entities/ProductCost.test.ts`, find any option fixture where `startDate === endDate` and change `endDate` to a strictly later date (strict `<` now rejects zero-length windows). Add one assertion that a same-day window throws:

```typescript
it('rejects a zero-length option window (startDate === endDate)', () => {
	expect(() =>
		ProductCost.create({
			storeId: testId('store', 'a'),
			storeIntegrationId: testId('si', 'a'),
			productId: testId('prod', 'a'),
			costType: ProductCostType.SINGLE,
			options: [
				{
					currency: CurrencyCode.BRL,
					startDate: '2026-01-01',
					endDate: '2026-01-01',
					shipping: { amountCents: 0, currency: CurrencyCode.BRL },
					items: [{ variantIds: [testId('variant', 'a')], quantity: 1, quantityModifier: QuantityModifier.EXACTLY, unitCost: { amountCents: 100, currency: CurrencyCode.BRL }, shipping: { amountCents: 0, currency: CurrencyCode.BRL } }],
				},
			],
		}),
	).toThrow(BaseError)
})
```

### Step T4.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/catalog/entities/ProductCost.test.ts`
Expected: FAIL — same-day window currently passes (old `<=`).

### Step T4.3 — Refactor ProductCostOption onto z.historical

Modify `packages/api/typescript/src/catalog/objects/ProductCostOption.ts`:

```diff
-export const ProductCostOptionSchema = z
-	.object({
-		id: z.instance(Id),
-		currency: z.enum(CurrencyCode),
-		country: z.string().length(2).optional(),
-		startDate: z.iso.date(),
-		endDate: z.iso.date().optional(),
-		shipping: z.instance(MonetaryAmount),
-		items: z.array(z.instance(ProductCostOptionItem)).min(1),
-	})
-	.refine(d => d.endDate === undefined || d.startDate <= d.endDate, {
-		error: 'INVALID_DATE_RANGE' as CatalogDomainErrors,
-	})
+export const ProductCostOptionSchema = z.historical({
+	id: z.instance(Id),
+	currency: z.enum(CurrencyCode),
+	country: z.string().length(2).optional(),
+	shipping: z.instance(MonetaryAmount),
+	items: z.array(z.instance(ProductCostOptionItem)).min(1),
+})
```

The `startDate`/`endDate` fields and the range refine now come from `z.historical` (`endDate` is `Date | null`, no longer optional/undefined; range check is strict `<`). Drop the now-unused `CatalogDomainErrors` import if nothing else uses it.

### Step T4.4 — Map option windows in ProductCost.create/update

In `packages/api/typescript/src/catalog/entities/ProductCost.ts`, the option-mapping blocks in `create` and `update` build plain option objects. `ProductCostOptionInputSchema` keeps `startDate: z.iso.date()` / `endDate: z.iso.date().optional()` (HTTP wire shape). When mapping to the option object, normalize `endDate` undefined → null so `z.coerce.date().nullable()` accepts it:

```diff
 		const options = data.options.map(opt => ({
 			id: crypto.randomUUID(),
 			currency: opt.currency,
 			country: opt.country,
 			startDate: opt.startDate,
-			endDate: opt.endDate,
+			endDate: opt.endDate ?? null,
 			shipping: opt.shipping,
```

Apply the same one-line change in the `update` method's option-mapping block. `z.coerce.date()` converts the ISO strings to `Date`; the `ProductCostOptionSchema.safeParse(opt)` guard already present validates the new window.

### Step T4.5 — Confirm repository date round-trip

Read `packages/api/typescript/src/catalog/repositories/ProductCostRepository/DrizzleProductCostRepository.ts`. The `options` jsonb persists `Date` → ISO string on write and rehydrates ISO string → `Date` via `z.coerce.date()` in the entity schema on read. If `toDomain` parses options through `ProductCostSchema`, no change is needed. If it hand-builds options bypassing the schema, ensure the stored jsonb is fed through `ProductCostSchema.shape.options.parse(...)`. Add a one-line comment noting coerce handles the round-trip; otherwise no code change.

### Step T4.6 — Run tests, type check, lint

Run: `cd packages/api/typescript && bun test src/catalog/ && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: catalog tests PASS (including the new zero-length rejection); 0 type/lint errors.

### Step T4.7 — Commit

```bash
git add packages/api/typescript/src/catalog/
git commit -m "refactor(catalog): ProductCostOption uses z.historical window (Task T4)"
```

---

## Task T5: Typed finance fee/tax schemas

**Files to write:**
- Create: `packages/api/typescript/src/finance/objects/GatewayFee.ts`
- Create: `packages/api/typescript/src/finance/objects/CheckoutFee.ts`
- Create: `packages/api/typescript/src/finance/objects/ShippingFee.ts`
- Create: `packages/api/typescript/src/finance/objects/RevenueTax.ts`
- Create: `packages/api/typescript/src/finance/objects/MarketingTax.ts`
- Create: `packages/api/typescript/src/finance/objects/index.ts`
- Test: `packages/api/typescript/src/finance/objects/ShippingFee.test.ts` (discriminated-union variant validation)

**Files to read:**
- `packages/api/typescript/src/shared/objects/MonetaryAmount.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema, /test
**Depends on:** T1, T3

> **Schema modules, not class VOs.** These five are `z.historical(...)` schemas + their inferred types — not `BaseValueObject` classes. Reasons: (1) `ShippingFee` is a discriminated union + window, which `BaseValueObject<ZodObject>` cannot wrap; (2) the `FeesConfiguration`/`TaxConfiguration` entities store the **plain `z.infer` shapes** via `z.array(XSchema)` (not `z.instance(...)`) so `Timeline.place` can spread-clone entries when it trims/splits them. No class behavior is needed, so do NOT `bun cli value-object` these — hand-write the schema modules below. Use `MonetaryAmountSchema` (plain object), never `z.instance(MonetaryAmount)`, so stored entries stay plain.

### Step T5.1 — Write the failing ShippingFee union test

Create `packages/api/typescript/src/finance/objects/ShippingFee.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { ShippingFeeSchema } from './ShippingFee'

describe('ShippingFeeSchema', () => {
	it('accepts NONE with no value', () => {
		expect(ShippingFeeSchema.safeParse({ mode: 'NONE', startDate: new Date('2026-01-01') }).success).toBe(true)
	})
	it('requires value for BY_PRODUCT_QUANTITY', () => {
		const ok = ShippingFeeSchema.safeParse({ mode: 'BY_PRODUCT_QUANTITY', value: { amountCents: 500, currency: 'BRL' }, startDate: new Date('2026-01-01') })
		expect(ok.success).toBe(true)
		const bad = ShippingFeeSchema.safeParse({ mode: 'BY_PRODUCT_QUANTITY', startDate: new Date('2026-01-01') })
		expect(bad.success).toBe(false)
	})
	it('PAID_BY_CUSTOMER_AT_CHECKOUT carries no value field', () => {
		expect(ShippingFeeSchema.safeParse({ mode: 'PAID_BY_CUSTOMER_AT_CHECKOUT', startDate: new Date('2026-01-01') }).success).toBe(true)
	})
})
```

### Step T5.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/finance/objects/ShippingFee.test.ts`
Expected: FAIL with `Cannot find module './ShippingFee'`.

### Step T5.3 — Write the five schema modules

`packages/api/typescript/src/finance/objects/GatewayFee.ts`:

```typescript
import { z } from '@template/core-typescript'
import type Z from 'zod'
import { PaymentGateway, PaymentMethod } from '@template/contracts-typescript/wire/enums'
import { MonetaryAmountSchema } from '../../shared/objects'

// Keys structural, only the value is historical: the (platform, method)
// identity stays outside the window; the changing {variable, fixed} is the
// leaf timeline value.
export const GatewayFeeRateSchema = z.historical({
	/** Variable fee as a 0..1 fraction of transaction amount. */
	variable: z.number().min(0).max(1),
	/** Flat per-transaction fee (currency + value). */
	fixed: MonetaryAmountSchema,
})
export type GatewayFeeRate = Z.infer<typeof GatewayFeeRateSchema>

export const GatewayFeeSchema = z.object({
	platform: z.enum(PaymentGateway),
	/** Per payment method: a Timeline (array) of windowed {variable, fixed} values. */
	methods: z.partialRecord(z.enum(PaymentMethod), z.array(GatewayFeeRateSchema)),
})
export type GatewayFee = Z.infer<typeof GatewayFeeSchema>
```

`packages/api/typescript/src/finance/objects/CheckoutFee.ts`:

```typescript
import { z } from '@template/core-typescript'
import type Z from 'zod'
import { CheckoutPlatform } from '@template/contracts-typescript/wire/enums'

export const CheckoutFeeSchema = z.historical({
	platform: z.enum(CheckoutPlatform),
	/** Checkout fee as a 0..1 fraction. */
	rate: z.number().min(0).max(1),
})

export type CheckoutFee = Z.infer<typeof CheckoutFeeSchema>
```

`packages/api/typescript/src/finance/objects/ShippingFee.ts`:

```typescript
import { z } from '@template/core-typescript'
import type Z from 'zod'
import { ShippingCostMode } from '@template/contracts-typescript/wire/enums'
import { MonetaryAmountSchema } from '../../shared/objects'

export const ShippingFeeSchema = z.historical(
	z.discriminatedUnion('mode', [
		z.object({ mode: z.literal(ShippingCostMode.NONE) }),
		z.object({ mode: z.literal(ShippingCostMode.PAID_BY_CUSTOMER_AT_CHECKOUT) }),
		z.object({ mode: z.literal(ShippingCostMode.AVERAGE_PER_SALE), value: MonetaryAmountSchema }),
		z.object({ mode: z.literal(ShippingCostMode.BY_PRODUCT_QUANTITY), value: MonetaryAmountSchema }),
	]),
)

export type ShippingFee = Z.infer<typeof ShippingFeeSchema>
```

`packages/api/typescript/src/finance/objects/RevenueTax.ts`:

```typescript
import { z } from '@template/core-typescript'
import type Z from 'zod'
import { TaxType, TaxDeductionType } from '@template/contracts-typescript/wire/enums'

export const RevenueTaxSchema = z.historical({
	type: z.enum(TaxType),
	deductionType: z.enum(TaxDeductionType),
	/** Effective rate as a 0..1 fraction. */
	rate: z.number().min(0).max(1),
	/** Profit-margin safety multiplier (1.0 = neutral). */
	multiplier: z.number().min(0).default(1),
})

export type RevenueTax = Z.infer<typeof RevenueTaxSchema>
```

`packages/api/typescript/src/finance/objects/MarketingTax.ts`:

```typescript
import { z } from '@template/core-typescript'
import type Z from 'zod'
import { MarketingPlatform } from '@template/contracts-typescript/wire/enums'

// Keyed by platform; only {rate} is historical (leaf timeline).
export const MarketingTaxRateSchema = z.historical({
	/** Marketing tax rate as a 0..1 fraction. */
	rate: z.number().min(0).max(1),
})
export type MarketingTaxRate = Z.infer<typeof MarketingTaxRateSchema>

export const MarketingTaxSchema = z.object({
	platform: z.enum(MarketingPlatform),
	/** A Timeline (array) of windowed {rate} values for this platform. */
	rates: z.array(MarketingTaxRateSchema),
})
export type MarketingTax = Z.infer<typeof MarketingTaxSchema>
```

### Step T5.4 — Write the objects barrel

Create `packages/api/typescript/src/finance/objects/index.ts`:

```typescript
export { GatewayFeeRateSchema, type GatewayFeeRate, GatewayFeeSchema, type GatewayFee } from './GatewayFee'
export { CheckoutFeeSchema, type CheckoutFee } from './CheckoutFee'
export { ShippingFeeSchema, type ShippingFee } from './ShippingFee'
export { RevenueTaxSchema, type RevenueTax } from './RevenueTax'
export { MarketingTaxRateSchema, type MarketingTaxRate, MarketingTaxSchema, type MarketingTax } from './MarketingTax'
```

### Step T5.5 — Run tests, type check, lint, commit

Run: `cd packages/api/typescript && bun test src/finance/objects/ && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: ShippingFee tests PASS; 0 errors.

```bash
git add packages/api/typescript/src/finance/objects/
git commit -m "feat(finance): typed fee/tax z.historical schemas (Task T5)"
```

---

## Task T6: FeesConfiguration stores typed per-key fee timelines

**Files to write:**
- Modify: `packages/api/typescript/src/finance/entities/FeesConfiguration.ts` — typed timelines, drop row-level dates/supersede, add `placeGatewayFee`/`placeCheckoutFee`/`placeShippingFee`
- Modify: `packages/contracts/db/schema/finance.ts` — `fees_configuration`: drop `start_date`/`end_date`, rename `checkout_fees`→`checkout_fee`, unique index on `store_id`
- Modify: `packages/api/typescript/src/finance/repositories/FeesConfigurationRepository/FeesConfigurationRepository.ts` — `findByStoreId`
- Modify: `packages/api/typescript/src/finance/repositories/FeesConfigurationRepository/DrizzleFeesConfigurationRepository.ts` — single-row upsert, new column names
- Modify: `packages/api/typescript/src/finance/repositories/FeesConfigurationRepository/MockFeesConfigurationRepository.ts` — `findByStoreId`
- Modify: `packages/api/typescript/src/finance/usecases/GetFeesConfigurationSettings.ts` — `findActiveByStoreId`→`findByStoreId`; read each timeline's `current()` into the existing output DTO (keep output shape unchanged)
- Migration: `packages/contracts/db/migrations/0047_*.sql`
- Test: `packages/api/typescript/src/finance/entities/FeesConfiguration.test.ts` (rewrite for timelines)
- Test: `packages/api/typescript/src/finance/repositories/FeesConfigurationRepository/DrizzleFeesConfigurationRepository.test.ts` (rewrite)

**Files to read:**
- `packages/api/typescript/src/finance/entities/FeesConfiguration.ts`
- `packages/api/typescript/src/finance/errors/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /db-modelling, /migrate, /repository, /test
**Depends on:** T2, T5

### Step T6.1 — Rewrite the entity unit test (RED)

Replace `FeesConfiguration.test.ts` with timeline-behavior assertions:

```typescript
import { describe, it, expect } from 'bun:test'
import { CurrencyCode, PaymentGateway, PaymentMethod, CheckoutPlatform, ShippingCostMode } from '@template/contracts-typescript/wire/enums'
import { FeesConfiguration } from './FeesConfiguration'

const gw = (variable: number, s: Date, e: Date | null, platform = PaymentGateway.STRIPE, method = PaymentMethod.CREDIT_CARD) => ({
	platform, paymentMethod: method, variable, fixed: { amountCents: 30, currency: CurrencyCode.USD }, startDate: s, endDate: e,
})

describe('FeesConfiguration', () => {
	it('places a gateway fee onto its (platform,method) timeline', () => {
		const fc = FeesConfiguration.create({ storeId: 'store-1' })
		fc.placeGatewayFee(gw(0.029, new Date('2026-01-01'), null))
		expect(fc.gatewayFees).toHaveLength(1)
	})

	it('superseding one gateway key never cuts another key', () => {
		const fc = FeesConfiguration.create({ storeId: 'store-1' })
		fc.placeGatewayFee(gw(0.029, new Date('2026-01-01'), null))
		fc.placeGatewayFee(gw(0.015, new Date('2026-01-01'), null, PaymentGateway.PAYPAL, PaymentMethod.PIX))
		// paint a new STRIPE/CREDIT_CARD fee from 2026-06-01 → trims that key only
		fc.placeGatewayFee(gw(0.031, new Date('2026-06-01'), null))
		const stripe = fc.gatewayFees.filter(f => f.platform === PaymentGateway.STRIPE && f.paymentMethod === PaymentMethod.CREDIT_CARD)
		const paypal = fc.gatewayFees.filter(f => f.platform === PaymentGateway.PAYPAL)
		expect(stripe).toHaveLength(2)            // [.., 2026-06-01) + [2026-06-01, ∞)
		expect(paypal).toHaveLength(1)            // untouched
	})

	it('checkout and shipping are single timelines', () => {
		const fc = FeesConfiguration.create({ storeId: 'store-1' })
		fc.placeCheckoutFee({ platform: CheckoutPlatform.YAMPI, rate: 0.02, startDate: new Date('2026-01-01'), endDate: null })
		fc.placeShippingFee({ mode: ShippingCostMode.AVERAGE_PER_SALE, value: { amountCents: 1500, currency: CurrencyCode.BRL }, startDate: new Date('2026-01-01'), endDate: null })
		expect(fc.checkoutFee).toHaveLength(1)
		expect(fc.shippingFee).toHaveLength(1)
	})
})
```

### Step T6.2 — Run test, verify it fails

Run: `cd packages/api/typescript && bun test src/finance/entities/FeesConfiguration.test.ts`
Expected: FAIL — `placeGatewayFee` undefined / schema rejects typed fees.

### Step T6.3 — Rewrite the FeesConfiguration entity

Replace the body of `packages/api/typescript/src/finance/entities/FeesConfiguration.ts`:

```typescript
import { AggregateRoot, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { Timeline } from '../../shared/objects'
import { GatewayFeeSchema, CheckoutFeeSchema, ShippingFeeSchema } from '../objects'

type GatewayFeeEntry = Z.infer<typeof GatewayFeeSchema>
type CheckoutFeeEntry = Z.infer<typeof CheckoutFeeSchema>
type ShippingFeeEntry = Z.infer<typeof ShippingFeeSchema>

export const FeesConfigurationSchema = z.object({
	storeId: z.instance(Id),
	gatewayFees: z.array(GatewayFeeSchema).default([]),
	checkoutFee: z.array(CheckoutFeeSchema).default([]),
	shippingFee: z.array(ShippingFeeSchema).default([]),
})

export type FeesConfigurationProps = Z.infer<typeof FeesConfigurationSchema>

const gatewayKey = (f: GatewayFeeEntry) => `${f.platform}|${f.paymentMethod}`

/**
 * One row per Store. Each fee block is a time-effective series. Gateway fees
 * are a Timeline per (platform, paymentMethod) key; checkout and shipping are
 * single Timelines.
 *
 * NOTE: the place* methods intentionally depart from the push-style
 * collection-mutation convention. A Timeline is a last-write-wins interval
 * series, so mutation trims/splits/removes entries via Timeline.place rather
 * than appending an item and returning it (spec Decision 3).
 */
export class FeesConfiguration extends AggregateRoot<typeof FeesConfigurationSchema> {
	static override schema = FeesConfigurationSchema

	static create(data: { storeId: string }): FeesConfiguration {
		return new FeesConfiguration({ storeId: data.storeId, gatewayFees: [], checkoutFee: [], shippingFee: [] })
	}

	placeGatewayFee(fee: GatewayFeeEntry): void {
		const key = gatewayKey(fee)
		const sameKey = this.gatewayFees.filter(f => gatewayKey(f) === key)
		const others = this.gatewayFees.filter(f => gatewayKey(f) !== key)
		const painted = new Timeline<GatewayFeeEntry>(sameKey).place(fee)
		this.gatewayFees = [...others, ...painted.entries]
		this.validate()
	}

	placeCheckoutFee(fee: CheckoutFeeEntry): void {
		this.checkoutFee = [...new Timeline<CheckoutFeeEntry>(this.checkoutFee).place(fee).entries]
		this.validate()
	}

	placeShippingFee(fee: ShippingFeeEntry): void {
		this.shippingFee = [...new Timeline<ShippingFeeEntry>(this.shippingFee).place(fee).entries]
		this.validate()
	}
}

export interface FeesConfiguration extends FeesConfigurationProps {}
```

### Step T6.4 — Update the Drizzle schema

Modify `packages/contracts/db/schema/finance.ts`, `feesConfiguration` table:

```diff
 		gatewayFees: jsonb('gateway_fees').notNull(),
-		checkoutFees: jsonb('checkout_fees').notNull(),
-		shippingFee: jsonb('shipping_fee'),
-		startDate: timestamp('start_date', { withTimezone: true }).notNull().defaultNow(),
-		endDate: timestamp('end_date', { withTimezone: true }),
+		checkoutFee: jsonb('checkout_fee').notNull().default([]),
+		shippingFee: jsonb('shipping_fee').notNull().default([]),
 		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
 		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
 		version: integer('version').notNull().default(1),
 	},
 	t => ({
-		storeStartDateIdx: index('fees_configuration_store_start_date_idx').on(t.storeId, t.startDate),
+		storeIdx: uniqueIndex('fees_configuration_store_id_idx').on(t.storeId),
 	}),
```

Add `uniqueIndex` to the drizzle import at the top of the file, and update the table doc comment to describe the embedded-timeline shape (gateway_fees: GatewayFee[] per key; checkout_fee: CheckoutFee[]; shipping_fee: ShippingFee[] discriminated by ShippingCostMode) and drop the `ShippingCostType` reference.

### Step T6.5 — Generate + apply migration 0047

Run: `bun migrate:create`
Expected: generates `packages/contracts/db/migrations/0047_*.sql` with `ALTER TABLE finance.fees_configuration DROP COLUMN start_date, DROP COLUMN end_date, ... RENAME/ADD checkout_fee ...` plus the unique index. Review it: it is destructive (drops columns / replaces `checkout_fees`) — acceptable, no seed/prod data. If drizzle emits `checkout_fees` rename as drop+add, that's fine.

Run: `bun migrate:dev`
Expected: applies cleanly.

### Step T6.6 — Update the repository (single row per store)

Modify `FeesConfigurationRepository.ts` (abstract):

```diff
-	abstract findActiveByStoreId(storeId: string, tx?: Transaction): Promise<FeesConfiguration | undefined>
+	abstract findByStoreId(storeId: string, tx?: Transaction): Promise<FeesConfiguration | undefined>
```

Modify `DrizzleFeesConfigurationRepository.ts`: rename `findActiveByStoreId` → `findByStoreId` dropping the `isNull(endDate)` predicate (now `where(eq(feesConfiguration.storeId, storeId))`); in `save`'s `onConflictDoUpdate.set`, replace `checkoutFees`/`startDate`/`endDate` with `checkoutFee` and remove the date fields; `toDomain`/`toPersistence` map `gatewayFees`/`checkoutFee`/`shippingFee` arrays straight through (the entity schema parses + coerces). Remove the `startDate`/`endDate` mapping lines. Modify `MockFeesConfigurationRepository.ts`: rename the method and replace the `f.isActive` check with `f.storeId.value === storeId`.

Then fix the one downstream read so `tsc` stays green: modify `GetFeesConfigurationSettings.ts` — call `findByStoreId`, and where it read the old flat `active.gatewayFees`/`checkoutFees`/`shippingFee`, read `active.gatewayFees` (now typed entries), `new Timeline(active.checkoutFee).current()`, and `new Timeline(active.shippingFee).current()` to populate the existing output DTO. Keep the output schema unchanged. (`GetFeesConfigurationSettingsController` just forwards `query.execute` — no change.)

### Step T6.7 — Rewrite the repository integration test

Rewrite `DrizzleFeesConfigurationRepository.test.ts` to: create a `FeesConfiguration`, `placeGatewayFee` twice on the same key, save, `findByStoreId`, and assert the gateway timeline rehydrates with 2 entries and coerced `Date` windows (AC-9 fees). Use `TestBed.create('integration', ...)` per the test skill.

### Step T6.8 — Run tests, type check, lint, commit

Run: `cd packages/api/typescript && bun test src/finance/entities/FeesConfiguration.test.ts src/finance/repositories/FeesConfigurationRepository/ && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: PASS; 0 errors.

```bash
git add packages/api/typescript/src/finance/entities/FeesConfiguration.ts \
        packages/api/typescript/src/finance/repositories/FeesConfigurationRepository/ \
        packages/api/typescript/src/finance/usecases/GetFeesConfigurationSettings.ts \
        packages/contracts/db/schema/finance.ts packages/contracts/db/migrations/
git commit -m "feat(finance): FeesConfiguration typed per-key fee timelines + migration 0047 (Task T6)"
```

---

## Task T10: Store owner configures gateway / checkout / shipping fees over time

> Sole fee write surface — the per-tab mock writers were deleted by the `b637d550` BFF-conventions refactor. `UpdateFeesConfiguration` accepts typed gateway/checkout/shipping blocks and places each onto its timeline.

**Files to write:**
- Modify: `packages/api/typescript/src/finance/usecases/UpdateFeesConfiguration.ts` — typed input; `findByStoreId` find-or-create; `place*` each supplied block
- Modify: `packages/api/typescript/src/finance/controllers/UpdateFeesConfigurationController.ts` (path `/fees-configuration`) — typed body; keep `[AuthAccountMiddleware, RequireStoreMember]`
- Test: `packages/api/typescript/src/finance/usecases/FeesConfiguration.test.ts` — rewrite for typed placement

**Files to read:**
- `packages/api/typescript/src/finance/objects/index.ts`
- `packages/api/typescript/src/finance/controllers/UpdateTaxesController.ts` (ctx/middleware convention)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /schema, /test
**Depends on:** T6

### Step T10.1 — Write the failing test (integration TestBed)

Rewrite `FeesConfiguration.test.ts`: drive `UpdateFeesConfiguration` (resolve via `testBed`), then resolve `FeesConfigurationRepository.findByStoreId` and assert:
- a STRIPE/CREDIT_CARD gateway fee effective `2026-01-01` then another effective `2026-06-01` → that key's timeline has 2 entries (first trimmed to end `2026-06-01`); a PAYPAL/PIX fee placed between is **untouched** (AC-14 gateway per-key);
- a checkout fee placed twice → single timeline supersedes;
- a shipping fee (`AVERAGE_PER_SALE` with value) → single timeline, one entry.
Use `testId` + `TestBed.create('integration', ...)` per the test skill.

### Step T10.2 — Run, verify fail

Run: `cd packages/api/typescript && bun test src/finance/usecases/FeesConfiguration.test.ts`
Expected: FAIL — input is still `z.array(z.unknown())` + `findActiveByStoreId`/`supersede`.

### Step T10.3 — Rewrite the use case

Replace `UpdateFeesConfiguration.ts`. Typed input (fee blocks WITHOUT the window — the use case attaches `startDate: effectiveFrom, endDate: null`):

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z, type Transaction } from '@template/core-typescript'
import { PaymentGateway, PaymentMethod, CheckoutPlatform, ShippingCostMode } from '@template/contracts-typescript/wire/enums'
import { MonetaryAmountSchema } from '../../shared/objects'
import { FeesConfiguration } from '../entities/FeesConfiguration'
import { FeesConfigurationRepository } from '../repositories/FeesConfigurationRepository'
import { FeesConfigurationUpdatedEvent } from '../events'

export const GatewayFeeBodySchema = z.object({
	platform: z.enum(PaymentGateway),
	paymentMethod: z.enum(PaymentMethod),
	variable: z.number().min(0).max(1),
	fixed: MonetaryAmountSchema,
})
export const CheckoutFeeBodySchema = z.object({ platform: z.enum(CheckoutPlatform), rate: z.number().min(0).max(1) })
export const ShippingFeeBodySchema = z.discriminatedUnion('mode', [
	z.object({ mode: z.literal(ShippingCostMode.NONE) }),
	z.object({ mode: z.literal(ShippingCostMode.PAID_BY_CUSTOMER_AT_CHECKOUT) }),
	z.object({ mode: z.literal(ShippingCostMode.AVERAGE_PER_SALE), value: MonetaryAmountSchema }),
	z.object({ mode: z.literal(ShippingCostMode.BY_PRODUCT_QUANTITY), value: MonetaryAmountSchema }),
])

export const UpdateFeesConfigurationInputSchema = z.object({
	userId: z.uuid(),
	storeId: z.uuid(),
	gatewayFees: z.array(GatewayFeeBodySchema).optional(),
	checkoutFee: CheckoutFeeBodySchema.optional(),
	shippingFee: ShippingFeeBodySchema.optional(),
	effectiveFrom: z.date(),
})

export const UpdateFeesConfigurationOutputSchema = z.object({ feesConfigurationId: z.uuid(), effectiveFrom: z.date() })

@injectable()
export class UpdateFeesConfiguration extends Handler<typeof UpdateFeesConfigurationInputSchema, typeof UpdateFeesConfigurationOutputSchema> {
	readonly name = 'update_fees_configuration' as const
	readonly inputSchema = UpdateFeesConfigurationInputSchema
	readonly outputSchema = UpdateFeesConfigurationOutputSchema

	constructor(private readonly fees: FeesConfigurationRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const fc = (await this.fees.findByStoreId(input.storeId, tx)) ?? FeesConfiguration.create({ storeId: input.storeId })
			const at = { startDate: input.effectiveFrom, endDate: null as Date | null }
			for (const g of input.gatewayFees ?? []) fc.placeGatewayFee({ ...g, ...at })
			if (input.checkoutFee) fc.placeCheckoutFee({ ...input.checkoutFee, ...at })
			if (input.shippingFee) fc.placeShippingFee({ ...input.shippingFee, ...at })
			await this.fees.save(fc, tx)
			await this.domainEventRepository.save(
				new FeesConfigurationUpdatedEvent({
					entityId: fc.id.value,
					ownerId: input.storeId,
					payload: { feesConfiguration: fc.toJSON(), effectiveStartDate: input.effectiveFrom, previousFeesConfigurationId: null },
				}),
				tx,
			)
			return { feesConfigurationId: fc.id.value, effectiveFrom: input.effectiveFrom }
		})
	}
}
```

### Step T10.4 — Type the controller

Modify `UpdateFeesConfigurationController.ts` (path `/fees-configuration`, keep `middlewares = [AuthAccountMiddleware, RequireStoreMember]`). Import `GatewayFeeBodySchema`/`CheckoutFeeBodySchema`/`ShippingFeeBodySchema` from the use case; replace the `body`'s `z.unknown()` fields with `gatewayFees: z.array(GatewayFeeBodySchema).optional()`, `checkoutFee: CheckoutFeeBodySchema.optional()`, `shippingFee: ShippingFeeBodySchema.optional()`, `effectiveFrom: z.stringToDate()`. In `handle`, pass `checkoutFee` (renamed from `checkoutFees`) through to `UpdateFeesConfiguration`.

### Step T10.5 — Run, type check, lint, commit

Run: `cd packages/api/typescript && bun test src/finance/usecases/FeesConfiguration.test.ts && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: PASS; 0 errors.

```bash
git add packages/api/typescript/src/finance/usecases/UpdateFeesConfiguration.ts \
        packages/api/typescript/src/finance/usecases/FeesConfiguration.test.ts \
        packages/api/typescript/src/finance/controllers/UpdateFeesConfigurationController.ts
git commit -m "feat(finance): typed UpdateFeesConfiguration via Timeline.place (Task T10)"
```

---

## Task T11: TaxConfiguration holds revenue + marketing tax timelines

**Files to write:**
- Create: `packages/api/typescript/src/finance/entities/TaxConfiguration.ts` (replaces `Taxes.ts`)
- Delete: `packages/api/typescript/src/finance/entities/Taxes.ts`
- Rename: `finance/repositories/TaxesRepository/` → `finance/repositories/TaxConfigurationRepository/` (abstract + Drizzle + Mock + index + test) with `findByStoreId`
- Modify: `packages/api/typescript/src/finance/registry.ts` — repo token rename
- Modify: `packages/contracts/db/schema/finance.ts` — reshape `taxes` → `tax_configuration` (revenue_tax + marketing_tax jsonb; drop type/rate/multiplier/map + dates)
- Modify: `packages/api/typescript/src/finance/events/TaxesUpdatedEvent.ts` — payload → `TaxConfigurationSchema`
- Modify: `packages/api/typescript/src/finance/usecases/GetTaxesSettings.ts` — `TaxesRepository`→`TaxConfigurationRepository`, `findActiveByStoreId`→`findByStoreId`, map `revenueTax`/`marketingTax` current entries into the existing output DTO
- Migration: `packages/contracts/db/migrations/0048_*.sql`
- Test: `packages/api/typescript/src/finance/entities/TaxConfiguration.test.ts` (rename + rewrite `Taxes.test.ts`)

**Files to read:**
- `packages/api/typescript/src/finance/entities/Taxes.ts`
- `packages/api/typescript/src/finance/repositories/TaxesRepository/DrizzleTaxesRepository.ts`
- `packages/api/typescript/src/finance/events/TaxesUpdatedEvent.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /db-modelling, /migrate, /repository, /event, /test
**Depends on:** T2, T5, T6

> Serialized after T6 (not parallel): both reshape `packages/contracts/db/schema/finance.ts` and generate a migration — running them concurrently would race the schema file + `bun migrate:create`. T6 ships migration 0047 (fees), then T11 ships 0048 (taxes).

### Step T11.1 — Failing entity test

Create `TaxConfiguration.test.ts`: `placeRevenueTax` twice (supersede single timeline); `placeMarketingTax` for META then GOOGLE_ADS then a new META rate — assert META timeline has 2 entries, GOOGLE_ADS 1, revenueTax untouched (AC-8, per-platform isolation).

### Step T11.2 — Run, verify fail

Run: `cd packages/api/typescript && bun test src/finance/entities/TaxConfiguration.test.ts`
Expected: FAIL — module missing.

### Step T11.3 — Implement TaxConfiguration

Create `packages/api/typescript/src/finance/entities/TaxConfiguration.ts` mirroring T6's pattern:

```typescript
import { AggregateRoot, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { Timeline } from '../../shared/objects'
import { RevenueTaxSchema, MarketingTaxSchema } from '../objects'

type RevenueTaxEntry = Z.infer<typeof RevenueTaxSchema>
type MarketingTaxEntry = Z.infer<typeof MarketingTaxSchema>

export const TaxConfigurationSchema = z.object({
	storeId: z.instance(Id),
	revenueTax: z.array(RevenueTaxSchema).default([]),
	marketingTax: z.array(MarketingTaxSchema).default([]),
})

export type TaxConfigurationProps = Z.infer<typeof TaxConfigurationSchema>

/**
 * One row per Store: a single `revenueTax` timeline + a per-MarketingPlatform
 * `marketingTax` timeline. The place* methods intentionally depart from the
 * push-style collection-mutation convention — a Timeline is a last-write-wins
 * interval series (Timeline.place trims/splits/removes), not an append (spec
 * Decision 3).
 */
export class TaxConfiguration extends AggregateRoot<typeof TaxConfigurationSchema> {
	static override schema = TaxConfigurationSchema

	static create(data: { storeId: string }): TaxConfiguration {
		return new TaxConfiguration({ storeId: data.storeId, revenueTax: [], marketingTax: [] })
	}

	placeRevenueTax(entry: RevenueTaxEntry): void {
		this.revenueTax = [...new Timeline<RevenueTaxEntry>(this.revenueTax).place(entry).entries]
		this.validate()
	}

	placeMarketingTax(entry: MarketingTaxEntry): void {
		const same = this.marketingTax.filter(m => m.platform === entry.platform)
		const others = this.marketingTax.filter(m => m.platform !== entry.platform)
		const painted = new Timeline<MarketingTaxEntry>(same).place(entry)
		this.marketingTax = [...others, ...painted.entries]
		this.validate()
	}
}

export interface TaxConfiguration extends TaxConfigurationProps {}
```

Delete `Taxes.ts`.

### Step T11.4 — Reshape the Drizzle schema + migration

Modify `packages/contracts/db/schema/finance.ts`: rename the `taxes` export/table to `taxConfiguration` / `tax_configuration`; replace `type`/`deductionType`/`rate`/`revenueTaxMultiplier`/`marketingTaxRatePerPlatform`/`startDate`/`endDate` columns with `revenueTax: jsonb('revenue_tax').notNull().default([])` and `marketingTax: jsonb('marketing_tax').notNull().default([])`; keep `storeId` with a unique index. Update the `@template/contracts/db` export name if `taxes` is re-exported. Then:

Run: `bun migrate:create` → review `0048_*.sql` (drops old taxes table / columns, recreates `tax_configuration`; destructive, OK — no data). Run: `bun migrate:dev`.

> Update every `import { taxes }` / `taxes.$inferSelect` reference (the TaxConfiguration Drizzle repo) to the renamed `taxConfiguration` export.

### Step T11.5 — Rename + rewrite the repository

Rename the `TaxesRepository/` folder to `TaxConfigurationRepository/`. Update class names (`TaxConfigurationRepository`, `DrizzleTaxConfigurationRepository`, `MockTaxConfigurationRepository`), the abstract method to `findByStoreId(storeId)`, and the Drizzle `toDomain`/`toPersistence` to map `revenueTax`/`marketingTax` jsonb arrays (entity schema coerces). Rewrite the repo integration test for the new shape.

Then fix the one downstream read so `tsc` stays green: modify `GetTaxesSettings.ts` — inject `TaxConfigurationRepository`, call `findByStoreId`, and map `new Timeline(tc.revenueTax).current()` (type/deductionType/rate/multiplier) + the `tc.marketingTax` entries into the existing output DTO. Keep the output schema unchanged. (`GetTaxesSettingsController` just forwards `query.execute` — no change.)

### Step T11.6 — Update registry + event

Modify `finance/registry.ts`: replace the three `TaxesRepository`/`MockTaxesRepository`/`DrizzleTaxesRepository` import + binding lines with the `TaxConfigurationRepository` equivalents (mock/integration/real). Modify `TaxesUpdatedEvent.ts`:

```diff
-import { TaxesSchema } from '../entities/Taxes'
+import { TaxConfigurationSchema } from '../entities/TaxConfiguration'

 export const TaxesUpdatedEventSchema = z.domainEvent({
-	taxes: TaxesSchema.input(),
+	taxConfiguration: TaxConfigurationSchema.input(),
 	effectiveStartDate: z.date(),
-	previousTaxesId: z.uuid().nullable(),
+	previousTaxConfigurationId: z.uuid().nullable(),
 })
```

(Keep the event `name` string unchanged so subscribers don't break.)

### Step T11.7 — Run tests, type check, lint, commit

Run: `cd packages/api/typescript && bun test src/finance/entities/TaxConfiguration.test.ts src/finance/repositories/TaxConfigurationRepository/ && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: PASS; 0 errors.

```bash
git add packages/api/typescript/src/finance/entities/ packages/api/typescript/src/finance/repositories/ \
        packages/api/typescript/src/finance/registry.ts packages/api/typescript/src/finance/events/TaxesUpdatedEvent.ts \
        packages/api/typescript/src/finance/usecases/GetTaxesSettings.ts \
        packages/contracts/db/schema/finance.ts packages/contracts/db/migrations/
git commit -m "feat(finance): TaxConfiguration with revenueTax+marketingTax timelines + migration 0048 (Task T11)"
```

---

## Task T12: Store owner updates revenue / marketing tax over time

**Files to write:**
- Modify: `packages/api/typescript/src/finance/usecases/UpdateTaxes.ts` — typed; place into `revenueTax`/`marketingTax`
- Modify: `packages/api/typescript/src/finance/controllers/UpdateTaxesController.ts` (real, path `/taxes-settings`) — typed body matching the new `UpdateTaxes` input
- Test: `packages/api/typescript/src/finance/usecases/Taxes.test.ts` → rename `UpdateTaxes.test.ts`, rewrite

**Files to read:**
- `packages/api/typescript/src/finance/usecases/UpdateTaxes.ts`
- `packages/api/typescript/src/finance/controllers/UpdateTaxesController.ts`
- `packages/contracts/wire/events/taxes-updated.tsp`

> Scope note: the sole tax write surface is `UpdateTaxesController` (`/taxes-settings`) → `UpdateTaxes`. The mock `UpdateTaxesBff` + its controller were already deleted by the `b637d550` refactor — nothing to retire here.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /schema, /test
**Depends on:** T11

### Step T12.1 — Failing test

Create `UpdateTaxes.test.ts`: update revenue tax effective `2026-01-01`, then META marketing tax effective `2026-03-01`, then a new META rate effective `2026-06-01`; assert META timeline has 2 entries (first trimmed), revenueTax timeline has 1, and a `TaxesUpdatedEvent` is recorded (`testBed.spy.getEventsOfType('finance.taxes.updated')`). Assert the integration `effectiveAt` semantics indirectly by checking `effectiveStartDate` on the domain event equals the change instant (AC-12).

### Step T12.2 — Run, verify fail

Run: `cd packages/api/typescript && bun test src/finance/usecases/UpdateTaxes.test.ts`
Expected: FAIL — current `UpdateTaxes` uses the flat `Taxes` shape + `supersede`.

### Step T12.3 — Rewrite UpdateTaxes

Replace `UpdateTaxes.ts`. Input distinguishes a revenue update from a marketing update via an optional discriminator, or accepts both blocks:

```typescript
export const UpdateTaxesInputSchema = z.object({
	userId: z.uuid(),
	storeId: z.uuid(),
	revenueTax: z.object({ type: z.enum(TaxType), deductionType: z.enum(TaxDeductionType), rate: z.number().min(0).max(1), multiplier: z.number().min(0).default(1) }).optional(),
	marketingTax: z.object({ platform: z.enum(MarketingPlatform), rate: z.number().min(0).max(1) }).optional(),
	effectiveFrom: z.date(),
})
```

In `handle`: find-or-create `TaxConfiguration`; if `input.revenueTax` → `tc.placeRevenueTax({ ...input.revenueTax, startDate: effectiveFrom, endDate: null })`; if `input.marketingTax` → `tc.placeMarketingTax({ ...input.marketingTax, startDate: effectiveFrom, endDate: null })`; `save`; emit `TaxesUpdatedEvent` with `taxConfiguration: tc.toJSON()`, `effectiveStartDate: effectiveFrom`, `previousTaxConfigurationId: null`. Output `{ taxConfigurationId: tc.id.value, effectiveFrom }`.

### Step T12.4 — Type the real tax controller

Modify `UpdateTaxesController.ts` (path `/taxes-settings`): replace the `body` schema (currently the old `revenueTaxType`/`revenueTaxRate`/`revenueTaxMultiplier`/`marketingTaxRatePerPlatform` shape) with the new typed blocks — `revenueTax: z.object({ type: z.enum(TaxType), deductionType: z.enum(TaxDeductionType), rate: z.number().min(0).max(1), multiplier: z.number().min(0).default(1) }).optional()`, `marketingTax: z.object({ platform: z.enum(MarketingPlatform), rate: z.number().min(0).max(1) }).optional()`, `effectiveFrom: z.stringToDate()`. Keep the existing `ctx` key and the existing `middlewares = [AuthAccountMiddleware, RequireStoreMember, RequireStoreRole([Role.OWNER, Role.ADMIN])]` unchanged. In `handle`, pass `{ userId: request.ctx.user.id, storeId: request.ctx.membership.storeId, ...request.body }` to `UpdateTaxes`. The output references `UpdateTaxesOutputSchema`, which now carries `taxConfigurationId` — auto-updated.

### Step T12.5 — Run, type check, lint, commit

Run: `cd packages/api/typescript && bun test src/finance/usecases/UpdateTaxes.test.ts && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: PASS; 0 errors.

```bash
git add packages/api/typescript/src/finance/usecases/UpdateTaxes.ts \
        packages/api/typescript/src/finance/usecases/UpdateTaxes.test.ts \
        packages/api/typescript/src/finance/controllers/UpdateTaxesController.ts
git commit -m "feat(finance): real typed UpdateTaxes (revenue+marketing timelines) (Task T12)"
```

---

## Task T13: Rework analytics fee breakdown + drop GatewayFeeKind

> `GatewayFeeKind`'s only remaining consumer is analytics `FeesBreakdownSchema` (`GetTaxFeeConfig` was deleted by the `b637d550` refactor). Rework that one schema, then drop the enum.

**Files to write:**
- Modify: `packages/api/typescript/src/shared/schemas/ui/index.ts` — `FeesBreakdownSchema.gateway` → explicit `{ fixed, variable }` metric (no `segmented(GatewayFeeKind)`)
- Delete: `packages/contracts/wire/enums/gateway-fee-kind.tsp`
- Modify: `packages/contracts/wire/main.tsp` — remove the import
- Regen: `packages/contracts/generated/**`

**Files to read:**
- `packages/api/typescript/src/shared/schemas/ui/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema, /enum, /sdk
**Depends on:** T10, T12

### Step T13.1 — Rework the analytics breakdown schema

Modify `packages/api/typescript/src/shared/schemas/ui/index.ts`: drop `GatewayFeeKind` from the enum import; replace `export const GatewayFeeSchema = segmented(GatewayFeeKind)` with an explicit shape preserving the fixed/variable reporting split:

```diff
-export const GatewayFeeSchema = segmented(GatewayFeeKind)
+export const GatewayFeeSchema = z.object({
+	fixed: MetricSchema,
+	variable: MetricSchema,
+})
```

(Confirm `MetricSchema` is already imported in this file; `FeesBreakdownSchema.gateway` keeps referencing `GatewayFeeSchema`, so no downstream change.)

### Step T13.2 — Drop the enum + regen

Delete `packages/contracts/wire/enums/gateway-fee-kind.tsp`; remove its import line from `packages/contracts/wire/main.tsp`. Run: `bun contracts`.
Expected: `generated/typescript/src/wire/enums/gateway-fee-kind.ts` and the Go `GatewayFeeKind` block disappear. Delete any lingering generated file if the emitter doesn't prune it.

### Step T13.3 — Verify no references remain (AC-6)

Run: `rg -n "GatewayFeeKind|gateway-fee-kind" packages/ --glob '!**/node_modules/**'`
Expected: no matches.

### Step T13.4 — Type-check, lint, commit

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: 0 errors.

```bash
git add packages/api/typescript/src/shared/schemas/ui/index.ts packages/contracts/
git commit -m "refactor: drop GatewayFeeKind, rework analytics fee breakdown (Task T13)"
```

---

## Phase 2 — Integration

## Task T14: Contract Lock #2 — OpenAPI + SDK regen

**Files to write:**
- Regen: `packages/api/typescript/**/openapi.json` (per `bun emit-openapi`)
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T10, T12, T13

### Step T14.1 — Regenerate OpenAPI + SDK

Run: `bun emit-openapi && bun sdk`

### Step T14.2 — Verify regen produced expected artifacts

Run: `git diff --stat packages/client/dist/ && git diff --stat **/openapi.json`
Expected: the `PUT /fees-configuration` operation now carries the typed gateway/checkout/shipping body (gateway: platform/paymentMethod/variable/fixed; checkout: platform/rate; shipping: discriminated union) and `PUT /taxes-settings` carries the typed revenue/marketing tax body; `client/dist` regenerated.

### Step T14.3 — Type-check all workspaces

Run: `bun tsc`
Expected: 0 errors across all workspaces (the stub frontend routes consume no fee/tax SDK hooks, so they stay green — AC-13).

### Step T14.4 — Commit

```bash
git add packages/client/dist/ **/openapi.json
git commit -m "chore(sdk): regenerate openapi+sdk for typed fee/tax config (Task T14)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `cd packages/api/typescript && bun test src/finance/ src/catalog/ src/shared/objects/ core/src/utils/schema/` — affected suites pass
- [ ] `rg -n "ShippingCostType|GatewayFeeKind|z\\.unknown\\(\\)" packages/api/typescript/src/finance` — no matches (clean rename + typed config)
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `packages/api/typescript/core/src/utils/schema/historical.test.ts:"adds a window / coerces / rejects"`
  - AC-2 → `core/src/utils/schema/historical.test.ts:"applies the window per-variant on a discriminated union"`
  - AC-3 → `packages/api/typescript/src/shared/objects/Timeline.test.ts` (all interval-paint cases)
  - AC-4 → `src/finance/objects/ShippingFee.test.ts` + `src/finance/entities/FeesConfiguration.test.ts`
  - AC-5 → `src/finance/entities/FeesConfiguration.test.ts:"places a gateway fee … / checkout and shipping are single timelines"`
  - AC-6 → Final-validation `rg` (no `GatewayFeeKind`) + T13.3
  - AC-7 → T3.4 `rg` (no `ShippingCostType`) + `src/finance/objects/ShippingFee.test.ts`
  - AC-8 → `src/finance/entities/TaxConfiguration.test.ts`
  - AC-9 → `src/finance/repositories/FeesConfigurationRepository/DrizzleFeesConfigurationRepository.test.ts` + `…/TaxConfigurationRepository/*.test.ts` (migrations applied via PGlite)
  - AC-10 → `src/catalog/entities/ProductCost.test.ts:"rejects a zero-length option window"`
  - AC-11 → `src/finance/usecases/FeesConfiguration.test.ts` (fees writer) + `src/finance/usecases/UpdateTaxes.test.ts` (tax writer)
  - AC-12 → `src/finance/usecases/UpdateTaxes.test.ts:"records a TaxesUpdatedEvent with effectiveStartDate"`
  - AC-13 → Final `bun tsc` + T14.3
  - AC-14 → `src/finance/usecases/FeesConfiguration.test.ts` (gateway per-key + checkout/shipping single timeline) + `src/finance/usecases/UpdateTaxes.test.ts` (marketing per-platform)
  - AC-15 → `src/shared/objects/Timeline.test.ts` + `core/src/utils/schema/historical.test.ts`

## Notes

- **No frontend work.** `settings/taxesAndFees` and `finance/costs` are stub route shells consuming no fee/tax SDK hooks; they stay green after regen (AC-13). Real screens are a separate spec.
- **Two migrations (0047 fees, 0048 taxes)** rather than the spec's single `0047` — each behavior task owns its migration so the slice is self-contained. Both are forward-recreate, no backfill (Decision 9). Patch any `shared.*` DDL to `IF NOT EXISTS` if drizzle emits it (migrate skill §Cross-Service Schemas) — unlikely here since only `finance.*` changes.
- **`z.coerce.date()`** in the `z.historical` window (refinement of spec Decision 2) is what makes jsonb-stored ISO strings rehydrate to `Date` on read for both fee timelines and `ProductCostOption`.
- **`INVALID_DATE_RANGE`** must be in the `BaseDomainErrors` union (Timeline + core `z.historical`) and the finance/catalog error unions (already present for the entities that throw it). Verify during T2/T6/T11.
- **Reads (`GetTaxesSettings`, `GetFeesConfigurationSettings`) are updated only mechanically** for the repo method/type renames (T6/T11) so `tsc` stays green; their output DTOs are unchanged. The per-tab mock reads/writers + `GetTaxFeeConfig` no longer exist (deleted by `b637d550`).
- **Write surface conventions (from `b637d550`)**: controllers use `z.stringToDate()` for dates, `ctx: { user:{id}, membership:{storeId} }`, and middlewares `[AuthAccountMiddleware, RequireStoreMember]` (`UpdateTaxesController` adds `RequireStoreRole([OWNER, ADMIN])`). Honor these in T10/T12.
- **Integration `.tsp` events unchanged** — `fees-configuration-updated.tsp` / `taxes-updated.tsp` already carry a single `effectiveAt` (Decision 11 / AC-12); only the TS *domain* event payloads change shape (T11).
- Run backend tests from `packages/api/typescript` so the `bunfig.toml` reflect-metadata preload applies; authoritative type-check is `bun x tsc -p tsconfig.build.json --noEmit`.
- **`validate-plan` may emit advisory `PR-19` findings** (T10→T6, T12→T11) and exit non-zero. Expected false-positives: `UpdateFeesConfiguration`/`UpdateTaxes` already import their repos today, but the reshaped entity/repo edges only fully materialize after T6/T11 — the declared `Depends on` are correct. No PR-18/PR-20 findings.
