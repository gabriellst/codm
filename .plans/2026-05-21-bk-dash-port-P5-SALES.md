# P5-SALES — BC Sales (canonical Order/Cart projections + OrderOverride aggregate) — Implementation Plan (polyglot rebase, iter 43)

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`)
> syntax for tracking. Each Task wraps one observable behavior in an outer
> RED → GREEN cycle. Files land under `packages/api/typescript/src/sales/`
> per the polyglot rebase (iter 39 addendum). No Go code is in scope here —
> the Go worker is the only writer of `sales.orders` + `sales.carts` (see
> `packages/contracts/db/schema/sales.ts` header for ownership notes).

**Goal:** Land the **Sales** bounded context in TypeScript:
- **Read side (Go-fed):** `OrderProjection` + `CartProjection` (Drizzle-mapped
  to `sales.orders` + `sales.carts`) materialized by two Projectors that
  subscribe to the 6 wire events (`integration.shared.order.updated`,
  `integration.shared.order_transaction.{recorded,refunded,disputed}`,
  `integration.shared.cart.abandoned`, `integration.shared.cart.linked_to_order`)
  via the `RedisExternalMediator`.
- **Write side (TS-owned):** the `OrderOverride` aggregate keyed by composite
  PK `(orderId, storeIntegrationExternalId)`, mutated by a single unified
  `UpdateOrderOverride` command that emits the new TS-authored
  `integration.shared.order.overridden` wire event.
- **Read queries (BFF):** `OrdersList`, `OrderDetail`, `AbandonedCartsList`
  JOIN `sales.orders ⨝ sales.order_overrides` and COALESCE override fields
  over canonical fields.
- **Cart → Order linking handler:** subscribes to
  `integration.shared.pixel_event.recorded` (CHECKOUT_COMPLETED only) and,
  after the matching Order projection lands, emits
  `integration.shared.cart.linked_to_order` so other Sales installs (and
  Tracking + Analytics) close the cart → order loop.

**Architecture:** Sales is half write-side, half read-side, in one TS
context. The read-side never exposes a public mutation API — it only
reacts to wire events from go-worker via the Redis stream
`events:integration.shared.*`. The write-side is a single
`OrderOverride` aggregate UPSERTed by composite PK, with one unified
command (NOT one per field). The 3 read queries are pure Drizzle BFF
selects (no entity rehydration) since the canonical Order shape is
Go-owned and we never call methods on it.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod, Redis Streams (Go → TS), TypeSpec wire authoring.

**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md`
  - §4 **BC4 Sales** (aggregates, events, command execution behavior)
  - §7.4 Sales (T13–T15 reads, C26 UpdateOrderOverride)
  - §7.5 referenced in the Ralph sub-prompt; spec §7.5 is Catalog — content scope here follows the sub-prompt's *content* (Order projection + OrderOverride), which lives in **§4 BC4 / §7.4 / §7.13 integration event catalog**.
  - §6 Design Decisions: Canonical Projection + Override; Deterministic IDs; Multi-Currency
  - §7.13 Integration Event Catalog — the 6 Sales-consumed events + the new TS-published `integration.shared.order.overridden`

**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (iter 39 polyglot rebase addendum). Master labels this sub-plan **P6-SALES**; filename is `P5-SALES.md` per Ralph sub-prompt. Content scope is BC4 Sales.
**Depends on sub-plans:** Iter 41 (TypeSpec wire/) ✅, Iter 42 (Drizzle `packages/contracts/db/schema/sales.ts`) ✅, P1-IDENTITY (HashedID helper + namespace), P2-TENANCY (`Store.reportingCurrency`, per-store membership middleware), P4-INTEGRATION (`StoreIntegration`, `integration.shared.integration.data_wipe_requested` publisher), PG-GO-WORKER (publishes the 6 Sales wire events on Redis stream).
**Tasks:** 21 (incl. 2 Contract-Lock tasks; 1 new TypeSpec authoring task for `order-overridden.tsp`)
**Estimated minutes:** ~310

---

## Naming + path notes (read once)

1. **Sub-plan ID vs. master plan.** Master plan calls this work `P6-SALES`; Ralph sub-prompt asked for `P5-SALES.md`. Filename matches the sub-prompt; spec consistently labels this **BC4 Sales** (§4, §7.4).
2. **TS BC home (polyglot layout).** `packages/api/typescript/src/sales/`. Sibling convention source: `packages/api/typescript/src/auth/` (full BC) and `packages/api/typescript/src/ui/` (the only sibling with a Projector — see `ui/projections/projectors/VideoFeedProjector.ts`).
3. **Wire shapes come from `@template/contracts-typescript/wire`.** Do NOT redeclare envelopes or schemas — all 6 consumed events are already generated; the 7th (`OrderOverriddenEvent`) is authored in Task 2.
4. **Drizzle schema for `sales.*` is already authored** in `packages/contracts/db/schema/sales.ts` (iter 42). This sub-plan does NOT touch that file — but Task 3 generates + applies the SQL migration, and the BC's repositories import the three table objects (`orders`, `carts`, `orderOverrides`).
5. **Phase 0 inventory** is much smaller than the pre-rebase plan: no per-BC duplicate type catalog under `shared/`. All cross-cutting types (enums, monetary, transaction shapes) come from `@template/contracts-typescript/wire/enums` + `@template/core-typescript`.
6. **No Phase 1 "Does this structure match?" interactive ack.** Inside Ralph loop, the structure below IS the decision.

---

## Phase 0 — Pre-flight artifact inventory (do NOT redefine)

Already shipped by **iter 41 (contracts/wire)** and consumed via `@template/contracts-typescript/wire`:

- Enums: `PaymentStatus`, `PaymentMethod`, `PaymentGateway`, `TransactionKind`, `TransactionStatus`, `DisputeStatus`, `OrderTransactionFeeType`, `SalesPlatform`, `CheckoutPlatform`, `CurrencyCode`, `PixelEventType`.
- Integration event classes (6 Sales-consumed):
  - `OrderUpdatedEvent` (`integration.shared.order.updated`)
  - `OrderTransactionRecordedEvent` (`integration.shared.order_transaction.recorded`)
  - `OrderTransactionRefundedEvent` (`integration.shared.order_transaction.refunded`)
  - `OrderTransactionDisputedEvent` (`integration.shared.order_transaction.disputed`)
  - `CartAbandonedEvent` (`integration.shared.cart.abandoned`)
  - `CartLinkedToOrderEvent` (`integration.shared.cart.linked_to_order`)
- Additionally consumed by Sales for cart linking: `PixelEventRecordedEvent` (`integration.shared.pixel_event.recorded`).
- `integration.shared.integration.data_wipe_requested` is owned by P4-INTEGRATION; Sales subscribes to cascade-delete its canonical rows.

Already shipped by **iter 42 (contracts/db/schema/sales.ts)**:
- `salesSchema = pgSchema('sales')`
- `orders` table — 34 columns, 4 indexes, Go-owned writer (notes in file header)
- `carts` table — Go-owned writer
- `orderOverrides` table — composite PK `(orderId, storeIntegrationExternalId)`, TS-owned writer

Framework primitives consumed from `@template/core-typescript`:
- `BoundedContext`, `Controller`, `Handler`, `EventHandler`, `Projector`, `BaseEntity`, `AggregateRoot`, `Repository`, `BaseError`, `BaseDomainEvent`, `BaseIntegrationEvent`, `Transaction`, `DrizzleClient`, `HttpStatusCode`, `registerErrorCodes`, `z`, `MainRouter`.

**This plan owns** (no prior sub-plan ships them):
- TypeSpec authoring of `packages/contracts/wire/events/order-overridden.tsp` (Task 2; this is the **only** TS-published wire event in BC4).
- The whole `packages/api/typescript/src/sales/` BC.
- The SQL migration generated from `packages/contracts/db/schema/sales.ts` (Task 3).
- Sales error codes + registration (Task 1 + Task 21 wiring).

**Assumed already landed by P1-IDENTITY** (referenced; if absent, fix imports only):
- `HashedID(platform, externalId)` helper at `packages/api/typescript/core/src/objects/HashedID.ts` (per polyglot core convention `core/objects/`) with the locked `BK_DASH_NAMESPACE` constant.

**Assumed already landed by P2-TENANCY** (referenced):
- `Store.reportingCurrency: CurrencyCode` (read by `OrdersList` for the `totalInReportingCurrency` field).
- Tenancy middleware that asserts the caller's StoreMembership for every `storeId` in the request. Controllers in Tasks 15/19 mount it; this plan does NOT re-implement multistore authorization.

**Assumed already landed by P4-INTEGRATION** (referenced):
- `StoreIntegration` aggregate with id = `HashedID(platform, externalId)`.
- `integration.shared.integration.data_wipe_requested` wire event (authored by P4). Sales's external handler cascades delete on it.

**Assumed already landed by PG-GO-WORKER** (referenced):
- go-worker emits the 6 Sales-consumed wire events on Redis stream `events:integration.shared.*`.
- Payload shapes match the TypeSpec `.tsp` (iter 41 already verified).
- The `id` column on `sales.orders` is computed by Go as `UUIDv5(BK_DASH_NAMESPACE, "${platform}:${externalId}")` — the deterministic ID rule (spec §6).

---

## Phase 1 — File Structure (locked in)

