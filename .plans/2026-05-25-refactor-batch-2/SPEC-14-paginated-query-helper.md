# SPEC-14: Migrate paginated controllers to `z.paginatedQuery` — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Replace hand-rolled `page`/`limit` inline schemas across 9 list controllers with `z.paginatedQuery({ ...domainFilters })`, standardize coercion to the helper's `stringToInteger` base, and regenerate the SDK so frontend list hooks reflect consistent pagination shapes.

**Architecture:** Three atomic commits: (1) migrate catalog + sales controllers (4 files); (2) migrate marketing + finance + analytics controllers (5 files); (3) regen SDK. No DB changes, no migration. The `z.paginatedQuery` helper (`core/src/utils/schema/ExtraTypes.ts:59-96`) is already exposed on the augmented `z` object — controllers import from `@template/core-typescript` as today. The helper's base has `max(100)`, so two controllers (`GetAdSpendBreakdownController`, `GetFxRatesController`) that used `max(500)` are noted explicitly and standardized down to 100 (the spec authorizes this).

**Tech Stack:** TypeScript + Bun + Zod. No migration, no new files, no DI changes. SDK regen via `bun sdk`.

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-14-paginated-query-helper.md`
**Tasks:** 3
**Estimated minutes:** 55

> **Planner note — coercion seam.** The helper's `page`/`limit` use `stringToInteger` (a `.transform()` that coerces query-string input to integers). Controllers already receive parsed request objects by the time `handle()` runs — the coercion happens at schema-parse time in the framework layer. Dropping `z.coerce.number()` in favor of the helper's `stringToInteger` is safe and correct: the runtime path is identical, but the generated OpenAPI now marks these params as `integer` (not `number`) consistently. Use-case `execute()` calls already consume `request.page` and `request.limit` as numbers — no use-case changes needed.

> **Planner note — `GetProductCostsListController` uses `POST` with a body.** `storeIntegrationIds` is an array field passed in the POST body together with `page`/`limit`. Spreading `z.paginatedQuery({...})` into a flat `z.object({...})` is correct here — the helper produces a `ZodObject` whose `.shape` is spread. Since the controller schema is already a flat object (not nested under `body:`), the spread pattern `{ ...z.paginatedQuery({ ... }).shape }` or calling `z.paginatedQuery({ storeIntegrationIds: ... })` directly both work; prefer the direct call `z.paginatedQuery({ ...domainFilters })` for consistency with GET controllers, making the entire schema the result of `paginatedQuery(...)`.

> **Planner note — `limit` deviation.** `GetAdSpendBreakdownController` (was `max(500)`, default 100) and `GetFxRatesController` (was `max(500)`, default 100) are standardized to `max(100)` per the helper default. `GetCampaignsListController`, `GetProductCostsListController`, `GetOperationalCostsListController`, `GetAbandonedCartsListController`, `GetProductPerformanceReportController`, `GetOrdersListController` — all used `max(200)`, default 50 — also standardized to `max(100)`, default 10 (helper's defaults). These were arbitrary limits with no documented business reason; standardizing is explicitly authorized by the spec (§ Scope bullet 2). This is noted in the PR commit message.

> **Planner note — `search` field.** Two controllers already had an inline `search: z.string().optional()` (`GetProductsListController`, `GetOrdersListController`). The helper already includes `search` — so after migration, the `search` field is no longer declared separately; it comes from the helper base. No behavior change.

---

## Task 1: Migrate catalog + sales controllers (4 files)

**Files:**
- Modify: `packages/api/typescript/src/catalog/controllers/GetProductsListController.ts`
- Modify: `packages/api/typescript/src/catalog/controllers/GetProductCostsListController.ts`
- Modify: `packages/api/typescript/src/sales/controllers/GetOrdersListController.ts`
- Modify: `packages/api/typescript/src/sales/controllers/GetAbandonedCartsListController.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /schema
**Depends on:** (none)

- [ ] **Step 1: Verify current inline state (RED anchor)**

```bash
grep -n "page: z\." \
  packages/api/typescript/src/catalog/controllers/GetProductsListController.ts \
  packages/api/typescript/src/catalog/controllers/GetProductCostsListController.ts \
  packages/api/typescript/src/sales/controllers/GetOrdersListController.ts \
  packages/api/typescript/src/sales/controllers/GetAbandonedCartsListController.ts
```

Expected: 4 matches (one `page: z.` per file). This is the RED state we are eliminating.

- [ ] **Step 2: Migrate `GetProductsListController.ts`**

Current inline (lines 9–12):
```ts
search: z.string().optional(),
status: z.string().optional(),
page: z.coerce.number().int().positive().default(1),
limit: z.coerce.number().int().positive().max(100).default(20),
```

