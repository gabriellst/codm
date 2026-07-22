# SPEC-01: Shared `MonetaryAmount` Value Object — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`)
> syntax for tracking. Each Task wraps one observable behavior in an outer
> RED→GREEN cycle. Complete tasks in order — Task 2 and 3 both depend on Task 1.

**Goal:** Eliminate the six duplicated `MonetaryAmountSchema` definitions scattered across bounded contexts by extracting a single shared composite value object (`src/shared/objects/MonetaryAmount.ts`), replacing each local definition with an import of the shared VO, and adapting the Goal and OperationalCost entities to embed a nested `targetAmount`/`amount` property in place of flat `*AmountCents + currency` pairs — while keeping the two-column Drizzle persistence layout unchanged.

**Architecture:** Composite VO (`BaseValueObject`) with `amountCents >= 0` (permissive). Entities that need a stricter bound (`Goal.targetAmount > 0`, `OperationalCost.amount > 0`) add `.positive()` in their own schema at the embed site. Hydration stays schema-driven (`Entity.schema.parse(...)` — no field-by-field assembly). DB column names unchanged; only the in-memory shape changes. The sales `readmodels/objects/MonetaryAmount.ts` is deleted and its importers switched to the shared VO. The `catalog/readmodels/ProductVariantReadModel.ts` cross-context import of `sales/readmodels/objects` is also redirected.

**Tech Stack:** TypeScript + Bun + Drizzle + Zod (`@template/core-typescript`), `bun:test`, PGlite integration harness.

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-01-monetary-amount-vo.md`

**Tasks:** 6

**Estimated minutes:** 110

> **Planner note — scope boundary.** The analytics use-case-local `MonetaryAmountSchema` constants in `GetDashboardOverview.ts` and `GetAdminStoreSnapshot.ts` are output-only schemas inside use-case files; they are NOT the same as the entity-level duplicates the spec targets (`const MonetaryAmountSchema` exported from entity or object files). They remain untouched — the spec's acceptance criterion is "no exported `const MonetaryAmountSchema` outside `src/shared/objects/`", not "no inline local schema anywhere".

> **Planner note — sales readmodels importers.** `OrderReadModel.ts`, `OrderLineReadModel.ts`, `OrderTransactionReadModel.ts` all import `MonetaryAmountSchema` from `./objects`. These are plain Zod schemas used as read-model shapes (no VO class, no entity hydration). Task 4 re-points them to the shared VO; no entity or repo change is needed for these files. `catalog/readmodels/ProductVariantReadModel.ts` imports the same schema cross-context — also re-pointed in Task 4.

> **Planner note — `objects.test.ts` migration.** `src/sales/readmodels/objects/objects.test.ts` tests the local `MonetaryAmountSchema`. After Task 4 deletes that file, the test moves to `src/shared/objects/MonetaryAmount.test.ts` and tests the shared VO instead (same cases + VO class construction).

---

## Task 1: `MonetaryAmount` shared VO exists and validates correctly

**Files:**
- Create: `packages/api/typescript/src/shared/objects/MonetaryAmount.ts`
- Create: `packages/api/typescript/src/shared/objects/MonetaryAmount.test.ts`
- Create: `packages/api/typescript/src/shared/objects/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

