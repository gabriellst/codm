# SPEC-14: Migrate paginated controllers to `z.paginatedQuery`

**Wave:** 6   **Stream:** A   **Depends on:** (none)   **Status:** done

## Motivation

A `paginatedQuery` helper already exists (`core/src/utils/schema/ExtraTypes.ts:59-96`, exposed as `z.paginatedQuery`) — it standardizes `page` / `limit` / `search` with `stringToInteger` coercion and sane defaults, and accepts extra properties:

```ts
export function paginatedQuery<T extends ZodRawShape>(properties?, options?): ZodObject<...>
```

But ~9 list controllers hand-roll their pagination inline, inconsistently — `z.coerce.number()` vs `z.number().int()`, `max` ranging 100→500, default `limit` 10/20/50/100, and no `search`:

```ts
// GetProductsListController.ts:11-12
page: z.coerce.number().int().positive().default(1),
limit: z.coerce.number().int().positive().max(100).default(20),
```

## Scope

1. Replace each controller's inline `page` / `limit` (and `search`, where present) with `z.paginatedQuery({ ...domainFilters })`, passing only the controller-specific filter fields as the `properties` argument.
2. Where a controller needs a non-default `limit` ceiling, decide a standard: prefer the helper's default `max(100)`. If a specific controller genuinely needs more, extend via the helper's options rather than re-inlining — but flag any controller that truly needs >100 in the PR (most are arbitrary).
3. Ensure the query-side coercion (`stringToInteger`) matches how each use case reads `page`/`limit` (the helper coerces strings → ints; drop redundant `z.coerce` at call sites).

## Affected files

- `src/catalog/controllers/GetProductsListController.ts`, `GetProductCostsListController.ts`
- `src/marketing/controllers/GetCampaignsListController.ts`, `GetAdSpendBreakdownController.ts`
- `src/sales/controllers/GetOrdersListController.ts`, `GetAbandonedCartsListController.ts`
- `src/finance/controllers/GetFxRatesController.ts`, `GetOperationalCostsListController.ts`
- `src/analytics/controllers/GetProductPerformanceReportController.ts`
- Regenerate SDK (`bun sdk`) — query param shapes change

## Acceptance criteria

- [ ] Every listed controller uses `z.paginatedQuery({...})` for pagination; none re-declares bare `page`/`limit` inline (grep `page: z.` in those controllers → zero).
- [ ] Pagination defaults/coercion are consistent (the helper's `stringToInteger` + defaults); any intentional `limit` ceiling deviation is noted in the PR.
- [ ] `bun sdk` regenerated; frontend list hooks still type-check.
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- Cursor-based pagination (the helper is page/limit only; leave any cursor-paginated reads as-is).
- Changing the actual query/SQL behaviour beyond param parsing.
- Adding pagination to controllers that don't have it.

## Notes

- The helper is the single source for pagination shape — extend it (add `properties`) rather than re-inlining per controller.
- Watch the coercion seam: the helper expects query strings and coerces; if a use case already did `Number(page)`, drop the redundant coercion.