```
Create: packages/api/typescript/src/sales/
├── index.ts                                                 # BoundedContext.create({...}) — pattern: packages/api/typescript/src/auth/index.ts
├── registry.ts                                              # INSTANCE_REGISTRY (mock/integration/real) — pattern: auth/registry.ts
├── enums/
│   └── index.ts                                             # re-export wire enums actually consumed in this BC (or empty)
├── errors/
│   └── index.ts                                             # DomainErrors / ApplicationErrors / Errors + registerErrorCodes side-effect
├── objects/                                                 # value-object kind (pattern: auth/objects/Email.ts)
│   ├── OrderOverrideFields.ts                              # Zod schema for the typed partial-fields payload
│   └── index.ts
├── entities/
│   ├── OrderOverride.ts                                     # AggregateRoot — composite PK in props, single create/merge surface
│   ├── OrderOverride.test.ts
│   └── index.ts
├── repositories/
│   ├── index.ts
│   ├── OrderOverrideRepository/
│   │   ├── OrderOverrideRepository.ts                       # abstract
│   │   ├── MockOrderOverrideRepository.ts
│   │   ├── DrizzleOrderOverrideRepository.ts
│   │   ├── DrizzleOrderOverrideRepository.test.ts
│   │   └── index.ts
│   ├── OrderProjectionRepository/                           # READ-side; pattern: ui/repositories/VideoFeedProjectionRepository/
│   │   ├── OrderProjectionRepository.ts                     # abstract — findById, deleteByStoreIntegrationId; insert/save are package-private (Projector only)
│   │   ├── MockOrderProjectionRepository.ts
│   │   ├── DrizzleOrderProjectionRepository.ts
│   │   ├── DrizzleOrderProjectionRepository.test.ts
│   │   └── index.ts
│   └── CartProjectionRepository/
│       ├── CartProjectionRepository.ts                      # abstract — findById, findByCartExternalId, setLinkedOrderId (atomic), deleteByStoreIntegrationId
│       ├── MockCartProjectionRepository.ts
│       ├── DrizzleCartProjectionRepository.ts
│       ├── DrizzleCartProjectionRepository.test.ts
│       └── index.ts
├── projections/                                              # pattern: ui/projections/
│   ├── OrderProjection.ts                                   # free record; OrderProjectionEvent union from wire classes
│   ├── OrderProjection.test.ts
│   ├── CartProjection.ts                                    # free record; CartProjectionEvent union from wire classes
│   ├── CartProjection.test.ts
│   ├── projectors/
│   │   ├── OrderProjector.ts                                # switch on event.name over the 4 order/transaction events
│   │   ├── OrderProjector.test.ts
│   │   ├── CartProjector.ts                                 # switch on cart.abandoned + cart.linked_to_order
│   │   ├── CartProjector.test.ts
│   │   └── index.ts
│   └── index.ts
├── events/                                                   # one TS-emitted DOMAIN event for the override; no internal-mirror events (Projectors subscribe directly to wire classes — see ui/ sibling)
│   ├── OrderOverriddenEvent.ts                              # internal domain event raised by the use case; later forwarded to wire by the OrderOverriddenForwarder handler
│   └── index.ts
├── handlers/
│   ├── external.ts                                          # re-export of all external handlers (consumed by BoundedContext.create)
│   ├── internal.ts                                          # re-export of internal handlers
│   ├── CartLinkingFromPixelHandler.ts                       # external — subscribes to PixelEventRecordedEvent (CHECKOUT_COMPLETED only); after Order match emits integration.shared.cart.linked_to_order
│   ├── StoreIntegrationDataWipedHandler.ts                  # external — subscribes to integration.shared.integration.data_wipe_requested; cascade-delete orders + carts (NOT overrides)
│   ├── OrderOverriddenForwarder.ts                          # internal — subscribes to OrderOverriddenEvent (domain), publishes integration.shared.order.overridden on ExternalMediator
│   └── index.ts
├── usecases/
│   ├── UpdateOrderOverride.ts                               # UNIFIED single command, partial OrderOverrideFields payload, emits OrderOverriddenEvent (domain)
│   ├── UpdateOrderOverride.test.ts
│   └── index.ts
├── queries/                                                 # BFF — direct Drizzle, no entity rehydration
│   ├── OrdersList.ts                                        # T13
│   ├── OrdersList.test.ts
│   ├── OrderDetail.ts                                       # T14
│   ├── OrderDetail.test.ts
│   ├── AbandonedCartsList.ts                                # T15
│   ├── AbandonedCartsList.test.ts
│   ├── FxConversionService.ts                               # per-query helper; reads FxRate via P9-FINANCE repo when available; falls back to native (spec §6 Multi-Currency rule 3)
│   └── index.ts
└── controllers/
    ├── UpdateOrderOverrideController.ts                     # POST /sales/orders/:orderId/override (C26)
    ├── ListOrdersController.ts                              # POST /sales/orders/query (T13)
    ├── GetOrderDetailController.ts                          # GET  /sales/orders/:orderId (T14)
    ├── ListAbandonedCartsController.ts                      # POST /sales/carts/abandoned/query (T15)
    └── index.ts

Create: packages/contracts/wire/events/order-overridden.tsp
  Authored as part of Task 2. Published by TS Sales after UpdateOrderOverride
  succeeds. Carries { orderId, storeIntegrationExternalId, changedFields[] }.
  Run `bun run codegen:wire` to emit generated/ shapes.

Modify: packages/contracts/wire/events/index.tsp
  Add `import "./order-overridden.tsp"` (Task 2).

Modify: packages/api/typescript/src/index.ts
  Add: `import SalesRouter from '@sales/index'` + include in `routers` array.
  Sibling: existing `AuthRouter`, `NotificationsRouter`, `UIRouter`.

Modify: packages/contracts/db/migrations/  (generated by `bun run drizzle:generate`)
  Adds: <NNNN>_sales_canonical_and_overrides.sql — three tables + indexes
  + composite PK. Mirrors `packages/contracts/db/schema/sales.ts`.

Modify: packages/api/typescript/tsconfig.json (paths) OR project's existing
  alias setup so `@sales/*` resolves to `src/sales/*` (pattern: `@auth/*`, `@ui/*`).
```

> Anti-invention check: every file ties to (a) an AC, (b) a spec citizen, or
> (c) an obvious technical necessity. No `Service` / `Helper` / `Factory`
> beyond `FxConversionService` (per-query helper, see Task 17).

---

## Phase 1.5 — AC mapping (read alongside Final Validation)

| Spec ref | Behavior | Implementing Task(s) | Test(s) |
|---|---|---|---|
| §7.4 T13 OrdersList | Read paginated orders w/ filters + multistore | T17 | `queries/OrdersList.test.ts` |
| §7.4 T14 OrderDetail | Read single order + join override + per-line overridden cost | T18 | `queries/OrderDetail.test.ts` |
| §7.4 T15 AbandonedCartsList | Read paginated carts w/ `linked` filter | T19 | `queries/AbandonedCartsList.test.ts` |
| §7.4 C26 UpdateOrderOverride | UPSERT override pinned by composite PK, partial typed fields, emits OrderOverridden | T13 | `usecases/UpdateOrderOverride.test.ts` |
| §4 BC4 — Order/Cart write-locked from users | No public controller writes to `sales.orders` or `sales.carts` | T6 (Projector only), T11 (cascade-delete via wipe) | `OrderProjector.test.ts` (no mutation API exposed) |
| §4 BC4 — OrderUpdated consumed | OrderProjector reacts via Redis stream | T6, T7 | `OrderProjector.test.ts` |
| §4 BC4 — OrderTransaction{Recorded,Refunded,Disputed} consumed | All 3 nested under `orders.transactions` JSONB | T7 | `OrderProjector.test.ts` |
| §4 BC4 — CartAbandoned / CartLinkedToOrder consumed | CartProjector reacts | T9, T10 | `CartProjector.test.ts` |
| §4 BC4 — CHECKOUT_COMPLETED → Cart→Order linking | Handler subscribes to PixelEventRecorded, emits CartLinkedToOrder | T12 | `CartLinkingFromPixelHandler.test.ts` |
| §4 BC4 — OrderOverridden emitted | UpdateOrderOverride domain-publishes; Forwarder maps to wire | T13 + T14 | `UpdateOrderOverride.test.ts` (outbox row) + forwarder test |
| §4 BC4 — Wipe cascade preserves overrides | StoreIntegrationDataWipedHandler deletes Orders + Carts ONLY | T11 | `StoreIntegrationDataWipedHandler.test.ts` |
| §6 Deterministic IDs — Order.id = UUIDv5(platform, externalId) | Projector trusts go-worker-supplied entityId; repo PK matches | T6 | `OrderProjector.test.ts` (asserts `row.id` matches `HashedID(platform, externalId)`) |
| §6 Multi-Currency — native storage; per-query conversion | Orders stored in native currency; `OrdersList` computes `totalInReportingCurrency` via FxConversionService | T17 + T18 | `OrdersList.test.ts` |
| §6 Override survives integration disconnect/reconnect | Override keyed by `storeIntegrationExternalId` (stable string), NOT `storeIntegrationId` (rotates) | T4 (entity validation), T13 (UPSERT by composite PK) | `OrderOverride.test.ts`, `DrizzleOrderOverrideRepository.test.ts` |

---

## Task 1: Sales BC skeleton + DI registry + error codes — compiles before any behavior

**Files:**
- Create: `packages/api/typescript/src/sales/index.ts`
- Create: `packages/api/typescript/src/sales/registry.ts`
- Create: `packages/api/typescript/src/sales/errors/index.ts`
- Create: empty barrels — `entities/index.ts`, `objects/index.ts`, `repositories/index.ts`, `usecases/index.ts`, `queries/index.ts`, `controllers/index.ts`, `events/index.ts`, `projections/index.ts`, `projections/projectors/index.ts`, `handlers/{internal,external,index}.ts`
- Modify: `packages/api/typescript/src/index.ts` — import `SalesRouter`, append to `routers`
- Modify: `packages/api/typescript/tsconfig.json` — add `@sales/*` path alias
- Test: `packages/api/typescript/src/sales/index.test.ts` (asserts the router exports)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context, /errors
**Depends on:** iter 41 + iter 42 complete; sibling `packages/api/typescript/src/auth/` available as the template.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/api/typescript/src/sales/index.test.ts
import { describe, expect, it } from 'bun:test'
import router from './index'

describe('sales context', () => {
  it('boots and exposes a router', () => {
    expect(router).toBeDefined()
    expect(typeof (router as any).controllers).toBe('object')
  })
})
```

- [ ] **Step 2: Verify failure** — `bun test packages/api/typescript/src/sales/index.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write skeleton**

`packages/api/typescript/src/sales/errors/index.ts` (mirror `auth/errors/index.ts`):

```typescript
import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type {
  BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors,
} from '@template/core-typescript'

export type SalesDomainErrors = 'INVALID_ORDER_OVERRIDE_FIELDS'
export type DomainErrors = BaseDomainErrors | SalesDomainErrors

export type SalesApplicationErrors = 'ORDER_NOT_FOUND' | 'INVALID_LINE_ID'
export type ApplicationErrors = BaseApplicationErrors | SalesApplicationErrors

export type InterfaceErrors = BaseInterfaceErrors
export type InfrastructureErrors = BaseInfrastructureErrors
export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
  INVALID_ORDER_OVERRIDE_FIELDS: HttpStatusCode.UNPROCESSABLE_ENTITY,
  ORDER_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  INVALID_LINE_ID: HttpStatusCode.UNPROCESSABLE_ENTITY,
})
```

`packages/api/typescript/src/sales/registry.ts` (mirror `auth/registry.ts`):

```typescript
import './errors' // side-effect: register error codes
import type { InstanceRegistry } from '@template/core-typescript'

export const INSTANCE_REGISTRY: InstanceRegistry = {
  mock: [],
  integration: [],
  real: [],
}
```

`packages/api/typescript/src/sales/index.ts` (mirror `auth/index.ts` + `ui/index.ts` for projectors):

```typescript
import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import * as projectors from './projections/projectors'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { INSTANCE_REGISTRY } from './registry'

const ctx = await BoundedContext.create({
  name: 'sales',
  controllers,
  projectors,
  internalHandlers,
  externalHandlers,
  registry: INSTANCE_REGISTRY,
})

export default ctx.router
```

Empty barrels (`export {}`) for every sub-folder so imports resolve.

Modify `packages/api/typescript/src/index.ts`: import `SalesRouter from '@sales/index'` and add to the `routers` array.

Modify `packages/api/typescript/tsconfig.json`: add `"@sales/*": ["src/sales/*"]` to `compilerOptions.paths` (mirror `@auth/*`).

- [ ] **Step 4: Verify pass + tsc/lint**

```bash
bun test packages/api/typescript/src/sales/index.test.ts && bun tsc && bun lint
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/typescript/src/sales/ packages/api/typescript/src/index.ts packages/api/typescript/tsconfig.json
git commit -m "feat(sales): scaffold BC + DI registry + error codes + main-router wiring (P5 Task 1)"
```

---

## Task 2: Author `order-overridden.tsp` + regen wire

**Files:**
- Create: `packages/contracts/wire/events/order-overridden.tsp`
- Modify: `packages/contracts/wire/events/index.tsp` — add `import "./order-overridden.tsp"`
- Regen: `packages/contracts/generated/{typescript,go,rust}/wire/events/order-overridden.{ts,go,rs}` via `bun run codegen:wire`
- Test: extend the generated-export sanity test (or add one) that checks the new schema validates a sample payload.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event, /schema
**Depends on:** Task 1

- [ ] **Step 1: Write the `.tsp`** (mirror shape of `cart-linked-to-order.tsp`):

```typescript
// packages/contracts/wire/events/order-overridden.tsp
import "./_base.tsp";

namespace TemplateContracts;

@doc("Published by TS Sales after UpdateOrderOverride mutates an OrderOverride row. Downstream consumers: Analytics (cache invalidation on dashboard metrics), Notifications (per-Store opt-in audit), Marketing (recomputed ROAS rollups). The override is keyed by composite (orderId, storeIntegrationExternalId).")
model OrderOverriddenEvent extends IntegrationEvent {
  name: "integration.shared.order.overridden";

  @doc("Canonical Order id (UUIDv5 from go-worker).")
  orderId: string;

  @doc("Provider's StoreIntegration externalId (stable across disconnect/reconnect — the pin half of the override composite PK).")
  storeIntegrationExternalId: string;

  @doc("Field names from the OrderOverrideFields payload whose values actually changed in this update. Empty array means no-op merge (still emitted for audit completeness).")
  changedFields: string[];
}
```

- [ ] **Step 2: Add import to `wire/events/index.tsp`** (one-line addition).

- [ ] **Step 3: Regen** — `bun run codegen:wire`. Hand-verify
  `packages/contracts/generated/typescript/src/wire/events/order-overridden.ts`
  exposes `OrderOverriddenEvent` + `OrderOverriddenEventSchema` and the
  barrel in `events/index.ts` re-exports them.

- [ ] **Step 4: Smoke test**

```typescript
import { OrderOverriddenEvent } from '@template/contracts-typescript/wire'

it('OrderOverriddenEvent.name is locked', () => {
  expect(OrderOverriddenEvent.name).toBe('integration.shared.order.overridden')
})
```

- [ ] **Step 5: Verify pass + tsc/lint + commit**

```bash
git add packages/contracts/wire/events/order-overridden.tsp \
        packages/contracts/wire/events/index.tsp \
        packages/contracts/generated/
git commit -m "feat(contracts): author integration.shared.order.overridden wire event (P5 Task 2)"
```

---

## Task 3: Generate + apply the `sales.*` migration

**Files:**
- Generated: `packages/contracts/db/migrations/<NNNN>_sales_canonical_and_overrides.sql`

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** sonnet
**Skills:** /migrate
**Depends on:** Task 1 (schema file already exists; only the migration generation is new)

- [ ] **Step 1: Generate** — `bun run drizzle:generate`

- [ ] **Step 2: Hand-review the SQL**
  - `CREATE SCHEMA "sales"` (patched to `IF NOT EXISTS` if /migrate skill prescribes it).
  - 3 tables: `sales.orders`, `sales.carts`, `sales.order_overrides`.
  - Columns: every BIGINT column for `*_cents`; every TIMESTAMPTZ for `*_at`; JSONB for `lines`/`transactions`/`utm`/`shipping_address`/`product_cost_by_line`.
  - Indexes match `packages/contracts/db/schema/sales.ts`: `orders_platform_external_id_unq`, `orders_store_id_idx`, `orders_store_integration_id_idx`, `orders_external_created_at_idx`; same pattern for `carts`; composite PK on `order_overrides` + `order_overrides_order_id_idx`.

- [ ] **Step 3: Apply locally** — `bun migrate:dev` (or the polyglot equivalent). Verify tables exist via `psql`.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/db/migrations/
git commit -m "feat(sales): apply canonical orders/carts/order_overrides migration (P5 Task 3)"
```

---

## Task 4: OrderOverride aggregate (write-side entity)

**Files:**
- Create: `packages/api/typescript/src/sales/objects/OrderOverrideFields.ts`
- Create: `packages/api/typescript/src/sales/objects/index.ts`
- Create: `packages/api/typescript/src/sales/entities/OrderOverride.ts`
- Create: `packages/api/typescript/src/sales/entities/index.ts`
- Test: `packages/api/typescript/src/sales/entities/OrderOverride.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /value-object, /schema
**Depends on:** Task 1

- [ ] **Step 1: Write the failing test** — covers: create with empty fields default; `mergeFields()` shallow-merges and bumps `updatedByUserId`; `changedFields(incoming)` returns the keys whose values differ; invalid `OrderOverrideFields` shapes throw `INVALID_ORDER_OVERRIDE_FIELDS`.

- [ ] **Step 2: Implement `OrderOverrideFields`** (mirror shape of spec §1.2 *Merchant Overrides (Sales)*; field set must match Drizzle columns in `order_overrides` exactly):

```typescript
// packages/api/typescript/src/sales/objects/OrderOverrideFields.ts
import { z } from '@template/core-typescript'
import { PaymentStatusSchema, PaymentMethodSchema, CurrencyCodeSchema } from '@template/contracts-typescript/wire'

const MonetaryAmountSchema = z.object({
  amountCents: z.number().int(),
  currency: CurrencyCodeSchema,
})

const ProductCostByLineEntrySchema = z.object({
  lineId: z.string(),
  cost: MonetaryAmountSchema,
})

export const OrderOverrideFieldsSchema = z.object({
  paymentMethod: PaymentMethodSchema.optional(),
  paymentStatus: PaymentStatusSchema.optional(),
  revenue: MonetaryAmountSchema.optional(),
  shipping: MonetaryAmountSchema.optional(),
  fees: MonetaryAmountSchema.optional(),
  taxes: MonetaryAmountSchema.optional(),
  productCostByLine: z.array(ProductCostByLineEntrySchema).optional(),
}).strict()

export type OrderOverrideFields = z.infer<typeof OrderOverrideFieldsSchema>
```

- [ ] **Step 3: Implement `OrderOverride`** (mirror `auth/entities/User.ts`):

```typescript
// packages/api/typescript/src/sales/entities/OrderOverride.ts
import { AggregateRoot, BaseError, z } from '@template/core-typescript'
import Z from 'zod'
import { OrderOverrideFieldsSchema, type OrderOverrideFields } from '../objects/OrderOverrideFields'
import type { SalesDomainErrors } from '../errors'

const OrderOverrideSchema = z.object({
  storeId: z.string(),
  orderId: z.string(),
  storeIntegrationExternalId: z.string(),
  fields: OrderOverrideFieldsSchema,
  updatedByuserId: z.uuid(),
})

export type OrderOverrideProps = Z.infer<typeof OrderOverrideSchema>

export class OrderOverride extends AggregateRoot<typeof OrderOverrideSchema> {
  static override schema = OrderOverrideSchema

  static create(data: { storeId: string; orderId: string; storeIntegrationExternalId: string; fields: OrderOverrideFields; updatedByUserId: string }): OrderOverride {
    const parsed = OrderOverrideFieldsSchema.safeParse(data.fields)
    if (!parsed.success) throw new BaseError<SalesDomainErrors>('INVALID_ORDER_OVERRIDE_FIELDS', parsed.error.issues[0]?.message)
    return new OrderOverride({ ...data, fields: parsed.data })
  }

  mergeFields(patch: OrderOverrideFields, byUserId: string): void {
    const parsed = OrderOverrideFieldsSchema.safeParse(patch)
    if (!parsed.success) throw new BaseError<SalesDomainErrors>('INVALID_ORDER_OVERRIDE_FIELDS', parsed.error.issues[0]?.message)
    this.fields = { ...this.fields, ...parsed.data }
    this.updatedByUserId = byUserId
  }

  changedFields(incoming: OrderOverrideFields): (keyof OrderOverrideFields)[] {
    return (Object.keys(incoming) as (keyof OrderOverrideFields)[])
      .filter(k => JSON.stringify(this.fields[k]) !== JSON.stringify(incoming[k]))
  }
}

export interface OrderOverride extends OrderOverrideProps {}
```

- [ ] **Step 4: Verify + commit**

```bash
git add packages/api/typescript/src/sales/objects/ packages/api/typescript/src/sales/entities/
git commit -m "feat(sales): OrderOverride aggregate + OrderOverrideFields value object (P5 Task 4)"
```

---

## Task 5: OrderOverrideRepository — abstract + Mock + Drizzle, composite PK UPSERT

**Files:**
- Create: `packages/api/typescript/src/sales/repositories/OrderOverrideRepository/{OrderOverrideRepository,MockOrderOverrideRepository,DrizzleOrderOverrideRepository,index}.ts`
- Test: `packages/api/typescript/src/sales/repositories/OrderOverrideRepository/DrizzleOrderOverrideRepository.test.ts`
- Modify: `packages/api/typescript/src/sales/registry.ts` — bind `OrderOverrideRepository`
- Modify: `packages/api/typescript/src/sales/repositories/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository
**Depends on:** Tasks 3, 4

- [ ] **Step 1: Test (integration mode)** — covers: `findByPin(orderId, storeIntegrationExternalId)` returns null when absent; `save` UPSERTs by composite PK (second call with same pin overwrites, not duplicate-inserts); fields JSONB round-trips lossless; `version` bumps on save.

- [ ] **Step 2: Implement** — abstract:

```typescript
import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { OrderOverride } from '../../entities/OrderOverride'

export abstract class OrderOverrideRepository extends Repository<OrderOverride> {
  abstract findByPin(orderId: string, storeIntegrationExternalId: string, tx?: Transaction): Promise<OrderOverride | undefined>
  abstract save(entity: OrderOverride, tx?: Transaction): Promise<OrderOverride>
}
```

Drizzle implementation: `onConflictDoUpdate({ target: [orderOverrides.orderId, orderOverrides.storeIntegrationExternalId], set: { /* flattened columns from entity.fields */ } })`. The fields → columns mapping flattens: `fields.paymentMethod → paymentMethod`, `fields.revenue → revenueAmountCents + revenueCurrency`, etc. Pattern: `auth/repositories/UserRepository/DrizzleUserRepository.ts`.

- [ ] **Step 3: Bind in registry** (mirror `auth/registry.ts`).

- [ ] **Step 4: Verify + commit**

```bash
git add packages/api/typescript/src/sales/repositories/ packages/api/typescript/src/sales/registry.ts
git commit -m "feat(sales): OrderOverrideRepository — abstract + Drizzle + Mock + composite-PK UPSERT (P5 Task 5)"
```

---

## Task 6: OrderProjection (read-side record) + event union

**Files:**
- Create: `packages/api/typescript/src/sales/projections/OrderProjection.ts`
- Test: `packages/api/typescript/src/sales/projections/OrderProjection.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /projection
**Depends on:** Task 3