Create `packages/api/typescript/src/shared/objects/MonetaryAmount.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { MonetaryAmount, MonetaryAmountSchema } from './MonetaryAmount'

describe('MonetaryAmount', () => {
  describe('schema validation', () => {
    it('accepts a zero amount (refunds/zero are valid)', () => {
      const m = MonetaryAmountSchema.parse({ amountCents: 0, currency: CurrencyCode.USD })
      expect(m.amountCents).toBe(0)
      expect(m.currency).toBe(CurrencyCode.USD)
    })

    it('accepts a positive amount', () => {
      const m = MonetaryAmountSchema.parse({ amountCents: 12_500, currency: CurrencyCode.BRL })
      expect(m.amountCents).toBe(12_500)
    })

    it('rejects negative amountCents', () => {
      expect(() => MonetaryAmountSchema.parse({ amountCents: -1, currency: CurrencyCode.USD })).toThrow()
    })

    it('rejects non-integer amountCents', () => {
      expect(() => MonetaryAmountSchema.parse({ amountCents: 12.5, currency: CurrencyCode.USD })).toThrow()
    })

    it('rejects unknown currency', () => {
      expect(() => MonetaryAmountSchema.parse({ amountCents: 100, currency: 'XYZ' })).toThrow()
    })
  })

  describe('VO construction', () => {
    it('constructs via new MonetaryAmount()', () => {
      const vo = new MonetaryAmount({ amountCents: 500, currency: CurrencyCode.USD })
      expect(vo.amountCents).toBe(500)
      expect(vo.currency).toBe(CurrencyCode.USD)
    })

    it('throws on invalid input', () => {
      expect(() => new MonetaryAmount({ amountCents: -1, currency: CurrencyCode.USD })).toThrow()
    })

    it('toJSON returns plain object', () => {
      const vo = new MonetaryAmount({ amountCents: 1000, currency: CurrencyCode.USD })
      const json = vo.toJSON()
      expect(json).toEqual({ amountCents: 1000, currency: CurrencyCode.USD })
    })

    it('equals: same values → true', () => {
      const a = new MonetaryAmount({ amountCents: 100, currency: CurrencyCode.USD })
      const b = new MonetaryAmount({ amountCents: 100, currency: CurrencyCode.USD })
      expect(a.equals(b)).toBe(true)
    })

    it('equals: different amountCents → false', () => {
      const a = new MonetaryAmount({ amountCents: 100, currency: CurrencyCode.USD })
      const b = new MonetaryAmount({ amountCents: 200, currency: CurrencyCode.USD })
      expect(a.equals(b)).toBe(false)
    })

    it('equals: different currency → false', () => {
      const a = new MonetaryAmount({ amountCents: 100, currency: CurrencyCode.USD })
      const b = new MonetaryAmount({ amountCents: 100, currency: CurrencyCode.BRL })
      expect(a.equals(b)).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api/typescript && bun test src/shared/objects/MonetaryAmount.test.ts`
Expected: FAIL — `Cannot find module './MonetaryAmount'`.

- [ ] **Step 3: Implement the VO**

Create `packages/api/typescript/src/shared/objects/MonetaryAmount.ts`:

```ts
import { BaseValueObject } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { CurrencyCodeSchema } from '@template/contracts-typescript/wire/enums'
import Z from 'zod'

export const MonetaryAmountSchema = z.object({
  amountCents: z.number().int().nonnegative(),
  currency: CurrencyCodeSchema,
})

export class MonetaryAmount extends BaseValueObject<typeof MonetaryAmountSchema> {
  static override schema = MonetaryAmountSchema

  equals(other: MonetaryAmount): boolean {
    return this.amountCents === other.amountCents && this.currency === other.currency
  }
}

export interface MonetaryAmount extends Z.infer<typeof MonetaryAmountSchema> {}
```

Create `packages/api/typescript/src/shared/objects/index.ts`:

```ts
export { MonetaryAmount, MonetaryAmountSchema } from './MonetaryAmount'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api/typescript && bun test src/shared/objects/MonetaryAmount.test.ts`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Type-check**

Run: `cd packages/api/typescript && bun tsc --noEmit`
Expected: 0 errors (new files only — no consumers yet).

- [ ] **Step 6: Commit**

```bash
git add packages/api/typescript/src/shared/objects/
git commit -m "feat(shared): MonetaryAmount composite VO (SPEC-01 Task 1)"
```

---

## Task 2: `Goal` entity embeds `MonetaryAmount`; repo round-trip passes

