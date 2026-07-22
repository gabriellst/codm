# Product Cost Resolution — Structural Refactor + Correctness — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Move the product-cost resolution pipeline entirely into `sales`, split the monolithic `ProductCostSolver` into pure expansion/search/scoring units behind an unchanged `solve()`, extract a `ProductCostLineAllocator` with exact (largest-remainder) money math, and lock the behavior with a comprehensive layered test suite — without changing the live `OrderUpdated`-driven behavior except the two corrections (rounding, multi-currency).

**Architecture:** `catalog` keeps the `ProductCost` aggregate + the `ProductCostQueryService` read port (which now owns its Zod-typed `ApplicableProductCost` return DTO). `sales` owns the resolution pipeline: a pure `ProductCostSolver` (composed of `optionExpansion` → `search` → `scoring`) that emits single-currency `SolvedProductCost[]`, a pure `ProductCostLineAllocator` that distributes those onto order lines, and a thin `ProductCostApplicationHandler` (subscribed to `OrderUpdated` only) that orchestrates `query → solve → allocate → save`. The solver/allocator are pure units constructed with `new` (no DI). The dead `ProductCostCreated`/`Deleted` recompute branch is removed (re-wired correctly in Spec C).

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod, bun:test (PGlite integration + mock-mode flows)

**Spec:** .specs/2026-05-29-product-cost-resolution-refactor-design.md
**Tasks:** 7
**Estimated minutes:** 260

---

## Task T1: Solver emits single-currency solved costs (kills the first-key bug)

The solver's output currently keys cost/shipping by currency string (`{ USD: 1500 }`), which forces the handler to do the lossy `Object.keys(entry.cost)[0]`. Change the contract so each solved entry carries exactly one explicit `{ amountCents, currency }`. The existing 5 solver tests guard the values; their assertions move from `.cost.USD` to `.cost.amountCents` + `.cost.currency`. The handler's inline consumption is updated minimally to compile (its full extraction is T5).

**Files to write:**
- Modify: `packages/api/typescript/src/catalog/services/ProductCostSolver/types.ts` — reshape `SolvedProductCost.cost`/`.shipping` to `{ amountCents, currency }`
- Modify: `packages/api/typescript/src/catalog/services/ProductCostSolver/ProductCostSolver.ts` — emit the new shape in `solve()`
- Modify: `packages/api/typescript/src/catalog/services/ProductCostSolver/ProductCostSolver.test.ts` — update assertions to the new shape
- Modify: `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts` — read `entry.cost.amountCents`/`.currency` instead of the Record

**Files to read:**
- `packages/api/typescript/src/shared/objects/MonetaryAmount.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** (none)

### Step T1.1 — Update the 5 existing solver test assertions to the single-currency shape

Modify `packages/api/typescript/src/catalog/services/ProductCostSolver/ProductCostSolver.test.ts`. Replace the two Record-style assertions:

```diff
-		expect(result[0]!.cost.USD).toBe(1500)
+		expect(result[0]!.cost.amountCents).toBe(1500)
+		expect(result[0]!.cost.currency).toBe('USD')
```

```diff
-		expect(result[0]!.cost.USD).toBe(1200)
+		expect(result[0]!.cost.amountCents).toBe(1200)
+		expect(result[0]!.cost.currency).toBe('USD')
```

### Step T1.2 — Run the tests to verify they fail

Run: `bun test packages/api/typescript/src/catalog/services/ProductCostSolver/ProductCostSolver.test.ts`
Expected: FAIL — `cost.amountCents` is `undefined` (solver still emits `{ USD: 1500 }`).

### Step T1.3 — Reshape the `SolvedProductCost` type

Modify `packages/api/typescript/src/catalog/services/ProductCostSolver/types.ts`. Add the `CurrencyCode` import at the top (it already imports from the same module):

```diff
-import { ProductCostType, QuantityModifier } from '@template/contracts-typescript/wire/enums'
+import { ProductCostType, QuantityModifier, type CurrencyCode } from '@template/contracts-typescript/wire/enums'
```

Replace the `SolvedProductCost` interface:

```diff
 /** A single resolved cost entry — the solver's per-combo output. */
 export interface SolvedProductCost {
 	costId: string
 	costOptionId: string
 	costOptionItemId: string | null
-	cost: Record<string, number>
-	shipping: Record<string, number>
+	cost: { amountCents: number; currency: CurrencyCode }
+	shipping: { amountCents: number; currency: CurrencyCode }
 	products: string[]
 	productQuantity: Record<string, number>
 }
```

### Step T1.4 — Emit the single-currency shape in `solve()`

Modify `packages/api/typescript/src/catalog/services/ProductCostSolver/ProductCostSolver.ts`. In the `processedCombo` map inside `solve()`, replace the two Record literals:

```diff
 				return {
 					content: {
 						...pick(content, ['costId', 'costOptionId', 'costOptionItemId']),
-						cost: { [currency]: cost },
+						cost: { amountCents: cost, currency: currency as CurrencyCode },
 						productQuantity: products,
 						products: Object.keys(products),
-						shipping: { [currency]: shipping },
+						shipping: { amountCents: shipping, currency: currency as CurrencyCode },
 					},
 				}
```

Add the `CurrencyCode` type import to the file's enum import:

```diff
-import { ProductCostType, QuantityModifier } from '@template/contracts-typescript/wire/enums'
+import { ProductCostType, QuantityModifier, type CurrencyCode } from '@template/contracts-typescript/wire/enums'
```

### Step T1.5 — Update the handler's inline read of the solved cost

Modify `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts`. In `applyForOrder`, replace the currency-key extraction block:

```diff
 		for (const entry of solved) {
-			const currency = Object.keys(entry.cost)[0]
-			if (!currency) continue
-			const totalCost = entry.cost[currency] ?? 0
+			const { amountCents: totalCost, currency } = entry.cost
 			const totalUnits = Object.values(entry.productQuantity).reduce((a, b) => a + b, 0)
 			if (totalUnits <= 0) continue
 			const perUnit = Math.round(totalCost / totalUnits)
 			for (const productId of entry.products) {
-				perUnitByProduct.set(productId, { amountCents: perUnit, currency: currency as CurrencyCode })
+				perUnitByProduct.set(productId, { amountCents: perUnit, currency })
 			}
 		}
```

### Step T1.6 — Run tests + type check

Run: `bun test packages/api/typescript/src/catalog/services/ProductCostSolver/ProductCostSolver.test.ts packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.test.ts`
Expected: PASS — solver (5) + handler (4) green.

Run: `bun tsc`
Expected: 0 errors.

### Step T1.7 — Commit

```bash
git add packages/api/typescript/src/catalog/services/ProductCostSolver/ \
        packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts
