# SPEC-15: `ProductCost` date-range validation moves into the schema `.refine()` — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Move the `startDate ≤ endDate` invariant from the freestanding `validateDateRange` function and its two manual call sites in `ProductCost.create()` / `.update()` into a `.refine()` on `ProductCostOptionSchema`, so `this.validate()` (via the BaseEntity constructor and explicit `validate()` calls) enforces it automatically on every mutation path — with no chance of forgetting it on a future path.

**Architecture:** Single atomic commit. Add `.refine(d => d.endDate === undefined || d.startDate <= d.endDate, { error: 'INVALID_DATE_RANGE' })` to `ProductCostOptionSchema`; delete the `validateDateRange` helper and its two `for (const opt of …) validateDateRange(opt)` loops from `.create()` and `.update()`. The `BaseEntity` constructor already runs `schema.safeParse(props)` (lines 33–39 of `BaseEntity.ts`) and `validate()` runs `schema.safeParse(this)` (lines 49–53) — both bubble the refine failure as `new BaseError(issues[0].message)` with the `INVALID_DATE_RANGE` code. No call site outside the entity changes.

**Tech Stack:** TypeScript + Bun + Zod (`@template/core-typescript`). No DB changes; no migration; no SDK regen.

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-15-productcost-daterange-refine.md`
**Tasks:** 1
**Estimated minutes:** 15

> **Planner note — `.create()` path already validates via constructor.** `ProductCost.create()` returns `new ProductCost({...})`. The `BaseEntity` constructor (lines 33–39) calls `schema.safeParse(props)` and throws `INVALID_ENTITY` on failure. However, `ProductCostSchema` embeds `options: z.array(ProductCostOptionSchema)`, so adding `.refine()` to `ProductCostOptionSchema` means the per-element refine fires during that constructor call — the `validateDateRange` loop at line 113 becomes redundant. The `.update()` path similarly drops the loop at line 156 because `this.validate()` at line 176 fires `schema.safeParse(this)` which includes the `options` array.

> **Planner note — existing use-case tests remain valid.** `CreateProductCost.test.ts:172` and `UpdateProductCost.test.ts:188` already assert that `INVALID_DATE_RANGE` is thrown when `startDate > endDate`. After this change the code that throws changes (schema refine instead of free function) but the observable behavior — same error code — is identical. Those tests stay green without modification; they are integration tests of the entity through the use case, which is the right level.

> **Planner note — `ProductCostOptionInputSchema` not touched.** The input schema (`ProductCostOptionInputSchema`, lines 59–66) is used by use cases/controllers for pre-validation of raw input. The spec only moves the check into `ProductCostOptionSchema` (the canonical entity-level schema at line 24). We do NOT add a refine to `ProductCostOptionInputSchema` — that would be double-validation not asked for by the spec, and input schemas are a controller concern.

> **Planner note — orthogonality with SPEC-01.** SPEC-01 replaces the inline `MonetaryAmountSchema` with the shared `MonetaryAmount` VO. Both touch `ProductCost.ts` but in disjoint sections (SPEC-01 touches `MonetaryAmountSchema`, `ProductCostOptionItemSchema`, and the `unitCost`/`shipping` fields; this spec touches only `ProductCostOptionSchema.refine()` and the `validateDateRange` helper). Sequence by wave: SPEC-01 is Wave 1 and must land before this Wave-6 plan executes. If both happen to be in flight on the same branch, resolve trivially by applying both diffs.

---

## Task 1: Date-range invariant lives in `ProductCostOptionSchema.refine()`; `validateDateRange` deleted

**Files:**
- Modify: `packages/api/typescript/src/catalog/entities/ProductCost.ts`
- Modify: `packages/api/typescript/src/catalog/entities/ProductCost.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** (none)

- [ ] **Step 1: Write the failing test (RED)**

Open `packages/api/typescript/src/catalog/entities/ProductCost.test.ts` and add a new `describe` block after the existing `'ProductCost entity schema'` block:

```ts
describe('ProductCostOptionSchema — date-range invariant', () => {
  const makeOption = (startDate: string, endDate?: string) => ({
    ...baseProps.options[0]!,
    startDate,
    endDate,
  })

  it('rejects startDate > endDate via schema', () => {
    const r = ProductCostSchema.safeParse({
      ...baseProps,
      options: [makeOption('2026-12-31', '2026-01-01')],
    })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.error.issues[0]?.message).toBe('INVALID_DATE_RANGE')
  })

  it('accepts startDate === endDate', () => {
    const r = ProductCostSchema.safeParse({
      ...baseProps,
      options: [makeOption('2026-06-01', '2026-06-01')],
    })
    expect(r.success).toBe(true)
  })

  it('accepts startDate < endDate', () => {
    const r = ProductCostSchema.safeParse({
      ...baseProps,
      options: [makeOption('2026-01-01', '2026-12-31')],
    })
    expect(r.success).toBe(true)
  })

  it('accepts a missing endDate (open-ended)', () => {
    const r = ProductCostSchema.safeParse({
      ...baseProps,
      options: [makeOption('2026-01-01', undefined)],
    })
    expect(r.success).toBe(true)
  })

  it('ProductCost.create() throws INVALID_DATE_RANGE when startDate > endDate', () => {
    const { CurrencyCode, ProductCostType, QuantityModifier } = require('@template/contracts-typescript/wire/enums')
    expect(() =>
      ProductCost.create({
        storeId: STORE,
        storeIntegrationId: INTEGRATION,
        productId: PRODUCT,
        costType: ProductCostType.SINGLE,
        options: [
          {
            currency: CurrencyCode.USD,
            startDate: '2026-12-31',
            endDate: '2026-01-01',
            shipping: { amountCents: 0, currency: CurrencyCode.USD },
            items: [
              {
                variantIds: [VARIANT],
                quantity: 1,
                quantityModifier: QuantityModifier.EQ,
                unitCost: { amountCents: 1000, currency: CurrencyCode.USD },
                shipping: { amountCents: 0, currency: CurrencyCode.USD },
              },
            ],
          },
        ],
      })
    ).toThrow('INVALID_DATE_RANGE')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/catalog/entities/ProductCost.test.ts
```

