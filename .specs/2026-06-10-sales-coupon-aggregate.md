# Sales discount coupons — Coupon aggregate, spec

> **Date:** 2026-06-10 · **Origin:** feature-loop brief (axes: CLASS-BASE, VALIDATION-PLACEMENT, OPTIONALITY,
> TELL-DONT-ASK, ERR-VOCAB, EVENT-EMISSION, ID-REPR). A verifier derives tests from this doc alone; a builder implements from it.

## Context

The Sales BC (`packages/api/typescript/src/sales/`) owns one TS write-side aggregate (`OrderOverride`);
it has `entities/ errors/ events/ usecases/ controllers/ repositories/ registry.ts` but **no `enums/`
folder and zero coupon artifacts** (verified: no `coupon` hits in `src/` or `packages/contracts/db/schema/`).
Sales tables live in `packages/contracts/db/schema/sales.ts` under `pgSchema('sales')`; enum-ish columns
are `text` validated at the app layer (no `pgEnum` anywhere). Domain events are persisted **by use cases**
via `this.domainEventRepository.save(event, tx)` in the same tx as the entity save (UC-C05 / EVT-C10 — see `UpdateOrderOverride`).

## Problem
Merchants cannot create or deactivate store-scoped discount coupons — no aggregate, no invariants, no events, no table.

## Goal
A store member creates a coupon (unique code per store, PERCENTAGE or FIXED_AMOUNT, optional future expiry)
and deactivates it — every invariant in the domain, named errors, and a domain event persisted in the same tx for both operations.

## Decisions

1. **Aggregate** — `Coupon extends AggregateRoot<typeof CouponSchema>` at
   `packages/api/typescript/src/sales/entities/Coupon.ts`; `static override schema = CouponSchema`; props via
   interface merging (`export type CouponProps = Z.infer<typeof CouponSchema>` + `export interface Coupon
   extends CouponProps {}`), no `!` fields. Id = auto `new Id()` UUID from `BaseEntity`. Export from `entities/index.ts`.
2. **Enums** — new `sales/enums/` (+ barrel): `CouponType.ts` (`PERCENTAGE = 'PERCENTAGE'`,
   `FIXED_AMOUNT = 'FIXED_AMOUNT'`), `CouponStatus.ts` (`ACTIVE = 'ACTIVE'`, `INACTIVE = 'INACTIVE'`). Plain TS string enums.
3. **Entity schema (format → schema)** — `CouponSchema = z.object({ storeId: z.instance(Id),
   code: z.string().trim().toUpperCase().min(1, { error: 'COUPON_CODE_REQUIRED' as SalesDomainErrors }).max(64, { error: 'INVALID_COUPON_CODE' as SalesDomainErrors }),
   type: z.enum(CouponType), value: z.number().int(), status: z.enum(CouponStatus),
   expiresAt: z.date().optional() })`. `value` = percentage points (PERCENTAGE) or cents (FIXED_AMOUNT).
4. **Cross-field type/value rule → `.refine()`** (ENT-C06) on `CouponSchema`: PERCENTAGE ⇒
   `1 <= value <= 100`; FIXED_AMOUNT ⇒ `value >= 1`; error `'INVALID_COUPON_VALUE' as SalesDomainErrors`.
   No if-checks duplicating this in `create()`.
5. **Status default in `create()`, NOT in schema** — `status` required in `CouponSchema`, **no `.default()`**.
   `static create(data: { storeId: string; code: string; type: CouponType; value: number; expiresAt?: Date | string })`
   passes `status: CouponStatus.ACTIVE` explicitly. Rehydration (`new Coupon({...row})` in the repo's
   `toDomain`) passes the stored status — an INACTIVE row stays INACTIVE.
6. **Expiry-in-future is a creation-time guard in `create()`, NOT in the schema** (expired rows must rehydrate).
   After normalizing `expiresAt` (string → `new Date(...)`): if `expiresAt <= new Date()`, throw
   `new BaseError<SalesDomainErrors>('COUPON_EXPIRY_IN_PAST')` before constructing.
7. **Tell-don't-ask deactivation** — `deactivate(now: Date = new Date()): void` on `Coupon`, guards INSIDE the
   method, in order: (a) `isExpired(now)` (public helper: `expiresAt != null && expiresAt <= now`) ⇒ throw
   `COUPON_EXPIRED` (expiry IS deactivation — even when stored status is ACTIVE); (b) `status === CouponStatus.INACTIVE`
   ⇒ throw `COUPON_ALREADY_INACTIVE`; then `this.status = CouponStatus.INACTIVE`. No `incrementVersion()` here (repo `save` owns it).
