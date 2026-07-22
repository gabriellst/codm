# SPEC-13: Entity hydration via `schema.parse`, not field-by-field

**Wave:** 2   **Depends on:** Wave 1 complete   **Status:** done

## Motivation

Drizzle repositories currently rehydrate entities from database rows with field-by-field assembly + manual casts:

```ts
const fields: Partial<OrderOverrideFields> = {}
if (row.paymentMethod) fields.paymentMethod = row.paymentMethod as PaymentMethod
if (row.paymentStatus) fields.paymentStatus = row.paymentStatus as PaymentStatus
if (row.revenueAmountCents != null && row.revenueCurrency)
  fields.revenue = { amountCents: Number(row.revenueAmountCents), currency: row.revenueCurrency as CurrencyCode }
// ... 4 more identical money branches
```

This is verbose, easy to forget a field, and the `as EnumType` casts duplicate type information the entity schema already encodes. The entity's Zod schema is the source of truth; let it do the work.

## Scope

For every repository's row-to-entity hydration:

1. Build a plain object that mirrors the entity's schema shape from the row.
2. Call `Entity.schema.parse(thatObject)` to validate + coerce.
3. Pass the parsed result to `new Entity(...)`.

This eliminates:
- Manual `as EnumType` casts (the schema validates the enum membership).
- Manual `Number(...)` coercions for money cents (the schema coerces).
- Forgotten fields (the schema catches missing required ones).

For nested value objects (e.g. `Money { amountCents, currency }`), build the nested object inline; the schema validates the structure.

## Affected files

Discovery: `rg "as (PaymentMethod|PaymentStatus|CurrencyCode|.*Status|.*Type)" packages/api/typescript/src --type ts -l` — repository files mostly.

Each `packages/api/typescript/src/<ctx>/repositories/*/Drizzle*Repository.ts`. Focus on the `findById` / `findByX` / list methods.

## Acceptance criteria

- [ ] No `as <EnumType>` casts inside repository hydration code.
- [ ] No `Number(row.X)` coercions inside repository hydration code (schema's `z.coerce.number()` or `z.number()` handles it).
- [ ] Each repo's hydration ends with `Entity.schema.parse(...)` and constructs the entity from the parsed result.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean — entity repo tests confirm round-trip (save → findById → equal shape).

## Out of scope

- Projection repositories (read-side records, different pattern — handled per their projection skill).
- Wire-event payload parsing (events use their own `.parse(...)` already).
- Adding new fields to entities — only the hydration code changes.

## Notes

- `Entity.schema.parse(...)` throws on validation failure. The repo's `findById` should let this propagate — corrupt rows are a real bug, not a soft "row not found" state.
- For optional nested VOs: build them only when their backing columns are present, then pass to `parse(...)`. The schema's `.optional()` handles the rest.
- If the schema's expected field names don't match the column names (snake_case vs camelCase), keep the mapping step but stop doing per-field casts inside it.
- SPEC-06 and SPEC-07 sweep any remaining casts outside the repo hydration paths.
