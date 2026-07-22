# Sales Coupon Management (CRUD) — Design Spec

**Date:** 2026-05-27
**Status:** Approved
**Bounded Context:** sales
**Kind:** feature
**Story Points:** 5 — one bounded context end-to-end: new `Coupon` aggregate + `CouponCode` VO + repository + three command use cases + one BFF list query + four controllers + one migration + a new `/app/coupons` route with a list section and a create/edit form (SDK regen, no cross-service contract). Comprehensive single-context CRUD; borderline 8 only because it carries four operations.

## Context

The `sales` bounded context (`packages/api/typescript/src/sales/`) holds order-side
aggregates today — e.g. `OrderOverride` (`packages/api/typescript/src/sales/entities/OrderOverride.ts`),
which models its shape with Zod (`z.instance(Id)` for relations), raises typed
`SalesDomainErrors`, and persists via a Drizzle repository. There is **no coupon
concept yet** anywhere in the codebase (`grep -ri coupon` is empty) — this introduces
a new `Coupon` aggregate alongside `OrderOverride`.

On the frontend, the app shell lives under `packages/app/react/src/routes/(app)/`,
which currently has a single feature route — `(app)/dashboard` with an
`OverviewSection` (`routes/(app)/dashboard/-components/OverviewSection/`). The new
`(app)/coupons` screen mirrors that route-shell + section composition. There are no
existing forms to mirror; the create/edit form is net-new and is scaffolded via
`bun cli form` (TanStack Form + the SDK schema). Coupon admin screens are a settled
UX shape (Stripe Dashboard / Shopify discounts): a table of coupons with inline
edit/delete and a modal form for create/edit.

## Problem

Net-new — no current problem being solved. The template lacks a worked full-stack
CRUD feature in the `sales` context; this adds the first end-to-end "manage a simple
catalog of records" surface (backend commands + read + an `/app` screen).

## Goal

A store admin can manage percentage discount coupons from a single screen: see all
coupons, create a new one, edit an existing one's discount or active state, and
delete one — with the same Zod schema validating the form in the browser and the
command on the server.

## Decisions

1. **`Coupon` is an aggregate in `sales`** (mirrors `OrderOverride`): `AggregateRoot`, schema with `code` (a `CouponCode` value object), `discountPercent` (integer), `active` (boolean). Identity is a random `Id` (UUIDv7 via `Id.value()`); `code` is the unique natural key.
2. **`CouponCode` is a primitive value object** (`sales/objects/CouponCode.ts`) validating the format `^[A-Z0-9]{4,12}$` and upper-casing on input — an invalid code cannot exist.
3. **`discountPercent` is an integer 1–100**, enforced as a `Coupon` invariant; violation raises `INVALID_DISCOUNT_PERCENT`.
4. **Code uniqueness** is enforced at create time: the use case looks up `CouponRepository.findByCode(code)` and raises `COUPON_ALREADY_EXISTS` if present.
5. **Four operations**, each a thin command use case + controller, plus one read: `CreateCoupon`, `UpdateCoupon` (discount + active), `DeleteCoupon`, and `ListCoupons` (a BFF read that returns the rows the table needs, optionally filtered by a `code` substring).
6. **Errors are typed `SalesDomainErrors`** in `sales/errors/index.ts`: `COUPON_ALREADY_EXISTS`, `INVALID_DISCOUNT_PERCENT`, `COUPON_NOT_FOUND`, plus the VO's `INVALID_COUPON_CODE` — mapped centrally; the frontend reacts on the code, never the message.
7. **One Drizzle migration** creates the `coupons` table, derived from the entity schema (`db-modelling` → `migrate`).
8. **Frontend `(app)/coupons`** route shell renders a `CouponListSection` (table: code · discount% · active · edit/delete actions). Create and edit use a single `CouponForm` rendered in a **dialog**; delete uses a confirm dialog. The list's `code` search lives in a **URL search param** (shareable/refresh-safe); the open/edit dialog state lives in a **local Zustand store** (`-stores/useCouponDialogStore.ts`).
9. **The form validates against the SDK schema** generated from the controllers — the same Zod that validates the command server-side; masks/validators are not redefined.

## User Stories

- **Story 1 — browse:** As a store admin, I want to see all my coupons in a table, so that I know what discounts exist.
  - Given coupons exist, when I open `/app/coupons`, then I see each coupon's code, discount %, and active status.
  - Given I type in the code search, when the query updates, then the list filters to matching codes (AC-1).

- **Story 2 — create:** As a store admin, I want to create a coupon with a code and discount, so that customers can redeem it.
  - Given the create dialog, when I submit a valid code + discount, then the coupon appears in the list (AC-2).
  - Given a code that already exists, when I submit, then I see a `COUPON_ALREADY_EXISTS` error and no duplicate is created (AC-2).
  - Given a discount outside 1–100, when I submit, then it is rejected as `INVALID_DISCOUNT_PERCENT` (AC-3).
  - Given a code not matching `^[A-Z0-9]{4,12}$`, when I submit, then it is rejected (AC-6).

- **Story 3 — edit:** As a store admin, I want to change a coupon's discount or toggle it active, so that I can adjust or pause offers.
  - Given an existing coupon, when I edit its discount/active and save, then the change persists and shows in the list (AC-4).

- **Story 4 — delete:** As a store admin, I want to delete a coupon, so that it can no longer be used.
  - Given an existing coupon, when I confirm delete, then it is removed from the list (AC-5).
  - Given a delete/edit for a non-existent coupon, then the server raises `COUPON_NOT_FOUND` (AC-4, AC-5).

## Acceptance Criteria

- [ ] AC-1: `GET` list returns coupons with `code`, `discountPercent`, `active`; an optional `code` query filters by substring. The `/app/coupons` table renders these rows.
- [ ] AC-2: Creating a coupon with a unique, valid code persists it and it appears in the list; creating with an existing code raises `COUPON_ALREADY_EXISTS` and creates no duplicate.
- [ ] AC-3: `discountPercent` outside 1–100 is rejected by the `Coupon` entity with `INVALID_DISCOUNT_PERCENT` (covered by an entity unit test).
- [ ] AC-4: Updating a coupon's `discountPercent` and/or `active` persists the change; updating a missing coupon raises `COUPON_NOT_FOUND`.
- [ ] AC-5: Deleting a coupon removes it from the list; deleting a missing coupon raises `COUPON_NOT_FOUND`.
- [ ] AC-6: A `code` not matching `^[A-Z0-9]{4,12}$` is rejected by the `CouponCode` value object with `INVALID_COUPON_CODE` (covered by a VO unit test); valid codes are upper-cased.
- [ ] AC-7: The `CouponForm` validates with the SDK-generated schema (the same Zod the controller uses) — no separately-maintained client validation.

## Out of Scope

- Coupon **redemption** (applying a coupon to an order) — this spec is management/CRUD only.
- Usage limits, per-customer caps, expiry dates, fixed-amount (non-percentage) coupons — not requested; add later if needed.
- Mobile (expo) screen — react `/app` only.