8. **Errors** — extend `sales/errors/index.ts`: `SalesDomainErrors` += `'COUPON_CODE_REQUIRED' | 'INVALID_COUPON_CODE'
   | 'INVALID_COUPON_VALUE' | 'COUPON_EXPIRY_IN_PAST' | 'COUPON_EXPIRED' | 'COUPON_ALREADY_INACTIVE'`;
   `SalesApplicationErrors` += `'COUPON_NOT_FOUND' | 'COUPON_CODE_ALREADY_EXISTS'`. `registerErrorCodes`: the four
   create-validation codes → `UNPROCESSABLE_ENTITY` (422); `COUPON_EXPIRED` / `COUPON_ALREADY_INACTIVE` /
   `COUPON_CODE_ALREADY_EXISTS` → `CONFLICT` (409); `COUPON_NOT_FOUND` → `NOT_FOUND` (404). *(Flagged: distinct
   `COUPON_EXPIRED` instead of reusing `COUPON_ALREADY_INACTIVE` — distinct vocabulary/i18n for the expiry case.)*
9. **Events (use-case-born, primitive ids)** — `sales/events/CouponCreatedEvent.ts`: name `'sales.coupon.created'`,
   schema `z.domainEvent({ couponId: z.uuid(), storeId: z.uuid(), code: z.string(), type: z.enum(CouponType),
   value: z.number().int(), expiresAt: z.iso.datetime({ offset: true }).optional() })`. `sales/events/CouponDeactivatedEvent.ts`:
   name `'sales.coupon.deactivated'`, payload `{ couponId: z.uuid(), storeId: z.uuid(), code: z.string() }`. Both in
   `events/index.ts`. The **entity never publishes/persists**: each use case constructs the event (`entityId: coupon.id.value`,
   `ownerId: coupon.storeId.value`) and `await this.domainEventRepository.save(event, tx)` in the SAME tx as the entity save.
10. **`CreateCoupon`** (`sales/usecases/CreateCoupon.ts`) — input `z.object({ storeId: z.uuid(), code: z.string(),
    type: z.enum(CouponType), value: z.number().int(), expiresAt: z.iso.datetime({ offset: true }).optional() })`;
    output `z.object({ couponId: z.uuid() })`. In `withTransaction`: normalize `code.trim().toUpperCase()`,
    `findByCode(storeId, normalizedCode, tx)` — hit ⇒ throw `BaseError<ApplicationErrors>('COUPON_CODE_ALREADY_EXISTS')`;
    else `Coupon.create(...)`, `save`, persist `CouponCreatedEvent`, return `{ couponId }`. All repo + event calls get `tx`.
11. **`DeactivateCoupon`** — input `z.object({ storeId: z.uuid(), couponId: z.uuid() })`, output `z.void()`.
    In `withTransaction`: `findById(couponId, tx)`; missing OR `coupon.storeId.value !== input.storeId` ⇒
    throw `COUPON_NOT_FOUND` (no cross-tenant leak); `coupon.deactivate()`; `save`; persist `CouponDeactivatedEvent` same tx.
12. **Controllers** (mirror `UpdateOrderOverrideController` / `AddProductTagController`) — `sales/controllers/CreateCoupon.ts`:
    `POST /coupons`, middlewares `[AuthAccountMiddleware, RequireStoreMember]`, ctx `{ user: { id: z.string() },
    session: { storeId: z.uuid() } }`, body = `CreateCouponInputSchema.omit({ storeId: true })`, returns 201 CREATED +
    `{ couponId }`. `sales/controllers/DeactivateCoupon.ts`: `POST /coupons/:couponId/deactivate`, params
    `z.object({ couponId: z.uuid() })`, no body, 204 NO_CONTENT, output `z.void()`. Register both in `controllers/index.ts`; run `bun sdk` after.
13. **Repository** — `sales/repositories/CouponRepository/{CouponRepository,DrizzleCouponRepository,MockCouponRepository,index}.ts`.
    Methods: `findById(id, tx?)`, `findByCode(storeId, code, tx?)`, `save(entity, tx?)`, `delete(id, tx?)`.
    `save` calls `entity.incrementVersion()` then `insert ... onConflictDoUpdate({ target: coupons.id })`
    updating `code/type/value/status/expiresAt/updatedAt/version`. `toDomain` = `new Coupon({ id: row.id,
    storeId: row.storeId, code, type, value, status, expiresAt: row.expiresAt ?? undefined, createdAt,
    updatedAt, version })`. Register in `sales/registry.ts`: mock → Mock, integration + real → Drizzle.