Expected: the new `'rejects startDate > endDate via schema'` and `'ProductCost.create() throws INVALID_DATE_RANGE when startDate > endDate'` tests FAIL — `INVALID_DATE_RANGE` is not in the schema issue message yet (the check lives in the free function, not the schema).

- [ ] **Step 3: Add the `.refine()` to `ProductCostOptionSchema` and delete `validateDateRange`**

In `packages/api/typescript/src/catalog/entities/ProductCost.ts` make the following changes:

**3a.** Change `ProductCostOptionSchema` (lines 24–32) to add a `.refine()`:

```diff
 export const ProductCostOptionSchema = z.object({
 	id: z.uuid(),
 	currency: CurrencyCodeSchema,
 	country: z.string().length(2).optional(),
 	startDate: z.iso.date(),
 	endDate: z.iso.date().optional(),
 	shipping: MonetaryAmountSchema,
 	items: z.array(ProductCostOptionItemSchema).min(1),
-})
+}).refine(d => d.endDate === undefined || d.startDate <= d.endDate, {
+	error: 'INVALID_DATE_RANGE' as CatalogDomainErrors,
+})
```

**3b.** Delete the `validateDateRange` free function (lines 80–84):

```diff
-function validateDateRange(opt: ProductCostOptionInput): void {
-	if (opt.endDate !== undefined && opt.startDate > opt.endDate) {
-		throw new BaseError<CatalogDomainErrors>('INVALID_DATE_RANGE')
-	}
-}
-
 /**
  * Deterministic hash of a sorted variant-ID set.
```

**3c.** Delete the `validateDateRange` loop inside `static create()` (lines 112–114):

```diff
 	static create(data: { ... }): ProductCost {
-		for (const opt of data.options) {
-			validateDateRange(opt)
-		}
-
 		const options: ProductCostOption[] = data.options.map(opt => ({
```

**3d.** Delete the `validateDateRange` loop inside `.update()` (lines 155–158):

```diff
 		if (data.options !== undefined) {
-			for (const opt of data.options) {
-				validateDateRange(opt)
-			}
 			this.options = data.options.map(opt => ({
```

No other changes are needed. The `this.validate()` calls in `.update()` (line 176) and `.delete()` (line 185) remain — they enforce schema on every mutation. The constructor path in `.create()` validates via `new ProductCost({...})` which runs `schema.safeParse` in `BaseEntity`'s constructor.

- [ ] **Step 4: Run tests to verify they pass (GREEN)**

```bash
cd packages/api/typescript && bun test src/catalog/entities/ProductCost.test.ts
```

Expected: PASS — all existing tests plus the new `'ProductCostOptionSchema — date-range invariant'` block (6 tests total in new block).

- [ ] **Step 5: Verify no stray `validateDateRange` reference survives**

```bash
grep -r "validateDateRange" packages/api/typescript/src/
```

Expected: zero output. If any hit remains, fix it.

- [ ] **Step 6: Run the use-case-level tests that assert `INVALID_DATE_RANGE`**

```bash
cd packages/api/typescript && bun test src/catalog/usecases/CreateProductCost.test.ts src/catalog/usecases/UpdateProductCost.test.ts
```

Expected: PASS — `CreateProductCost.test.ts:172` and `UpdateProductCost.test.ts:188` both continue to assert the same error code; the mechanism change (free function → schema refine) is transparent to the use-case tests.

- [ ] **Step 7: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors. The `BaseError` import in `ProductCost.ts` may become unused once `validateDateRange` is gone — check and remove the import if so:

```diff
-import { AggregateRoot, BaseError, z } from '@template/core-typescript'
+import { AggregateRoot, z } from '@template/core-typescript'
```

(Only remove if `BaseError` is no longer referenced anywhere in the file — the `.update()` and `.delete()` methods still use it for the `PRODUCT_COST_NOT_FOUND` guard.)

- [ ] **Step 8: Run full catalog test suite**

```bash
cd packages/api/typescript && bun run test --filter src/catalog
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

Use `/commit`:

```
refactor(catalog): move ProductCost date-range invariant into schema .refine() (SPEC-15)
```

Stage: `packages/api/typescript/src/catalog/entities/ProductCost.ts`, `packages/api/typescript/src/catalog/entities/ProductCost.test.ts`

---

## Acceptance Criteria Coverage

| AC | Covered by |
|---|---|
| `ProductCostOptionSchema` has a `.refine()` enforcing `endDate === undefined \|\| startDate <= endDate`, raising `INVALID_DATE_RANGE` | Task 1 Step 3a |
| `validateDateRange` free function deleted; its two `for`-loop call sites in `.create()` and `.update()` deleted | Task 1 Steps 3b–3d |
| `grep validateDateRange` → zero | Task 1 Step 5 |
| `ProductCost.create()` with `startDate > endDate` throws `INVALID_DATE_RANGE` | Task 1 Step 4 (new entity test) |
| `bun tsc` clean | Task 1 Step 7 |
| `bun run test` clean (catalog suite) | Task 1 Step 8 |
