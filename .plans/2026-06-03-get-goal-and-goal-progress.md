# Plan — `GetGoal` + `GetGoalProgress` (analytics context)

**Date:** 2026-06-03 · **Branch:** `feat/bk-dash-polyglot` · Status: **DESIGN LOCKED (grilled) — build not started.**

Dashboard-page read #4 (after `GetDashboard`, `GetPixelFunnel`, `ListQuickProductRanking`). Refactors the spec's single
`GetCurrentGoal` into **two** endpoints. Designed against `.specs/frontend-screens/SPEC.md` (`GoalSection`) over the
existing real `Goal` aggregate. Grilled via `grill-with-docs`.

> The `Goal` aggregate is **real/persisted** (analytics: `entities/Goal.ts`, `GoalRepository`,
> Create/Update/Delete/DuplicateLast). So **goals are read for real**; only the *actual* revenue/profit compared in
> `GetGoalProgress` is faker for now (mirrors the faker dashboard).

`Goal` shape: `{ storeId, type: GoalType (REVENUE|PROFIT), targetAmount: MonetaryAmount, from, to }`.

---

## 1. `GetGoal` — the current goal entity (simple)

- **Real** Query use case in **`analytics`**, over `GoalRepository`.
- Returns the **current active** goal for **`ctx.session.storeId`** — the goal whose window contains now
  (`from ≤ now ≤ to`); `null` if none. **No `id` param, no `tenancyScope`** (per-store, mono-currency).
- New repo method: `findActiveByStoreId(storeId, at: Date): Promise<Goal | undefined>`.

```ts
export const GetGoalInputSchema = z.object({ storeId: z.uuid() })   // ← ctx.session.storeId
export const GetGoalOutputSchema = z.object({
  goal: z.object({
    id: z.uuid(), storeId: z.uuid(), type: z.enum(GoalType),
    targetAmount: MonetaryAmountSchema,        // { amountCents, currency }
    from: z.date(), to: z.date(),
  }).nullable(),
})
// controller: GET → ctx only (no body/query); storeId from ctx.session.storeId; user dropped from ctx.
```

---

## 2. `GetGoalProgress` — prorated goal vs actuals

**Real goals + faker actuals**, Query use case in **`analytics`**. `tenancyScope` **input-only** (selects the store
set; output shape identical).

### Algorithm
```
1. store set:  SINGLE → [ctx.session.storeId]   |   MULTI → ctx.membership.storeIds
2. goals = GoalRepository.listIntersecting(storeIds, startDate, endDate)   // [from,to] ∩ [startDate,endDate] ≠ ∅
3. per goal, prorate to the window (OVERLAPPING SLICE — no averaging):
     dailyTarget   = goal.targetAmount / days(goal.from .. goal.to)
     sliceTarget   = dailyTarget × days(overlap of goal window ∩ [startDate,endDate])
4. group by goal.type (REVENUE / PROFIT):
     type.target   = Σ sliceTarget over that type's goals
     type.achieved = faker actual revenue (REVENUE) / profit (PROFIT) for [startDate,endDate]
     type.stores[] = per composing store: { storeId, storeName, target=its slice, achieved=its faker actual }
5. progress = achieved / target  → DERIVED FRONTEND-SIDE (not returned)
```
- **Money = plain normalized `number`** everywhere (MULTI crosses currencies; faker normalizes to a display number).
- **`storeName`** looked up from the tenancy store record (faker names for now; real lookup later).
- New repo method: `listIntersecting(storeIds: string[], from: Date, to: Date): Promise<Goal[]>`.

### Output
```ts
export const GoalStoreProgressSchema = z.object({
  storeId: z.uuid(), storeName: z.string(),
  target: z.number(), achieved: z.number(),
})
export const GoalTypeProgressSchema = z.object({
  target: z.number(), achieved: z.number(),
  stores: z.array(GoalStoreProgressSchema),     // which stores compose this type (name + target + achieved)
})
export const GetGoalProgressOutputSchema = z.object({
  byType: z.record(z.enum(GoalType), GoalTypeProgressSchema),   // only intersecting types present (REVENUE and/or PROFIT)
})
```

### Inputs
```ts
export const GetGoalProgressInputSchema = z.object({
  tenancyScope: z.enum(TenancyScope),
  storeId:  z.uuid(),               // ← ctx.session.storeId      (SINGLE_STORE)
  storeIds: z.array(z.uuid()),      // ← ctx.membership.storeIds  (MULTI_STORE)
  startDate: z.date(),
  endDate:   z.date(),
})
// controller query = .omit({storeId,storeIds,startDate,endDate}).extend({ startDate: stringToDate, endDate: stringToDate })
// ctx = { session:{storeId}, membership:{storeIds} } ; NO productIds (goals aren't product-scoped)
```

---

## 3. Build order
1. **Repo methods** on `GoalRepository` (+ Drizzle + Mock): `findActiveByStoreId(storeId, at)`,
   `listIntersecting(storeIds, from, to)` (+ repo tests).
2. **`GetGoal`** use case + controller + barrels; register in `analytics/registry.ts` + router.
3. **`GetGoalProgress`** use case (real goals via repo; faker actuals + faker store names; proration) + controller.
   Store-name source: inject a tenancy store read (`StoreQueryService`/repo) or faker for now.
4. Use-case tests: active-now selection (`GetGoal`); proration slice math + per-type grouping + per-store composition +
   SINGLE/MULTI store-set (`GetGoalProgress`).
5. `bun sdk`; repo `tsc` + `bun test` + `bun lint`; commit (`export PATH="$HOME/.bun/bin:$PATH"`).

## 4. Real-swap path (later)
`GetGoalProgress` actuals: replace faker revenue/profit with the real sales aggregation (the same source the real
`GetDashboard` will use) per store over `[startDate,endDate]`, then normalize to a display number. Goals + proration are
already real. No contract change. Store names become a real tenancy lookup.

## 5. Depends on / shared
- `Goal` aggregate + `GoalRepository` (analytics, existing).
- `TenancyScope` wire enum (shared with the dashboard/funnel/ranking slices) — `GetGoalProgress` only.
- A tenancy store-name read (for `GetGoalProgress.stores[].storeName`).