git commit -m "refactor(catalog,sales): single-currency SolvedProductCost contract (Task T1)"
```

---

## Task T2: Relocate the solver to `sales` + catalog owns the Zod read DTO

Move the whole `ProductCostSolver` directory from `catalog` to `sales`. Because the solver now lives in `sales`, `catalog`'s query port can no longer import its return type from the solver — so the `ProductCostFormatted`/`ProductCostForProcessing` shapes move into the query port, renamed `ApplicableProductCost`/`ApplicableProductCostItem` and expressed as Zod schemas (per the `XQueryService` convention). The solver imports those from `catalog`. Behavior-preserving — guarded by the 5 solver + 4 handler tests.

**Files to write:**
- Move: `packages/api/typescript/src/catalog/services/ProductCostSolver/` → `packages/api/typescript/src/sales/services/ProductCostSolver/` (git mv)
- Create: `packages/api/typescript/src/catalog/services/ProductCostQueryService/ApplicableProductCost.ts` — Zod DTO (replaces the solver-owned types)
- Modify: `packages/api/typescript/src/catalog/services/ProductCostQueryService/ProductCostQueryService.ts` — return `ApplicableProductCost[]`, import from local DTO
- Modify: `packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.ts` — build `ApplicableProductCost`, import from local DTO
- Modify: `packages/api/typescript/src/catalog/services/ProductCostQueryService/MockProductCostQueryService.ts` — `nextCosts: ApplicableProductCost[]`, import from local DTO
- Modify: `packages/api/typescript/src/catalog/services/ProductCostQueryService/index.ts` — export the DTO + schemas
- Modify: `packages/api/typescript/src/sales/services/ProductCostSolver/types.ts` — drop the moved DTO types; import `ApplicableProductCost`(+Item) from catalog
- Modify: `packages/api/typescript/src/sales/services/ProductCostSolver/index.ts` — drop the DTO re-exports
- Modify: `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts` — repoint its `ProductCostFormatted` import/annotation to the catalog DTO (the moved test still references the now-deleted local type)
- Modify: `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts` — import the solver from the sales-local path
- Modify: `packages/api/typescript/src/catalog/registry.ts` — delete the stale "ProductCostSolver is NOT registered" comment

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /query
**Depends on:** T1

### Step T2.1 — Move the solver directory (preserve git history)

```bash
git mv packages/api/typescript/src/catalog/services/ProductCostSolver \
       packages/api/typescript/src/sales/services/ProductCostSolver
```

### Step T2.2 — Create the catalog-owned Zod read DTO

The DTO is a read-port return contract (not an entity/VO), so currency stays `z.enum` and ids stay `z.string()` per the id/enum layer boundary.

Create `packages/api/typescript/src/catalog/services/ProductCostQueryService/ApplicableProductCost.ts`:

```typescript
import { z } from '@template/core-typescript'
import type Z from 'zod'
import { CurrencyCode, ProductCostType, QuantityModifier } from '@template/contracts-typescript/wire/enums'

/** One per-variant × qty-tier cost line inside an option, flattened for the solver. */
export const ApplicableProductCostItemSchema = z.object({
	cost: z.number().int().optional(),
	costOptionItemId: z.string().nullable(),
	currency: z.enum(CurrencyCode),
	productId: z.string().optional(),
	quantity: z.number().int(),
	quantityModifier: z.enum(QuantityModifier),
	shipping: z.number().int().optional(),
	variants: z.array(z.string()).optional(),
})
export type ApplicableProductCostItem = Z.infer<typeof ApplicableProductCostItemSchema>

/** One effective cost rule (a single option's slice), shaped for the solver. */
export const ApplicableProductCostSchema = z.object({
	cost: z.number().int().optional(),
	costId: z.string(),
	costOptionId: z.string(),
	country: z.string().optional(),
	endDate: z.date().nullable(),
	data: z.array(ApplicableProductCostItemSchema),
	productId: z.string().optional(),
	shipping: z.number().int().optional(),
	startDate: z.date(),
	type: z.enum(ProductCostType),
	variants: z.array(z.string()).optional(),
})
export type ApplicableProductCost = Z.infer<typeof ApplicableProductCostSchema>
```

### Step T2.3 — Point the query port + impls at the local DTO

Modify `packages/api/typescript/src/catalog/services/ProductCostQueryService/ProductCostQueryService.ts`:

```diff
-import type { ProductCostFormatted } from '../ProductCostSolver'
+import type { ApplicableProductCost } from './ApplicableProductCost'
```
```diff
 export abstract class ProductCostQueryService {
-	abstract findApplicable(input: FindApplicableProductCostsInput): Promise<ProductCostFormatted[]>
+	abstract findApplicable(input: FindApplicableProductCostsInput): Promise<ApplicableProductCost[]>
 }
