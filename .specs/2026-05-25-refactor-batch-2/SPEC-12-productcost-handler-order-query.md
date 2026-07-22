# SPEC-12: `ProductCostApplicationHandler` reads orders via `OrderQueryService`

**Wave:** 4   **Depends on:** SPEC-11   **Status:** done

## Motivation

`ProductCostApplicationHandler` already uses `ProductCostQueryService` for the catalog-cost lookup, but it reaches into the `orders` table with raw Drizzle:

```ts
// src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts
const rows = await dbc.select().from(orders).where(eq(orders.id, orderId)).limit(1)        // :69
const storeOrders = await dbc.select().from(orders).where(eq(orders.storeId, storeId))     // :139
```

That's a read-side query inlined into a write-side handler — exactly what `OrderQueryService` (SPEC-11) exists to encapsulate. Routing through the service removes the direct table dependency and the injected `DrizzleClient`.

## Scope

1. Inject `OrderQueryService` into `ProductCostApplicationHandler` (replacing the direct `DrizzleClient` use for order reads).
2. Replace the line-69 single-order read with an `OrderQueryService.findById(orderId)` (add the method to the service in SPEC-11 if not already present).
3. Replace the line-139 store-orders read with an `OrderQueryService.findByStore(storeId, ...)` method.
4. Drop the now-unused `orders` table import and the `DrizzleClient` constructor dependency if nothing else in the handler needs them.

## Affected files

- `src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts`
- `src/sales/services/OrderQueryService/*` — add `findById` / `findByStore` if missing (SPEC-11)
- Handler test — assert it reads via the (mock) query service, not Drizzle
- `src/sales/registry.ts` — ensure the handler's DI gets `OrderQueryService`

## Acceptance criteria

- [ ] `ProductCostApplicationHandler` has no `db.select().from(orders)` calls (grep `from(orders)` in the handler → zero).
- [ ] Order reads go through `OrderQueryService`; the handler no longer imports the `orders` table.
- [ ] Handler test passes with a mocked `OrderQueryService`.
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- Changing the cost-application logic / `ProductCostSolver` behaviour.
- The catalog-side `ProductCostQueryService` usage (already correct).
- Adding `OrderQueryService` methods beyond what this handler needs.

## Notes

- Depends on SPEC-11 — `OrderQueryService` must exist with the two read methods this handler needs.
- This is the concrete first consumer that justifies `OrderQueryService.findById` / `findByStore`; keep those method signatures driven by this handler's needs (no speculative reads).