- [ ] **Step 1: Write failing tests** — cover: `create(OrderUpdatedEvent)` when `isNew=true` builds a fully-populated row; `applyEvent(OrderUpdatedEvent)` (`isNew=false`) overwrites mutable fields; `applyEvent(OrderTransactionRecordedEvent)` appends to a `transactions` array; refund/dispute branches update existing entries.

- [ ] **Step 2: Implement** — pattern: `ui/projections/VideoFeedProjection.ts`.

```typescript
import { z as _z } from 'zod'
import { z } from '@template/core-typescript'
import {
  OrderUpdatedEvent,
  OrderTransactionRecordedEvent,
  OrderTransactionRefundedEvent,
  OrderTransactionDisputedEvent,
} from '@template/contracts-typescript/wire'

export const OrderProjectionSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  storeIntegrationId: z.string(),
  storeIntegrationExternalId: z.string(),
  platform: z.string(),
  externalId: z.string(),
  paymentStatus: z.string(),
  totalCents: z.number().int(),
  currency: z.string(),
  transactions: z.array(z.object({
    externalId: z.string(),
    kind: z.string(),
    status: z.string(),
    amountCents: z.number().int(),
    currency: z.string(),
    disputeStatus: z.string().nullable().optional(),
  })).default([]),
  updatedAt: z.date().default(() => new Date()),
})
export type OrderProjectionProps = _z.infer<typeof OrderProjectionSchema>

export type OrderProjectionEvent =
  | OrderUpdatedEvent
  | OrderTransactionRecordedEvent
  | OrderTransactionRefundedEvent
  | OrderTransactionDisputedEvent

export class OrderProjection {
  constructor(public props: OrderProjectionProps) {}

  static create(event: OrderUpdatedEvent): OrderProjection {
    const p = event.payload
    return new OrderProjection(OrderProjectionSchema.parse({
      id: event.entityId,
      storeId: event.ownerId,
      storeIntegrationId: '', // hydrated by Projector via lookup if needed; left empty here because wire shape only carries externalId
      storeIntegrationExternalId: p.storeIntegrationExternalId,
      platform: p.platform,
      externalId: p.externalId,
      paymentStatus: p.paymentStatus,
      totalCents: Number(p.totalCents),
      currency: p.currency,
      transactions: [],
    }))
  }

  applyEvent(event: OrderProjectionEvent): void {
    switch (event.name) {
      case OrderUpdatedEvent.name: {
        const p = (event as OrderUpdatedEvent).payload
        this.props.paymentStatus = p.paymentStatus
        this.props.totalCents = Number(p.totalCents)
        this.props.currency = p.currency
        this.props.updatedAt = new Date()
        return
      }
      case OrderTransactionRecordedEvent.name: {
        const p = (event as OrderTransactionRecordedEvent).payload
        const i = this.props.transactions.findIndex(t => t.externalId === p.transactionExternalId)
        const tx = { externalId: p.transactionExternalId, kind: p.kind, status: p.status, amountCents: Number(p.amountCents), currency: p.currency }
        if (i >= 0) this.props.transactions[i] = tx
        else this.props.transactions.push(tx)
        this.props.updatedAt = new Date()
        return
      }
      case OrderTransactionRefundedEvent.name: {
        const p = (event as OrderTransactionRefundedEvent).payload
        const i = this.props.transactions.findIndex(t => t.externalId === p.transactionExternalId)
        const tx = { externalId: p.transactionExternalId, kind: 'REFUND', status: 'SUCCESS', amountCents: Number(p.amountCents), currency: p.currency }
        if (i >= 0) this.props.transactions[i] = tx
        else this.props.transactions.push(tx)
        this.props.paymentStatus = p.resultingPaymentStatus
        this.props.updatedAt = new Date()
        return
      }
      case OrderTransactionDisputedEvent.name: {
        const p = (event as OrderTransactionDisputedEvent).payload
        const i = this.props.transactions.findIndex(t => t.externalId === p.transactionExternalId)
        if (i >= 0) this.props.transactions[i] = { ...this.props.transactions[i], disputeStatus: p.disputeStatus }
        this.props.updatedAt = new Date()
        return
      }
    }
  }
}
```

