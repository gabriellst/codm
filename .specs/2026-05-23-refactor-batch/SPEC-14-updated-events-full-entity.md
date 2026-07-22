# SPEC-14: `*Updated` integration events carry the full entity JSON

**Wave:** 5   **Stream:** A (parallel)   **Depends on:** Wave 4 complete   **Status:** done

## Motivation

`*Updated` integration events today carry a `changedFields: string[]` (CSV in some), forcing every consumer to:
1. Look up the current entity by id
2. Cross-reference `changedFields` to decide whether THEIR concern is affected
3. Recompute / re-invalidate accordingly

This is fragile (CSV typos, missed fields when the publisher adds a column) and forces every consumer to do its own lookup just to read state that the publisher already had in hand. Replace with: `*Updated` events carry the **full entity JSON** in the payload. Consumers read what they need directly.

Trade-off accepted: events get bigger. For the events we care about (Order, Product, Variant, Subscription, OrderOverride), the entity bodies are small (~500-2000 bytes JSON) — well within outbox / queue limits.

## Scope

### Contracts side

Update every `*Updated` wire event in `packages/contracts/wire/events/*.tsp`. Identify them by file naming or by current schema shape (has `changedFields` field).

Likely affected events (audit and add to this list during the spec):
- `wire/events/order-updated.tsp` → drop `changedFields`, add `entity: Order` (model defined in `wire/`)
- `wire/events/order-overridden.tsp` → same
- `wire/events/product-updated.tsp` → same
- `wire/events/variant-updated.tsp` → same
- (audit `wire/events/` for any other `*-updated` files)

For each:
1. Remove the `changedFields` property from the TypeSpec model.
2. Add a `entity: <EntityModel>` property of the corresponding entity wire model. If no entity model exists yet, define it as a sibling `<Entity>.tsp` next to the event.
3. Regenerate: `bun emit-openapi && bun sdk`.

### Go side (publishers)

Most `*Updated` events are published by Go sync pipelines (the canonical-write side). Update each publisher to emit the full entity JSON:

- `packages/api/go/internal/sync/pipelines/shopify_orders_pipeline.go` — when emitting `integration.shared.order.updated`, populate `entity` with the full normalized Order
- `packages/api/go/internal/sync/pipelines/shopify_products_pipeline.go` — same for `integration.shared.product.updated`
- Any other Go publisher of `*Updated` events (audit `packages/api/go/internal/sync/`)

Drop the change-detection code paths that today compute `changedFields` (typically a diff between previous and new row).

### TS side (consumers)

Update every handler / projector that consumes a `*Updated` event:

1. Remove all references to `event.payload.changedFields`.
2. Read fields directly from `event.payload.entity`.
3. Drop any "did changedFields include X?" branching — the consumer trusts the publisher and reacts to the entity's current state. Idempotency is preserved (already required for event handlers).

Concentrations:
- `packages/api/typescript/src/sales/handlers/`
- `packages/api/typescript/src/analytics/handlers/` (cache invalidation post-update)
- `packages/api/typescript/src/sales/projections/projectors/`
- `packages/api/typescript/src/sales/handlers/OrderOverriddenPublisher.ts` (already emits `changedFields`; refactor to emit entity)

### TS side (publishers of `OrderOverriddenEvent`)

`sales/handlers/OrderOverriddenPublisher.ts` is a TS publisher (different from Go publishers). After the wire shape changes, this publisher emits the full `OrderOverride` entity in the payload — fetch the entity inside the handler if not already available on the source event.

## Affected files

### Contracts
- `packages/contracts/wire/events/order-updated.tsp` and siblings (audit `*-updated.tsp`)
- `packages/contracts/wire/events/order-overridden.tsp`
- Possibly new `packages/contracts/wire/models/order.tsp`, `product.tsp`, etc. if wire entity models don't exist yet

### Go
- `packages/api/go/internal/sync/pipelines/*.go` — publishers
- `packages/api/go/internal/sync/normalizers/**` — drop diff code
- Go-side tests

### TS
- `packages/api/typescript/src/**/handlers/**/*Updated*.ts` — consumers
- `packages/api/typescript/src/**/projections/projectors/*.ts` — same
- `packages/api/typescript/src/sales/handlers/OrderOverriddenPublisher.ts` — publish full entity
- Tests for the above

### Generated (do not edit by hand)
- `packages/contracts/generated/{typescript,go}/wire/events/*-updated.{ts,go}` — regenerated from TypeSpec

## Acceptance criteria

- [ ] Zero remaining `changedFields` in any `*Updated` event schema or payload (search `rg "changedFields|ChangedFields" packages` returns only legacy comments removed in this spec).
- [ ] Every `*Updated` event payload has `entity` populated by publishers.
- [ ] All TS consumers read state from `event.payload.entity`, not from a separate lookup.
- [ ] `bun emit-openapi && bun sdk` regenerates cleanly.
- [ ] Go publishers emit full entities (verify via integration tests or mock outbox capture).
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.
- [ ] Go test suite clean.

## Out of scope

- Splitting `OrderUpdatedHandler` into sub-handlers — that's SPEC-12. This spec just changes the payload shape; the consumer rewrite is value-by-value, not structural.
- Adding new `*Created` / `*Deleted` events — only `*Updated` shape changes.
- Versioning the event schema (publishing both old + new shape during transition) — not needed for a template repo with no in-flight consumers.

## Notes

- For events published by Go and consumed by TS, the regeneration step (`bun emit-openapi && bun sdk`) is critical. The Go side emits OpenAPI from its own TypeSpec; TS consumes via the generated `@template/contracts-typescript` types.
- The `entity` field's TypeSpec definition needs to match the existing Drizzle table shape closely (column names) — easiest if a parallel `wire/models/<entity>.tsp` is created mirroring the table columns.
- For `OrderOverriddenEvent`, the OrderOverride entity is TS-owned (not Go-canonical), so the TypeScript publisher fetches it directly from `OrderOverrideRepository.findById` before emitting. No Go publisher impact for that one specific event.
- Memory rule: `*Updated` events carry the full entity JSON. Future event additions follow this pattern.
