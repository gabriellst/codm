# SPEC-02: Entity id schemas use `z.instance(Id)`

**Wave:** 3   **Stream:** C   **Depends on:** Wave 2 complete   **Status:** done

## Motivation

Entity schemas currently declare their id field as `z.string().uuid()`:

```ts
export const StoreIntegrationSchema = z.object({
  id: z.string().uuid(),
  // ...
})
```

This loses the `Id` value object — call sites have to wrap with `new Id(stringValue)` or re-validate. Using `z.instance(Id)` directly:
- Ensures the id field is always an `Id` instance, not a raw string.
- Centralizes uuid validation in the `Id` constructor (already `IdSchema = z.string().refine(...)`).
- Makes hydration via `Entity.schema.parse(...)` (SPEC-13) naturally produce `Id` instances.

## Scope

For every entity schema:

1. Replace `id: z.string().uuid()` (or `z.uuid()` post-SPEC-01) with `id: z.instance(Id)`.
2. Verify the corresponding `Entity` class's `id` field is typed as `Id` (not `string`).
3. Repository hydration code (after SPEC-13's `schema.parse(...)` refactor) automatically produces an `Id` instance — verify call sites that use `.id` expect the VO (have `.value` accessors where strings are needed).

Same change applies to nested entity id fields (e.g. `foreignKeyId: z.instance(Id)`) where the field references another entity's id.

## Affected files

Discovery: `rg "id: z\.string\(\)\.uuid\(\)|id: z\.uuid\(\)" packages/api/typescript/src --type ts`

Concentrations:
- `packages/api/typescript/src/**/entities/*.ts` (entity schemas)
- `packages/api/typescript/src/**/projections/*.ts` (read-side projection schemas)
- `packages/api/typescript/src/**/events/*.ts` (event payload schemas that carry an entity id)

## Acceptance criteria

- [ ] Every entity schema uses `id: z.instance(Id)` for its primary id field.
- [ ] Foreign-key id fields that reference an entity (e.g. `storeId`, `userId`, `orderId`) use `z.instance(Id)` too **where the entity actually wraps the field in an `Id` VO**. If the entity stores the foreign key as a plain string, leave as `z.uuid()`.
- [ ] `bun tsc` clean — no `Id` vs `string` mismatch errors.
- [ ] `bun run test` clean — entity round-trip tests confirm `schema.parse(...)` produces `Id` instances.

## Out of scope

- Projection schemas where the projection is "raw" (record-typed by `props.id: string`) — those are intentionally flat. Verify case-by-case.
- Wire-event payload schemas (TypeSpec-generated) — those use `string` because the wire is JSON.
- Use-case input schemas accepting an id from a controller — those parse from raw string input; either accept `z.string().uuid()` (then construct `new Id(...)` inside the use case) OR use `z.string().uuid().transform(v => new Id(v))`. Either is fine; choose per-use-case based on what reads cleanest. Default: leave use-case input as `z.uuid()` — the use case wraps with `new Id(...)` on its own boundary.

## Notes

- `z.instance(Id)` validates by `instanceof` check at runtime. If raw input arrives (e.g. from a use case constructing the entity from primitives), the use case must wrap with `new Id(value)` first.
- `Id.fromSeed(...)` (SPEC-20) already returns an `Id` — call sites using it work without change.
- Entity hydration (SPEC-13) — after schema-parse hydration is in place, the repo passes a `{ id: new Id(row.id), ... }` object to `parse`. The `z.instance(Id)` check passes, the resulting entity has `.id: Id`.
- Equality checks shift from `a.id === b.id` (string equality) to `a.id.equals(b.id)` or `a.id.value === b.id.value`. Sweep accordingly when surfaced by tsc.

**Resolution (2026-05-23):** No-op for this codebase. `BaseEntity` (`core/src/entities/BaseEntity.ts`) already provides `id: Id` natively — no entity schema declares its own `id` field. The remaining `id: z.uuid()` matches all live in nested VO schemas (`ProductCostOptionItemSchema`, `ProductCostOptionSchema`) or read-model / DTO schemas where the design intentionally keeps `id: string` (out of scope per spec). Foreign-key fields (`storeId`, `userId`, `orderId`, etc.) are stored as plain strings by every entity in this repo, so they stay as `z.uuid()` per the spec's exception clause ("If the entity stores the foreign key as a plain string, leave as `z.uuid()`.").
