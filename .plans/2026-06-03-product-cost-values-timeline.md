# Product-Cost Values Timeline — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Make a product's cost for each `(currency, country)` a clean time-series — identity structural (`country` as the `Country` enum), only `{ items }` historical as a leaf `Timeline` — so updates supersede instead of duplicate, mirroring the shipped `Fees`/`Taxes` pattern.

**Architecture:** `ProductCostOption` becomes `{ id, currency, country?, values: ProductCostOptionValue[] }` with `ProductCostOptionValue = z.historical({ items })`. `ProductCost.create/update` group input options by `(currency, country)` and paint each value onto that option's `values` `Timeline`. The `DrizzleProductCostQueryService` read port selects the value active at a date and emits the **unchanged** `ApplicableProductCost` shape, so sales stays insulated. No migration — `product_costs.options` is a jsonb column whose contents reshape (and `country` moves from an in-jsonb string to the `Country` enum, not a DB column).

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod v4

**Spec:** .specs/2026-06-03-product-cost-values-timeline-design.md
**Tasks:** 4
**Estimated minutes:** 210

---

## Task T1: Store owner configures product cost per (currency,country) over time

**Files to write:**
- Modify: `packages/api/typescript/src/catalog/objects/ProductCostOption.ts` — keys-structural shape; `values` leaf timeline; `country` enum
- Modify: `packages/api/typescript/src/catalog/entities/ProductCost.ts` — `ProductCostOptionInputSchema.country` → `Country` enum; `create`/`update` group by `(currency,country)` + paint via `Timeline`
- Create: `packages/api/typescript/tests/support/given/catalog/givenProductCost.ts`
- Modify: `packages/api/typescript/tests/support/given/index.ts` — re-export `givenProductCost`
- Test: `packages/api/typescript/src/catalog/entities/ProductCost.test.ts` — rewrite for the timeline shape