> Note: the lean `OrderProjectionSchema` above projects the wire-derivable
> fields only. Tasks 7 (`OrderProjectionRepository`) and 17–18 (queries) read
> additional `sales.orders` columns (lines, transactions, customer, etc.)
> directly via Drizzle; the Projection class is only the canonical mutation
> surface used by the Projector. This matches the Go-owned write rule.

- [ ] **Step 3: Verify + commit**

```bash
git add packages/api/typescript/src/sales/projections/OrderProjection.ts packages/api/typescript/src/sales/projections/OrderProjection.test.ts
git commit -m "feat(sales): OrderProjection record + event union (P5 Task 6)"
```

---

## Task 7: OrderProjectionRepository + DrizzleOrderProjector mapping

**Files:**
- Create: `packages/api/typescript/src/sales/repositories/OrderProjectionRepository/{OrderProjectionRepository,MockOrderProjectionRepository,DrizzleOrderProjectionRepository,index}.ts`
- Test: `packages/api/typescript/src/sales/repositories/OrderProjectionRepository/DrizzleOrderProjectionRepository.test.ts`
- Modify: `packages/api/typescript/src/sales/registry.ts` — bind `OrderProjectionRepository`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /projection
**Depends on:** Tasks 3, 6

- [ ] **Step 1: Test** (integration) — covers: `insertIfNew` idempotent on `id`; `findById` round-trips; `save` mirrors to row via `onConflictDoUpdate(id)`; `deleteByStoreIntegrationId` returns count.

