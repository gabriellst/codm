# SPEC-10: Strip the remaining TS projections + projection repositories

**Wave:** 4   **Depends on:** SPEC-17 (Wave 0)   **Status:** done

## Motivation

After SPEC-17 removes the `/ui` context (and with it `VideoFeedProjection` / `VideoFeedProjector`), the only projections left on the TS side are in `sales`, and neither is a useful read-model:

- **`OrderProjection` + `OrderProjector` + `OrderProjectionRepository`**: written by the projector, but **no reader** — `GetOrdersList` already queries `orders` LEFT JOIN `order_overrides` directly (the usecase comment says so).
- **`CartProjectionRepository`**: TS write-only — a single `linkToOrderByExternalCartId` called by `PixelCheckoutCompletedLinkCartHandler` + `OrderUpdatedLinkCartHandler`. The `carts` rows are **Go-owned**.

The decision is to drop projections on the TS side and read by joining base tables directly (formalised as query services in SPEC-11). The Go-owned `carts` table stays; only the TS projection abstractions go.

## Scope

1. **Delete** (sales): `projections/OrderProjection.ts`, `projections/projectors/OrderProjector.ts`, `repositories/OrderProjectionRepository/*`, `repositories/CartProjectionRepository/*` (+ their tests and `index.ts` barrels).
2. **Registry**: remove the projection-repo bindings from `src/sales/registry.ts` (mock/integration/real) and drop the `OrderProjector` registration from the sales projector barrel/index.
3. **Cart link relocation**: the two handlers that called `cartRepo.linkToOrderByExternalCartId(...)` now write `carts.linked_order_id` via direct Drizzle (the same two-step `SELECT order by (platform, cartToken) → UPDATE cart WHERE linked_order_id IS NULL`), inline or via a small `sales` query service. They keep republishing `CartLinkedToOrderEvent`. The `carts` table is untouched (Go-owned).
4. **No migration**: `OrderProjection` materialized into the canonical `sales.orders` table (there is no separate `order_projections` table), so deleting the TS classes leaves `orders` intact for `GetOrdersList`. `carts` is Go-owned and stays. (`video_feed_projection` is dropped by SPEC-17.)

## Affected files

- `src/sales/projections/**`, `src/sales/repositories/OrderProjectionRepository/**`, `src/sales/repositories/CartProjectionRepository/**`
- `src/sales/registry.ts`, `src/sales/repositories/index.ts`, the sales projector barrel
- `src/sales/handlers/PixelCheckoutCompletedLinkCartHandler.ts`, `OrderUpdatedLinkCartHandler.ts` — relocate the link write
- (No schema/migration changes — `OrderProjection` used the canonical `orders` table; `carts` is Go-owned.)

## Acceptance criteria

- [ ] No `Projection`, `Projector`, or `ProjectionRepository` classes remain on the TS side except cart-link logic relocated as plain handler/query code (grep `extends Projector`, `ProjectionRepository` → zero).
- [ ] `sales/registry.ts` has no projection-repo bindings; the app boots (DI resolves) without them.
- [ ] The cart→order link still works (both pixel-first and order-first handlers); `CartLinkedToOrderEvent` still publishes; `carts` table unchanged.
- [ ] No schema/migration change needed; `sales.orders` (canonical) + `carts` (Go-owned) remain.
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- The `/ui` context, `VideoFeedProjection`, and `GetVideoFeed` — removed by SPEC-17 (Wave 0).
- The `carts` table and the Go writer (Go-owned; untouched).
- Introducing `OrderQueryService` (SPEC-11) — this spec only removes projections and inlines the minimal reads it breaks.
- Go-side projections (separate Go specs).

## Notes

- Depends on SPEC-17 (Wave 0) having already removed the `/ui` projection — by the time this runs, the only projections left are the two sales ones.
- `OrderProjection` removal is zero-risk (no readers). The real work is the cart-link relocation.
- The cart link is a **write** to a Go-owned table, not a read-model — stripping the repo means inlining the `UPDATE carts SET linked_order_id` into the handlers; the table stays.
- After this, `GetOrdersList` reads base tables directly — SPEC-11 formalises that into `OrderQueryService`.
