# Plan — `ListQuickProductRanking` controller (ui context)

**Date:** 2026-06-03 · **Branch:** `feat/bk-dash-polyglot` · Status: **DESIGN LOCKED (grilled) — build not started.**

Dashboard-page read #3 (after `GetDashboard`, `GetPixelFunnel`). Designed against `.specs/frontend-screens/SPEC.md`
(`RankingSection` / `RankingProductRow`) + `_schema-fundamentals.md`. Grilled via `grill-with-docs`.

---

## 1. Decisions locked (grill outcomes)

1. **Faker Query use case in the `ui` context** — cross-context aggregate (catalog `name`/`imageUrl` + sales
   `units`/`revenue`); same home as `GetDashboard`. Real swap later behind the same interface.
2. **`tenancyScope` is input-only** — selects the store set (`SINGLE_STORE` = `[ctx.session.storeId]`, `MULTI_STORE` =
   `ctx.membership.storeIds`); summed across them. Output shape **does not change** with scope (no discrimination).
3. **Top 10, flat — NOT paginated.** This is the dashboard *preview*; the full pageable ranking belongs to the
   `/app/products` screen (the "Ver Tudo" link). No `limit`/pagination param — fixed top 10.
4. **Ranked by `revenue` desc** (fixed, not configurable).
5. **Each item `sales: TallySchema`** — units sold (**count**) + revenue (**money**), each with `deltaPct`. (Textbook
   `Tally`: a count *and* a separate money value. See [[composition-first-discriminated-bff-outputs]].)
6. **`totalProducts: z.number()`** — the header count; a plain number, **no delta** (it's not a Metric).
7. **No explicit `rank` field** — frontend derives position from array index.
8. Inputs: `tenancyScope` + date range **required** + **`productIds` optional filter** (query, `stringToArray(uuid)`;
   absent = all products) — restricts the ranking to the selected products.

---

## 2. Output schema

```ts
// src/ui/usecases/ListQuickProductRanking.ts
import { TallySchema } from '@shared/schemas'

export const QuickProductRankingItemSchema = z.object({
  productId: z.uuid(),
  name: z.string(),
  imageUrl: z.url().nullable(),
  sales: TallySchema,            // count = units sold (+ deltaPct), value = revenue (+ deltaPct)
})

export const ListQuickProductRankingOutputSchema = z.object({
  totalProducts: z.number(),                          // header count (simple number, no delta)
  items: z.array(QuickProductRankingItemSchema),      // top 10, revenue desc
})
```

## 3. Inputs (controller composes from use-case input)

```ts
export const ListQuickProductRankingInputSchema = z.object({
  tenancyScope: z.enum(TenancyScope),
  storeId:  z.uuid(),               // ← ctx.session.storeId      (SINGLE_STORE)
  storeIds: z.array(z.uuid()),      // ← ctx.membership.storeIds  (MULTI_STORE)
  startDate: z.date(),
  endDate:   z.date(),
  productIds: z.array(z.uuid()).optional(),   // absent = all products
})

// src/ui/controllers/ListQuickProductRanking.ts (GET → query)
inputSchema = z.object({
  ctx: z.object({
    session:    z.object({ storeId: z.uuid() }),
    membership: z.object({ storeIds: z.array(z.uuid()) }),
  }),
  query: ListQuickProductRankingInputSchema
    .omit({ storeId: true, storeIds: true, startDate: true, endDate: true, productIds: true })
    .extend({
      startDate: z.stringToDate(),
      endDate: z.stringToDate(),
      productIds: z.stringToArray(z.uuid()).optional(),
    }),
})
outputSchema = ListQuickProductRankingOutputSchema
```
- Handler: `storeIds = tenancyScope === MULTI_STORE ? ctx.membership.storeIds : [ctx.session.storeId]`; faker returns
  10 deterministic items (seed by `storeIds` + date range) ranked by `revenue` desc + a faked `totalProducts`.
- `user` dropped from ctx (handler never reads it); auth middlewares still run.

## 4. Build order
1. **`TenancyScope` wire enum** + `TallySchema` (`@shared/schemas`) must exist (shared with the dashboard/funnel
   slices — build those atoms first or introduce here).
2. **Use case** `src/ui/usecases/ListQuickProductRanking.ts` (faker).
3. **Controller** + barrels; register in `ui/registry.ts` + router (the reintroduced `ui` context from the dashboard
   slice — depends on that context existing).
4. Use-case test: SINGLE vs MULTI store-set selection; 10 items, revenue-desc; shape valid.
5. `bun sdk`; repo `tsc` + `bun test` + `bun lint`; commit (`export PATH="$HOME/.bun/bin:$PATH"`).

## 5. Real-swap path (later)
Replace faker with a cross-context aggregation (sales `OrderQueryService` for units/revenue per product over the period
+ prior period for deltas, joined to catalog `ProductQueryService` for `name`/`imageUrl`), ordered by revenue, top 10,
plus a `count(distinct product)` for `totalProducts`. No contract change.

## 6. Depends on / shared
- `ui` context (reintroduced in the dashboard slice).
- `TenancyScope` wire enum + `TallySchema` (`@shared/schemas`), shared with `GetDashboard` + `GetPixelFunnel`.