- [ ] **Step 2: Implement** abstract surface (minimal — Projector calls these only; queries go direct to Drizzle):

```typescript
export abstract class OrderProjectionRepository {
  abstract findById(id: string, tx?: Transaction): Promise<OrderProjection | undefined>
  abstract insertIfNew(p: OrderProjection, tx?: Transaction): Promise<boolean>
  abstract save(p: OrderProjection, tx?: Transaction): Promise<void>
  abstract deleteByStoreIntegrationId(storeIntegrationId: string, tx?: Transaction): Promise<number>
}
```

Drizzle impl uses `@template/contracts/db` re-exported `orders` table. Pattern: `auth/repositories/UserRepository/DrizzleUserRepository.ts`. `insertIfNew` → `.onConflictDoNothing({ target: orders.id })`; `save` → `.onConflictDoUpdate({ target: orders.id, set: { ... } })`. `deleteByStoreIntegrationId` → `.delete(orders).where(eq(orders.storeIntegrationId, ...))`.

- [ ] **Step 3: Bind in registry + commit**

```bash
git add packages/api/typescript/src/sales/repositories/OrderProjectionRepository/ packages/api/typescript/src/sales/registry.ts
git commit -m "feat(sales): OrderProjectionRepository — abstract + Drizzle + Mock (P5 Task 7)"
```

---

## Task 8: OrderProjector — switch dispatch on the 4 order/transaction wire events

**Files:**
- Create: `packages/api/typescript/src/sales/projections/projectors/OrderProjector.ts`
- Create: `packages/api/typescript/src/sales/projections/projectors/index.ts`
- Test: `packages/api/typescript/src/sales/projections/projectors/OrderProjector.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /projector
**Depends on:** Task 7

- [ ] **Step 1: Test** (integration) — covers: `OrderUpdatedEvent` (`isNew=true`) → `insertIfNew`; `isNew=false` → `find → applyEvent → save`; `find` returns nothing → promote to `insertIfNew` (out-of-order safety); refund/dispute on unknown order = silent no-op (replay-safe); same event twice = idempotent.

- [ ] **Step 2: Implement** (mirror `ui/projections/projectors/VideoFeedProjector.ts`):

```typescript
import { injectable } from 'tsyringe-neo'
import { Projector } from '@template/core-typescript'
import {
  OrderUpdatedEvent,
  OrderTransactionRecordedEvent,
  OrderTransactionRefundedEvent,
  OrderTransactionDisputedEvent,
} from '@template/contracts-typescript/wire'
import { OrderProjection, type OrderProjectionEvent } from '../OrderProjection'
import { OrderProjectionRepository } from '../../repositories/OrderProjectionRepository/OrderProjectionRepository'

@injectable()
export class OrderProjector extends Projector<OrderProjectionEvent> {
  readonly events = [
    OrderUpdatedEvent.name,
    OrderTransactionRecordedEvent.name,
    OrderTransactionRefundedEvent.name,
    OrderTransactionDisputedEvent.name,
  ] as const

  constructor(private repo: OrderProjectionRepository) { super() }

  async handle(event: OrderProjectionEvent): Promise<void> {
    if (event.name === OrderUpdatedEvent.name) {
      const e = event as OrderUpdatedEvent
      if (e.payload.isNew) {
        await this.repo.insertIfNew(OrderProjection.create(e))
        return
      }
      const existing = await this.repo.findById(e.entityId)
      if (!existing) { await this.repo.insertIfNew(OrderProjection.create(e)); return }
      existing.applyEvent(e)
      await this.repo.save(existing)
      return
    }
    // Transaction events — silent no-op if Order not yet projected.
    const existing = await this.repo.findById(event.entityId)
    if (!existing) return
    existing.applyEvent(event)
    await this.repo.save(existing)
  }
}
```

- [ ] **Step 3: `index.ts`**

```typescript
export * from './OrderProjector'
export * from './CartProjector' // landed in Task 10
```

- [ ] **Step 4: Verify + commit**

```bash
git add packages/api/typescript/src/sales/projections/projectors/OrderProjector.ts \
        packages/api/typescript/src/sales/projections/projectors/OrderProjector.test.ts \
        packages/api/typescript/src/sales/projections/projectors/index.ts
git commit -m "feat(sales): OrderProjector — switch dispatch over 4 wire events, replay-safe (P5 Task 8)"
```

---

## Task 9: CartProjection + CartProjectionRepository

**Files:**
- Create: `packages/api/typescript/src/sales/projections/CartProjection.ts`
- Create: `packages/api/typescript/src/sales/repositories/CartProjectionRepository/{CartProjectionRepository,MockCartProjectionRepository,DrizzleCartProjectionRepository,index}.ts`
- Test: `packages/api/typescript/src/sales/projections/CartProjection.test.ts`
- Test: `packages/api/typescript/src/sales/repositories/CartProjectionRepository/DrizzleCartProjectionRepository.test.ts`
- Modify: `packages/api/typescript/src/sales/registry.ts` — bind `CartProjectionRepository`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /projection, /repository
**Depends on:** Tasks 3, 6, 7

CartProjection:
- `create(event: CartAbandonedEvent)` materializes initial row (totalCents/currency/itemCount; lines hydrated empty since wire payload only carries summary stats — denormalized lines/customer come from go-worker direct insert before the event).
- `applyEvent(event: CartLinkedToOrderEvent)` sets `linkedOrderId` + `recoveredAt`.

```typescript
export type CartProjectionEvent = CartAbandonedEvent | CartLinkedToOrderEvent
```

CartProjectionRepository — abstract surface:

```typescript
export abstract class CartProjectionRepository {
  abstract findById(id: string, tx?: Transaction): Promise<CartProjection | undefined>
  abstract findByCartExternalId(platform: string, cartExternalId: string, tx?: Transaction): Promise<CartProjection | undefined>
  abstract insertIfNew(p: CartProjection, tx?: Transaction): Promise<boolean>
  abstract save(p: CartProjection, tx?: Transaction): Promise<void>
  /** Atomic op — JUSTIFIED: two providers can race on the same cart→order link; canonical find→apply→save loses one update. */
  abstract setLinkedOrderId(cartId: string, orderId: string, linkedAt: Date, tx?: Transaction): Promise<void>
  abstract deleteByStoreIntegrationId(storeIntegrationId: string, tx?: Transaction): Promise<number>
}
```

Commit:

```bash
git add packages/api/typescript/src/sales/projections/CartProjection.ts \
        packages/api/typescript/src/sales/repositories/CartProjectionRepository/ \
        packages/api/typescript/src/sales/registry.ts
git commit -m "feat(sales): CartProjection + CartProjectionRepository with atomic link op (P5 Task 9)"
```

---

## Task 10: CartProjector — dispatch on cart.abandoned + cart.linked_to_order

**Files:**
- Create: `packages/api/typescript/src/sales/projections/projectors/CartProjector.ts`
- Test: `packages/api/typescript/src/sales/projections/projectors/CartProjector.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /projector
**Depends on:** Task 9

Switch on event name:
- `CartAbandonedEvent.name` → `repo.insertIfNew(CartProjection.create(event))`
- `CartLinkedToOrderEvent.name` → resolve cart row via `findByCartExternalId(platform, cartExternalId)`, then `repo.setLinkedOrderId(cart.id, orderEntityId, new Date(event.occurredAt))` (atomic — see Task 9 justification).

```bash
git add packages/api/typescript/src/sales/projections/projectors/CartProjector.ts \
        packages/api/typescript/src/sales/projections/projectors/CartProjector.test.ts
git commit -m "feat(sales): CartProjector — atomic cart→order link op (P5 Task 10)"
```

---

## Task 11: StoreIntegrationDataWipedHandler — cascade-delete preserving overrides