**Files:**
- Modify: `packages/api/typescript/src/analytics/entities/Goal.ts`
- Modify: `packages/api/typescript/src/analytics/repositories/GoalRepository/DrizzleGoalRepository.ts`
- Modify: `packages/api/typescript/src/analytics/repositories/GoalRepository/DrizzleGoalRepository.test.ts`
- Modify: `packages/api/typescript/src/analytics/usecases/CreateGoal.ts`
- Modify: `packages/api/typescript/src/analytics/usecases/UpdateGoal.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /repository, /test
**Depends on:** 1

- [ ] **Step 1: Update the entity test to drive the new shape**

In `packages/api/typescript/src/analytics/repositories/GoalRepository/DrizzleGoalRepository.test.ts`, replace the flat `targetAmountCents` + `currency` parameters in the `build()` helper and assertions with the nested `targetAmount` shape:

```diff
-   type: GoalType.REVENUE,
-   targetAmountCents: opts.targetAmountCents ?? 100_000,
-   currency: CurrencyCode.USD,
+   type: GoalType.REVENUE,
+   targetAmount: { amountCents: opts.amountCents ?? 100_000, currency: CurrencyCode.USD },
```

Update `build()` parameter type from `{ ..., targetAmountCents?: number }` to `{ ..., amountCents?: number }`.

Update all assertions that reference `fetched?.targetAmountCents` or `fetched?.currency` to `fetched?.targetAmount.amountCents` and `fetched?.targetAmount.currency`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api/typescript && bun test src/analytics/repositories/GoalRepository/DrizzleGoalRepository.test.ts`
Expected: FAIL — shape mismatch or `targetAmountCents` does not exist.

- [ ] **Step 3: Update the entity**

Modify `packages/api/typescript/src/analytics/entities/Goal.ts`:

```ts
import { AggregateRoot, BaseError, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { GoalTypeSchema, type GoalType } from '@template/contracts-typescript/wire/enums'
import { MonetaryAmountSchema } from '../../../shared/objects'
import type { AnalyticsDomainErrors } from '../errors'

export const GoalSchema = z.object({
  userId: z.instance(Id),
  storeId: z.instance(Id),
  type: GoalTypeSchema,
  targetAmount: MonetaryAmountSchema.input(),.refine(m => m.amountCents > 0, {
    error: 'INVALID_AMOUNT' as AnalyticsDomainErrors,
  }),
  from: z.iso.date(),
  to: z.iso.date(),
})

export type GoalProps = Z.infer<typeof GoalSchema>

export class Goal extends AggregateRoot<typeof GoalSchema> {
  static override schema = GoalSchema

  static create(data: {
    userId: string
    storeId: string
    type: GoalType
    targetAmount: { amountCents: number; currency: string }
    from: string
    to: string
  }): Goal {
    if (data.from > data.to) {
      throw new BaseError<AnalyticsDomainErrors>('INVALID_DATE_RANGE', 'from must be <= to')
    }
    return new Goal(data)
  }

  updateTarget(patch: { targetAmount?: { amountCents: number; currency: string }; from?: string; to?: string }): string[] {
    const effFrom = patch.from ?? this.from
    const effTo = patch.to ?? this.to
    if (effFrom > effTo) {
      throw new BaseError<AnalyticsDomainErrors>('INVALID_DATE_RANGE', 'from must be <= to')
    }
    const changed: string[] = []
    if (patch.targetAmount !== undefined) {
      this.targetAmount = patch.targetAmount as any
      changed.push('targetAmount')
    }
    if (patch.from !== undefined && patch.from !== this.from) {
      this.from = patch.from
      changed.push('from')
    }
    if (patch.to !== undefined && patch.to !== this.to) {
      this.to = patch.to
      changed.push('to')
    }
    if (changed.length > 0) this.validate()
    return changed
  }
}

export interface Goal extends GoalProps {}
```

- [ ] **Step 4: Update the Drizzle repository**

Modify `packages/api/typescript/src/analytics/repositories/GoalRepository/DrizzleGoalRepository.ts`:

In `toDomain`, collapse the two flat columns into the nested shape:

```diff
- const parsed = GoalSchema.parse({
-   userId: row.userId,
-   storeId: row.storeId,
-   type: row.type,
-   targetAmountCents: Number(row.targetAmountCents),
-   currency: row.targetCurrency,
-   from: row.startDate.toISOString().slice(0, 10),
-   to: row.endDate.toISOString().slice(0, 10),
- })
+ const parsed = GoalSchema.parse({
+   userId: row.userId,
+   storeId: row.storeId,
+   type: row.type,
+   targetAmount: { amountCents: Number(row.targetAmountCents), currency: row.targetCurrency },
+   from: row.startDate.toISOString().slice(0, 10),
+   to: row.endDate.toISOString().slice(0, 10),
+ })
```

In `toPersistence`, extract the two columns from the nested VO:

```diff
- targetAmountCents: BigInt(entity.targetAmountCents),
- targetCurrency: entity.currency,
+ targetAmountCents: BigInt(entity.targetAmount.amountCents),
+ targetCurrency: entity.targetAmount.currency,
```