Replace the entire `GetProductsListControllerInputSchema` with:

```ts
export const GetProductsListControllerInputSchema = z.paginatedQuery({
  ctx: z.object({ session: z.object({ userId: z.string() }) }),
  params: z.object({ storeId: z.uuid() }),
  status: z.string().optional(),
})
```

Note: `search` is now provided by the helper base (no longer declared inline). The field order in the output type changes slightly but the use-case call site `request.search` / `request.page` / `request.limit` remain identical.

- [ ] **Step 3: Migrate `GetProductCostsListController.ts`**

Current inline (lines 11–12):
```ts
page: z.number().int().min(1).default(1),
limit: z.number().int().min(1).max(200).default(50),
```

Replace the entire `GetProductCostsListControllerInputSchema` with:

```ts
export const GetProductCostsListControllerInputSchema = z.paginatedQuery({
  ctx: z.object({ session: z.object({ userId: z.string() }) }),
  params: z.object({ storeId: z.uuid() }),
  storeIntegrationIds: z.array(z.uuid()).optional(),
})
```

Note: `page`/`limit` come from the helper. Previous `max(200)` / `default(50)` → now `max(100)` / `default(10)` (standardized). No `search` was declared on this controller; the helper adds it as optional — acceptable, it simply goes unused.

- [ ] **Step 4: Migrate `GetOrdersListController.ts`**

Current inline (lines 15–17):
```ts
search: z.string().optional(),
page: z.number().int().min(1).default(1),
limit: z.number().int().min(1).max(200).default(50),
```

Replace the entire `GetOrdersListControllerInputSchema` with:

```ts
export const GetOrdersListControllerInputSchema = z.paginatedQuery({
  ctx: z.object({ session: z.object({ userId: z.string() }) }),
  params: z.object({ storeId: z.uuid() }),
  storeIntegrationIds: z.array(z.uuid()).optional(),
  paymentStatus: z.array(PaymentStatusSchema).optional(),
  from: z.date().optional(),
  to: z.date().optional(),
})
```

Note: `search` now comes from the helper. Previous `max(200)` / `default(50)` → `max(100)` / `default(10)`.

- [ ] **Step 5: Migrate `GetAbandonedCartsListController.ts`**

Current inline (lines 10–11):
```ts
page: z.number().int().min(1).default(1),
limit: z.number().int().min(1).max(200).default(50),
```

Replace the entire `GetAbandonedCartsListControllerInputSchema` with:

```ts
export const GetAbandonedCartsListControllerInputSchema = z.paginatedQuery({
  ctx: z.object({ session: z.object({ userId: z.string() }) }),
  params: z.object({ storeId: z.uuid() }),
})
```

Note: No domain filters on this controller. Previous `max(200)` / `default(50)` → `max(100)` / `default(10)`.

- [ ] **Step 6: Verify zero inline `page: z.` in migrated files (GREEN anchor)**

```bash
grep -n "page: z\." \
  packages/api/typescript/src/catalog/controllers/GetProductsListController.ts \
  packages/api/typescript/src/catalog/controllers/GetProductCostsListController.ts \
  packages/api/typescript/src/sales/controllers/GetOrdersListController.ts \
  packages/api/typescript/src/sales/controllers/GetAbandonedCartsListController.ts
```

Expected: zero matches.

- [ ] **Step 7: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors. The use-case `execute()` calls in each controller's `handle()` are unchanged — `request.page`, `request.limit`, `request.search` remain valid fields from the helper base.

- [ ] **Step 8: `bun run test` clean (TS API only)**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass. These controllers have no colocated unit tests; the type change is safe.

- [ ] **Step 9: Commit**

Use `/commit`:

```
refactor(catalog,sales): use z.paginatedQuery in list controllers (SPEC-14 Task 1)

Standardizes page/limit/search to the helper's stringToInteger coercion + max(100)
default(10). Drops redundant z.coerce and z.number inline declarations.
search field on GetProductsListController and GetOrdersListController now comes
from the helper base (no behavioral change).
```

Stage: all 4 modified controller files.

---

## Task 2: Migrate marketing + finance + analytics controllers (5 files)

