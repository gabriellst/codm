# SPEC-09: Remove changed-fields tracking

**Wave:** 3   **Depends on:** SPEC-08   **Status:** done

## Motivation

Several entity update methods and use cases build a `changed: string[]` array to detect "did anything change", then conditionally skip persistence/event emission:

- Entity methods returning `string[]`: `Store.updateSettings` / `Store.updatePreferences`, `OperationalCost.update`, `WarrantyReserve.update`, `Goal.updateTarget`, `OrderOverride.changedFields(patch)`.
- Use-case locals: `UpdateStoreSettings`, `UpdateStorePreferences`, `UpdateGoal`, `UpdateUserPreferences` (some `return` early when empty); `UpdateProductCost`, `UpdateManualAdSpend`, `UpdateOperationalCost`, `UpdateTaxes`, `UpdateFeesConfiguration`, `UpdateWarrantyReserve` (built but unused).

The arrays are never part of the event payload (SPEC-08 makes `*Updated` carry the full entity instead), and the no-op-skip behaviour adds branching for marginal benefit. Remove the tracking; the update path becomes "apply → save → publish `*Updated`".

## Scope

1. Delete the `string[]` return from the entity update methods listed above — they mutate state and return `void` (or the entity). Remove `OrderOverride.changedFields`.
2. In the use cases, delete the `const changed/changedFields = ...` locals and the `if (changed.length === 0) return` / `if (!changed) return` guards. The use case always applies the update, saves, and publishes the `*Updated` event.
3. Update tests that asserted on the returned array or the no-op-skip behaviour.

## Affected files

- `src/tenancy/entities/Store.ts` (`updateSettings`, `updatePreferences`)
- `src/finance/entities/OperationalCost.ts` (`update`), `src/finance/entities/WarrantyReserve.ts` (`update`)
- `src/analytics/entities/Goal.ts` (`updateTarget`)
- `src/sales/entities/OrderOverride.ts` (`changedFields`)
- Use cases: `UpdateStoreSettings`, `UpdateStorePreferences`, `UpdateGoal`, `UpdateUserPreferences`, `UpdateProductCost`, `UpdateManualAdSpend`, `UpdateOperationalCost`, `UpdateTaxes`, `UpdateFeesConfiguration`, `UpdateWarrantyReserve`
- Their colocated tests

## Acceptance criteria

- [ ] No entity method returns a `string[]` of changed field names; no `changedFields(...)` method remains (grep `changed: string\[\]`, `changedFields`, `const changed` in `src/**` → zero in production code).
- [ ] Update use cases unconditionally apply → save → publish the `*Updated` event (no `if (changed.length === 0) return`).
- [ ] Tests updated; no test asserts on a changed-fields array.
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- The event payload reshape (SPEC-08) — this spec assumes `*Updated` already carries the full entity.
- No-op detection via a different mechanism (e.g. entity equality) — explicitly dropped, not replaced.
- `MarkNotificationRead`'s `changed` boolean (`delivery.markRead(...)` returns a domain-meaningful flag, not field tracking) — leave it.

## Notes

- Sequence after SPEC-08: once `*Updated` carries the full entity snapshot, the changed-fields arrays have no remaining consumer, so removal is safe.
- Idempotent re-publishing of an unchanged `*Updated` event is acceptable here (template repo; downstream handlers are idempotent). If a specific handler genuinely needs change-detection later, it computes the diff from the embedded entity itself.
- Distinguish field-tracking arrays (remove) from domain booleans like `markRead` returning "was it newly read" (keep).