In `save` → `onConflictDoUpdate`, update the set object:

```diff
- targetAmountCents: data.targetAmountCents,
- targetCurrency: data.targetCurrency,
+ targetAmountCents: data.targetAmountCents,
+ targetCurrency: data.targetCurrency,
```

(These column references are unchanged — the column names stay; only `data.*` extraction path changes above.)

- [ ] **Step 5: Update affected use cases**

Modify `packages/api/typescript/src/analytics/usecases/CreateGoal.ts` — replace the flat input fields with the nested `targetAmount` object:

```diff
  export const CreateGoalInputSchema = z.object({
    userId: z.uuid(),
    storeId: z.uuid(),
    type: GoalTypeSchema,
-   targetAmountCents: z.number().int().positive(),
-   currency: CurrencyCodeSchema,
+   targetAmount: MonetaryAmountSchema.input(),
    from: z.iso.date(),
    to: z.iso.date(),
  })
```

Update the `Goal.create(...)` call to pass `targetAmount: input.targetAmount` (drop `targetAmountCents` and `currency`). Update the domain event payload to use `targetAmount`.

Modify `packages/api/typescript/src/analytics/usecases/UpdateGoal.ts` — replace `targetAmountCents: z.number().int().positive().optional()` + `currency: CurrencyCodeSchema.optional()` with `targetAmount: MonetaryAmountSchema.input(),.refine(m => m.amountCents > 0).optional()`. Update `entity.updateTarget(...)` call to pass `targetAmount: input.targetAmount`.