**Files:**
- Create: `packages/api/typescript/src/sales/handlers/StoreIntegrationDataWipedHandler.ts`
- Modify: `packages/api/typescript/src/sales/handlers/external.ts` — export it
- Test: `packages/api/typescript/src/sales/handlers/StoreIntegrationDataWipedHandler.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler
**Depends on:** Tasks 7, 9; assumes P4-INTEGRATION has authored `integration.shared.integration.data_wipe_requested` in `packages/contracts/wire/events/`.

- [ ] **Step 1: Test** — seed 2 orders + 1 cart + 1 override on a given `storeIntegrationId`; dispatch the wipe event; assert: 0 orders, 0 carts, **1 override row preserved** (per spec §4 BC4 — merchant-owned).

- [ ] **Step 2: Implement**

```typescript
import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { UnitOfWorkFactory } from '@template/core-typescript'
import { IntegrationDataWipeRequestedEvent } from '@template/contracts-typescript/wire' // authored by P4
import { OrderProjectionRepository } from '../repositories/OrderProjectionRepository/OrderProjectionRepository'
import { CartProjectionRepository } from '../repositories/CartProjectionRepository/CartProjectionRepository'

@injectable()
export class StoreIntegrationDataWipedHandler extends EventHandler<typeof IntegrationDataWipeRequestedEvent> {
  readonly event = IntegrationDataWipeRequestedEvent
  constructor(
    private orderRepo: OrderProjectionRepository,
    private cartRepo: CartProjectionRepository,
    private uowFactory: UnitOfWorkFactory,
  ) { super() }

  async handle(event: this['input']): Promise<this['output']> {
    const uow = this.uowFactory.create()
    await uow.transaction(async tx => {
      await this.orderRepo.deleteByStoreIntegrationId(event.payload.storeIntegrationId, tx)
      await this.cartRepo.deleteByStoreIntegrationId(event.payload.storeIntegrationId, tx)
      // OrderOverride rows intentionally NOT deleted — merchant-owned per spec §4 BC4.
    })
  }
}
```

If the wire event name differs in P4's authoring, adjust the import only.

- [ ] **Step 3: Commit**

```bash
git add packages/api/typescript/src/sales/handlers/StoreIntegrationDataWipedHandler.ts \
        packages/api/typescript/src/sales/handlers/StoreIntegrationDataWipedHandler.test.ts \
        packages/api/typescript/src/sales/handlers/external.ts
git commit -m "feat(sales): StoreIntegrationDataWipedHandler — cascade-delete preserving overrides (P5 Task 11)"
```

---

## Task 12: CartLinkingFromPixelHandler — subscribes to pixel_event.recorded (CHECKOUT_COMPLETED)

**Files:**
- Create: `packages/api/typescript/src/sales/handlers/CartLinkingFromPixelHandler.ts`
- Modify: `packages/api/typescript/src/sales/handlers/external.ts` — export it
- Test: `packages/api/typescript/src/sales/handlers/CartLinkingFromPixelHandler.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler
**Depends on:** Tasks 7, 9

