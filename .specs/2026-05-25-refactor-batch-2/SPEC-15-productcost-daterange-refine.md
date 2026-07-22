# SPEC-15: `ProductCost` date-range validation moves into the schema `.refine()`

**Wave:** 6   **Stream:** B   **Depends on:** (none)   **Status:** done

## Motivation

`ProductCost` validates its option date range with a free function called manually in two places:

```ts
// src/catalog/entities/ProductCost.ts:80-84
function validateDateRange(opt: ProductCostOptionInput): void {
  if (opt.endDate !== undefined && opt.startDate > opt.endDate) {
    throw new BaseError<CatalogDomainErrors>('INVALID_DATE_RANGE')
  }
}
// called in a loop inside .create() (:112) and .update() (:155)
```

`BaseEntity.validate()` already runs `schema.safeParse(this)` and throws on failure (`core/src/entities/BaseEntity.ts:48-54`), and the canonical cross-field pattern is a schema-level `.refine()` (see `core/src/objects/Range.ts:6-11`). Moving the check into `ProductCostOptionSchema.refine(...)` makes it run automatically through `this.validate()` — no manual call, no chance of forgetting it on a new mutation path.

## Scope

1. Add a `.refine()` to the `ProductCostOption` schema enforcing `endDate === undefined || startDate <= endDate`, raising the `INVALID_DATE_RANGE` error code (use the `error` message convention from `Range.ts`).
2. Delete the standalone `validateDateRange` function and its manual calls in `.create()` and `.update()` — `this.validate()` now covers it.
3. Confirm `.create()` / `.update()` already call `this.validate()` (the BaseEntity path); if a path constructs without validating, route it through `validate()`.

## Affected files

- `src/catalog/entities/ProductCost.ts`

## Acceptance criteria

- [ ] The date-range invariant lives in `ProductCostOptionSchema.refine(...)`; the free `validateDateRange` function and its manual call sites are gone (grep `validateDateRange` → zero).
- [ ] Creating/updating a ProductCost with `startDate > endDate` throws `INVALID_DATE_RANGE` via schema validation (entity test asserts the code).
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- AdSpend's analogous inline date check — handled in SPEC-16.
- Changing the date storage type or the `ProductCost` options structure.
- The `MonetaryAmount` swap (SPEC-01) — orthogonal; if both touch ProductCost, sequence by wave (01 is Wave 1).

## Notes

- `Range.ts` is the reference: `.refine(data => data.from <= data.to, { error: 'INVALID_RANGE' })`.
- `BaseEntity.validate()` runs `schema.safeParse(this)` and `Object.assign(this, result.data)` — a schema refine fires on every validated construct/mutate, which is the whole point.
- If options are an array, put the refine on the per-option schema so each element is checked.