14. **Persistence + migration** — add `coupons` to `packages/contracts/db/schema/sales.ts`: `id uuid PK;
    store_id uuid notNull; code text notNull; type text notNull; status text notNull; value integer notNull;
    expires_at timestamptz NULL; created_at/updated_at timestamptz notNull defaultNow; version integer notNull
    default 1`; `uniqueIndex('coupons_store_id_code_unq').on(t.storeId, t.code)` + `index('coupons_store_id_idx').on(t.storeId)`.
    `type`/`status` stay `text` (house no-pgEnum convention, see `catalog.ts`). `bun migrate:create` then `bun migrate:dev`.
15. **Tests** — colocated: `entities/Coupon.test.ts` (unit, direct instantiation), `usecases/{CreateCoupon,DeactivateCoupon}.test.ts`
    (integration TestBed), `repositories/CouponRepository/DrizzleCouponRepository.test.ts`. State setup via
    repositories / `tests/support/given` (add `givenCoupon` to `given/sales.ts` if needed) — never via another use case.

## User stories

- **US1** — As a store member, I create a coupon (code, type, value, optional expiry) so customers get a discount; I get its id back and the system records the fact.
- **US2** — As a store member, I deactivate an active coupon so it can no longer be used; the system refuses to deactivate an inactive or already-expired coupon and tells me why.

## Acceptance criteria

- **AC1** `Coupon.create({ storeId, code: ' save10 ', type: PERCENTAGE, value: 10 })` → instance with
  `status === CouponStatus.ACTIVE` (caller never passes status), `code === 'SAVE10'`, `id.value` a generated UUID.
- **AC2** PERCENTAGE value 0 or 101 throws `INVALID_COUPON_VALUE`; 1 and 100 accepted.
- **AC3** FIXED_AMOUNT value 0 or negative throws `INVALID_COUPON_VALUE`; any positive int accepted.
- **AC4** `create` with past `expiresAt` throws `COUPON_EXPIRY_IN_PAST`; future `expiresAt` succeeds.
- **AC5** Rehydration `new Coupon({...row})` with a **past** `expiresAt` and `status: 'INACTIVE'` does NOT
  throw and keeps `status === INACTIVE` — expiry guard lives only in `create()`, status default not in schema.
- **AC6** Empty/whitespace code throws `COUPON_CODE_REQUIRED`; 65-char code throws `INVALID_COUPON_CODE`.
- **AC7** `deactivate()` on an ACTIVE non-expired coupon sets `status === INACTIVE` (version unchanged by the method).
- **AC8** `deactivate()` on an INACTIVE coupon throws `COUPON_ALREADY_INACTIVE`.
- **AC9** `deactivate()` on a coupon with passed `expiresAt` throws `COUPON_EXPIRED` **even when stored status
  is ACTIVE** (expiry guard runs before the status guard).
- **AC10** `CreateCoupon` with a duplicate code in the same store (case/whitespace-insensitive: `'save10'`
  duplicates `'SAVE10'`) throws `COUPON_CODE_ALREADY_EXISTS`; the same code in another store succeeds.
- **AC11** `CreateCoupon` persists the coupon row AND a `'sales.coupon.created'` event (payload `couponId, storeId,
  code, type, value, expiresAt?` as primitives/ISO string) visible via the domain event repository in the
  integration TestBed — entity save and event save share one transaction.
- **AC12** `DeactivateCoupon` persists `status = INACTIVE` AND a `'sales.coupon.deactivated'` event
  (`couponId, storeId, code`) in the same transaction.
- **AC13** `DeactivateCoupon` with an unknown `couponId`, or one belonging to another store, throws `COUPON_NOT_FOUND`.
- **AC14** HTTP mapping: 422 for `COUPON_CODE_REQUIRED/INVALID_COUPON_CODE/INVALID_COUPON_VALUE/COUPON_EXPIRY_IN_PAST`;
  409 for `COUPON_EXPIRED/COUPON_ALREADY_INACTIVE/COUPON_CODE_ALREADY_EXISTS`; 404 for `COUPON_NOT_FOUND` (`registerErrorCodes`; `registry.ts` keeps `import './errors'`).
- **AC15** `POST /coupons` → 201 + `{ couponId }`; `POST /coupons/:couponId/deactivate` → 204; both require
  auth + store membership and read `storeId` from `ctx.session`, never from the body.
- **AC16** Drizzle round-trip: save → findById → all props equal (incl. `expiresAt`, incremented `version`);
  a second raw insert with the same `(store_id, code)` violates `coupons_store_id_code_unq`.
