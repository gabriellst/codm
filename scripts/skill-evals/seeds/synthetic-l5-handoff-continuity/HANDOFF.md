# HANDOFF — Sales Coupon aggregate (write-side DONE, orchestration REMAINS)

> Compacted by agent A for agent B (fresh context). Pick up from here — do **not**
> re-derive or re-scaffold the write-side that is already on disk and green. Finish
> the orchestration half so the whole slice passes the same gates a full build would.
> Source spec for the full slice: `.specs/2026-06-10-sales-coupon-aggregate.md`
> (read it for any detail this handoff compresses; it is the source of truth).

## What this slice is

Merchants can create and deactivate **store-scoped discount coupons** in the Sales BC
(`packages/api/typescript/src/sales/`). One write-side aggregate (`Coupon`), two
commands (`CreateCoupon`, `DeactivateCoupon`), each persisting a use-case-born domain
event in the same transaction as the entity save. Sales already owns `OrderOverride`
end-to-end — **mirror its shapes** (controllers, repository folder layout, registry
wiring, `pgSchema('sales')` table, text-validated enum-ish columns — no `pgEnum`).

## DONE — already on disk, compiling, tested (do NOT rebuild these)

The write-side aggregate half is committed in the tree and **green**:

- `src/sales/entities/Coupon.ts` — `Coupon extends AggregateRoot<typeof CouponSchema>`.
  `CouponSchema` holds the format + cross-field invariants: code `.trim().toUpperCase()`
  min1/max64 (`COUPON_CODE_REQUIRED` / `INVALID_COUPON_CODE`), and a `.refine()`
  enforcing PERCENTAGE ⇒ 1..100, FIXED_AMOUNT ⇒ ≥1 (`INVALID_COUPON_VALUE`). `status`
  is REQUIRED with **no** schema `.default()`. `static create(...)` injects
  `status: CouponStatus.ACTIVE` and guards expiry-in-past (`COUPON_EXPIRY_IN_PAST`).
  `deactivate(now = new Date())` guards expiry-first (`COUPON_EXPIRED`) then
  already-inactive (`COUPON_ALREADY_INACTIVE`); it does NOT call `incrementVersion()`.
  `isExpired(now)` is public.
- `src/sales/enums/{CouponType,CouponStatus,index}.ts` — plain TS string enums
  (`PERCENTAGE`/`FIXED_AMOUNT`, `ACTIVE`/`INACTIVE`).
- `src/sales/events/{CouponCreatedEvent,CouponDeactivatedEvent}.ts` (+ barrel) —
  `sales.coupon.created` (couponId, storeId, code, type, value, expiresAt? ISO) and
  `sales.coupon.deactivated` (couponId, storeId, code). Use-case-born: the entity
  never publishes or persists them.
- `src/sales/errors/index.ts` — `SalesDomainErrors` / `SalesApplicationErrors` already
  extended with every coupon code, and `registerErrorCodes` already maps them
  (422 for the four create-validation codes; 409 for `COUPON_EXPIRED` /
  `COUPON_ALREADY_INACTIVE` / `COUPON_CODE_ALREADY_EXISTS`; 404 for `COUPON_NOT_FOUND`).
- `src/sales/entities/index.ts` already re-exports `Coupon`.
- `src/sales/entities/Coupon.test.ts` — the entity unit suite (AC1–AC9). **Green.**
  Do not modify it; do not duplicate it.

> Verify for yourself before touching anything:
> `cd packages/api/typescript && bun test src/sales/entities/Coupon.test.ts` (19 pass).

## REMAINS — your job (orchestration half), binding decisions

Wire the command side so the whole slice composes. Reuse the DONE files by import — a
re-declared `Coupon` class, a second enums folder, or a parallel errors union is a
rejected restart.

- **R1. CreateCoupon** — `src/sales/usecases/CreateCoupon.ts`. Input
  `z.object({ storeId: z.uuid(), code: z.string(), type: z.enum(CouponType),
  value: z.number().int(), expiresAt: z.iso.datetime({ offset: true }).optional() })`;
  output `z.object({ couponId: z.uuid() })`. Inside `withTransaction`: normalize
  `code.trim().toUpperCase()`, `findByCode(storeId, normalized, tx)` — a hit throws
  `BaseError<ApplicationErrors>('COUPON_CODE_ALREADY_EXISTS')`; else `Coupon.create(...)`,
  `save`, construct `CouponCreatedEvent` (entityId `coupon.id.value`, ownerId
  `coupon.storeId.value`, primitive/ISO payload) and `await
  this.domainEventRepository.save(event, tx)` in the SAME tx; return `{ couponId }`.
- **R2. DeactivateCoupon** — `src/sales/usecases/DeactivateCoupon.ts`. Input
  `z.object({ storeId: z.uuid(), couponId: z.uuid() })`, output `z.void()`. In
  `withTransaction`: `findById(couponId, tx)`; missing OR
  `coupon.storeId.value !== input.storeId` ⇒ throw `COUPON_NOT_FOUND` (no cross-tenant
  leak); `coupon.deactivate()`; `save`; persist `CouponDeactivatedEvent` same tx.
