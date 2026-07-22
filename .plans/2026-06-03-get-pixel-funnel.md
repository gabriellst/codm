# Plan — `GetPixelFunnel` controller (tracking context)

**Date:** 2026-06-03 · **Branch:** `feat/bk-dash-polyglot` · Status: **DESIGN LOCKED (grilled) — build not started.**

Dashboard-page read #2 (after `GetDashboard`, see `.plans/2026-06-03-get-dashboard-and-ui-context.md`). Designed against
`.specs/frontend-screens/SPEC.md` (`FunnelSection` + `GetFunnelOutputSchema`) + `_schema-fundamentals.md`. Grilled via
`grill-with-docs`. Minimal divergence from spec, with deltas added.

---

## 1. Decisions locked (grill outcomes)

1. **Faker-backed** Query use case **in the `tracking` context** (not `ui`) — the pixel domain already lives there
   (`GetPixelScriptSnippet`, `PixelEventReadRepository`). Faker now; the **real swap is in-place**: the use case body
   later calls the existing `PixelEventReadRepository.aggregateFunnelStages(...)` behind the same interface.
2. **`tenancyScope` is input-only** — it selects the **store set** to query (`SINGLE_STORE` = `[ctx.session.storeId]`,
   `MULTI_STORE` = `ctx.membership.storeIds`); the output is a **single flat funnel summed across them**. **No
   discriminated union, no `perStore`** (funnel is pure counts — no money/scope shape change).
3. **Steps, base, conversionRate = `MetricSchema`** (single quantities + delta). **`carts` = `TallySchema`** (the one
   count+money field: abandoned-cart count *and* abandoned value).
4. **Steps measured as unique sessions** — one number per stage (`MetricSchema`); the displayed "183 de 2.542" *rate*
   is derived frontend-side (`step.value / base`), not stored.
5. **Deltas everywhere** (each `Metric`/`Tally` leaf has `deltaPct`) — added vs the spec's plain shape; faker fakes them
   (the real impl will compute via a prior-period `aggregateFunnelStages` call).
6. `carts` = **abandoned** carts (added-to-cart − checkout-completed). `hasPixel` faker default **`true`** (shape still
   supports the `false` empty-state → `PixelInstallCta`).
7. Inputs: `tenancyScope` (query) + date range **required** (query, `stringToDate`) + **`productIds` optional filter**
   (query, `stringToArray(uuid)`; absent = all products) — filters the funnel to pixel events for those products.

### MetricSchema vs TallySchema rule (recorded for reuse)
- **`MetricSchema`** = *one* quantity + delta (count **or** rate **or** money — unit is contextual).
- **`TallySchema`** = a **count** *and* a separate **monetary value**, each with delta. Use only when both exist
  (orders; abandoned carts). A bare count is already a `Metric`. A count + a *derived rate* is still one stored `Metric`.

### Divergences from spec (intentional, minimal)
- Spec output is `{ hasPixel, base, steps:{count,rate} }`. We: make leaves `Metric`/`Tally` (deltas), drop stored
  `rate` (derived FE), add `conversionRate` + `carts` (the two `FunnelHighlightCard`s, which carry deltas the FE can't
  compute itself).

---

## 2. Output schema

```ts
// src/tracking/usecases/GetPixelFunnel.ts
import { MetricSchema, TallySchema } from '@shared/schemas'   // shared read vocab (from the dashboard slice)
import { PixelEventType } from '@template/contracts-typescript/wire/enums'

export const GetPixelFunnelOutputSchema = z.object({
  hasPixel: z.boolean(),
  base: MetricSchema,                                     // PAGE_VIEWED unique sessions (+ deltaPct)
  steps: z.record(z.enum(PixelEventType), MetricSchema),  // per stage: value = unique sessions, deltaPct = delta
                                                          //   rate derived frontend-side (value / base)
  conversionRate: MetricSchema,                           // CHECKOUT_COMPLETED / base — a rate (+ delta)
  carts: TallySchema,                                     // abandoned carts: { count: Metric, value: Metric } (+ deltas)
})
```
> `base` is kept explicit as the funnel denominator even though it equals `steps[PAGE_VIEWED]` (convenience).
> Faker note: `carts.value` is a single normalized `Metric` (no multi-currency split — `tenancyScope` never changes the
> output shape; cross-currency summation is a real-impl concern, parked).

## 3. Inputs (controller composes from use-case input)

```ts
export const GetPixelFunnelInputSchema = z.object({
  tenancyScope: z.enum(TenancyScope),
  storeId:  z.uuid(),               // ← ctx.session.storeId      (SINGLE_STORE)
  storeIds: z.array(z.uuid()),      // ← ctx.membership.storeIds  (MULTI_STORE)
  startDate: z.date(),
  endDate:   z.date(),
  productIds: z.array(z.uuid()).optional(),   // absent = all products
})

// src/tracking/controllers/GetPixelFunnel.ts (GET → query)
inputSchema = z.object({
  ctx: z.object({
    session:    z.object({ storeId: z.uuid() }),
    membership: z.object({ storeIds: z.array(z.uuid()) }),
  }),
  query: GetPixelFunnelInputSchema
    .omit({ storeId: true, storeIds: true, startDate: true, endDate: true, productIds: true })
    .extend({
      startDate: z.stringToDate(),
      endDate: z.stringToDate(),
      productIds: z.stringToArray(z.uuid()).optional(),
    }),
})
outputSchema = GetPixelFunnelOutputSchema
```
- Handler: `storeIds = tenancyScope === MULTI_STORE ? ctx.membership.storeIds : [ctx.session.storeId]`; pass date range;
  use case returns the faker funnel. `user` dropped from ctx (handler never reads it); auth middlewares still run.
- `hasPixel`: faker `true`; real impl derives it from whether the (any) selected store has a pixel-supported
  (Shopify `SALES_CHANNEL`) integration — reuse `GetPixelScriptSnippet`'s integration lookup.

## 4. Build order
1. **`TenancyScope` wire enum** must exist (shared with the dashboard slice — build that first, or add the enum here).
2. **Use case** `src/tracking/usecases/GetPixelFunnel.ts` (faker; deterministic seed by `storeIds`+date range).
3. **Controller** `src/tracking/controllers/GetPixelFunnel.ts` + barrels; register in `tracking/registry.ts` + router.
4. Use-case test: SINGLE vs MULTI selects the right store set; output shape valid; `hasPixel=false` empty-state path.
5. `bun sdk`; repo `tsc` + `bun test` + `bun lint`; commit. (`export PATH="$HOME/.bun/bin:$PATH"` before commit.)

## 5. Real-swap path (later, not now)
Replace the faker body with two `PixelEventReadRepository.aggregateFunnelStages({ storeIds, from, to })` calls (current +
prior period) → map `PixelFunnelStage[]` (`{ type, count, uniqueSessions }`) into `steps` (uniqueSessions) + compute
`base`, `conversionRate`, `carts`, and the `deltaPct`s from the period-over-period diff. No **contract** change.
> ⚠ The real swap **will** require a repo change: `PixelFunnelQuery` (`{ storeIds, storeIntegrationIds?, from, to }`) has
> **no `productIds`** field — extend it (the repo doc already anticipates "future per-product attribution") so the
> `productIds` filter reaches the `pixel_events` aggregation. Faker just filters its generated set by `productIds`.

## 6. Depends on / shared
- Reuses `MetricSchema` + `TallySchema` from `@shared/schemas` (introduced in the dashboard slice). If the funnel is
  built first, introduce those two atoms there as part of this slice.
- `TenancyScope` wire enum (shared with `GetDashboard`).