```

Modify `packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.ts`:

```diff
-import type { ProductCostFormatted, ProductCostForProcessing } from '../ProductCostSolver'
+import type { ApplicableProductCost, ApplicableProductCostItem } from './ApplicableProductCost'
```
Then replace the two local type annotations `ProductCostFormatted` → `ApplicableProductCost` and `ProductCostForProcessing` → `ApplicableProductCostItem` (the `out` array and the `data` map). No logic changes.

Modify `packages/api/typescript/src/catalog/services/ProductCostQueryService/MockProductCostQueryService.ts`:

```diff
-import type { ProductCostFormatted } from '../ProductCostSolver'
+import type { ApplicableProductCost } from './ApplicableProductCost'
```
```diff
-	nextCosts: ProductCostFormatted[] = []
+	nextCosts: ApplicableProductCost[] = []
-	async findApplicable(input: FindApplicableProductCostsInput): Promise<ProductCostFormatted[]> {
+	async findApplicable(input: FindApplicableProductCostsInput): Promise<ApplicableProductCost[]> {
```

### Step T2.4 — Export the DTO from the query-service barrel

Modify `packages/api/typescript/src/catalog/services/ProductCostQueryService/index.ts`, append:

```typescript
export {
	ApplicableProductCostSchema,
	ApplicableProductCostItemSchema,
	type ApplicableProductCost,
	type ApplicableProductCostItem,
} from './ApplicableProductCost'
```

### Step T2.5 — Make the solver consume the catalog DTO

Modify `packages/api/typescript/src/sales/services/ProductCostSolver/types.ts`. Delete the now-moved `ProductCostForProcessing` and `ProductCostFormatted` interfaces and import the DTO from catalog instead; re-express the solver-internal types on top of it:

```diff
-import { ProductCostType, QuantityModifier, type CurrencyCode } from '@template/contracts-typescript/wire/enums'
-
-export interface ProductCostForProcessing {
-	cost?: number
-	costOptionItemId: string | null
-	currency: string
-	productId?: string
-	quantity: number
-	quantityModifier: QuantityModifier
-	shipping?: number
-	variants?: string[]
-}
-
-export interface ProductCostFormatted {
-	cost?: number
-	costId: string
-	costOptionId: string
-	country?: string
-	endDate: Date | null
-	data: ProductCostForProcessing[]
-	productId?: string
-	shipping?: number
-	startDate: Date
-	type: ProductCostType
-	variants?: string[]
-}
-
-export type ProductCostToExpand = Omit<ProductCostFormatted, 'data'>
+import { ProductCostType, QuantityModifier, type CurrencyCode } from '@template/contracts-typescript/wire/enums'
+import type { ApplicableProductCost, ApplicableProductCostItem } from '@catalog/services/ProductCostQueryService'
+
+export type ProductCostToExpand = Omit<ApplicableProductCost, 'data'>
```

Then update the two solver-internal types that referenced the deleted names:

```diff
 export interface ProductCostSolverConstructorDTO {
-	costs: ProductCostFormatted[]
+	costs: ApplicableProductCost[]
 	debug?: boolean
 	variantProducts: Map<string, string>
 	variants: Map<string, number>
 }

-export interface ProductCostSolverOption extends ProductCostForProcessing {
+export interface ProductCostSolverOption extends ApplicableProductCostItem {
 	costId: string
 	costOptionId: string
 	requirements?: Array<{
 		productId: string
 		quantity: number
 		variants: string[]
 	}>
 	type: ProductCostType
 }
```

> `@catalog/...` is the existing path alias for `packages/api/typescript/src/catalog` (used across the codebase, e.g. the handler imported `../../../catalog/...`). Use the alias form for the cross-context import.

### Step T2.6 — Fix the solver code that referenced the moved type names

Modify `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.ts`:

```diff
 import type {
 	ProductCostBacktrackDTO,
-	ProductCostFormatted,
-	ProductCostForProcessing,
 	ProductCostSolverConstructorDTO,
 	ProductCostSolverOption,
 	ProductCostSolverResult,
 	ProductCostToExpand,
 	SolvedProductCost,
 } from './types'
+import type { ApplicableProductCost, ApplicableProductCostItem } from '@catalog/services/ProductCostQueryService'
```
```diff
-	private readonly costs: ProductCostFormatted[]
+	private readonly costs: ApplicableProductCost[]
```
And in `expandOptions`, the `itemFields` array is typed `Array<keyof ProductCostForProcessing>` → change to `Array<keyof ApplicableProductCostItem>`.

Then repoint the **moved test file** so it stops importing the deleted local type. Modify `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts`:

```diff
-import type { ProductCostFormatted } from './types'
+import type { ApplicableProductCost } from '@catalog/services/ProductCostQueryService'
```
and change the `singleCost` helper's return annotation `: ProductCostFormatted` → `: ApplicableProductCost`.

### Step T2.7 — Drop the DTO re-exports from the solver barrel

Modify `packages/api/typescript/src/sales/services/ProductCostSolver/index.ts`:

```diff
 export { ProductCostSolver } from './ProductCostSolver'
 export type {
-	ProductCostFormatted,
-	ProductCostForProcessing,
 	ProductCostSolverConstructorDTO,
 	SolvedProductCost,
 } from './types'
```

### Step T2.8 — Repoint the handler import + delete the stale catalog comment

Modify `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts`:

```diff
-import { ProductCostSolver } from '../../../catalog/services/ProductCostSolver'
+import { ProductCostSolver } from '../../services/ProductCostSolver'
```

Modify `packages/api/typescript/src/catalog/registry.ts` — delete the 3-line comment block:

```diff
-// Note: ProductCostSolver is NOT registered — it's constructed per-order with
-// the order's product/variant maps (`new ProductCostSolver({...})`), not a
-// ... (the rest of the comment)
```

### Step T2.9 — Run the moved + dependent tests + type check

Run: `bun test packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.test.ts`
Expected: PASS — solver (5) + handler (4) green at their new locations.

Run: `bun tsc`
Expected: 0 errors across all workspaces.

### Step T2.10 — Commit

```bash
git add packages/api/typescript/src/catalog packages/api/typescript/src/sales
git commit -m "refactor(catalog,sales): relocate solver to sales; catalog owns ApplicableProductCost DTO (Task T2)"
```

---

## Task T3: Lock the solver's behavior with full characterization coverage

Before splitting the solver internals (T4), pin every wired behavior so the split cannot silently change output. These tests assert the current (correct) behavior and pass immediately — they are the safety net, not new behavior. All use the single-currency shape from T1.

**Files to write:**
- Modify: `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts` — add the characterization cases

**Files to read:**
- `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T2

### Step T3.1 — Add the characterization cases

Append to the `describe('ProductCostSolver …')` block in `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts`. The existing `singleCost` helper builds a `SINGLE` cost; reuse it. Add a small `multipleCost`/kit helper inline where needed.

```typescript
	// ── Quantity modifiers ──────────────────────────────────────────────
	it('EQ tier: under-tier → no cost, exact → 1×, over → 1× + uncovered, multiple → N×', () => {
		const make = (qty: number) =>
			new ProductCostSolver({
				costs: [singleCost({ costId: 'c', costOptionId: 'o', productId: PRODUCT_A, cost: 900, quantity: 3, quantityModifier: QuantityModifier.EQ })],
				variantProducts: new Map([[VARIANT_A1, PRODUCT_A]]),
				variants: new Map([[VARIANT_A1, qty]]),
			}).solve()

		expect(make(2)).toHaveLength(0) // under the tier → nothing covers
		expect(make(3)[0]!.cost.amountCents).toBe(900) // exactly one application
		expect(make(6)[0]!.cost.amountCents).toBe(1800) // two applications
	})

	it('GT tier: equal does not apply, strictly greater applies', () => {
		const make = (qty: number) =>
			new ProductCostSolver({
				costs: [singleCost({ costId: 'c', costOptionId: 'o', productId: PRODUCT_A, cost: 700, quantity: 2, quantityModifier: QuantityModifier.GT })],
				variantProducts: new Map([[VARIANT_A1, PRODUCT_A]]),
				variants: new Map([[VARIANT_A1, qty]]),
			}).solve()
		expect(make(2)).toHaveLength(0)
		expect(make(3).some(r => r.costId === 'c')).toBe(true)
	})

	it('LT/LTE tiers enumerate the valid quantity window', () => {
		const lt = new ProductCostSolver({
			costs: [singleCost({ costId: 'lt', costOptionId: 'o', productId: PRODUCT_A, cost: 400, quantity: 3, quantityModifier: QuantityModifier.LT })],
			variantProducts: new Map([[VARIANT_A1, PRODUCT_A]]),
			variants: new Map([[VARIANT_A1, 2]]),
		}).solve()
		expect(lt.some(r => r.costId === 'lt')).toBe(true)
	})

	// ── Kits (MULTIPLE) ─────────────────────────────────────────────────
	function kit(cost: number, members: Array<{ product: string; variant: string; quantity: number }>): ApplicableProductCost {
		return {
			costId: 'kit', costOptionId: 'kit-o', type: ProductCostType.MULTIPLE,
			startDate: new Date('2026-01-01'), endDate: null, cost, shipping: 0,
			data: members.map((m, i) => ({
				cost: i === 0 ? cost : 0, costOptionItemId: `ki-${i}`, currency: 'USD',
				productId: m.product, quantity: m.quantity, quantityModifier: QuantityModifier.EQ, variants: [m.variant],
			})),
		}
	}

	it('kit limiting-ingredient: 2A+1B required, 10A+1B available → 1 kit', () => {
		const result = new ProductCostSolver({
			costs: [kit(1200, [{ product: PRODUCT_A, variant: VARIANT_A1, quantity: 2 }, { product: PRODUCT_B, variant: VARIANT_B1, quantity: 1 }])],
			variantProducts: new Map([[VARIANT_A1, PRODUCT_A], [VARIANT_B1, PRODUCT_B]]),
			variants: new Map([[VARIANT_A1, 10], [VARIANT_B1, 1]]),
		}).solve()
		expect(result[0]!.cost.amountCents).toBe(1200)
	})

	it('kit multi-application: 1A+1B required, 3A+3B available → 3 kits', () => {
		const result = new ProductCostSolver({
			costs: [kit(1000, [{ product: PRODUCT_A, variant: VARIANT_A1, quantity: 1 }, { product: PRODUCT_B, variant: VARIANT_B1, quantity: 1 }])],
			variantProducts: new Map([[VARIANT_A1, PRODUCT_A], [VARIANT_B1, PRODUCT_B]]),
			variants: new Map([[VARIANT_A1, 3], [VARIANT_B1, 3]]),
		}).solve()
		expect(result[0]!.cost.amountCents).toBe(3000)
	})

	// ── Precedence / non-interference ───────────────────────────────────
	it('variant-specific beats generic; generic only covers the remaining variant', () => {
		const result = new ProductCostSolver({
			costs: [
				singleCost({ costId: 'gen', costOptionId: 'og', productId: PRODUCT_A, cost: 900 }),
				singleCost({ costId: 'spec', costOptionId: 'os', productId: PRODUCT_A, cost: 100, variants: [VARIANT_A1] }),
			],
			variantProducts: new Map([[VARIANT_A1, PRODUCT_A], [VARIANT_A2, PRODUCT_A]]),
			variants: new Map([[VARIANT_A1, 1], [VARIANT_A2, 1]]),
		}).solve()
		const ids = result.map(r => r.costId)
		expect(ids).toContain('spec')
		// total units covered exactly once across the combo
		const totalUnits = result.reduce((n, r) => n + Object.values(r.productQuantity).reduce((a, b) => a + b, 0), 0)
		expect(totalUnits).toBe(2)
	})

	it('two independent products: each cost applies only to its own product', () => {
		const result = new ProductCostSolver({
			costs: [
				singleCost({ costId: 'ca', costOptionId: 'oa', productId: PRODUCT_A, cost: 300 }),
				singleCost({ costId: 'cb', costOptionId: 'ob', productId: PRODUCT_B, cost: 700 }),
			],
			variantProducts: new Map([[VARIANT_A1, PRODUCT_A], [VARIANT_B1, PRODUCT_B]]),
			variants: new Map([[VARIANT_A1, 1], [VARIANT_B1, 1]]),
		}).solve()
		const byProduct = new Map(result.map(r => [r.costId, r.products]))
		expect(byProduct.get('ca')).toEqual([PRODUCT_A])
		expect(byProduct.get('cb')).toEqual([PRODUCT_B])
	})

	it('partial coverage: when no combo fully covers, the best partial (≥1 unit) is returned', () => {
		const result = new ProductCostSolver({
			costs: [singleCost({ costId: 'c', costOptionId: 'o', productId: PRODUCT_A, cost: 500, quantity: 5, quantityModifier: QuantityModifier.EQ })],
			variantProducts: new Map([[VARIANT_A1, PRODUCT_A], [VARIANT_B1, PRODUCT_B]]),
			variants: new Map([[VARIANT_A1, 5], [VARIANT_B1, 1]]),
		}).solve()
		// covers the 5 A units; the lone B unit stays uncovered, combo still returned
		expect(result.some(r => r.costId === 'c')).toBe(true)
	})
```

> The `ApplicableProductCost` import was already added to this file in Step T2.6; the new `kit` helper reuses it. No new imports needed beyond the existing `ProductCostType`/`QuantityModifier` (already imported) for the cases above.

### Step T3.2 — Run the tests to verify they pass (characterization)

Run: `bun test packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts`
Expected: PASS — all cases green against the current solver (this is characterization; if any fails, it documents a real behavior the split must preserve — investigate, don't "fix" the solver).

### Step T3.3 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T3.4 — Commit

```bash
git add packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts
git commit -m "test(sales): characterize ProductCostSolver before split (Task T3)"
```

---

## Task T4: Split the solver into pure expansion/search/scoring units

With the behavior pinned (T3), decompose the monolithic class into three pure functions and a thin composing class. The public `new ProductCostSolver(dto).solve()` signature is unchanged. No shared mutable instance state across phases; no `option.quantity ||= 1` mid-search mutation; no `!` soup. The T1/T3 tests are the green bar.

**Files to write:**
- Create: `packages/api/typescript/src/sales/services/ProductCostSolver/optionExpansion.ts` — `expandOptions(dto) → ProductCostSolverOption[]`
- Create: `packages/api/typescript/src/sales/services/ProductCostSolver/search.ts` — `search(options, demand, variantProducts) → ProductCostSolverResult[]`
- Create: `packages/api/typescript/src/sales/services/ProductCostSolver/scoring.ts` — `selectBest(results) → SolvedProductCost[]`
- Modify: `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.ts` — compose the three; keep `solve()`

**Files to read:**
- `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.ts`
- `packages/api/typescript/src/sales/services/ProductCostSolver/types.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service
**Depends on:** T3

### Step T4.1 — Confirm the green bar before refactor

Run: `bun test packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts`
Expected: PASS (baseline before restructuring).

### Step T4.2 — Extract `optionExpansion.ts`

Create `packages/api/typescript/src/sales/services/ProductCostSolver/optionExpansion.ts`. Move the `expandOptions` + `expandItem` logic verbatim into a pure function that takes the constructor inputs and returns the option list (no `this`). The es-toolkit shims (`pick`) move here or into a shared `./util.ts` — keep them co-located:

```typescript
import { ProductCostType, QuantityModifier } from '@template/contracts-typescript/wire/enums'
import type { ApplicableProductCost, ApplicableProductCostItem } from '@catalog/services/ProductCostQueryService'
import type { ProductCostSolverOption, ProductCostToExpand } from './types'
import { pick } from './util'

interface ExpandInput {
	costs: ApplicableProductCost[]
	orderProducts: Record<string, number>
	orderVariants: Map<string, number>
	variantProducts: Map<string, string>
}

/** Pure: flatten cost rules into discrete solver options (one per qty tier). */
export function expandOptions({ costs, orderProducts, orderVariants, variantProducts }: ExpandInput): ProductCostSolverOption[] {
	const options: ProductCostSolverOption[] = []
	// … move the body of the current `expandOptions` here, pushing to `options`
	// instead of `this.options`, and reading the params instead of `this.*`.
	// `expandItem` becomes a local helper that pushes into `options`.
	return options
}
```

> Move the exact algorithm from the current `expandOptions`/`expandItem`. Replace `this.costs`→`costs`, `this.orderProducts`→`orderProducts`, `this.orderVariants`→`orderVariants`, `this.variantProductsMap`→`variantProducts`, `this.options.push`→`options.push`. Do not change any branch.

Create `packages/api/typescript/src/sales/services/ProductCostSolver/util.ts` with the three shims (`cloneDeep`, `sum`, `rangeInclusive`) + `pick`, exported, so `search.ts`/`scoring.ts` share them.

### Step T4.3 — Extract `search.ts`

Create `packages/api/typescript/src/sales/services/ProductCostSolver/search.ts`. Move `backtrack` + `getMaxTimes` + `allocate` into pure functions. The accumulator (`result`) is a local array threaded through, not `this.result`:

```typescript
import { ProductCostType } from '@template/contracts-typescript/wire/enums'
import type { ProductCostSolverOption, ProductCostSolverResult } from './types'
import { cloneDeep, rangeInclusive, sum } from './util'

interface SearchInput {
	options: ProductCostSolverOption[]
	orderProducts: Record<string, number>
	variantProducts: Map<string, string>
}

/** Pure: enumerate candidate cost combos covering the order's product demand. */
export function search({ options, orderProducts, variantProducts }: SearchInput): ProductCostSolverResult[] {
	const results: ProductCostSolverResult[] = []
	// … move `backtrack` here as a closure that pushes into `results`;
	// `getMaxTimes`/`allocate` become module-private pure helpers taking explicit args.
	// Remove the `option.quantity ||= 1` mutation: compute a local
	// `const quantity = option.quantity || 1` and pass it where needed.
	return results
}
```

> Move the exact `backtrack`/`getMaxTimes`/`allocate` bodies. The one behavior-preserving cleanup: replace the in-place `option.quantity ||= 1` with a local `const quantity = option.quantity || 1` used by `getMaxTimes`/`allocate` for that iteration — the option object is no longer mutated.

### Step T4.4 — Extract `scoring.ts`

Create `packages/api/typescript/src/sales/services/ProductCostSolver/scoring.ts`. Move the `solve()` scoring/shaping (the `.map(...).sort(...)` block) into a pure function returning `SolvedProductCost[]`:

```typescript
import { ProductCostType, type CurrencyCode } from '@template/contracts-typescript/wire/enums'
import type { ProductCostSolverResult, SolvedProductCost } from './types'
import { pick, sum } from './util'

/** Pure: score combos (most-covered ↓, then cheapest ↑) and shape the winner. */
export function selectBest(results: ProductCostSolverResult[], orderProducts: Record<string, number>): SolvedProductCost[] {
	if (results.length === 0) return []
	// … move the existing `.map`/`.sort` body; emit the single-currency
	// `cost: { amountCents, currency }` shape from T1; return `best?.combo ?? []`.
}
```

### Step T4.5 — Reduce `ProductCostSolver.ts` to a thin composer

Modify `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.ts` so the class only computes the `orderProducts` map in the constructor and `solve()` composes the three pure functions:

```typescript
import type { ProductCostSolverConstructorDTO, SolvedProductCost } from './types'
import { expandOptions } from './optionExpansion'
import { search } from './search'
import { selectBest } from './scoring'

export class ProductCostSolver {
	private readonly costs: ProductCostSolverConstructorDTO['costs']
	private readonly orderVariants: Map<string, number>
	private readonly variantProducts: Map<string, string>
	private readonly orderProducts: Record<string, number>

	constructor({ costs, variantProducts, variants }: ProductCostSolverConstructorDTO) {
		this.costs = costs
		this.orderVariants = variants
		this.variantProducts = variantProducts
		this.orderProducts = Array.from(variants.entries()).reduce((obj, [variant, quantity]) => {
			const product = variantProducts.get(variant)!
			obj[product] = (obj[product] ?? 0) + quantity
			return obj
		}, {} as Record<string, number>)
	}

	solve(): SolvedProductCost[] {
		const options = expandOptions({
			costs: this.costs,
			orderProducts: this.orderProducts,
			orderVariants: this.orderVariants,
			variantProducts: this.variantProducts,
		})
		const results = search({ options, orderProducts: this.orderProducts, variantProducts: this.variantProducts })
		return selectBest(results, this.orderProducts)
	}
}
```

### Step T4.6 — Run the solver tests to verify behavior is preserved

Run: `bun test packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts`
Expected: PASS — all T1+T3 cases green (the split changed structure, not behavior).

### Step T4.7 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T4.8 — Commit

```bash
git add packages/api/typescript/src/sales/services/ProductCostSolver/
git commit -m "refactor(sales): split ProductCostSolver into pure expansion/search/scoring (Task T4)"
```

---

## Task T5: Allocate per-line cost exactly (largest-remainder) in a thin handler

Extract the per-line distribution out of the handler into a pure `ProductCostLineAllocator` that guarantees `Σ(line costs for a product) == solved total` via the largest-remainder method, and raises `MIXED_CURRENCY_PRODUCT_COST` if a line resolves to two currencies. The handler becomes thin orchestration subscribed to `OrderUpdated` only — the dead `ProductCostCreated`/`Deleted` recompute branch is deleted (Spec C re-wires it). New behaviors: exact rounding (AC-5), the mixed-currency guard (AC-6), and the structural extraction (AC-2/3).

**Files to write:**
- Create: `packages/api/typescript/src/sales/services/ProductCostLineAllocator/ProductCostLineAllocator.ts`
- Create: `packages/api/typescript/src/sales/services/ProductCostLineAllocator/index.ts`
- Test: `packages/api/typescript/src/sales/services/ProductCostLineAllocator/ProductCostLineAllocator.test.ts`
- Modify: `packages/api/typescript/src/sales/errors/index.ts` — add `MIXED_CURRENCY_PRODUCT_COST`
- Modify: `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts` — OrderUpdated-only; compose allocator; drop recompute + casts
- Modify: `packages/api/typescript/src/sales/handlers/external.ts` — update the stale "multi-event" comment (export line unchanged)

**Files to read:**
- `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts`
- `packages/api/typescript/src/sales/objects/OrderOverrideFields.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /errors, /handler, /test
**Depends on:** T4

### Step T5.1 — Write the failing allocator test

Create `packages/api/typescript/src/sales/services/ProductCostLineAllocator/ProductCostLineAllocator.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { ProductCostLineAllocator } from './ProductCostLineAllocator'
import type { SolvedProductCost } from '../ProductCostSolver'

const PRODUCT_A = 'prod-a'
function solved(amountCents: number, productQuantity: Record<string, number>): SolvedProductCost {
	return {
		costId: 'c', costOptionId: 'o', costOptionItemId: 'i',
		cost: { amountCents, currency: CurrencyCode.USD },
		shipping: { amountCents: 0, currency: CurrencyCode.USD },
		products: Object.keys(productQuantity), productQuantity,
	}
}

describe('ProductCostLineAllocator', () => {
	const allocator = new ProductCostLineAllocator()

	it('single line receives the whole solved total', () => {
		const out = allocator.allocate([solved(1000, { [PRODUCT_A]: 1 })], [{ id: 'l1', productId: PRODUCT_A, quantity: 1 }])
		expect(out).toEqual([{ lineId: 'l1', cost: { amountCents: 1000, currency: CurrencyCode.USD } }])
	})

	it('even split distributes equally', () => {
		const lines = [
			{ id: 'l1', productId: PRODUCT_A, quantity: 1 },
			{ id: 'l2', productId: PRODUCT_A, quantity: 1 },
			{ id: 'l3', productId: PRODUCT_A, quantity: 1 },
		]
		const out = allocator.allocate([solved(900, { [PRODUCT_A]: 3 })], lines)
		expect(out.map(e => e.cost.amountCents)).toEqual([300, 300, 300])
	})

	it('uneven split uses largest-remainder, Σlines == total, deterministic by lineId', () => {
		const lines = [
			{ id: 'l1', productId: PRODUCT_A, quantity: 1 },
			{ id: 'l2', productId: PRODUCT_A, quantity: 1 },
			{ id: 'l3', productId: PRODUCT_A, quantity: 1 },
		]
		const out = allocator.allocate([solved(1000, { [PRODUCT_A]: 3 })], lines)
		const cents = out.map(e => e.cost.amountCents)
		expect(cents.reduce((a, b) => a + b, 0)).toBe(1000)
		expect(cents).toEqual([334, 333, 333]) // remainder cent → first lineId
	})

	it('mixed currency on one line throws MIXED_CURRENCY_PRODUCT_COST', () => {
		const a = solved(500, { [PRODUCT_A]: 1 })
		const b: SolvedProductCost = { ...solved(700, { [PRODUCT_A]: 1 }), costId: 'c2', cost: { amountCents: 700, currency: CurrencyCode.BRL } }
		expect(() => allocator.allocate([a, b], [{ id: 'l1', productId: PRODUCT_A, quantity: 1 }])).toThrow(BaseError)
	})
})
```

### Step T5.2 — Run to verify it fails

Run: `bun test packages/api/typescript/src/sales/services/ProductCostLineAllocator/ProductCostLineAllocator.test.ts`
Expected: FAIL — `Cannot find module './ProductCostLineAllocator'`.

### Step T5.3 — Register the `MIXED_CURRENCY_PRODUCT_COST` error

Modify `packages/api/typescript/src/sales/errors/index.ts`:

```diff
-export type SalesDomainErrors = 'INVALID_ORDER_OVERRIDE_FIELDS'
+export type SalesDomainErrors = 'INVALID_ORDER_OVERRIDE_FIELDS' | 'MIXED_CURRENCY_PRODUCT_COST'
```
```diff
 registerErrorCodes({
 	INVALID_ORDER_OVERRIDE_FIELDS: HttpStatusCode.UNPROCESSABLE_ENTITY,
+	MIXED_CURRENCY_PRODUCT_COST: HttpStatusCode.UNPROCESSABLE_ENTITY,
 	ORDER_NOT_FOUND: HttpStatusCode.NOT_FOUND,
 	INVALID_LINE_ID: HttpStatusCode.UNPROCESSABLE_ENTITY,
 })
```

### Step T5.4 — Implement the allocator

Create `packages/api/typescript/src/sales/services/ProductCostLineAllocator/ProductCostLineAllocator.ts`. Pure unit (no DI). Per product: collect solved entries (assert single currency), sum the per-product total, then distribute over that product's lines by largest-remainder (proportional to line quantity), tie-broken by `lineId`.

```typescript
import { BaseError } from '@template/core-typescript'
import type { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import type { OrderOverrideFieldsInput } from '../../objects/OrderOverrideFields'
import type { SalesDomainErrors } from '../../errors'
import type { SolvedProductCost } from '../ProductCostSolver'

export interface AllocatorOrderLine {
	id: string
	productId: string
	quantity: number
}
type ProductCostByLine = NonNullable<OrderOverrideFieldsInput['productCostByLine']>

/** Distributes solved product costs across order lines with exact integer cents. */
export class ProductCostLineAllocator {
	allocate(solved: SolvedProductCost[], lines: AllocatorOrderLine[]): ProductCostByLine {
		// 1. Per product: total cents + single currency (guard mixed currency).
		const totals = new Map<string, { amountCents: number; currency: CurrencyCode }>()
		for (const entry of solved) {
			for (const productId of entry.products) {
				const prev = totals.get(productId)
				if (prev && prev.currency !== entry.cost.currency) {
					throw new BaseError<SalesDomainErrors>('MIXED_CURRENCY_PRODUCT_COST')
				}
				totals.set(productId, {
					amountCents: (prev?.amountCents ?? 0) + entry.cost.amountCents,
					currency: entry.cost.currency,
				})
			}
		}

		// 2. Per product: largest-remainder split across its lines (by quantity).
		const out: ProductCostByLine = []
		for (const [productId, total] of totals) {
			const productLines = lines.filter(l => l.productId === productId)
			const totalQty = productLines.reduce((n, l) => n + l.quantity, 0)
			if (totalQty <= 0) continue

			const shares = productLines.map(l => {
				const exact = (total.amountCents * l.quantity) / totalQty
				const floor = Math.floor(exact)
				return { lineId: l.id, floor, remainder: exact - floor }
			})
			let leftover = total.amountCents - shares.reduce((n, s) => n + s.floor, 0)
			// Hand remainder cents to the largest fractional parts; tie-break by lineId.
			shares
				.slice()
				.sort((a, b) => b.remainder - a.remainder || (a.lineId < b.lineId ? -1 : 1))
				.forEach(s => {
					if (leftover > 0) { s.floor += 1; leftover -= 1 }
				})
			for (const s of shares) {
				out.push({ lineId: s.lineId, cost: { amountCents: s.floor, currency: total.currency } })
			}
		}
		return out
	}
}
```

Create `packages/api/typescript/src/sales/services/ProductCostLineAllocator/index.ts`:

```typescript
export { ProductCostLineAllocator, type AllocatorOrderLine } from './ProductCostLineAllocator'
```

### Step T5.5 — Run the allocator test to verify it passes

Run: `bun test packages/api/typescript/src/sales/services/ProductCostLineAllocator/ProductCostLineAllocator.test.ts`
Expected: PASS — 4 tests pass.

### Step T5.6 — Rewrite the handler: OrderUpdated-only, thin orchestration

Modify `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts`. Subscribe to a single event, drop the `as unknown as` cast + the `recomputeAffected` branch, and delegate distribution to the allocator:

```typescript
import { injectable } from 'tsyringe-neo'
import { EventHandler, Id, type Transaction } from '@template/core-typescript'
import { OrderUpdatedEvent } from '@template/contracts-typescript/wire/events'
import { ProductCostSolver } from '../../services/ProductCostSolver'
import { ProductCostLineAllocator } from '../../services/ProductCostLineAllocator'
import { ProductCostQueryService } from '../../../catalog/services/ProductCostQueryService'
import { OrderOverride } from '../../entities/OrderOverride'
import { OrderOverrideRepository } from '../../repositories/OrderOverrideRepository/OrderOverrideRepository'
import { OrderQueryService } from '../../services/OrderQueryService'

type OrderQueryResult = Awaited<ReturnType<OrderQueryService['findById']>>
interface OrderLine { id: string; productId: string; variantId: string; quantity: number }

@injectable()
export class ProductCostApplicationHandler extends EventHandler<typeof OrderUpdatedEvent> {
	readonly event = OrderUpdatedEvent
	private readonly allocator = new ProductCostLineAllocator()

	constructor(
		private readonly orderQuery: OrderQueryService,
		private readonly costQuery: ProductCostQueryService,
		private readonly overrideRepo: OrderOverrideRepository,
	) {
		super()
	}

	async handle(event: this['input'], tx?: Transaction): Promise<void> {
		const { platform, externalId } = event.payload
		const orderId = Id.fromSeed('order', platform, externalId).value
		const order = await this.orderQuery.findById(orderId)
		if (!order) return
		await this.applyForOrder(order, tx)
	}

	private async applyForOrder(order: NonNullable<OrderQueryResult>, tx?: Transaction): Promise<void> {
		const lines = (order.lines as OrderLine[]) ?? []
		if (lines.length === 0) return

		const variantProducts = new Map<string, string>()
		const variantQuantities = new Map<string, number>()
		for (const line of lines) {
			if (!line.variantId || !line.productId) continue
			variantProducts.set(line.variantId, line.productId)
			variantQuantities.set(line.variantId, (variantQuantities.get(line.variantId) ?? 0) + line.quantity)
		}
		if (variantQuantities.size === 0) return

		const productIds = Array.from(new Set(variantProducts.values()))
		const costs = await this.costQuery.findApplicable({ storeId: order.storeId, productIds, at: order.externalCreatedAt })

		const solved = new ProductCostSolver({ costs, variantProducts, variants: variantQuantities }).solve()
		const productCostByLine = this.allocator.allocate(
			solved,
			lines.map(l => ({ id: l.id, productId: l.productId, quantity: l.quantity })),
		)

		let override = await this.overrideRepo.findByPin(order.id, order.storeIntegrationExternalId, tx)
		if (!override) {
			override = OrderOverride.create({
				storeId: order.storeId,
				orderId: order.id,
				storeIntegrationExternalId: order.storeIntegrationExternalId,
				fields: {},
				updatedByUserId: 'system:product-cost',
			})
		}
		override.setProductCostByLine(productCostByLine)
		await this.overrideRepo.save(override, tx)
	}
}
```

> The dead `applyForOrderId`/`recomputeAffected` methods and the `ProductCostCreatedEvent`/`ProductCostDeletedEvent` imports are deleted. `orderQuery` stays the first constructor param (the structural handler test asserts `handler.orderQuery`). Single-event handlers use `EventHandler<typeof OrderUpdatedEvent>` + `readonly event = OrderUpdatedEvent` (not the array form) — matching `OrderUpdatedLinkCartHandler`. The barrel export at `sales/handlers/external.ts:24` is unchanged; update its preceding comment (line ~19) from "multi-event" to note it now reacts to `OrderUpdated` only.

### Step T5.7 — Run handler + allocator tests + type check

Run: `bun test packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.test.ts packages/api/typescript/src/sales/services/ProductCostLineAllocator/ProductCostLineAllocator.test.ts`
Expected: PASS — handler (4) + allocator (4). The handler test's `2 units × 500 → 1000` case is unaffected (whole number).

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T5.8 — Commit

```bash
git add packages/api/typescript/src/sales/services/ProductCostLineAllocator/ \
        packages/api/typescript/src/sales/errors/index.ts \
        packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts
git commit -m "refactor(sales): extract ProductCostLineAllocator + thin OrderUpdated-only handler (Task T5)"
```

---

## Task T6: Query-service timespan matching tests

The date-range matching lives in `DrizzleProductCostQueryService.findApplicable`. Add an integration test (PGlite) that seeds `ProductCost`s via the real repository and asserts the effective-interval filtering: within/before/after/open-ended/inclusive-boundary/range-selection. Documents current behavior (AC-12); the end-of-day boundary edge is Spec D (Open Question 1), so the boundary cases use date-aligned `at` values.

**Files to write:**
- Test: `packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.test.ts`

**Files to read:**
- `packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.ts`
- `packages/api/typescript/src/catalog/usecases/CreateProductCost.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /test
**Depends on:** T2

### Step T6.1 — Write the timespan test

Create `packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.test.ts`. Seed via the `ProductCostRepository` (never via use case), then query the Drizzle service:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { CurrencyCode, ProductCostType, QuantityModifier } from '@template/contracts-typescript/wire/enums'
import { ProductCost } from '../../entities/ProductCost'
import { ProductCostRepository } from '../../repositories/ProductCostRepository'
import { ProductCostQueryService } from './ProductCostQueryService'

const STORE = 'aaaaaaaa-0001-4000-8000-000000000010'
const SI = 'bbbbbbbb-0001-4000-8000-000000000010'
const PRODUCT = 'cccccccc-0001-4000-8000-000000000010'
const VARIANT = 'dddddddd-0001-4000-8000-000000000010'

function makeCost(startDate: string, endDate?: string): ProductCost {
	return ProductCost.create({
		storeId: STORE, storeIntegrationId: SI, productId: PRODUCT, costType: ProductCostType.SINGLE,
		options: [{
			currency: CurrencyCode.USD, startDate, endDate,
			shipping: { amountCents: 0, currency: CurrencyCode.USD },
			items: [{
				variantIds: [VARIANT], quantity: 1, quantityModifier: QuantityModifier.GTE,
				unitCost: { amountCents: 500, currency: CurrencyCode.USD },
				shipping: { amountCents: 0, currency: CurrencyCode.USD },
			}],
		}],
	})
}

describe('DrizzleProductCostQueryService.findApplicable — timespan', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: ProductCostRepository
	let query: ProductCostQueryService

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		repo = testBed.resolve(ProductCostRepository)
		query = testBed.resolve(ProductCostQueryService)
	})
	beforeEach(async () => { await testBed.reset() })
	afterAll(async () => { await testBed.destroy() })

	async function applies(at: Date): Promise<boolean> {
		const rows = await query.findApplicable({ storeId: STORE, productIds: [PRODUCT], at })
		return rows.length > 0
	}

	it('order within the range applies; before and after do not', async () => {
		await repo.save(makeCost('2026-01-01', '2026-06-30'))
		expect(await applies(new Date('2026-05-01'))).toBe(true)
		expect(await applies(new Date('2025-12-01'))).toBe(false)
		expect(await applies(new Date('2026-07-01'))).toBe(false)
	})

	it('open-ended range (no endDate) applies for any later date', async () => {
		await repo.save(makeCost('2026-01-01'))
		expect(await applies(new Date('2027-01-01'))).toBe(true)
	})

	it('range boundaries are inclusive (date-aligned)', async () => {
		await repo.save(makeCost('2026-01-01', '2026-06-30'))
		expect(await applies(new Date('2026-01-01'))).toBe(true)
		expect(await applies(new Date('2026-06-30'))).toBe(true)
	})

	it('two non-overlapping ranges: the order date selects the right option', async () => {
		await repo.save(makeCost('2026-01-01', '2026-03-31'))
		// Second rule for the same product would violate the one-rule-per-(store,product)
		// uniqueness gate at the use-case layer, but the repository persists options
		// directly; seed a single rule whose option covers the second window instead.
		const second = makeCost('2026-04-01', '2026-06-30')
		await testBed.reset()
		await repo.save(second)
		expect(await applies(new Date('2026-05-15'))).toBe(true)
		expect(await applies(new Date('2026-02-15'))).toBe(false)
	})
})
```

> If `ProductCost.create` rejects multiple options in the same `(currency, country)` with overlapping/adjacent ranges, keep each assertion to a single rule per `reset()` as shown — the goal is to prove `findApplicable`'s date filter, not multi-rule overlap (that's the entity's invariant, covered in `ProductCost.test.ts`).

### Step T6.2 — Run the test

Run: `bun test packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.test.ts`
Expected: PASS — date-range filtering behaves as asserted.

### Step T6.3 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T6.4 — Commit

```bash
git add packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.test.ts
git commit -m "test(catalog): timespan matching for ProductCostQueryService.findApplicable (Task T6)"
```

---

## Task T7: Creation → application flow test (live OrderUpdated path)

Prove the whole live path end-to-end: a `ProductCost` created via the real `CreateProductCost` use case is applied with the right per-line values when its order is processed via `OrderUpdated`, with no-cost yielding no entries and replay being idempotent. The order read-model is Go-owned (no TS write repo), so the order is seeded via `MockOrderQueryService.nextOrders` — mirroring the existing handler test — while costs go through the real catalog use case + repository.

**Files to write:**
- Test: `packages/api/typescript/tests/flows/product-cost-application.flow.test.ts`

**Files to read:**
- `packages/api/typescript/tests/flows/billing-webhook-order-approved.flow.test.ts`
- `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.test.ts`
- `packages/api/typescript/src/catalog/usecases/CreateProductCost.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T5

### Step T7.1 — Write the flow test

Create `packages/api/typescript/tests/flows/product-cost-application.flow.test.ts`. Use `integration` mode so the real catalog use case + `DrizzleProductCostQueryService` round-trip the cost through the DB; override `OrderQueryService` with the mock to seed the order; assert the real `OrderOverrideRepository`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Id } from '@template/core-typescript'
import { CurrencyCode, PaymentStatus, ProductCostType, QuantityModifier, SalesPlatform } from '@template/contracts-typescript/wire/enums'
import { OrderUpdatedEvent } from '@template/contracts-typescript/wire/events'
import { CreateProductCost } from '@catalog/usecases/CreateProductCost'
import { ProductCostApplicationHandler } from '@sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler'
import { OrderOverrideRepository } from '@sales/repositories/OrderOverrideRepository/OrderOverrideRepository'
import { OrderQueryService, MockOrderQueryService } from '@sales/services/OrderQueryService'

const STORE = '019e4d24-6524-7041-9e1c-8108180cddae'
const SI = '019e4d24-6524-7041-9e1c-8108180cddaf'
const SI_EXTERNAL = 'acme.myshopify.com'
const PLATFORM = SalesPlatform.SHOPIFY
const ORDER_EXTERNAL = 'shopify_order_flow_1'
const USER = '019e4d24-6524-7041-9e1c-8108180cddb0'
const PRODUCT_ID = Id.fromSeed('product', PLATFORM, 'flow_prod_1').value
const VARIANT_ID = Id.fromSeed('product_variant', PLATFORM, 'flow_var_1').value
const ORDER_ID = Id.fromSeed('order', PLATFORM, ORDER_EXTERNAL).value

function makeOrder(quantity: number) {
	return {
		id: ORDER_ID, storeId: STORE, storeIntegrationExternalId: SI_EXTERNAL,
		externalCreatedAt: new Date('2026-05-15T10:00:00Z'),
		lines: [{ id: 'line-1', productId: PRODUCT_ID, variantId: VARIANT_ID, quantity }],
	}
}

function orderUpdated(): OrderUpdatedEvent {
	return new OrderUpdatedEvent({
		ownerId: STORE,
		payload: {
			platform: PLATFORM, externalId: ORDER_EXTERNAL, storeIntegrationExternalId: SI_EXTERNAL,
			paymentStatus: PaymentStatus.PAID, totalCents: 0, currency: CurrencyCode.USD, isNew: true, entity: {},
		},
	})
}

describe('FLOW: create ProductCost → applied to order on OrderUpdated', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let createCost: CreateProductCost
	let handler: ProductCostApplicationHandler
	let overrideRepo: OrderOverrideRepository
	let orderQuery: MockOrderQueryService

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		orderQuery = new MockOrderQueryService()
		testBed.override(OrderQueryService, orderQuery)
		createCost = testBed.resolve(CreateProductCost)
		handler = testBed.resolve(ProductCostApplicationHandler)
		overrideRepo = testBed.resolve(OrderOverrideRepository)
	})
	beforeEach(async () => { await testBed.reset(); orderQuery.nextOrders = [] })
	afterAll(async () => { await testBed.destroy() })

	async function createUsdCost(unitCents: number) {
		await createCost.execute({
			userId: USER, storeId: STORE, storeIntegrationId: SI, productId: PRODUCT_ID,
			costType: ProductCostType.SINGLE, displayName: 'flow cost',
			options: [{
				currency: CurrencyCode.USD, startDate: '2026-01-01',
				shipping: { amountCents: 0, currency: CurrencyCode.USD },
				items: [{
					variantIds: [VARIANT_ID], quantity: 1, quantityModifier: QuantityModifier.GTE,
					unitCost: { amountCents: unitCents, currency: CurrencyCode.USD },
					shipping: { amountCents: 0, currency: CurrencyCode.USD },
				}],
			}],
		})
	}

	it('a created cost is applied with the right per-line value when the order is processed', async () => {
		await createUsdCost(500)
		orderQuery.nextOrders = [makeOrder(2)]

		await handler.handle(orderUpdated() as never)

		const override = await overrideRepo.findByPin(ORDER_ID, SI_EXTERNAL)
		const byLine = override!.fields.productCostByLine!
		expect(byLine).toHaveLength(1)
		expect(byLine[0]!.cost.amountCents).toBe(1000) // 2 units × 500
		expect(byLine[0]!.cost.currency).toBe(CurrencyCode.USD)
	})

	it('no matching cost → no per-line entries', async () => {
		orderQuery.nextOrders = [makeOrder(1)]
		await handler.handle(orderUpdated() as never)
		const override = await overrideRepo.findByPin(ORDER_ID, SI_EXTERNAL)
		expect(override?.fields.productCostByLine ?? []).toHaveLength(0)
	})

	it('replaying OrderUpdated is idempotent', async () => {
		await createUsdCost(500)
		orderQuery.nextOrders = [makeOrder(2)]
		await handler.handle(orderUpdated() as never)
		await handler.handle(orderUpdated() as never)
		const override = await overrideRepo.findByPin(ORDER_ID, SI_EXTERNAL)
		expect(override!.fields.productCostByLine).toHaveLength(1)
		expect(override!.fields.productCostByLine![0]!.cost.amountCents).toBe(1000)
	})
})
```

> `handler.handle(orderUpdated() as never)` matches the existing handler test's invocation (the base `EventHandler.handle` is typed to the subscribed union; `as never` sidesteps the test-only event-construction variance, exactly as `ProductCostApplicationHandler.test.ts` does).

### Step T7.2 — Run the flow test

Run: `bun test packages/api/typescript/tests/flows/product-cost-application.flow.test.ts`
Expected: PASS — 3 tests pass.

### Step T7.3 — Full type check + lint + affected tests

Run: `bun tsc && bun lint`
Expected: 0 errors.

Run: `bun test packages/api/typescript/src/catalog packages/api/typescript/src/sales packages/api/typescript/tests/flows`
Expected: PASS — all catalog + sales + flow suites green.

### Step T7.4 — Commit

```bash
git add packages/api/typescript/tests/flows/product-cost-application.flow.test.ts
git commit -m "test(flows): product cost creation applies to order on OrderUpdated (Task T7)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — all suites pass (catalog + sales + flows)
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts` (5 existing cases pass after the move+split) + the `optionExpansion.ts`/`search.ts`/`scoring.ts` files exist (T4)
  - AC-2 → `packages/api/typescript/src/sales/services/ProductCostLineAllocator/ProductCostLineAllocator.test.ts` + handler contains no inline allocation (T5)
  - AC-3 → `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.test.ts:"handler reads orders via OrderQueryService, not via Drizzle directly"` (single-event handler, `orderQuery` preserved, no recompute)
  - AC-4 → `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts:"single generic cost matches every unit of the product"` (asserts `cost.amountCents`/`cost.currency`)
  - AC-5 → `packages/api/typescript/src/sales/services/ProductCostLineAllocator/ProductCostLineAllocator.test.ts:"uneven split uses largest-remainder, Σlines == total, deterministic by lineId"`
  - AC-6 → `packages/api/typescript/src/sales/services/ProductCostLineAllocator/ProductCostLineAllocator.test.ts:"mixed currency on one line throws MIXED_CURRENCY_PRODUCT_COST"`
  - AC-7 → `packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.test.ts` (returns `ApplicableProductCost[]`) + `bun tsc` (all call sites updated)
  - AC-8 → `packages/api/typescript/src/sales/services/ProductCostSolver/ProductCostSolver.test.ts` (modifier/kit/precedence/partial cases, T3)
  - AC-9 → `bun tsc` + `bun run test` (handler's 4 tests included)
  - AC-10 → `packages/api/typescript/src/catalog/registry.ts` (stale comment removed) + no DI binding added for solver/allocator (`bun tsc` resolves; handler keeps its registration)
  - AC-11 → `packages/api/typescript/src/sales/services/ProductCostLineAllocator/ProductCostLineAllocator.test.ts` (single/even/uneven/mixed)
  - AC-12 → `packages/api/typescript/src/catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.test.ts` (within/before/after/open-ended/boundary/selection)
  - AC-13 → `packages/api/typescript/tests/flows/product-cost-application.flow.test.ts` (create→apply, no-cost, idempotency)

## Notes

- **No migration, no SDK regen, no contract change.** All changes are internal services/types; no controller or OpenAPI schema is touched, so the SDK Contract-Lock task does not apply.
- **`@catalog/...` alias.** Cross-context imports use the existing path alias (`@catalog/services/ProductCostQueryService`), consistent with the rest of `packages/api/typescript`. If the alias is unavailable in a given file, fall back to the relative path (`../../../catalog/...`) as the handler did pre-refactor.
- **Worktree caveat (project memory):** nested worktrees break Nx, so prefer per-file `bun test <path>` and `bun tsc` over `nx`-routed targets when validating mid-build.
- **Deferred to other specs:** search scalability (Spec B); recompute-on-cost-change wiring + fan-out (Spec C — the dead `ProductCostCreated`/`Deleted` path removed here); country + currency normalization via `FxRateService` (Spec D — replaces the `MIXED_CURRENCY_PRODUCT_COST` guard).