**Files:**
- Modify: `packages/api/typescript/src/marketing/controllers/GetCampaignsListController.ts`
- Modify: `packages/api/typescript/src/marketing/controllers/GetAdSpendBreakdownController.ts`
- Modify: `packages/api/typescript/src/finance/controllers/GetFxRatesController.ts`
- Modify: `packages/api/typescript/src/finance/controllers/GetOperationalCostsListController.ts`
- Modify: `packages/api/typescript/src/analytics/controllers/GetProductPerformanceReportController.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /schema
**Depends on:** (none)

- [ ] **Step 1: Verify current inline state (RED anchor)**

```bash
grep -n "page: z\." \
  packages/api/typescript/src/marketing/controllers/GetCampaignsListController.ts \
  packages/api/typescript/src/marketing/controllers/GetAdSpendBreakdownController.ts \
  packages/api/typescript/src/finance/controllers/GetFxRatesController.ts \
  packages/api/typescript/src/finance/controllers/GetOperationalCostsListController.ts \
  packages/api/typescript/src/analytics/controllers/GetProductPerformanceReportController.ts
```

Expected: 5 matches.

- [ ] **Step 2: Migrate `GetCampaignsListController.ts`**

Current inline (lines 13–14):
```ts
page: z.number().int().min(1).default(1),
limit: z.number().int().min(1).max(200).default(50),
```

Replace the entire `GetCampaignsListControllerInputSchema` with:

```ts
export const GetCampaignsListControllerInputSchema = z.paginatedQuery({
  ctx: z.object({ session: z.object({ userId: z.string() }) }),
  params: z.object({ storeId: z.uuid() }),
  platform: MarketingPlatformSchema.optional(),
  status: CampaignStatusSchema.optional(),
})
```

Note: Previous `max(200)` / `default(50)` → `max(100)` / `default(10)`.

- [ ] **Step 3: Migrate `GetAdSpendBreakdownController.ts`**

Current inline (lines 15–16):
```ts
page: z.number().int().min(1).default(1),
limit: z.number().int().min(1).max(500).default(100),
```

Replace the entire `GetAdSpendBreakdownControllerInputSchema` with:

```ts
export const GetAdSpendBreakdownControllerInputSchema = z.paginatedQuery({
  ctx: z.object({ session: z.object({ userId: z.string() }) }),
  params: z.object({ storeId: z.uuid() }),
  storeIntegrationIds: z.array(z.uuid()).optional(),
  from: z.iso.date(),
  to: z.iso.date(),
  groupBy: AdSpendGroupBySchema,
})
```

Note: Previous `max(500)` / `default(100)` → `max(100)` / `default(10)`. The `max(500)` was arbitrary — standardized per spec § Scope bullet 2.

- [ ] **Step 4: Migrate `GetFxRatesController.ts`**

Current inline (lines 13–14):
```ts
page: z.number().int().min(1).default(1),
limit: z.number().int().min(1).max(500).default(100),
```

Replace the entire `GetFxRatesControllerInputSchema` with:

```ts
export const GetFxRatesControllerInputSchema = z.paginatedQuery({
  ctx: z.object({ session: z.object({ userId: z.string() }) }),
  fromCurrency: CurrencyCodeSchema.optional(),
  toCurrency: CurrencyCodeSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
```

Note: No `params` — this controller is store-agnostic (`path = '/fx-rates'`). Previous `max(500)` / `default(100)` → `max(100)` / `default(10)`. The `max(500)` was arbitrary — standardized.

- [ ] **Step 5: Migrate `GetOperationalCostsListController.ts`**

Current inline (lines 10–11):
```ts
page: z.number().int().min(1).default(1),
limit: z.number().int().min(1).max(200).default(50),
```

Replace the entire `GetOperationalCostsListControllerInputSchema` with:

```ts
export const GetOperationalCostsListControllerInputSchema = z.paginatedQuery({
  ctx: z.object({ session: z.object({ userId: z.string() }) }),
  params: z.object({ storeId: z.uuid() }),
})
```

Note: No domain filters. Previous `max(200)` / `default(50)` → `max(100)` / `default(10)`.

- [ ] **Step 6: Migrate `GetProductPerformanceReportController.ts`**

Current inline (lines 10–11):
```ts
page: z.number().int().min(1).default(1),
limit: z.number().int().min(1).max(200).default(50),
```

Replace the entire `GetProductPerformanceReportControllerInputSchema` with:

```ts
export const GetProductPerformanceReportControllerInputSchema = z.paginatedQuery({
  ctx: z.object({ session: z.object({ userId: z.string() }) }),
  storeIds: z.array(z.uuid()).min(1),
  from: z.iso.date(),
  to: z.iso.date(),
})
```

Note: No `params` — `storeIds` is the multi-store filter array. Previous `max(200)` / `default(50)` → `max(100)` / `default(10)`.

- [ ] **Step 7: Verify zero inline `page: z.` in migrated files (GREEN anchor)**

```bash
grep -n "page: z\." \
  packages/api/typescript/src/marketing/controllers/GetCampaignsListController.ts \
  packages/api/typescript/src/marketing/controllers/GetAdSpendBreakdownController.ts \
  packages/api/typescript/src/finance/controllers/GetFxRatesController.ts \
  packages/api/typescript/src/finance/controllers/GetOperationalCostsListController.ts \
  packages/api/typescript/src/analytics/controllers/GetProductPerformanceReportController.ts
```

Expected: zero matches.

- [ ] **Step 8: Acceptance criterion — global grep across all 9 controllers**

```bash
grep -rn "page: z\." \
  packages/api/typescript/src/catalog/controllers/GetProductsListController.ts \
  packages/api/typescript/src/catalog/controllers/GetProductCostsListController.ts \
  packages/api/typescript/src/marketing/controllers/GetCampaignsListController.ts \
  packages/api/typescript/src/marketing/controllers/GetAdSpendBreakdownController.ts \
  packages/api/typescript/src/sales/controllers/GetOrdersListController.ts \
  packages/api/typescript/src/sales/controllers/GetAbandonedCartsListController.ts \
  packages/api/typescript/src/finance/controllers/GetFxRatesController.ts \
  packages/api/typescript/src/finance/controllers/GetOperationalCostsListController.ts \
  packages/api/typescript/src/analytics/controllers/GetProductPerformanceReportController.ts
```

Expected: zero matches. This is the primary acceptance criterion from the spec.

- [ ] **Step 9: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 10: `bun run test` clean**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

Use `/commit`:

```
refactor(marketing,finance,analytics): use z.paginatedQuery in list controllers (SPEC-14 Task 2)

Standardizes page/limit across 5 remaining controllers. Notable: GetAdSpendBreakdown
and GetFxRates had max(500) — standardized to max(100) (no documented business reason
for the higher cap). All controllers now use the helper's stringToInteger coercion.
```

Stage: all 5 modified controller files.

---

## Task 3: SDK regen; frontend `tsc` stays green

**Files:**
- Regenerate: `packages/api/typescript/public/docs/openapi.json` (emitted by `bun emit-openapi`)
- Regenerate: `packages/client/` SDK (emitted by `bun sdk`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /sdk
**Depends on:** 1, 2

- [ ] **Step 1: Regenerate OpenAPI + SDK**

```bash
bun sdk
```

This runs `emit-openapi` (updating `packages/api/typescript/public/docs/openapi.json` to reflect the standardized pagination shapes) then Kubb regenerates the client hooks and Zod schemas.

Expected: the generated list-endpoint input schemas in `packages/client/dist/typescript/` now contain `page`, `limit`, `search` sourced from the helper — `z.number().int().gte(1).lte(100).default(10)` for `limit`, consistent across all 9 endpoints.

- [ ] **Step 2: Verify consistent pagination in generated SDK**

```bash
grep -A 5 "page\|limit" packages/api/typescript/public/docs/openapi.json | grep -E "maximum|default|minimum" | sort | uniq -c | sort -rn | head -20
```

Expected: `maximum: 100` and `default: 10` (for `limit`) appear consistently. No `maximum: 200`, `maximum: 500`, or `default: 50`/`default: 20`/`default: 100` remain for `limit` fields.

- [ ] **Step 3: Frontend `tsc` check**

```bash
cd packages/app/react && bun tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors. List hooks consume `limit` as `number` — the default value change (50→10, 100→10) only affects the schema default, not the TypeScript type. If any component hardcodes `.defaultValues({ limit: 50 })` against the SDK schema, it will still type-check (50 is still a valid `number`); the only behavioral change is the server-side default when the client omits `limit`.

```bash
cd packages/app/expo && bun tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors.

- [ ] **Step 4: Full API `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 5: Full test suite clean**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

Use `/commit`:

```
chore(sdk): regen after z.paginatedQuery migration (SPEC-14 Task 3)
```

Stage: `packages/api/typescript/public/docs/openapi.json`, all changed files under `packages/client/dist/`.

---

## Acceptance Criteria Coverage

| AC | Covered by |
|---|---|
| Every listed controller uses `z.paginatedQuery({...})`; none re-declares bare `page`/`limit` inline (grep `page: z.` → zero) | Task 1 Step 6, Task 2 Steps 7–8 |
| Pagination defaults/coercion consistent (helper's `stringToInteger` + defaults); limit deviation noted | Task 1 Step 9 commit message, Task 2 Step 11 commit message |
| `bun sdk` regenerated; frontend list hooks still type-check | Task 3 Steps 1–3 |
| `bun tsc` clean | Tasks 1 Step 7, 2 Step 9, 3 Step 4 |
| `bun run test` clean | Tasks 1 Step 8, 2 Step 10, 3 Step 5 |