- [ ] **Step 1: Test** — covers:
  - non-CHECKOUT_COMPLETED pixel event → handler is a no-op;
  - CHECKOUT_COMPLETED with no matching Order yet → handler is a no-op (don't drop; the link will arrive via a future `OrderUpdated` reconciliation pass when the merchant or go-worker explicitly emits the link);
  - CHECKOUT_COMPLETED with a matching Order projected (resolved via `OrderProjectionRepository.findById(HashedID(platform, orderExternalId))` — but pixel doesn't carry `orderExternalId`, only `cartExternalId`; resolution happens through `CartProjectionRepository.findByCartExternalId(platform, cartExternalId)` + the existing cart's `linkedOrderId` field) → publishes `CartLinkedToOrderEvent` on the `ExternalMediator` so go-worker / other Sales installs / Analytics close the loop.

  > Implementation note: the actual cart → order matching is owned by go-worker
  > (which already publishes `cart.linked_to_order` when its provider data
  > matches). This handler exists for the TS-side replay path described in the
  > sub-prompt — emitting the link when a CHECKOUT_COMPLETED pixel arrives
  > AFTER both the cart projection and the order projection are present in
  > the TS read store, covering the race where the pixel event outpaces the
  > provider webhook. If both projections are not yet matched, the handler
  > drops the pixel event silently (replay-safe).

- [ ] **Step 2: Implement**

```typescript
import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import { PixelEventRecordedEvent, CartLinkedToOrderEvent } from '@template/contracts-typescript/wire'
import { ExternalMediator } from '@template/core-typescript'
import { CartProjectionRepository } from '../repositories/CartProjectionRepository/CartProjectionRepository'

@injectable()
export class CartLinkingFromPixelHandler extends EventHandler<typeof PixelEventRecordedEvent> {
  readonly event = PixelEventRecordedEvent
  constructor(
    private carts: CartProjectionRepository,
    private external: ExternalMediator,
  ) { super() }

  async handle(event: this['input']): Promise<this['output']> {
    const p = event.payload
    if (p.eventType !== 'CHECKOUT_COMPLETED') return
    const cart = await this.carts.findByCartExternalId(p.platform, p.cartExternalId)
    if (!cart || !cart.props.linkedOrderId) return // not yet matched — drop (replay-safe)
    const linkEvent = new CartLinkedToOrderEvent({
      entityId: cart.props.id,
      ownerId: cart.props.storeId,
      payload: {
        platform: p.platform,
        cartExternalId: p.cartExternalId,
        orderExternalId: cart.props.linkedOrderExternalId ?? '', // hydrated by go-worker — if absent, projector populated linkedOrderId only
        storeIntegrationExternalId: p.storeIntegrationExternalId,
      },
    })
    await this.external.publish(linkEvent)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/typescript/src/sales/handlers/CartLinkingFromPixelHandler.ts \
        packages/api/typescript/src/sales/handlers/CartLinkingFromPixelHandler.test.ts \
        packages/api/typescript/src/sales/handlers/external.ts
git commit -m "feat(sales): CartLinkingFromPixelHandler — emit cart.linked_to_order on CHECKOUT_COMPLETED (P5 Task 12)"
```

---

## Task 13: UpdateOrderOverride use case + OrderOverriddenEvent (domain)

**Files:**
- Create: `packages/api/typescript/src/sales/events/OrderOverriddenEvent.ts`
- Create: `packages/api/typescript/src/sales/events/index.ts`
- Create: `packages/api/typescript/src/sales/usecases/UpdateOrderOverride.ts`
- Create: `packages/api/typescript/src/sales/usecases/index.ts`
- Test: `packages/api/typescript/src/sales/usecases/UpdateOrderOverride.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /event
**Depends on:** Tasks 4, 5, 7

- [ ] **Step 1: Author the domain event** (in-process; the wire-level `OrderOverriddenEvent` from Task 2 is published by the Forwarder in Task 14):

```typescript
// packages/api/typescript/src/sales/events/OrderOverriddenEvent.ts
import { BaseDomainEvent, z } from '@template/core-typescript'

export const OrderOverriddenEventSchema = z.domainEvent({
  orderId: z.string(),
  storeIntegrationExternalId: z.string(),
  changedFields: z.array(z.string()),
})

export class OrderOverriddenEvent extends BaseDomainEvent<typeof OrderOverriddenEventSchema> {
  static override readonly name = 'sales.order.overridden' as const
  static readonly schema = OrderOverriddenEventSchema
}
```

- [ ] **Step 2: Test** — covers:
  - UPSERTs a new override row when none exists (assert composite-PK row);
  - merges fields on second invocation; `updatedByUserId` updates;
  - throws `ORDER_NOT_FOUND` when the order projection row is missing;
  - throws `INVALID_LINE_ID` when `productCostByLine` references a missing line (assert against an order with lines `['line-a']` and patch `['line-b']`);
  - persists a domain event row to the outbox with `name = 'sales.order.overridden'` and `payload.changedFields = ['paymentStatus']`.

- [ ] **Step 3: Implement** (mirror `auth/usecases/RegisterUser.ts`):

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { OrderProjectionRepository } from '@sales/repositories/OrderProjectionRepository/OrderProjectionRepository'
import { OrderOverrideRepository } from '@sales/repositories/OrderOverrideRepository/OrderOverrideRepository'
import { OrderOverride } from '@sales/entities/OrderOverride'
import { OrderOverrideFieldsSchema } from '@sales/objects/OrderOverrideFields'
import { OrderOverriddenEvent } from '@sales/events/OrderOverriddenEvent'
import type { SalesApplicationErrors } from '@sales/errors'

export const UpdateOrderOverrideInputSchema = z.object({
  orderId: z.string(),
  storeId: z.string(),
  userId: z.uuid(),
  fields: OrderOverrideFieldsSchema,
})
export const UpdateOrderOverrideOutputSchema = z.void()

@injectable()
export class UpdateOrderOverride extends Handler<typeof UpdateOrderOverrideInputSchema, typeof UpdateOrderOverrideOutputSchema> {
  readonly name = 'update_order_override' as const
  readonly inputSchema = UpdateOrderOverrideInputSchema
  readonly outputSchema = UpdateOrderOverrideOutputSchema

  constructor(
    private orders: OrderProjectionRepository,
    private overrides: OrderOverrideRepository,
  ) { super() }

  protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
    return this.withTransaction(tx, async tx => {
      const order = await this.orders.findById(input.orderId, tx)
      if (!order) throw new BaseError<SalesApplicationErrors>('ORDER_NOT_FOUND')

      if (input.fields.productCostByLine) {
        // Read direct from sales.orders.lines JSONB via a thin helper on the repo (added if not present).
        const validLineIds = new Set(/* read order.lines via direct Drizzle helper */ [] as string[])
        for (const entry of input.fields.productCostByLine) {
          if (!validLineIds.has(entry.lineId)) throw new BaseError<SalesApplicationErrors>('INVALID_LINE_ID')
        }
      }

      const existing = await this.overrides.findByPin(input.orderId, order.props.storeIntegrationExternalId, tx)
      let override: OrderOverride
      let changed: (keyof typeof input.fields)[]
      if (existing) {
        changed = existing.changedFields(input.fields)
        existing.mergeFields(input.fields, input.userId)
        override = existing
      } else {
        override = OrderOverride.create({
          storeId: input.storeId,
          orderId: input.orderId,
          storeIntegrationExternalId: order.props.storeIntegrationExternalId,
          fields: input.fields,
          updatedByUserId: input.userId,
        })
        changed = Object.keys(input.fields) as (keyof typeof input.fields)[]
      }
      await this.overrides.save(override, tx)

      const ev = new OrderOverriddenEvent({
        entityId: input.orderId,
        ownerId: input.storeId,
        payload: {
          orderId: input.orderId,
          storeIntegrationExternalId: order.props.storeIntegrationExternalId,
          changedFields: changed.map(String),
        },
      })
      await this.domainEventRepository.save(ev, tx)
    })
  }
}
```

> If `OrderProjectionRepository.findById` does not expose `lines`, extend its
> abstract surface with `getLineIds(orderId, tx)` rather than reading the
> raw row in the use case. Keep the use case dependent only on the repo.

- [ ] **Step 4: Commit**

```bash
git add packages/api/typescript/src/sales/events/ packages/api/typescript/src/sales/usecases/
git commit -m "feat(sales): UpdateOrderOverride use case + OrderOverriddenEvent domain event (P5 Task 13)"
```

---

## Task 14: OrderOverriddenForwarder — domain → wire republish

**Files:**
- Create: `packages/api/typescript/src/sales/handlers/OrderOverriddenForwarder.ts`
- Modify: `packages/api/typescript/src/sales/handlers/internal.ts` — export it
- Test: `packages/api/typescript/src/sales/handlers/OrderOverriddenForwarder.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler, /event
**Depends on:** Tasks 2, 13

The Forwarder bridges the in-process domain event (`sales.order.overridden`) to the wire event (`integration.shared.order.overridden`) authored in Task 2 so downstream contexts and other Sales installs can subscribe.

```typescript
import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@template/core-typescript'
import { OrderOverriddenEvent as DomainOrderOverridden } from '@sales/events/OrderOverriddenEvent'
import { OrderOverriddenEvent as WireOrderOverridden } from '@template/contracts-typescript/wire'

@injectable()
export class OrderOverriddenForwarder extends EventHandler<typeof DomainOrderOverridden> {
  readonly event = DomainOrderOverridden
  constructor(private external: ExternalMediator) { super() }

  async handle(event: this['input']): Promise<this['output']> {
    const wire = new WireOrderOverridden({
      entityId: event.entityId,
      ownerId: event.ownerId,
      payload: {
        orderId: event.payload.orderId,
        storeIntegrationExternalId: event.payload.storeIntegrationExternalId,
        changedFields: event.payload.changedFields,
      },
    })
    await this.external.publish(wire)
  }
}
```

Test asserts the External mediator receives one wire event per domain event with payload parity.

Commit:

```bash
git add packages/api/typescript/src/sales/handlers/OrderOverriddenForwarder.ts \
        packages/api/typescript/src/sales/handlers/OrderOverriddenForwarder.test.ts \
        packages/api/typescript/src/sales/handlers/internal.ts
git commit -m "feat(sales): OrderOverriddenForwarder — bridge domain event to wire (P5 Task 14)"
```

---

## Task 15: UpdateOrderOverrideController + tenancy middleware hookup

**Files:**
- Create: `packages/api/typescript/src/sales/controllers/UpdateOrderOverrideController.ts`
- Modify: `packages/api/typescript/src/sales/controllers/index.ts` — add export
- Test: `packages/api/typescript/src/sales/controllers/UpdateOrderOverrideController.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /schema
**Depends on:** Task 13

- [ ] **Step 1: Test** — POST `/sales/orders/:orderId/override`. Returns 204 NO_CONTENT on success. Schema rejects extra fields. `ORDER_NOT_FOUND` → 404; `INVALID_LINE_ID` → 422; `INVALID_ORDER_OVERRIDE_FIELDS` → 422. Pattern: `auth/controllers/GetSession.ts`.

- [ ] **Step 2: Implement** — wire `AuthActorMiddleware` (from auth) + the to-be-implemented `StoreMembershipMiddleware` (P2-TENANCY). The controller's `middlewares` array references both.

- [ ] **Step 3: Commit**

```bash
git add packages/api/typescript/src/sales/controllers/UpdateOrderOverrideController.ts \
        packages/api/typescript/src/sales/controllers/UpdateOrderOverrideController.test.ts \
        packages/api/typescript/src/sales/controllers/index.ts
git commit -m "feat(sales): UpdateOrderOverrideController — POST /sales/orders/:orderId/override (P5 Task 15)"
```

---

## Task 16: Contract Lock — SDK regen for UpdateOrderOverride

**Files:**
- Regen: `packages/api/typescript/public/docs/openapi.json` (or the polyglot-equivalent path)
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** Task 15

```bash
bun emit-openapi && bun sdk && bun tsc
git add packages/api/**/openapi.json packages/client/dist/
git commit -m "chore(sdk): regenerate openapi+sdk for UpdateOrderOverride (P5 Task 16)"
```

---

## Task 17: OrdersList query (T13) — JOIN orders ⨝ order_overrides, COALESCE override fields, multistore + per-row reporting-currency

**Files:**
- Create: `packages/api/typescript/src/sales/queries/OrdersList.ts`
- Create: `packages/api/typescript/src/sales/queries/FxConversionService.ts`
- Create: `packages/api/typescript/src/sales/queries/index.ts`
- Test: `packages/api/typescript/src/sales/queries/OrdersList.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query
**Depends on:** Tasks 5, 7

- [ ] **Step 1: Test** — seed 3 orders across 2 stores; assert: filter by `storeIds` / `paymentStatuses` / `isManual` / `search`; pagination + ordering; `hasOverride` flips when an override row exists; `effectivePaymentStatus = COALESCE(override.paymentStatus, orders.paymentStatus)`; `totalInReportingCurrency` equals the raw total when reportingCurrency matches the row's currency (no FxRate seeded).

- [ ] **Step 2: Implement** — pure Drizzle BFF read; no entity rehydration. LEFT JOIN `orders ⨝ order_overrides` on `(orders.id = order_overrides.order_id AND orders.store_integration_external_id = order_overrides.store_integration_external_id)`. COALESCE every overridable field in the SELECT. Apply `FxConversionService.convert(amountCents, fromCurrency, toReportingCurrency, atDate)` in a post-query map (NOT in SQL — FxRate table lives in P9-FINANCE; if unavailable, helper returns native amount and sets `reportingCurrency` to the row's currency per spec §6 Multi-Currency rule 3).

`FxConversionService` (per-query helper, NOT registered in DI — a tiny ~30-line class instantiated via constructor in the query):

```typescript
export class FxConversionService {
  constructor(private finance?: { getRateAt(from: string, to: string, at: Date): Promise<number | null> }) {}
  async convert(cents: number, from: string, to: string, at: Date): Promise<{ amountCents: number; currency: string }> {
    if (from === to || !this.finance) return { amountCents: cents, currency: from }
    const rate = await this.finance.getRateAt(from, to, at)
    if (rate == null) return { amountCents: cents, currency: from }
    return { amountCents: Math.round(cents * rate), currency: to }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/typescript/src/sales/queries/OrdersList.ts \
        packages/api/typescript/src/sales/queries/FxConversionService.ts \
        packages/api/typescript/src/sales/queries/OrdersList.test.ts \
        packages/api/typescript/src/sales/queries/index.ts
git commit -m "feat(sales): OrdersList query (T13) — join+coalesce overrides, multistore, FX at read time (P5 Task 17)"
```

---

## Task 18: OrderDetail query (T14)

**Files:**
- Create: `packages/api/typescript/src/sales/queries/OrderDetail.ts`
- Test: `packages/api/typescript/src/sales/queries/OrderDetail.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query
**Depends on:** Tasks 5, 7, 17 (reuses `FxConversionService`)

Single-row SELECT joining `orders ⨝ order_overrides`. Output includes the full override block when present and per-line `overriddenCost` (from `override.productCostByLine[].cost`). Throws `ORDER_NOT_FOUND` if no row.

Commit:

```bash
git add packages/api/typescript/src/sales/queries/OrderDetail.ts packages/api/typescript/src/sales/queries/OrderDetail.test.ts
git commit -m "feat(sales): OrderDetail query (T14) — order + override + per-line cost (P5 Task 18)"
```

---

## Task 19: AbandonedCartsList query (T15) + query controllers

**Files:**
- Create: `packages/api/typescript/src/sales/queries/AbandonedCartsList.ts`
- Test: `packages/api/typescript/src/sales/queries/AbandonedCartsList.test.ts`
- Create: `packages/api/typescript/src/sales/controllers/ListOrdersController.ts` (POST `/sales/orders/query`)
- Create: `packages/api/typescript/src/sales/controllers/GetOrderDetailController.ts` (GET `/sales/orders/:orderId`)
- Create: `packages/api/typescript/src/sales/controllers/ListAbandonedCartsController.ts` (POST `/sales/carts/abandoned/query`)
- Modify: `packages/api/typescript/src/sales/controllers/index.ts` — add 3 exports
- Test: HTTP-level smoke test per controller

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /controller, /schema
**Depends on:** Tasks 9, 17, 18

`AbandonedCartsList`: paginated read on `carts` filtered by `storeIds`, `storeIntegrationIds?`, `dateRange (abandonedAt)`, `linked?` (`linkedOrderId IS NULL` / `IS NOT NULL`). Per-row `totalInReportingCurrency` via `FxConversionService`. Output matches spec §7.4 T15.

Controllers: POST for list endpoints (rich filter set), GET for the detail. Mount `AuthActorMiddleware` + `StoreMembershipMiddleware`. Pattern: `auth/controllers/GetSession.ts`.

```bash
git add packages/api/typescript/src/sales/queries/AbandonedCartsList.ts \
        packages/api/typescript/src/sales/queries/AbandonedCartsList.test.ts \
        packages/api/typescript/src/sales/controllers/ListOrdersController.ts \
        packages/api/typescript/src/sales/controllers/GetOrderDetailController.ts \
        packages/api/typescript/src/sales/controllers/ListAbandonedCartsController.ts \
        packages/api/typescript/src/sales/controllers/index.ts
git commit -m "feat(sales): AbandonedCartsList query + 3 read controllers (P5 Task 19)"
```

---

## Task 20: Contract Lock — SDK regen for the 3 reads

**Files:**
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** Task 19

```bash
bun emit-openapi && bun sdk && bun tsc
git add packages/api/**/openapi.json packages/client/dist/
git commit -m "chore(sdk): regenerate openapi+sdk for OrdersList + OrderDetail + AbandonedCartsList (P5 Task 20)"
```

---

## Task 21: Final wiring + smoke (BoundedContext exhaustive registration)

**Files:**
- Modify: `packages/api/typescript/src/sales/index.ts` — confirm `controllers`, `projectors`, `internalHandlers`, `externalHandlers` are populated.
- Test: `packages/api/typescript/src/sales/index.test.ts` — extended to assert every Projector + Handler resolves via the container and is subscribed on the right mediator (mirror the `BoundedContext.registerProjectors` log).

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context
**Depends on:** Tasks 8, 10, 11, 12, 14, 19

- [ ] **Step 1: Extend the smoke test** — assert `ctx.container.resolve(OrderProjector)` resolves; assert `ExternalMediator` has at least one subscription for each of the 6 wire events Sales consumes; assert `InternalMediator` has a subscription for `sales.order.overridden`.

- [ ] **Step 2: Run the full suite**

```bash
bun tsc && bun lint && bun test packages/api/typescript/src/sales/
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/typescript/src/sales/index.ts packages/api/typescript/src/sales/index.test.ts
git commit -m "feat(sales): exhaustive BC wiring smoke (P5 Task 21)"
```

---

## Open Questions (leave as `# QUESTION` per Ralph guardrails — do NOT block)

- `# QUESTION 1` — **Sub-plan ID + spec section.** Master plan labels this `P6-SALES (§7.4)`; Ralph sub-prompt asked for `P5-SALES.md` citing "§4 BC5 / §7.5". In the spec, BC5 is Catalog. Content here follows the sub-prompt's *content* scope (Order projection + OrderOverride) which the spec puts in **BC4 / §7.4**. If a later iteration renames the file, content unchanged.

- `# QUESTION 2` — **HashedID location.** Sub-prompt assumed P1-IDENTITY lands the helper. Polyglot convention is `packages/api/typescript/core/src/objects/HashedID.ts` (per `core/objects/` pattern). If P1 places it elsewhere, fix imports — do not re-implement.

- `# QUESTION 3` — **FxConversionService dependency on P9-FINANCE.** Task 17 ships the helper with graceful fallback (returns native amount when finance is unavailable). Spec §6 Multi-Currency rule 3 explicitly allows this cold-start behavior. Confirm P9's read-repo signature before Task 17 lands.

- `# QUESTION 4` — **`integration.shared.integration.data_wipe_requested` ownership.** Task 11 assumes P4-INTEGRATION authors this wire event. If P4 picks a different name, fix the import in `StoreIntegrationDataWipedHandler.ts`.

- `# QUESTION 5` — **`OrderProjection` shape vs. `sales.orders` shape.** Task 6 ships a *lean* projection schema (only the wire-derivable fields the Projector mutates). Queries (Tasks 17–19) read the full row directly via Drizzle. If a downstream context (Analytics) wants entity rehydration, extend the projection schema then — do NOT prematurely widen it here.

- `# QUESTION 6` — **`CartProjection.linkedOrderExternalId`.** Task 12's `CartLinkingFromPixelHandler` references `cart.props.linkedOrderExternalId`. The Drizzle table currently has `linkedOrderId` (the canonical UUIDv5). If we need the external id back, add a denormalized column in a follow-up — for now the handler hydrates `orderExternalId: ''` and relies on `linkedOrderId` being non-null as the matched signal.

- `# QUESTION 7` — **Internal "FromProvider" mirror events.** The previous (`feat/bk-dash`) iteration of this plan defined 6 internal `sales.<x>_from_provider` events to keep projectors transport-agnostic. The polyglot template's `ui/projections/projectors/VideoFeedProjector.ts` sibling subscribes directly to **wire event classes** instead. This plan follows the polyglot pattern (no mirror events) to stay aligned with the existing sibling. If a reviewer wants the mirror layer, add it in a follow-up sub-plan without changing test names — the Projector public API is the same.

---

## Final Validation

- [ ] `bun tsc` — 0 errors
- [ ] `bun lint` — 0 errors
- [ ] `bun test packages/api/typescript/src/sales/` — all green
- [ ] `bun run codegen:wire` then `git diff --quiet packages/contracts/generated/` — no uncommitted regen output (Task 2)
- [ ] `bun emit-openapi && bun sdk && git diff --quiet packages/api/**/openapi.json packages/client/dist/` — no uncommitted regen output
- [ ] Spec §7.4 T13 OrdersList → `queries/OrdersList.test.ts` passes
- [ ] Spec §7.4 T14 OrderDetail → `queries/OrderDetail.test.ts` passes
- [ ] Spec §7.4 T15 AbandonedCartsList → `queries/AbandonedCartsList.test.ts` passes
- [ ] Spec §7.4 C26 UpdateOrderOverride → `usecases/UpdateOrderOverride.test.ts` passes
- [ ] Spec §4 BC4 Order/Cart write-locked → no controller writes to `sales.orders` / `sales.carts`; Projector is the only writer (verified by repo-import grep + smoke)
- [ ] Spec §4 BC4 Override survives reintegration → `DrizzleOrderOverrideRepository.test.ts` asserts composite-PK UPSERT
- [ ] Spec §4 BC4 Cascade on data wipe preserves overrides → `StoreIntegrationDataWipedHandler.test.ts`
- [ ] Spec §4 BC4 Cart → Order linking on CHECKOUT_COMPLETED → `CartLinkingFromPixelHandler.test.ts`
- [ ] Spec §6 Deterministic IDs → `OrderProjector.test.ts` asserts `entityId` matches `HashedID(platform, externalId)`
- [ ] Spec §6 Multi-Currency → `OrdersList.test.ts` asserts `totalInReportingCurrency` is computed at query time
- [ ] `git status` clean — every change committed across Tasks 1–21

---

## Dependency footer

**Upstream sub-plans that MUST be complete before /build can start Task 1:**

- ✅ **Iter 41 (contracts/wire)** — 6 Sales-consumed wire events + Pixel + 11 enums.
- ✅ **Iter 42 (contracts/db/schema)** — `packages/contracts/db/schema/sales.ts` (orders / carts / order_overrides).
- **P1-IDENTITY** — `HashedID` helper + `BK_DASH_NAMESPACE` constant at `packages/api/typescript/core/src/objects/HashedID.ts`.
- **P2-TENANCY** — `Store.reportingCurrency` accessor; `StoreMembershipMiddleware` mounted on per-store routes.
- **P4-INTEGRATION** — `StoreIntegration` aggregate + `integration.shared.integration.data_wipe_requested` wire event authored.
- **PG-GO-WORKER** — go-worker publishes the 6 Sales wire events + `pixel_event.recorded` on Redis stream `events:integration.shared.*` with payload shapes matching the iter-41 TypeSpec.

**Downstream sub-plans that depend on P5-SALES:**

- **P7-MARKETING** — listens to `integration.shared.order.updated` directly for ROAS rollups (no Sales BC artifact dependency).
- **P8-TRACKING** — Sales-side handler for CHECKOUT_COMPLETED Cart-linking depends on this BC's `CartProjection` being populated.
- **P10-NOTIFICATIONS** — per-Store opt-in order-push depends on the wire event being consumed somewhere (Sales projector counts).
- **P11-ANALYTICS** — invalidates caches on `integration.shared.order.overridden` (Task 2 + Task 14 emit it).

**Parallel safety:** P5-SALES and **P5-CATALOG** can run in parallel — both consume go-worker events but write disjoint Drizzle schemas (`sales.*` vs `catalog.*`). Conflict points: only `packages/api/typescript/src/index.ts` (router registration) and `packages/api/typescript/tsconfig.json` (path aliases). If both run in parallel, merge those two files manually post-build.