**Files to read:**
- `packages/api/typescript/src/catalog/objects/ProductCostOptionItem.ts`
- `packages/api/typescript/src/shared/objects/Timeline.ts`
- `packages/api/typescript/src/finance/entities/Fees.ts` (the keyed-container + `Timeline.place` grouping pattern to mirror)
- `packages/api/typescript/src/catalog/repositories/ProductCostRepository/ProductCostRepository.ts` (for the given helper's `save`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object, /entity, /test
**Depends on:** (none)

### Step T1.1 — Write the failing entity test

Rewrite `packages/api/typescript/src/catalog/entities/ProductCost.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { CurrencyCode, Country, ProductCostType, QuantityModifier } from '@template/contracts-typescript/wire/enums'
import { ProductCost, type ProductCostOptionInput } from './ProductCost'

const VARIANT = '11111111-1111-4111-8111-111111111111'
const items = [{ variantIds: [VARIANT], quantity: 1, quantityModifier: QuantityModifier.EQ, unitCost: { amountCents: 500, currency: CurrencyCode.USD } }]
const opt = (startDate: string, endDate?: string): ProductCostOptionInput => ({ currency: CurrencyCode.USD, country: Country.US, startDate, endDate, items })
const create = (options: ProductCostOptionInput[]) =>
	ProductCost.create({ storeId: '22222222-2222-4222-8222-222222222222', storeIntegrationId: '33333333-3333-4333-8333-333333333333', productId: '44444444-4444-4444-8444-444444444444', costType: ProductCostType.SINGLE, options })
const usOption = (pc: ProductCost) => pc.options.find(o => o.currency === CurrencyCode.USD && o.country === Country.US)

describe('ProductCost', () => {
	it('creates one option per (currency,country) with a values timeline', () => {
		const pc = create([opt('2026-05-01')])
		expect(pc.options).toHaveLength(1)
		expect(usOption(pc)!.values).toHaveLength(1)
		expect(usOption(pc)!.values[0]!.endDate).toBeNull()
	})

	it('two values for the same (currency,country) supersede into one option, not two', () => {
		const pc = create([opt('2026-05-01'), opt('2026-09-01')])
		expect(pc.options).toHaveLength(1)                 // single (USD,US) option
		const values = usOption(pc)!.values
		expect(values).toHaveLength(2)                      // [.., 2026-09-01) + [2026-09-01, ∞)
		expect(values.find(v => v.endDate === null)).toBeDefined()
	})

	it('rejects a zero-length value window (startDate === endDate)', () => {
		expect(() => create([opt('2026-05-01', '2026-05-01')])).toThrow(BaseError)
	})
})
```

### Step T1.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/catalog/entities/ProductCost.test.ts`
Expected: FAIL — `pc.options[i].values` undefined (option still flat `z.historical`).

### Step T1.3 — Restructure the ProductCostOption value object

Replace `packages/api/typescript/src/catalog/objects/ProductCostOption.ts` with:

```typescript
import { BaseValueObject, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { CurrencyCode, Country } from '@template/contracts-typescript/wire/enums'
import { ProductCostOptionItem } from './ProductCostOptionItem'

// Keys structural, only the value is historical: (currency, country) identify
// the option; the changing { items } is a leaf Timeline entry.
export const ProductCostOptionValueSchema = z.historical({
	items: z.array(z.instance(ProductCostOptionItem)).min(1),
})
export type ProductCostOptionValue = Z.infer<typeof ProductCostOptionValueSchema>

export const ProductCostOptionSchema = z.object({
	id: z.instance(Id),
	currency: z.enum(CurrencyCode),
	country: z.enum(Country).optional(),
	/** A Timeline (array) of windowed { items } values for this (currency,country). */
	values: z.array(ProductCostOptionValueSchema).min(1),
})

export type ProductCostOptionProps = Z.infer<typeof ProductCostOptionSchema>

/**
 * A `(currency, country)`-keyed slice of a `ProductCost`. Identity is
 * structural; `values` is the time-effective series of `{ items }` (the
 * per-variant unit costs that change over time). Composite value object,
 * serialized inline in the `ProductCost` aggregate's jsonb column.
 */
export class ProductCostOption extends BaseValueObject<typeof ProductCostOptionSchema> {
	static override schema = ProductCostOptionSchema
}

export interface ProductCostOption extends ProductCostOptionProps {}
```

### Step T1.4 — Group-and-paint in ProductCost.create/update

Modify `packages/api/typescript/src/catalog/entities/ProductCost.ts`.

(a) Imports — add `Country` and `Timeline`:

```diff
-import { ProductCostType, QuantityModifier, CurrencyCode } from '@template/contracts-typescript/wire/enums'
+import { ProductCostType, QuantityModifier, CurrencyCode, Country } from '@template/contracts-typescript/wire/enums'
+import { Timeline } from '../../shared/objects'
```

(b) `ProductCostOptionInputSchema` — typed `country` (wire input keeps `z.iso.date()`):

```diff
 export const ProductCostOptionInputSchema = z.object({
 	currency: z.enum(CurrencyCode),
-	country: z.string().length(2).optional(),
+	country: z.enum(Country).optional(),
 	startDate: z.iso.date(),
 	endDate: z.iso.date().optional(),
 	items: z.array(ProductCostOptionItemInputSchema).min(1),
 })
```

(c) Replace the per-option mapping in **both** `create` and `update` with a shared module-level grouper (define it next to `hashVariantIds`). It groups inputs by `(currency, country)`, builds each `{ items }` value with `Date` windows (so `Timeline` can compare), and paints them onto that key's timeline:

```typescript
type PaintedOption = { id: string; currency: CurrencyCode; country?: Country; values: Array<{ items: ReturnType<typeof buildItems>; startDate: Date; endDate: Date | null }> }

function buildItems(items: ProductCostOptionInput['items']) {
	return items.map(item => ({
		id: crypto.randomUUID(),
		variantIds: item.variantIds,
		quantity: item.quantity,
		quantityModifier: item.quantityModifier,
		unitCost: item.unitCost,
		variantsHash: hashVariantIds(item.variantIds),
	}))
}

/** Group input options by (currency, country); paint each value onto that key's Timeline. */
function groupAndPaint(inputs: ProductCostOptionInput[]): PaintedOption[] {
	const byKey = new Map<string, PaintedOption>()
	for (const opt of inputs) {
		const key = `${opt.currency}|${opt.country ?? ''}`
		const value = { items: buildItems(opt.items), startDate: new Date(opt.startDate), endDate: opt.endDate ? new Date(opt.endDate) : null }
		const entry = byKey.get(key)
		if (entry) entry.values = [...new Timeline(entry.values).place(value).entries]
		else byKey.set(key, { id: crypto.randomUUID(), currency: opt.currency, country: opt.country, values: [value] })
	}
	return [...byKey.values()]
}
```

In `create`: `const options = groupAndPaint(data.options)`, then the existing `ProductCostOptionSchema.safeParse(opt)` validation loop (unchanged — it now validates the keyed shape, and `z.historical`'s coerced-date window accepts the `Date`s), then `new ProductCost({ ..., options, deletedAt: null })`. In `update`: `this.options = ProductCostSchema.shape.options.parse(groupAndPaint(data.options))`. Update the aggregate's doc-comment invariant line to "each option's `values` timeline is non-overlapping (Timeline-enforced); at most one option per (currency, country)".

### Step T1.5 — Add the givenProductCost helper

Create `packages/api/typescript/tests/support/given/catalog/givenProductCost.ts` (repo-direct, new shape):

```typescript
import type { TestBed } from '../../TestBed'
import { ProductCost, type ProductCostOptionInput } from '@catalog/entities/ProductCost'
import { ProductCostRepository } from '@catalog/repositories/ProductCostRepository'
import { ProductCostType, CurrencyCode, Country, QuantityModifier } from '@template/contracts-typescript/wire/enums'
import { testId } from '../../testId'

interface GivenProductCostOverrides {
	storeId?: string
	storeIntegrationId?: string
	productId?: string | null
	costType?: ProductCostType
	options?: ProductCostOptionInput[]
}

export async function givenProductCost(testBed: TestBed, overrides: GivenProductCostOverrides = {}): Promise<ProductCost> {
	const repo = testBed.resolve(ProductCostRepository)
	const pc = ProductCost.create({
		storeId: overrides.storeId ?? testId('store', 'a'),
		storeIntegrationId: overrides.storeIntegrationId ?? testId('store-integration', 'a'),
		productId: overrides.productId ?? testId('product', 'a'),
		costType: overrides.costType ?? ProductCostType.SINGLE,
		options: overrides.options ?? [
			{
				currency: CurrencyCode.USD,
				country: Country.US,
				startDate: '2026-05-01',
				items: [{ variantIds: [testId('variant', 'a')], quantity: 1, quantityModifier: QuantityModifier.EQ, unitCost: { amountCents: 500, currency: CurrencyCode.USD } }],
			},
		],
	})
	await repo.save(pc)
	return pc
}
```

> Verify the exact `@catalog` path alias, `ProductCostRepository.save` signature, and `testId` import against a sibling given helper (e.g. `given/sales/givenOrderOverride.ts`); adjust imports to match. Then re-export from `tests/support/given/index.ts`: add `export { givenProductCost } from './catalog/givenProductCost'`.

### Step T1.6 — Run test, type check, lint, commit

Run: `cd packages/api/typescript && bun test src/catalog/entities/ProductCost.test.ts && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: PASS; 0 errors.

```bash
git add packages/api/typescript/src/catalog/objects/ProductCostOption.ts \
        packages/api/typescript/src/catalog/entities/ProductCost.ts \
        packages/api/typescript/src/catalog/entities/ProductCost.test.ts \
        packages/api/typescript/tests/support/given/catalog/givenProductCost.ts \
        packages/api/typescript/tests/support/given/index.ts
git commit -m "feat(catalog): ProductCostOption keyed (currency,country) values timeline (Task T1)"
```

---

## Task T2: Sales reads the product cost active at a date

**Files to write:**
- Modify: `packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.ts` — per-option active-value selection via `Timeline.activeAt`; update the internal `StoredProductCostOption` type
- Test: `packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.test.ts` — active-value across two windows

**Files to read:**
- `packages/api/typescript/src/catalog/services/ProductCostQueryService/ApplicableProductCost.ts` (output shape — unchanged)
- `packages/api/typescript/src/shared/objects/Timeline.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /test
**Depends on:** T1

### Step T2.1 — Write the failing test

Rewrite `DrizzleProductCostQueryService.test.ts` (integration TestBed; seed via `givenProductCost`): a `(USD,US)` option with two values — `[2026-05-01, 2026-09-01)` (unitCost 500) and `[2026-09-01, ∞)` (unitCost 700). Assert `findApplicable({ storeId, at: 2026-07-01 })` returns one `ApplicableProductCost` whose item `cost` is 500 and `startDate/endDate` match the May window; `at: 2026-10-01` returns 700 with the open window. Assert the output has **no `shipping`** field (shape preserved).

### Step T2.2 — Run, verify it fails

Run: `cd packages/api/typescript && bun test src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.test.ts`
Expected: FAIL — reads `option.startDate`/`option.items` (now on `values[]`, not the option).

### Step T2.3 — Select the active value per option

Modify `DrizzleProductCostQueryService.ts`:

(a) Update the internal stored-row type — the option now carries `values`:

```diff
-type StoredProductCostOption = {
-	startDate: string
-	endDate?: string | null
-	items: StoredItem[]
-	id: string
-	currency: string
-	country?: string
-}
+type StoredProductCostOptionValue = { startDate: string; endDate?: string | null; items: StoredItem[] }
+type StoredProductCostOption = { id: string; currency: string; country?: string; values: StoredProductCostOptionValue[] }
```

(b) Replace the per-option body: instead of date-filtering the option, pick the active value with `Timeline`, then build items from it. The emitted `ApplicableProductCost` fields are unchanged (`costId`, `costOptionId`, `type`, `country`, `startDate`, `endDate`, `data`, `productId`, `variants`) — `startDate`/`endDate` now come from the active value's window:

```typescript
for (const option of options) {
	const entries = option.values.map(v => ({ ...v, startDate: new Date(v.startDate), endDate: v.endDate ? new Date(v.endDate) : null }))
	const active = input.at ? new Timeline(entries).activeAt(input.at) : new Timeline(entries).current()
	if (!active) continue
	const data = active.items.map(item => ApplicableProductCostItemSchema.parse({
		cost: item.unitCost.amountCents, costOptionItemId: item.id, currency: item.unitCost.currency,
		productId: row.productId ?? undefined, quantity: item.quantity, quantityModifier: item.quantityModifier, variants: item.variantIds,
	}))
	out.push(ApplicableProductCostSchema.parse({
		costId: row.id, costOptionId: option.id, type: row.costType, country: option.country,
		startDate: active.startDate, endDate: active.endDate, data, productId: row.productId ?? undefined,
		variants: data.flatMap(d => d.variants ?? []),
	}))
}
```

(`Timeline.activeAt` is half-open `[start, end)`; `current()` returns the open entry when `at` is omitted — matching the prior "no `at` ⇒ all" behavior is intentionally narrowed to "the current value", which is what callers want. If a caller relied on getting every window when `at` is omitted, keep the old loop for that branch — verify against `ProductCostSolver`/`ProductCostApplicationHandler` call sites, which always pass `at`.)

### Step T2.4 — Run, type check, lint, commit

Run: `cd packages/api/typescript && bun test src/catalog/services/ProductCostQueryService/ && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: PASS; 0 errors. Sales `ProductCostSolver` + `ProductCostApplicationHandler` tests still green (run `bun test src/sales/services/ProductCostSolver src/sales/handlers/ProductCostApplicationHandler`).

```bash
git add packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.ts \
        packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.test.ts
git commit -m "feat(catalog): findApplicable selects active value per option (Task T2)"
```

---

## Task T3: CSV import / bulk update supersede instead of duplicate

**Files to write:**
- Modify: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/processors/ManualProductCostCsvProcessor.ts` — parse `country` to the `Country` enum (per-value build inputs unchanged otherwise)
- Modify: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/processors/ShopifyProductCostCsvProcessor.ts` — same
- Modify: `packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.ts` — flatten existing options' `values` back to per-value inputs before re-submitting to `update()` (which now groups + paints → supersede, no blind re-append)
- Modify: `packages/api/typescript/src/catalog/controllers/CreateProductCost.ts` + `UpdateProductCost.ts` — `country` enum flows via `ProductCostOptionInputSchema` (confirm they compose from it; adjust if they redeclare)
- Test: adjust `BulkImportProductCostsFromCsv` + CSV processor tests for the new flatten/supersede + `Country` enum

**Files to read:**
- `packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.ts`
- `packages/api/typescript/src/catalog/services/ProductCostCsvParser/types.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /service, /controller, /test
**Depends on:** T1

### Step T3.1 — Failing test

In `BulkImportProductCostsFromCsv`'s test: import a `(USD,US)` cost effective `2026-05-01`, then re-import `(USD,US)` effective `2026-09-01`; assert the persisted `ProductCost` has **one** `(USD,US)` option whose `values` timeline has 2 entries (first trimmed), **not** two options.

### Step T3.2 — Run, verify fail

Run: `cd packages/api/typescript && bun test src/catalog/usecases/BulkImportProductCostsFromCsv.test.ts`
Expected: FAIL — current code re-appends `existing.options.map(o => o.toJSON())`, producing duplicates / a shape mismatch.

### Step T3.3 — Flatten existing values, let update() paint

Modify `BulkImportProductCostsFromCsv.ts` — replace the existing-options re-append with a flatten of each existing option's `values` into per-value `ProductCostOptionInput`s, concatenated with the new build options, handed to `update()` (which groups by `(currency,country)` and paints — superseding):

```typescript
const existingInputs = existing.options.flatMap(o =>
	o.values.map(v => ({
		currency: o.currency,
		country: o.country,
		startDate: new Date(v.startDate).toISOString().slice(0, 10),
		endDate: v.endDate ? new Date(v.endDate).toISOString().slice(0, 10) : undefined,
		items: v.items.map(it => ({ variantIds: it.variantIds.map(String), quantity: it.quantity, quantityModifier: it.quantityModifier, unitCost: { amountCents: it.unitCost.amountCents, currency: it.unitCost.currency } })),
	})),
)
existing.update({ options: [...existingInputs, ...build.options] })
```

### Step T3.4 — Parse CSV country to the Country enum

In both processors, where a row's `country` is read into the build option, validate the CSV string against the enum with `z.enum(Country).safeParse(raw)` (the alpha-2 code IS the enum value); on failure emit a row error consistent with existing CSV error handling. Do NOT key-index `Country[raw]` (fragile if a key ever differs from its value). Confirm `CreateProductCost.ts`/`UpdateProductCost.ts` controllers pick up the `Country` enum through `ProductCostOptionInputSchema` (no change if they compose from it).

### Step T3.5 — Run, type check, lint, commit

Run: `cd packages/api/typescript && bun test src/catalog/ && bun x tsc -p tsconfig.build.json --noEmit && bun lint`
Expected: PASS; 0 errors.

```bash
git add packages/api/typescript/src/catalog/services/ProductCostCsvParser/ \
        packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.ts \
        packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.test.ts \
        packages/api/typescript/src/catalog/controllers/CreateProductCost.ts \
        packages/api/typescript/src/catalog/controllers/UpdateProductCost.ts
git commit -m "feat(catalog): CSV/bulk product-cost import supersedes via Timeline + Country enum (Task T3)"
```

---

## Task T4: Contract Lock — OpenAPI + SDK regen

**Files to write:**
- Regen: `packages/api/typescript/**/openapi.json`
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T1, T3

### Step T4.1 — Regenerate OpenAPI + SDK

```bash
bun emit-openapi && bun sdk
```

### Step T4.2 — Verify regen produced expected artifacts

```bash
git diff --stat packages/client/dist/ && git diff --stat **/openapi.json
```

Expected: the Create/Update ProductCost request bodies now type `country` as the `Country` enum and the option shape as `{ currency, country?, startDate, endDate?, items }` (no shipping); `client/dist` regenerated. (kubb is incremental — if a stale ProductCost SDK file lingers with the old shape, force-clean per CLAUDE.md.)

### Step T4.3 — Type-check all workspaces

Run: `bun tsc`
Expected: 0 errors across all workspaces.

### Step T4.4 — Commit

```bash
git add packages/client/dist/ **/openapi.json
git commit -m "chore(sdk): regenerate openapi+sdk for ProductCost values timeline (Task T4)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `cd packages/api/typescript && bun test src/catalog/ src/sales/services/ProductCostSolver src/sales/handlers/ProductCostApplicationHandler` — catalog + the sales consumers pass
- [ ] `rg -n "z\\.historical\\(\\{[^}]*country|option\\.startDate|option\\.items\\b" packages/api/typescript/src/catalog` — no option-level window/flat access remains (currency/country outside the window; items under `values`)
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `src/catalog/entities/ProductCost.test.ts:"creates one option per (currency,country) with a values timeline"`
  - AC-2 → `src/catalog/entities/ProductCost.test.ts:"two values for the same (currency,country) supersede into one option"` (+ the rg check: no shipping in catalog)
  - AC-3 → `src/catalog/entities/ProductCost.test.ts` (country enum) + T4.2 SDK diff (input body)
  - AC-4 → `src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.test.ts:"active value across two windows"`
  - AC-5 → `src/sales/services/ProductCostSolver/*.test.ts` + `src/sales/handlers/ProductCostApplicationHandler/*.test.ts` (unchanged, green)
  - AC-6 → `src/catalog/usecases/BulkImportProductCostsFromCsv.test.ts:"re-import supersedes into one option"`
  - AC-7 → N/A — no migration (jsonb column unchanged; documented in Notes)
  - AC-8 → `tests/support/given/catalog/givenProductCost.ts` used by the T1/T2 tests
  - AC-9 → Final `bun tsc` + `bun test src/catalog/`

## Notes

- **No migration.** `catalog.product_costs.options` stays a `jsonb` column; only its document shape changes (and `country` moves from an in-jsonb string to the `Country` enum value — still inside the jsonb, not a DB column). AC-7's "forward-recreate migration" is therefore **moot** and dropped — there is no DDL to emit and no seed/production data to reset. Update the table's doc-comment in `packages/contracts/db/schema/catalog.ts` to describe the new option shape (`{ id, currency, country?, values: [{ startDate, endDate?, items }] }`) — a comment-only edit, no migration.
- **Sales insulation is the load-bearing constraint.** Keep `ApplicableProductCost` byte-stable (T2). If a future change must alter it, `ProductCostSolver` + `ProductCostApplicationHandler` come into scope.
- **Dates round-trip via `z.coerce.date()`** in the `z.historical` value window — `Timeline` operates on `Date`s; jsonb stores ISO strings; reload coerces back. `create`/`update` build values with `new Date(opt.startDate)` so `Timeline.place` compares correctly.
- Run backend tests from `packages/api/typescript`; authoritative type-check is `bun x tsc -p tsconfig.build.json --noEmit`. Pre-existing `app-react` lint failures are out of scope.
