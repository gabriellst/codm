# SPEC-11: `ProductQueryService` + `OrderQueryService` replace the read-models

**Wave:** 4   **Depends on:** SPEC-10   **Status:** done

## Motivation

The Product/Order "read-models" are orphaned Zod schemas — defined, exported, and **consumed by nothing**:

- `src/catalog/readmodels/ProductReadModel.ts`, `ProductVariantReadModel.ts`
- `src/sales/readmodels/OrderReadModel.ts`, `OrderLineReadModel.ts`, `OrderTransactionReadModel.ts`

Meanwhile the project already has the right pattern: `ProductCostQueryService` (abstract class + `DrizzleProductCostQueryService` impl, return shape as a typed DTO), plus `BillingSubscriptionQueryService` and tenancy's `SubscriptionQueryService`. The `/query` skill prescribes read-side services that query Drizzle directly and define their return shape **inside the service**. We want `ProductQueryService` + `OrderQueryService` so business rules that need to read products/orders (e.g. cost application, SPEC-12) have a typed, joinable read port — and the dangling read-models go away.

## Scope

1. Create `src/catalog/services/ProductQueryService/` — abstract `ProductQueryService` + `DrizzleProductQueryService` (inject `DrizzleClient`, query `products` (+ `product_overrides`, `product_variants`) directly). Define the return schema/DTO inside the service (fold in whatever of `ProductReadModel` is actually needed).
2. Create `src/sales/services/OrderQueryService/` — abstract `OrderQueryService` + `DrizzleOrderQueryService` querying `orders` (+ `order_overrides`, `order_lines`, `order_transactions`). Methods are the reads real callers need (e.g. `findById`, `findByStore`, `findByIds`) — don't speculate. Return shape defined inside the service.
3. Delete the orphaned read-model files; move any shape still needed into the query services' return schemas.
4. Register both services in their context registries (mock/integration/real), mirroring `ProductCostQueryService`'s registration.

## Affected files

- `src/catalog/services/ProductQueryService/{ProductQueryService.ts,DrizzleProductQueryService.ts,index.ts}` — NEW
- `src/sales/services/OrderQueryService/{OrderQueryService.ts,DrizzleOrderQueryService.ts,index.ts}` — NEW
- `src/catalog/readmodels/ProductReadModel.ts`, `ProductVariantReadModel.ts` — DELETE
- `src/sales/readmodels/OrderReadModel.ts`, `OrderLineReadModel.ts`, `OrderTransactionReadModel.ts` — DELETE (+ the readmodels barrels)
- `src/catalog/registry.ts`, `src/sales/registry.ts` — register the new services
- `MonetaryAmount` (SPEC-01) for any money fields in the return shapes

## Acceptance criteria

- [ ] `ProductQueryService` and `OrderQueryService` exist as abstract classes with Drizzle impls, return shapes defined inside the service (per `/query` skill).
- [ ] The orphaned read-model files are deleted; nothing imports `ProductReadModel` / `OrderReadModel` (grep → zero).
- [ ] Both services are registered in their context registries for mock/integration/real.
- [ ] At least one method on each service is exercised by a test (the real consumer arrives in SPEC-12 for orders).
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- Rewiring `GetOrdersList` to route through these services — it already reads Drizzle directly; only refactor it through the service if it's a clean win, otherwise leave it.
- `ProductCostApplicationHandler` adoption — SPEC-12.
- Adding query methods with no caller (YAGNI — methods follow real demand).

## Notes

- Follow `ProductCostQueryService` exactly: abstract class (not a bare interface), `Drizzle*` impl injecting `DrizzleClient`, registered like the others.
- Depends on SPEC-10 (projections gone) so the only read path is the direct join these services formalise.
- Naming follows the established `X QueryService` convention (read-side cross-BC port); see memory `feedback_query_service_naming_and_zod`.