- **R3. CouponRepository** — `src/sales/repositories/CouponRepository/{CouponRepository,
  DrizzleCouponRepository,MockCouponRepository,index}.ts`. Methods: `findById(id, tx?)`,
  `findByCode(storeId, code, tx?)`, `save(entity, tx?)`, `delete(id, tx?)`. `save`
  calls `entity.incrementVersion()` then `insert … onConflictDoUpdate({ target:
  coupons.id })`. `toDomain` rehydrates `new Coupon({ id, storeId, code, type, value,
  status, expiresAt: row.expiresAt ?? undefined, createdAt, updatedAt, version })` —
  the STORED status passes through unchanged (an INACTIVE row stays INACTIVE). Mirror
  `OrderOverrideRepository/`.
- **R4. Controllers** (mirror `UpdateOrderOverrideController`) —
  `src/sales/controllers/CreateCoupon.ts`: `POST /coupons`, middlewares
  `[AuthAccountMiddleware, RequireStoreMember]`, ctx `{ user: { id: z.string() },
  session: { storeId: z.uuid() } }`, body `CreateCouponInputSchema.omit({ storeId:
  true })`, 201 CREATED + `{ couponId }` — storeId comes from `ctx.session`, never the
  body. `src/sales/controllers/DeactivateCoupon.ts`: `POST
  /coupons/:couponId/deactivate`, params `z.object({ couponId: z.uuid() })`, no body,
  204 NO_CONTENT, output `z.void()`. Register both in `controllers/index.ts`; run
  `bun sdk` after.
- **R5. Persistence + migration** — add `coupons` to
  `packages/contracts/src/db/sqlite/sales.ts` under `pgSchema('sales')`: id uuid PK;
  store_id uuid notNull; code text notNull; type text notNull; status text notNull;
  value integer notNull; expires_at timestamptz NULL; created_at/updated_at timestamptz
  notNull defaultNow; version integer notNull default 1;
  `uniqueIndex('coupons_store_id_code_unq').on(t.storeId, t.code)` +
  `index('coupons_store_id_idx').on(t.storeId)`. type/status stay text (house
  no-`pgEnum` convention). Generate with `bun migrate:create` — the PGlite TestBed
  applies the tree's migrations, so the integration tests cannot pass without it.
- **R6. DI wiring** — bind `CouponRepository` in `src/sales/registry.ts`: mock → Mock,
  integration + real → Drizzle. Export the new events from `events/index.ts` (already
  done) and the new usecases/controllers from their barrels.
- **R7. Tests** — your colocated command tests live per the test skill; the verifier's
  verdict suite is injected at `src/sales/usecases/coupon-acceptance.test.ts` (AC10–AC13:
  duplicate-code, event emission in one tx, cross-tenant `COUPON_NOT_FOUND`,
  no-event-on-rejected-transition). Make it green WITHOUT editing it. State setup is
  repo-direct via `@test/support` (`givenStore`, `testId`) — never via another use case.

## Acceptance criteria (the orchestration half — AC10–AC16 of the spec)

- AC10: duplicate code per store (case/whitespace-insensitive) → `COUPON_CODE_ALREADY_EXISTS`,
  no partial state; same code in another store succeeds.
- AC11: `CreateCoupon` persists the row AND exactly one `sales.coupon.created` event
  (primitive/ISO payload) in one transaction.
- AC12: `DeactivateCoupon` persists `status = INACTIVE` AND one `sales.coupon.deactivated`
  event in one transaction.
- AC13: unknown couponId OR another store's coupon → `COUPON_NOT_FOUND` (no existence leak).
- AC14: error→HTTP mapping is already registered (errors/index.ts) — keep `import './errors'`
  in `registry.ts`.
- AC15: `POST /coupons` → 201 + `{ couponId }`; `POST /coupons/:couponId/deactivate` → 204;
  both require auth + store membership and read storeId from `ctx.session`.
- AC16: Drizzle round-trip save → findById → all props equal (incl. expiresAt, incremented
  version); a raw re-insert on `(store_id, code)` violates `coupons_store_id_code_unq`.

## Read before writing

`.claude/skills/{usecase,controller,repository,schema,db-modelling,migrate,test}/typescript/SKILL.md`,
the existing `UpdateOrderOverride.{ts,test.ts}` and `OrderOverride.ts` in `src/sales/`,
and the spec. The CLI scaffolder emits the canonical shapes (`bun cli usecase sales
CreateCoupon`, etc.) — scaffold, then fill in.

## Finishing gates (all must pass before you are done)

```
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit
cd packages/api/typescript && bun test src/sales/entities/Coupon.test.ts src/sales/usecases/coupon-acceptance.test.ts
```