> Import `MonetaryAmountSchema` from `'../../../shared/objects'` in both use cases. Remove the `CurrencyCodeSchema` import that was only used for the flat currency field (keep it if it's used elsewhere in the file).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/api/typescript && bun test src/analytics/`
Expected: PASS — all Goal repository and use-case tests green.

- [ ] **Step 7: Type-check**

Run: `cd packages/api/typescript && bun tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/api/typescript/src/analytics/
git commit -m "refactor(analytics): Goal embeds MonetaryAmount VO (SPEC-01 Task 2)"
```

---

## Task 3: `OperationalCost` entity embeds `MonetaryAmount`; repo round-trip passes

**Files:**
- Modify: `packages/api/typescript/src/finance/entities/OperationalCost.ts`
- Modify: `packages/api/typescript/src/finance/repositories/OperationalCostRepository/DrizzleOperationalCostRepository.ts`
- Modify: `packages/api/typescript/src/finance/repositories/OperationalCostRepository/DrizzleOperationalCostRepository.test.ts`
- Modify: `packages/api/typescript/src/finance/usecases/CreateOperationalCost.ts`
- Modify: `packages/api/typescript/src/finance/usecases/UpdateOperationalCost.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /repository, /test
**Depends on:** 1

- [ ] **Step 1: Update the repo test to drive the new shape**

In `packages/api/typescript/src/finance/repositories/OperationalCostRepository/DrizzleOperationalCostRepository.test.ts`, update the `build()` helper to accept `amount?: { amountCents: number; currency: CurrencyCode }` instead of `amountCents?: number`. Update all assertions that read `fetched?.amountCents` / `fetched?.currency` to read `fetched?.amount.amountCents` / `fetched?.amount.currency`.

Key test-body changes:
- `build({ amountCents: 500_000 })` → `build({ amount: { amountCents: 500_000, currency: CurrencyCode.USD } })`
- `expect(fetched?.amountCents).toBe(500_000)` → `expect(fetched?.amount.amountCents).toBe(500_000)`
- `expect(fetched?.currency).toBe(CurrencyCode.USD)` → `expect(fetched?.amount.currency).toBe(CurrencyCode.USD)`

The `entity.update({ amountCents: 200_000 })` call in the UPSERT test becomes `entity.update({ amount: { amountCents: 200_000, currency: CurrencyCode.USD } })`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api/typescript && bun test src/finance/repositories/OperationalCostRepository/DrizzleOperationalCostRepository.test.ts`
Expected: FAIL — shape mismatch.

- [ ] **Step 3: Update the entity**

Modify `packages/api/typescript/src/finance/entities/OperationalCost.ts`:

Replace the flat `amountCents` + `currency` fields in `OperationalCostSchema` with a single `amount: MonetaryAmountSchema.refine(m => m.amountCents > 0)`. Import `MonetaryAmountSchema` from `'../../../shared/objects'`. Remove `CurrencyCodeSchema` from imports (only if no longer used elsewhere in the file — `CurrencyCode` type is still used in `create()` / `update()` signatures so keep the type import).

In `create()`, accept `amount: { amountCents: number; currency: CurrencyCode }` and drop the flat `amountCents` / `currency` parameters. Thread `amount` through to the `new OperationalCost(...)` call.

In `update(patch)`, replace `amountCents?: number; currency?: CurrencyCode` with `amount?: { amountCents: number; currency: CurrencyCode }`. Update the internal mutation block to `this.amount = patch.amount` and push `'amount'` to `changed`.

- [ ] **Step 4: Update the Drizzle repository**

Modify `packages/api/typescript/src/finance/repositories/OperationalCostRepository/DrizzleOperationalCostRepository.ts`:

`toDomain`: change `GoalSchema.parse(...)` → pass `amount: { amountCents: Number(row.amountCents), currency: row.currency }` instead of the flat fields.

`toPersistence`: extract `entity.amount.amountCents` and `entity.amount.currency` into the flat columns.

The `onConflictDoUpdate` set remains `amountCents: data.amountCents, currency: data.currency` (column names unchanged).

- [ ] **Step 5: Update affected use cases**

Modify `packages/api/typescript/src/finance/usecases/CreateOperationalCost.ts`:

Replace `amountCents: z.number().int().positive(), currency: CurrencyCodeSchema` in `CreateOperationalCostInputSchema` with `amount: MonetaryAmountSchema.refine(m => m.amountCents > 0)`. Update `OperationalCost.create(...)` call to pass `amount: input.amount`. Update the domain event payload to use `amount`.

Modify `packages/api/typescript/src/finance/usecases/UpdateOperationalCost.ts`:

Replace `amountCents: z.number().int().positive().optional(), currency: CurrencyCodeSchema.optional()` with `amount: MonetaryAmountSchema.refine(m => m.amountCents > 0).optional()`. Update `entity.update(...)` call.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/api/typescript && bun test src/finance/`
Expected: PASS — all OperationalCost repository and use-case tests green.

- [ ] **Step 7: Type-check**

Run: `cd packages/api/typescript && bun tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/api/typescript/src/finance/
git commit -m "refactor(finance): OperationalCost embeds MonetaryAmount VO (SPEC-01 Task 3)"
```

---

## Task 4: Remaining entity/object files replace local schema; readmodel `MonetaryAmount.ts` deleted

**Files:**
- Modify: `packages/api/typescript/src/sales/objects/OrderOverrideFields.ts`
- Modify: `packages/api/typescript/src/marketing/entities/AdSpend.ts`
- Modify: `packages/api/typescript/src/catalog/entities/ProductCost.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/objects/MonetaryAmount.ts`
- Modify: `packages/api/typescript/src/sales/readmodels/objects/index.ts`
- Modify: `packages/api/typescript/src/sales/readmodels/OrderReadModel.ts`
- Modify: `packages/api/typescript/src/sales/readmodels/OrderLineReadModel.ts`
- Modify: `packages/api/typescript/src/sales/readmodels/OrderTransactionReadModel.ts`
- Modify: `packages/api/typescript/src/catalog/readmodels/ProductVariantReadModel.ts`
- Modify: `packages/api/typescript/src/shared/objects/MonetaryAmount.test.ts` (absorb the deleted `objects.test.ts` cases)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object, /schema
**Depends on:** 1

- [ ] **Step 1: Replace local schema in `OrderOverrideFields.ts`**

In `packages/api/typescript/src/sales/objects/OrderOverrideFields.ts`:

```diff
-import { z } from '@template/core-typescript'
+import { z } from '@template/core-typescript'
+import { MonetaryAmountSchema } from '../../../shared/objects'
 import Z from 'zod'
 import { PaymentStatusSchema, PaymentMethodSchema, CurrencyCodeSchema } from '@template/contracts-typescript/wire'
-
-export const MonetaryAmountSchema = z.object({
-  amountCents: z.number().int().nonnegative(),
-  currency: CurrencyCodeSchema,
-})
```

Remove the `CurrencyCodeSchema` import if it was only used for the deleted local schema (check: `PaymentStatusSchema, PaymentMethodSchema, CurrencyCodeSchema` — `CurrencyCodeSchema` is no longer needed; `PaymentStatusSchema` and `PaymentMethodSchema` remain). All usages of `MonetaryAmountSchema` within the file now reference the imported one.

- [ ] **Step 2: Replace local schema in `AdSpend.ts`**

In `packages/api/typescript/src/marketing/entities/AdSpend.ts`:

```diff
+import { MonetaryAmountSchema } from '../../../shared/objects'
 import {
   MarketingPlatform, MarketingPlatformSchema, AdSpendType, AdSpendTypeSchema, AdSpendGroupBy, AdSpendGroupBySchema,
-  type CurrencyCode, CurrencyCodeSchema,
+  type CurrencyCode, CurrencyCodeSchema,
 } from '../enums'
-
-export const MonetaryAmountSchema = z.object({
-  amountCents: z.number().int().min(0),
-  currency: CurrencyCodeSchema,
-})
```

`CurrencyCodeSchema` is still needed for the `currency` field in `AdSpendSchema` itself — keep it. Remove only the `MonetaryAmountSchema` local declaration. All remaining `MonetaryAmountSchema` usages in the file (the `spend` field) now resolve to the import.

- [ ] **Step 3: Replace local schema in `ProductCost.ts`**

In `packages/api/typescript/src/catalog/entities/ProductCost.ts`:

```diff
+import { MonetaryAmountSchema } from '../../../shared/objects'
 import { ProductCostTypeSchema, QuantityModifierSchema, CurrencyCodeSchema } from '@template/contracts-typescript/wire/enums'
-
-export const MonetaryAmountSchema = z.object({
-  amountCents: z.number().int().nonnegative(),
-  currency: CurrencyCodeSchema,
-})
```

All remaining `MonetaryAmountSchema` usages in `ProductCost.ts` (the `unitCost`, `shipping` fields and input schemas) now resolve to the import. `CurrencyCodeSchema` is still used in `ProductCostOptionSchema.currency` — keep it.

- [ ] **Step 4: Delete sales readmodel `MonetaryAmount.ts` and re-point importers**

Delete `packages/api/typescript/src/sales/readmodels/objects/MonetaryAmount.ts`.

Modify `packages/api/typescript/src/sales/readmodels/objects/index.ts`:
```diff
-export { MonetaryAmountSchema } from './MonetaryAmount'
+export { MonetaryAmountSchema } from '../../../../shared/objects'
```

This keeps the barrel working so `OrderReadModel.ts`, `OrderLineReadModel.ts`, `OrderTransactionReadModel.ts` (which import from `'./objects'`) continue to compile without touching their import lines.

Modify `packages/api/typescript/src/catalog/readmodels/ProductVariantReadModel.ts`:
```diff
-import { MonetaryAmountSchema } from '../../sales/readmodels/objects'
+import { MonetaryAmountSchema } from '../../shared/objects'
```

- [ ] **Step 5: Migrate the deleted test to the shared VO test file**

The existing `src/sales/readmodels/objects/objects.test.ts` tests the (now-deleted) local `MonetaryAmountSchema`. Move its cases into `src/shared/objects/MonetaryAmount.test.ts` (they're already covered structurally in Task 1's test, but confirm the negative-amount case is explicitly present since the sales readmodel previously allowed negatives and the shared VO does not). Delete `src/sales/readmodels/objects/objects.test.ts`.

Verify `MonetaryAmountSchema.parse({ amountCents: -500, currency: CurrencyCode.BRL })` now throws (the sales readmodel allowed negatives; the shared VO enforces `nonnegative`). Add this as a named test case in `MonetaryAmount.test.ts` if not already present.

- [ ] **Step 6: Run all affected tests**

Run: `cd packages/api/typescript && bun test src/shared/ src/sales/ src/marketing/ src/catalog/`
Expected: PASS — all tests green. Confirm `objects.test.ts` is gone and `MonetaryAmount.test.ts` covers its cases.

- [ ] **Step 7: Type-check**

Run: `cd packages/api/typescript && bun tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git rm packages/api/typescript/src/sales/readmodels/objects/MonetaryAmount.ts \
        packages/api/typescript/src/sales/readmodels/objects/objects.test.ts
git add packages/api/typescript/src/sales/objects/OrderOverrideFields.ts \
        packages/api/typescript/src/marketing/entities/AdSpend.ts \
        packages/api/typescript/src/catalog/entities/ProductCost.ts \
        packages/api/typescript/src/sales/readmodels/objects/index.ts \
        packages/api/typescript/src/catalog/readmodels/ProductVariantReadModel.ts \
        packages/api/typescript/src/shared/objects/MonetaryAmount.test.ts
git commit -m "refactor(sales,marketing,catalog): replace local MonetaryAmountSchema with shared VO; delete readmodel duplicate (SPEC-01 Task 4)"
```

---

## Task 5: Controllers adjusted to the new entity input shape

> **Scope note:** Controllers for Goal and OperationalCost receive `targetAmount` / `amount` in the request body and pass them through to use-case inputs. This task verifies that no controller still references the flat `targetAmountCents`/`currency` parameters removed from the use-case input schemas in Tasks 2–3, and updates any that do.

**Files:**
- Modify: `packages/api/typescript/src/analytics/controllers/CreateGoalController.ts` (if it references flat fields)
- Modify: `packages/api/typescript/src/analytics/controllers/UpdateGoalController.ts` (if it references flat fields)
- Modify: `packages/api/typescript/src/finance/controllers/CreateOperationalCostController.ts` (if it references flat fields)
- Modify: `packages/api/typescript/src/finance/controllers/UpdateOperationalCostController.ts` (if it references flat fields)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller
**Depends on:** 2, 3

- [ ] **Step 1: Inspect controllers for stale flat field references**

Read each of the four controller files. Controllers that declare their own `InputSchema` (wrapping the use-case schema) may independently specify `targetAmountCents` / `currency` / `amountCents` fields. Any that do must be updated to match the new `targetAmount` / `amount` nested shape.

Controllers that simply forward the parsed body to the use case without re-declaring those fields are already correct.

- [ ] **Step 2: Update controllers that still declare flat fields**

For each controller that independently declares `targetAmountCents: z.number().int().positive()` + `currency: CurrencyCodeSchema` (or `amountCents: ...`), replace those lines with:

```ts
import { MonetaryAmountSchema } from '../../../shared/objects'
// ...
targetAmount: MonetaryAmountSchema.input(),
// or:
amount: MonetaryAmountSchema
```

- [ ] **Step 3: Run test + type-check**

Run: `cd packages/api/typescript && bun test src/analytics/controllers/ src/finance/controllers/`
Run: `cd packages/api/typescript && bun tsc --noEmit`
Expected: PASS / 0 errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/typescript/src/analytics/controllers/ \
        packages/api/typescript/src/finance/controllers/
git commit -m "refactor(analytics,finance): controllers use nested MonetaryAmount input (SPEC-01 Task 5)"
```

---

## Task 6: Full acceptance gate — no duplicate schema, all tests green, tsc clean

**Files:**
- (no new files — verification only)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none)
**Depends on:** 4, 5

- [ ] **Step 1: Grep confirms zero duplicate definitions**

Run:
```bash
grep -rn "^export const MonetaryAmountSchema" packages/api/typescript/src/
```
Expected: exactly **one** hit — `src/shared/objects/MonetaryAmount.ts`.

- [ ] **Step 2: Run the full test suite**

Run: `cd packages/api/typescript && bun run test`
Expected: all tests pass (no skips from missing test-DB are acceptable — they pass when `DATABASE_URL` is set, or skip cleanly).

- [ ] **Step 3: Full tsc**

Run: `cd packages/api/typescript && bun tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Mark spec done**

In `.specs/2026-05-25-refactor-batch-2/SPEC-01-monetary-amount-vo.md`, set `**Status:** done`.

In `.specs/2026-05-25-refactor-batch-2/README.md`, tick the `01` row in the status table.

- [ ] **Step 5: Commit**

```bash
git add .specs/2026-05-25-refactor-batch-2/SPEC-01-monetary-amount-vo.md \
        .specs/2026-05-25-refactor-batch-2/README.md
git commit -m "chore(spec): mark SPEC-01 done (SPEC-01 Task 6)"
```
