<!--
  CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-l4-planning
  task:        synthetic-l4-planning
  stamp:       l4-synthetic-l4-planning
  docTreeHash: 21385794902e
  model:       sonnet
  graded:      2026-06-14T00:11:20.601Z
  source:      .plans/2026-06-13-procurement-sync-plan.md (archived eval build, applied at HEAD)
  Verbatim extract of the archived eval build — NOT a live module. Do not import it.
-->
# Plan: Procurement Sync

**Goal:** Introduce a Procurement capability — seller-managed purchase orders, Go-owned supplier-webhook ingest, and two BFF dashboard reads (shipment timeline + supplier scorecard).
**Architecture:** DDD + Clean Architecture + CQRS + Event-Driven, polyglot (TS Bun + Go fx).
**Tech Stack:** TypeSpec contracts → Drizzle schema → Kubb SDK → TanStack Start + React Query.
**Spec:** `.specs/2026-06-13-procurement-sync-plan.md` (frozen; this plan implements it verbatim).
**Tasks:** T1–T11 (11 tasks).
**Estimated minutes:** 120.

---

## Modeling Decisions

### Aggregates accepted

| Aggregate | Owner | Justification |
|---|---|---|
| `PurchaseOrder` | TS backend | Seller-issued lifecycle command (DRAFT→PLACED→RECEIVED→CLOSED/CANCELLED). Has identity, invariants, behavior methods. Exactly what an AggregateRoot is for. |
| `InboundShipment` | Go worker (write); TS BFF (read) | Webhook delivery from supplier platform. Go worker owns ingest; TS reads via direct Drizzle query. |

### Aggregates explicitly rejected

**`SupplierConnection`** — *rejected as aggregate*. The closed-set enum `SupplierPlatform` + `ConnectionMode` codes (BLING/TINY/OLIST × OAUTH/CREDENTIALS/MANUAL) represent configuration, not a domain entity with lifecycle. A connection can be represented as fields on `PurchaseOrder` (`supplierPlatform`, `connectionMode`). No invariants require a separate root. → **Kept as enum constants only**.

**`SupplierScorecard` projection** — *rejected as materialized projection*. On-time-delivery stats are a live `GROUP BY` on `inbound_shipments` filtered by `deliveredAt ≤ expectedAt`. No cross-context aggregation required; no denormalization. A `QueryService` (BFF) suffices and eliminates projection maintenance overhead.

**`ShipmentDeduplicationAudit` entity** — *rejected*. Idempotency is enforced at the DB layer via partial unique index on `(supplier_platform, external_shipment_id)`. No domain entity needed.

### Integration event decision

No new cross-boundary integration event is introduced. AC-3 ("live update without manual refresh") and AC-4 ("recomputes when webhook lands") are both satisfied by React Query polling of the BFF endpoints. Polling is simpler and sufficient for the shipment timeline cadence.

---

## Naming Glossary

| Canonical term | Banned aliases | Where it appears |
|---|---|---|
| `supplierPlatform` | `provider`, `vendor` | TypeSpec, DB column, Go/TS code |
| `SupplierPlatform` | `SupplierProvider`, `VendorPlatform` | TypeSpec enum, TS enum, Go const |
| `PurchaseOrder` | `SupplierOrder`, `InboundOrder` | Aggregate, table, controllers |
| `InboundShipment` | `Delivery`, `SupplierDelivery`, `Webhook` | Go entity, DB table, BFF |
| `connectionMode` | `authMode`, `integrationType` | Fields referencing OAUTH/CREDENTIALS/MANUAL |
| `ConnectionMode` | (already exists in contracts) | Reuse existing TypeSpec enum |
| `externalShipmentId` | `webhookId`, `deliveryId`, `externalId` | `inbound_shipments.external_shipment_id` |
| `GetPurchaseOrderTimeline` | `GetOrderShipments`, `GetTimeline` | BFF query + controller |
| `GetSupplierScorecard` | `GetSupplierStats`, `GetOnTimeDelivery` | BFF query + controller |
| `PlacePurchaseOrder` | `CreateOrder`, `SubmitOrder` | TS use case + controller |
| `CancelPurchaseOrder` | `DeleteOrder`, `AbortOrder` | TS use case + controller |
| `PurchaseOrderPlaced` | `OrderCreated`, `OrderSubmitted` | Domain event |
| `PurchaseOrderCancelled` | `OrderCancelled` | Domain event |
| `ExternalShipmentStatusUpdated` | `WebhookReceived`, `ShipmentUpdated` | Go domain event |
| `EXTERNAL_SHIPMENT_STATUS_UPDATED` | — | SyncEventName TypeSpec enum value |

---

## Wave Plan

```
Phase 0 — Contract Lock (serial)
  T1  TypeSpec enums + SyncEventName value
  T2  TS procurement context skeleton
  T3  Mock controllers (procurement + ui BFF)
  T4  bun emit-openapi && bun sdk  ← CONTRACT LOCK

Phase 0 extended (serial after T4)
  T5  Drizzle schema + migration (all procurement tables)

Phase 1 — Behavior Slices (parallel where noted)
  T6  TS: PlacePurchaseOrder backend          (after T5)
  T7  TS: CancelPurchaseOrder backend         (after T6, serial)
  T8  Go: supplier webhook pipeline           (after T5, parallel with T6)
  T9  BFF reads                               (after T6 + T8)
  T10 React route + components                (after T4, parallel with T5-T9)

Phase 2 — Integration + QA
  T11 E2E coverage                            (after T6, T7, T8, T9, T10)
```

**Dependency graph:**
```
T1 → T2 → T3 → T4 → T5 → T6 → T7
                          ↓         ↘
                          T8          T9
     T10 (from T4, independent of T5-T9)
                               T11 (after all of T6,T7,T8,T9,T10)
```

**Critical path:** T1 → T2 → T3 → T4 → T5 → T6 → T9 → T11

**Feature type:** 1 — Complete new feature (new TS aggregate + Go entity + controllers + frontend route/components).

---

## Task Manifest

---

## Task T1: TypeSpec enums + SyncEventName

**Phase:** 0 — Contract Lock (serial, first)
**Depends on:** —
**Estimated minutes:** 10

Introduces three new closed-set enums to `packages/contracts/wire/enums/` and adds one value to the existing `SyncEventName` enum. Registers the new files in `main.tsp`.

### Step T1.1 — Create `supplier-platform.tsp`

**Files to write:**
- `packages/contracts/wire/enums/supplier-platform.tsp` (new)

```typespec
namespace TemplateContracts;

@doc("Closed set of supplier platforms integrated for procurement ingest.")
enum SupplierPlatform {
  BLING: "BLING",
  TINY: "TINY",
  OLIST: "OLIST",
}
```

### Step T1.2 — Create `purchase-order-status.tsp`

**Files to write:**
- `packages/contracts/wire/enums/purchase-order-status.tsp` (new)

```typespec
namespace TemplateContracts;

@doc("Lifecycle states of a seller-issued purchase order.")
enum PurchaseOrderStatus {
  DRAFT: "DRAFT",
  PLACED: "PLACED",
  RECEIVED: "RECEIVED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
}
```

### Step T1.3 — Create `inbound-shipment-status.tsp`

**Files to write:**
- `packages/contracts/wire/enums/inbound-shipment-status.tsp` (new)

```typespec
namespace TemplateContracts;

@doc("Supplier-reported shipment lifecycle states received via webhook.")
enum InboundShipmentStatus {
  CREATED: "CREATED",
  PACKED: "PACKED",
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
}
```

### Step T1.4 — Add `EXTERNAL_SHIPMENT_STATUS_UPDATED` to `sync-event-name.tsp`

**Files to edit:**
- `packages/contracts/wire/enums/sync-event-name.tsp`

Add at the end of the `SyncEventName` enum body (before closing `}`):
```typespec
  EXTERNAL_SHIPMENT_STATUS_UPDATED: "sync.external_shipment_status_updated",
```

### Step T1.5 — Register new enums in `main.tsp`

**Files to edit:**
- `packages/contracts/wire/main.tsp`

Add a `// Procurement` block after the `// Sync` block (before `import "./events/index.tsp"`):
```typespec
// Procurement
import "./enums/supplier-platform.tsp";
import "./enums/purchase-order-status.tsp";
import "./enums/inbound-shipment-status.tsp";
```

---

## Task T2: TS procurement context skeleton

**Phase:** 0 — Contract Lock
**Depends on:** T1
**Estimated minutes:** 8

Scaffolds the TS bounded context and wires it into the API root.

### Step T2.1 — Scaffold bounded context

**Scaffold:**
```bash
bun cli context procurement --lang=typescript
```

This generates:
- `packages/api/typescript/src/procurement/` directory
- `errors/index.ts`, `registry.ts`, `index.ts`

### Step T2.2 — Populate `errors/index.ts`

**Files to write:**
- `packages/api/typescript/src/procurement/errors/index.ts`

```typescript
import { registerErrorCodes } from '@codedm/core-typescript'

export type ProcurementErrors =
  | 'PURCHASE_ORDER_NOT_FOUND'
  | 'PURCHASE_ORDER_ALREADY_PLACED'
  | 'PURCHASE_ORDER_CANNOT_BE_CANCELLED'
  | 'PURCHASE_ORDER_LINE_QUANTITY_EXCEEDS_ORDERED'

registerErrorCodes({
  PURCHASE_ORDER_NOT_FOUND: { status: 404, i18nKey: 'errors.procurement.orderNotFound' },
  PURCHASE_ORDER_ALREADY_PLACED: { status: 409, i18nKey: 'errors.procurement.alreadyPlaced' },
  PURCHASE_ORDER_CANNOT_BE_CANCELLED: { status: 422, i18nKey: 'errors.procurement.cannotBeCancelled' },
  PURCHASE_ORDER_LINE_QUANTITY_EXCEEDS_ORDERED: { status: 422, i18nKey: 'errors.procurement.quantityExceedsOrdered' },
})
```

### Step T2.3 — Wire context into API root

**Files to edit:**
- `packages/api/typescript/src/index.ts`

Add import:
```typescript
import ProcurementRouter from '@procurement/index'
```
Add `ProcurementRouter` to the `routers` array passed to `MainRouter`.

---

## Task T3: Mock controllers

**Phase:** 0 — Contract Lock
**Depends on:** T2
**Estimated minutes:** 12

Creates stub controllers in `procurement` (commands) and `ui` (BFF reads) so that `bun emit-openapi` can produce a full schema for the SDK.

### Step T3.1 — Scaffold PlacePurchaseOrder controller

**Scaffold:**
```bash
bun cli controller procurement PlacePurchaseOrder
```

**Files to write:**
- `packages/api/typescript/src/procurement/controllers/PlacePurchaseOrder.ts`

```typescript
import { Controller, z } from '@codedm/core-typescript'
import { SupplierPlatform, ConnectionMode } from '@codedm/contracts-typescript'

export const PlacePurchaseOrderControllerInputSchema = z.object({
  ctx: z.object({ storeId: z.uuid() }),
  body: z.object({
    supplierId: z.uuid(),
    supplierPlatform: z.enum(SupplierPlatform),
    connectionMode: z.enum(ConnectionMode),
    expectedDeliveryAt: z.iso.datetime(),
    lines: z.array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().positive(),
        unitPriceCents: z.number().int().nonnegative(),
        currency: z.string().length(3),
      }),
    ).min(1),
  }),
})

export const PlacePurchaseOrderControllerOutputSchema = z.object({
  purchaseOrderId: z.uuid(),
})

export class PlacePurchaseOrderController extends Controller<
  typeof PlacePurchaseOrderControllerInputSchema,
  typeof PlacePurchaseOrderControllerOutputSchema
> {
  readonly path = '/procurement/purchase-orders'
  readonly method = 'POST' as const
  readonly inputSchema = PlacePurchaseOrderControllerInputSchema
  readonly outputSchema = PlacePurchaseOrderControllerOutputSchema

  async handle(_request: z.infer<typeof PlacePurchaseOrderControllerInputSchema>) {
    return { purchaseOrderId: '00000000-0000-0000-0000-000000000000' }
  }
}
```

### Step T3.2 — Scaffold CancelPurchaseOrder controller

**Files to write:**
- `packages/api/typescript/src/procurement/controllers/CancelPurchaseOrder.ts`

```typescript
import { Controller, z } from '@codedm/core-typescript'

export const CancelPurchaseOrderControllerInputSchema = z.object({
  ctx: z.object({ storeId: z.uuid() }),
  params: z.object({ purchaseOrderId: z.uuid() }),
  body: z.object({ reason: z.string().max(500).optional() }),
})

export const CancelPurchaseOrderControllerOutputSchema = z.object({
  success: z.boolean(),
})

export class CancelPurchaseOrderController extends Controller<
  typeof CancelPurchaseOrderControllerInputSchema,
  typeof CancelPurchaseOrderControllerOutputSchema
> {
  readonly path = '/procurement/purchase-orders/:purchaseOrderId/cancel'
  readonly method = 'POST' as const
  readonly inputSchema = CancelPurchaseOrderControllerInputSchema
  readonly outputSchema = CancelPurchaseOrderControllerOutputSchema

  async handle(_request: z.infer<typeof CancelPurchaseOrderControllerInputSchema>) {
    return { success: true }
  }
}
```

### Step T3.3 — Scaffold BFF GetPurchaseOrderTimeline controller

**Scaffold:**
```bash
bun cli query ui GetPurchaseOrderTimeline
```

**Files to write:**
- `packages/api/typescript/src/ui/controllers/GetPurchaseOrderTimeline.ts`

```typescript
import { Controller, z } from '@codedm/core-typescript'
import { InboundShipmentStatus } from '@codedm/contracts-typescript'

export const GetPurchaseOrderTimelineControllerInputSchema = z.object({
  ctx: z.object({ storeId: z.uuid() }),
  params: z.object({ purchaseOrderId: z.uuid() }),
})

const ShipmentTimelineItemSchema = z.object({
  shipmentId: z.uuid(),
  externalShipmentId: z.string(),
  status: z.enum(InboundShipmentStatus),
  expectedDeliveryAt: z.iso.datetime().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
  receivedAt: z.iso.datetime(),
})

export const GetPurchaseOrderTimelineControllerOutputSchema = z.object({
  purchaseOrderId: z.uuid(),
  status: z.string(),
  shipments: z.array(ShipmentTimelineItemSchema),
})

export class GetPurchaseOrderTimelineController extends Controller<
  typeof GetPurchaseOrderTimelineControllerInputSchema,
  typeof GetPurchaseOrderTimelineControllerOutputSchema
> {
  readonly path = '/ui/procurement/purchase-orders/:purchaseOrderId/timeline'
  readonly method = 'GET' as const
  readonly inputSchema = GetPurchaseOrderTimelineControllerInputSchema
  readonly outputSchema = GetPurchaseOrderTimelineControllerOutputSchema

  async handle(_request: z.infer<typeof GetPurchaseOrderTimelineControllerInputSchema>) {
    return { purchaseOrderId: '00000000-0000-0000-0000-000000000000', status: 'DRAFT', shipments: [] }
  }
}
```

### Step T3.4 — Scaffold BFF GetSupplierScorecard controller

**Files to write:**
- `packages/api/typescript/src/ui/controllers/GetSupplierScorecard.ts`

```typescript
import { Controller, z } from '@codedm/core-typescript'
import { SupplierPlatform } from '@codedm/contracts-typescript'

export const GetSupplierScorecardControllerInputSchema = z.object({
  ctx: z.object({ storeId: z.uuid() }),
  query: z.object({
    supplierPlatform: z.enum(SupplierPlatform).optional(),
    fromDate: z.iso.datetime().optional(),
    toDate: z.iso.datetime().optional(),
  }),
})

const SupplierScorecardRowSchema = z.object({
  supplierId: z.uuid(),
  supplierPlatform: z.enum(SupplierPlatform),
  totalShipments: z.number().int(),
  onTimeDeliveries: z.number().int(),
  onTimeDeliveryRate: z.number(),
})

export const GetSupplierScorecardControllerOutputSchema = z.object({
  rows: z.array(SupplierScorecardRowSchema),
})

export class GetSupplierScorecardController extends Controller<
  typeof GetSupplierScorecardControllerInputSchema,
  typeof GetSupplierScorecardControllerOutputSchema
> {
  readonly path = '/ui/procurement/supplier-scorecard'
  readonly method = 'GET' as const
  readonly inputSchema = GetSupplierScorecardControllerInputSchema
  readonly outputSchema = GetSupplierScorecardControllerOutputSchema

  async handle(_request: z.infer<typeof GetSupplierScorecardControllerInputSchema>) {
    return { rows: [] }
  }
}
```

### Step T3.5 — Update barrel files

**Files to edit:**
- `packages/api/typescript/src/procurement/controllers/index.ts` — export `PlacePurchaseOrderController`, `CancelPurchaseOrderController`
- `packages/api/typescript/src/ui/controllers/index.ts` — add exports for `GetPurchaseOrderTimelineController`, `GetSupplierScorecardController`

---

## Task T4: Contract Lock — emit-openapi + SDK regen

**Phase:** 0 — Contract Lock (terminal gate)
**Depends on:** T3
**Estimated minutes:** 5

```bash
bun emit-openapi
bun sdk
```

After this step the SDK is frozen. All downstream tasks (T5–T11) consume the generated hooks and types from `@codedm/client-typescript`. If a controller shape must change after T4, re-run `bun sdk` and update this plan with a note.

---

## Task T5: Drizzle schema + migration

**Phase:** 0 extended (serial after T4)
**Depends on:** T4
**Estimated minutes:** 10

Single Drizzle migration covering all procurement tables. Both T6 (TS) and T8 (Go) depend on this step to prevent migration-number conflicts.

### Step T5.1 — Create procurement schema module

**Files to write:**
- `packages/contracts/db/schema/procurement.ts`

```typescript
import { pgSchema, uuid, text, timestamp, integer, bigint, index, uniqueIndex } from 'drizzle-orm/pg-core'

export const procurementSchema = pgSchema('procurement')

/**
 * `purchase_orders` — seller-issued orders to suppliers.
 * Owned by TS procurement bounded context.
 * Status lifecycle: DRAFT → PLACED → RECEIVED → CLOSED | CANCELLED.
 */
export const purchaseOrders = procurementSchema.table(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    storeId: uuid('store_id').notNull(),
    supplierId: uuid('supplier_id').notNull(),

    // SupplierPlatform enum (BLING | TINY | OLIST)
    supplierPlatform: text('supplier_platform').notNull(),
    // ConnectionMode enum (OAUTH | CREDENTIALS | MANUAL)
    connectionMode: text('connection_mode').notNull(),

    // PurchaseOrderStatus enum
    status: text('status').notNull().default('DRAFT'),

    expectedDeliveryAt: timestamp('expected_delivery_at', { withTimezone: true }),

    // jsonb snapshot of line items: [{ productId, quantity, unitPriceCents, currency }]
    lines: text('lines').notNull(), // stored as JSON string

    cancelledReason: text('cancelled_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  t => ({
    storeIdx: index('purchase_orders_store_id_idx').on(t.storeId),
    supplierIdx: index('purchase_orders_supplier_id_idx').on(t.supplierId),
    statusIdx: index('purchase_orders_status_idx').on(t.status),
  }),
)

/**
 * `inbound_shipments` — Go worker writes one row per supplier webhook delivery.
 * Deduped by (supplierPlatform, externalShipmentId) partial unique index.
 * TS BFF reads via direct Drizzle query (no projection class needed).
 */
export const inboundShipments = procurementSchema.table(
  'inbound_shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),

    // Supplier-native shipment id — used for dedup.
    externalShipmentId: text('external_shipment_id').notNull(),

    // SupplierPlatform enum (BLING | TINY | OLIST)
    supplierPlatform: text('supplier_platform').notNull(),

    // InboundShipmentStatus enum
    status: text('status').notNull(),

    expectedDeliveryAt: timestamp('expected_delivery_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),

    // Raw webhook payload for auditability.
    rawPayload: text('raw_payload').notNull(),

    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => ({
    // Dedup: one shipment id per platform.
    externalUnq: uniqueIndex('inbound_shipments_external_unq').on(t.supplierPlatform, t.externalShipmentId),
    orderIdx: index('inbound_shipments_purchase_order_id_idx').on(t.purchaseOrderId),
    statusIdx: index('inbound_shipments_status_idx').on(t.status),
    // Scorecard GROUP BY scan.
    platformIdx: index('inbound_shipments_supplier_platform_idx').on(t.supplierPlatform),
  }),
)
```

### Step T5.2 — Add export to schema barrel

**Files to edit:**
- `packages/contracts/db/schema/index.ts`

Add at the end:
```typescript
export * from './procurement'
```

### Step T5.3 — Generate and apply migration

```bash
bun migrate:create   # generates new Drizzle migration SQL
bun migrate:dev      # applies channel (Go) + api (TS) migrations
```

---

## Task T6: PlacePurchaseOrder backend

**Phase:** 1 — Behavior Slice
**Depends on:** T5
**Estimated minutes:** 20

Implements the entity, repository, domain event, and use case for placing a purchase order, then wires the real controller.

### Step T6.1 — Scaffold PurchaseOrder entity

**Scaffold:**
```bash
bun cli entity procurement PurchaseOrder --aggregate
```

**Files to write:**
- `packages/api/typescript/src/procurement/entities/PurchaseOrder.ts`

```typescript
import { AggregateRoot, z } from '@codedm/core-typescript'
import { PurchaseOrderStatus, SupplierPlatform, ConnectionMode } from '@codedm/contracts-typescript'
import { BaseError } from '@codedm/core-typescript'
import type { ProcurementErrors } from '../errors'

const OrderLineSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
})

export const PurchaseOrderSchema = z.object({
  id: z.uuid(),
  storeId: z.uuid(),
  supplierId: z.uuid(),
  supplierPlatform: z.enum(SupplierPlatform),
  connectionMode: z.enum(ConnectionMode),
  status: z.enum(PurchaseOrderStatus),
  expectedDeliveryAt: z.iso.datetime().nullable(),
  lines: z.array(OrderLineSchema).min(1),
  cancelledReason: z.string().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  version: z.number().int(),
})

type PurchaseOrderProps = z.infer<typeof PurchaseOrderSchema>

export class PurchaseOrder extends AggregateRoot<typeof PurchaseOrderSchema> {
  static override schema = PurchaseOrderSchema

  static create(props: Omit<PurchaseOrderProps, 'status' | 'createdAt' | 'updatedAt' | 'version'>): PurchaseOrder {
    return new PurchaseOrder({
      ...props,
      status: PurchaseOrderStatus.DRAFT,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    })
  }

  place(): void {
    if (this.props.status !== PurchaseOrderStatus.DRAFT) {
      throw new BaseError<ProcurementErrors>('PURCHASE_ORDER_ALREADY_PLACED')
    }
    this.props.status = PurchaseOrderStatus.PLACED
    this.props.updatedAt = new Date().toISOString()
  }

  cancel(reason?: string): void {
    if (
      this.props.status === PurchaseOrderStatus.RECEIVED ||
      this.props.status === PurchaseOrderStatus.CLOSED ||
      this.props.status === PurchaseOrderStatus.CANCELLED
    ) {
      throw new BaseError<ProcurementErrors>('PURCHASE_ORDER_CANNOT_BE_CANCELLED')
    }
    this.props.status = PurchaseOrderStatus.CANCELLED
    this.props.cancelledReason = reason
    this.props.updatedAt = new Date().toISOString()
  }

  markReceived(): void {
    this.props.status = PurchaseOrderStatus.RECEIVED
    this.props.updatedAt = new Date().toISOString()
  }
}

export interface PurchaseOrder extends PurchaseOrderProps {}
```

### Step T6.2 — Scaffold domain event PurchaseOrderPlaced

**Scaffold:**
```bash
bun cli event procurement PurchaseOrderPlaced
```

**Files to write:**
- `packages/api/typescript/src/procurement/events/PurchaseOrderPlacedEvent.ts`

```typescript
import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const PurchaseOrderPlacedEventSchema = z.domainEvent({
  purchaseOrderId: z.uuid(),
  storeId: z.uuid(),
  supplierId: z.uuid(),
  supplierPlatform: z.string(),
})

export class PurchaseOrderPlacedEvent extends BaseDomainEvent<typeof PurchaseOrderPlacedEventSchema> {
  static override readonly name = 'procurement.purchase_order.placed' as const
  static readonly schema = PurchaseOrderPlacedEventSchema
}
```

### Step T6.3 — Scaffold repository

**Scaffold:**
```bash
bun cli repository procurement PurchaseOrder
```

**Files to write:**
- `packages/api/typescript/src/procurement/repositories/IPurchaseOrderRepository.ts`

```typescript
import type { PurchaseOrder } from '../entities/PurchaseOrder'

export interface IPurchaseOrderRepository {
  findById(id: string): Promise<PurchaseOrder | null>
  findByIdAndStoreId(id: string, storeId: string): Promise<PurchaseOrder | null>
  save(order: PurchaseOrder, tx?: unknown): Promise<void>
}
```

**Files to write:**
- `packages/api/typescript/src/procurement/repositories/DrizzlePurchaseOrderRepository.ts`

```typescript
import { IPurchaseOrderRepository } from './IPurchaseOrderRepository'
import { PurchaseOrder } from '../entities/PurchaseOrder'
// Drizzle client injected via DI

export class DrizzlePurchaseOrderRepository implements IPurchaseOrderRepository {
  constructor(private readonly db: /* DrizzleClient */ any) {}

  async findById(id: string): Promise<PurchaseOrder | null> {
    // SELECT from procurement.purchase_orders WHERE id = $1
    // Rehidrate via new PurchaseOrder({ ...row, lines: JSON.parse(row.lines) })
    throw new Error('implement')
  }

  async findByIdAndStoreId(id: string, storeId: string): Promise<PurchaseOrder | null> {
    throw new Error('implement')
  }

  async save(order: PurchaseOrder, tx?: unknown): Promise<void> {
    // UPSERT via drizzle .insert().onConflictDoUpdate() on procurement.purchase_orders
    throw new Error('implement')
  }
}
```

### Step T6.4 — Scaffold PlacePurchaseOrder use case

**Scaffold:**
```bash
bun cli usecase procurement PlacePurchaseOrder
```

**Files to write:**
- `packages/api/typescript/src/procurement/usecases/PlacePurchaseOrder.ts`

```typescript
import { Handler, z } from '@codedm/core-typescript'
import { SupplierPlatform, ConnectionMode } from '@codedm/contracts-typescript'
import { injectable, inject } from 'tsyringe'
import { PurchaseOrder } from '../entities/PurchaseOrder'
import { PurchaseOrderPlacedEvent } from '../events/PurchaseOrderPlacedEvent'
import type { IPurchaseOrderRepository } from '../repositories/IPurchaseOrderRepository'

const InputSchema = z.object({
  storeId: z.uuid(),
  supplierId: z.uuid(),
  supplierPlatform: z.enum(SupplierPlatform),
  connectionMode: z.enum(ConnectionMode),
  expectedDeliveryAt: z.iso.datetime().nullable(),
  lines: z.array(
    z.object({
      productId: z.uuid(),
      quantity: z.number().int().positive(),
      unitPriceCents: z.number().int().nonnegative(),
      currency: z.string().length(3),
    }),
  ).min(1),
})

const OutputSchema = z.object({ purchaseOrderId: z.uuid() })

@injectable()
export class PlacePurchaseOrder extends Handler<typeof InputSchema, typeof OutputSchema> {
  readonly name = 'PlacePurchaseOrder'

  constructor(
    @inject('IPurchaseOrderRepository') private readonly repo: IPurchaseOrderRepository,
  ) {
    super()
  }

  protected async handle(input: z.infer<typeof InputSchema>, tx?: unknown) {
    return this.withTransaction(tx, async tx => {
      const order = PurchaseOrder.create({
        id: crypto.randomUUID(),
        storeId: input.storeId,
        supplierId: input.supplierId,
        supplierPlatform: input.supplierPlatform,
        connectionMode: input.connectionMode,
        expectedDeliveryAt: input.expectedDeliveryAt ?? null,
        lines: input.lines,
      })

      order.place()

      await this.repo.save(order, tx)

      await this.domainEventRepository.save(
        new PurchaseOrderPlacedEvent({
          purchaseOrderId: order.props.id,
          storeId: order.props.storeId,
          supplierId: order.props.supplierId,
          supplierPlatform: order.props.supplierPlatform,
        }),
        tx,
      )

      return { purchaseOrderId: order.props.id }
    })
  }
}
```

### Step T6.5 — Wire real controller

**Files to edit:**
- `packages/api/typescript/src/procurement/controllers/PlacePurchaseOrder.ts`

Replace mock `handle` body with real use case injection and dispatch (inject `PlacePurchaseOrder` use case via constructor DI, call `this.useCase.execute({ storeId: request.ctx.storeId, ...request.body })`).

### Step T6.6 — Update registry.ts

**Files to edit:**
- `packages/api/typescript/src/procurement/registry.ts`

Register `DrizzlePurchaseOrderRepository` under `IPurchaseOrderRepository` for `integration` and `real` environments; `MockPurchaseOrderRepository` for `mock`.

---

## Task T7: CancelPurchaseOrder backend

**Phase:** 1 — Behavior Slice
**Depends on:** T6
**Estimated minutes:** 10

### Step T7.1 — Domain event PurchaseOrderCancelled

**Files to write:**
- `packages/api/typescript/src/procurement/events/PurchaseOrderCancelledEvent.ts`

```typescript
import { BaseDomainEvent, z } from '@codedm/core-typescript'

export const PurchaseOrderCancelledEventSchema = z.domainEvent({
  purchaseOrderId: z.uuid(),
  storeId: z.uuid(),
  reason: z.string().optional(),
})

export class PurchaseOrderCancelledEvent extends BaseDomainEvent<typeof PurchaseOrderCancelledEventSchema> {
  static override readonly name = 'procurement.purchase_order.cancelled' as const
  static readonly schema = PurchaseOrderCancelledEventSchema
}
```

### Step T7.2 — CancelPurchaseOrder use case

**Scaffold:**
```bash
bun cli usecase procurement CancelPurchaseOrder
```

**Files to write:**
- `packages/api/typescript/src/procurement/usecases/CancelPurchaseOrder.ts`

```typescript
import { Handler, z, BaseError } from '@codedm/core-typescript'
import { injectable, inject } from 'tsyringe'
import { PurchaseOrderCancelledEvent } from '../events/PurchaseOrderCancelledEvent'
import type { IPurchaseOrderRepository } from '../repositories/IPurchaseOrderRepository'
import type { ProcurementErrors } from '../errors'

const InputSchema = z.object({
  storeId: z.uuid(),
  purchaseOrderId: z.uuid(),
  reason: z.string().max(500).optional(),
})

const OutputSchema = z.object({ success: z.boolean() })

@injectable()
export class CancelPurchaseOrder extends Handler<typeof InputSchema, typeof OutputSchema> {
  readonly name = 'CancelPurchaseOrder'

  constructor(
    @inject('IPurchaseOrderRepository') private readonly repo: IPurchaseOrderRepository,
  ) {
    super()
  }

  protected async handle(input: z.infer<typeof InputSchema>, tx?: unknown) {
    return this.withTransaction(tx, async tx => {
      const order = await this.repo.findByIdAndStoreId(input.purchaseOrderId, input.storeId)
      if (!order) throw new BaseError<ProcurementErrors>('PURCHASE_ORDER_NOT_FOUND')

      order.cancel(input.reason)
      await this.repo.save(order, tx)

      await this.domainEventRepository.save(
        new PurchaseOrderCancelledEvent({
          purchaseOrderId: order.props.id,
          storeId: order.props.storeId,
          reason: input.reason,
        }),
        tx,
      )

      return { success: true }
    })
  }
}
```

### Step T7.3 — Wire real CancelPurchaseOrder controller

**Files to edit:**
- `packages/api/typescript/src/procurement/controllers/CancelPurchaseOrder.ts`

Inject and call `CancelPurchaseOrder` use case with `{ storeId: request.ctx.storeId, purchaseOrderId: request.params.purchaseOrderId, reason: request.body.reason }`.

### Step T7.4 — Test: CancelPurchaseOrder behaviour

**Files to write:**
- `packages/api/typescript/src/procurement/usecases/CancelPurchaseOrder.test.ts`

Tests must assert:
- AC-2: places order → cancel succeeds → status `CANCELLED`
- PURCHASE_ORDER_CANNOT_BE_CANCELLED thrown when status is RECEIVED
- PURCHASE_ORDER_NOT_FOUND thrown for unknown id

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { TestBed } from '@codedm/core-typescript/testing'
import { container } from 'tsyringe'
import { CancelPurchaseOrder } from './CancelPurchaseOrder'
import { PlacePurchaseOrder } from './PlacePurchaseOrder'

describe('CancelPurchaseOrder', () => {
  let testBed: TestBed
  let cancel: CancelPurchaseOrder
  let place: PlacePurchaseOrder

  beforeAll(async () => {
    const testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer, ownerId: 'test-tenant' })
    cancel = testContainer.resolve(CancelPurchaseOrder)
    place = testContainer.resolve(PlacePurchaseOrder)
  })
  beforeEach(async () => { await testBed.reset() })
  afterAll(async () => { await testBed.destroy() })

  it('cancels a PLACED order', async () => {
    const { purchaseOrderId } = await place.execute({
      storeId: 'store-1',
      supplierId: 'supplier-1',
      supplierPlatform: 'BLING',
      connectionMode: 'CREDENTIALS',
      expectedDeliveryAt: null,
      lines: [{ productId: 'prod-1', quantity: 5, unitPriceCents: 1000, currency: 'BRL' }],
    })
    const result = await cancel.execute({ storeId: 'store-1', purchaseOrderId, reason: 'test' })
    expect(result.success).toBe(true)
  })

  it('throws PURCHASE_ORDER_CANNOT_BE_CANCELLED when RECEIVED', async () => {
    // given: order in RECEIVED state via repo directly
    // expect: PURCHASE_ORDER_CANNOT_BE_CANCELLED
  })
})
```

---

## Task T8: Go supplier webhook pipeline

**Phase:** 1 — Behavior Slice (parallel with T6, after T5)
**Depends on:** T5
**Estimated minutes:** 25

Implements the Go procurement bounded context: webhook controller, mapper factory, domain event, handler, repository, and fx module.

### Step T8.1 — Go context scaffold

**Scaffold:**
```bash
bun cli context procurement --lang=go
```

Generates `packages/api/go/internal/procurement/` with `module.go`.

### Step T8.2 — Go domain event

**Files to write:**
- `packages/api/go/internal/procurement/events/external_shipment_status_updated.go`

```go
package events

import "template/api-go/core/types"

const ExternalShipmentStatusUpdatedEventName = "sync.external_shipment_status_updated"

type ExternalShipmentStatusUpdatedPayload struct {
	PurchaseOrderID    string `json:"purchaseOrderId"`
	ExternalShipmentID string `json:"externalShipmentId"`
	SupplierPlatform   string `json:"supplierPlatform"`
	Status             string `json:"status"`
	ExpectedDeliveryAt string `json:"expectedDeliveryAt,omitempty"`
	DeliveredAt        string `json:"deliveredAt,omitempty"`
	RawPayload         string `json:"rawPayload"`
}

type ExternalShipmentStatusUpdatedEvent = types.DomainEvent[ExternalShipmentStatusUpdatedPayload]

func NewExternalShipmentStatusUpdated(payload ExternalShipmentStatusUpdatedPayload) ExternalShipmentStatusUpdatedEvent {
	return types.NewDomainEvent(ExternalShipmentStatusUpdatedEventName, payload)
}
```

### Step T8.3 — Go InboundShipment entity

**Files to write:**
- `packages/api/go/internal/procurement/entities/inbound_shipment.go`

```go
package entities

import "time"

type InboundShipment struct {
	id                 string
	purchaseOrderID    string
	externalShipmentID string
	supplierPlatform   string
	status             string
	expectedDeliveryAt *time.Time
	deliveredAt        *time.Time
	rawPayload         string
	receivedAt         time.Time
	updatedAt          time.Time
}

func NewInboundShipment(
	id, purchaseOrderID, externalShipmentID, supplierPlatform, status string,
	expectedDeliveryAt, deliveredAt *time.Time,
	rawPayload string,
) *InboundShipment {
	now := time.Now().UTC()
	return &InboundShipment{
		id:                 id,
		purchaseOrderID:    purchaseOrderID,
		externalShipmentID: externalShipmentID,
		supplierPlatform:   supplierPlatform,
		status:             status,
		expectedDeliveryAt: expectedDeliveryAt,
		deliveredAt:        deliveredAt,
		rawPayload:         rawPayload,
		receivedAt:         now,
		updatedAt:          now,
	}
}

// Accessor methods for persistence
func (s *InboundShipment) ID() string                      { return s.id }
func (s *InboundShipment) PurchaseOrderID() string         { return s.purchaseOrderID }
func (s *InboundShipment) ExternalShipmentID() string      { return s.externalShipmentID }
func (s *InboundShipment) SupplierPlatform() string        { return s.supplierPlatform }
func (s *InboundShipment) Status() string                  { return s.status }
func (s *InboundShipment) ExpectedDeliveryAt() *time.Time  { return s.expectedDeliveryAt }
func (s *InboundShipment) DeliveredAt() *time.Time         { return s.deliveredAt }
func (s *InboundShipment) RawPayload() string              { return s.rawPayload }
func (s *InboundShipment) ReceivedAt() time.Time           { return s.receivedAt }
func (s *InboundShipment) UpdatedAt() time.Time            { return s.updatedAt }
```

### Step T8.4 — Mapper interface and factory

**Files to write:**
- `packages/api/go/internal/procurement/mappers/mapper.go`

```go
package mappers

import "template/api-go/internal/procurement/events"

// SupplierWebhookMapper converts a raw webhook body ([]byte) from a specific
// supplier platform into the canonical ExternalShipmentStatusUpdatedPayload.
type SupplierWebhookMapper interface {
	Map(purchaseOrderID string, rawBody []byte) (events.ExternalShipmentStatusUpdatedPayload, error)
}
```

**Files to write:**
- `packages/api/go/internal/procurement/mappers/factory.go`

```go
package mappers

import "fmt"

// Factory returns the mapper for the given supplier platform.
func Factory(platform string) (SupplierWebhookMapper, error) {
	switch platform {
	case "BLING":
		return &BlingMapper{}, nil
	case "TINY":
		return &TinyMapper{}, nil
	case "OLIST":
		return &OlistMapper{}, nil
	default:
		return nil, fmt.Errorf("no mapper for supplier platform: %s", platform)
	}
}
```

**Files to write:**
- `packages/api/go/internal/procurement/mappers/bling.go` (stub)

```go
package mappers

import (
	"encoding/json"
	"template/api-go/internal/procurement/events"
)

type BlingMapper struct{}

type blingWebhookBody struct {
	ShipmentID  string `json:"shipment_id"`
	Status      string `json:"status"`
	ExpectedAt  string `json:"expected_at,omitempty"`
	DeliveredAt string `json:"delivered_at,omitempty"`
}

func (m *BlingMapper) Map(purchaseOrderID string, rawBody []byte) (events.ExternalShipmentStatusUpdatedPayload, error) {
	var body blingWebhookBody
	if err := json.Unmarshal(rawBody, &body); err != nil {
		return events.ExternalShipmentStatusUpdatedPayload{}, err
	}
	return events.ExternalShipmentStatusUpdatedPayload{
		PurchaseOrderID:    purchaseOrderID,
		ExternalShipmentID: body.ShipmentID,
		SupplierPlatform:   "BLING",
		Status:             body.Status,
		ExpectedDeliveryAt: body.ExpectedAt,
		DeliveredAt:        body.DeliveredAt,
		RawPayload:         string(rawBody),
	}, nil
}
```

Add stub `TinyMapper` and `OlistMapper` similarly (return `events.ExternalShipmentStatusUpdatedPayload{}`, `nil` — actual mapping deferred to per-platform work).

### Step T8.5 — Go webhook controller

**Files to write:**
- `packages/api/go/internal/procurement/controllers/supplier_webhook.go`

```go
package controllers

import (
	"context"
	"io"
	"net/http"

	"template/api-go/core/types"
	"template/api-go/internal/procurement/events"
	"template/api-go/internal/procurement/mappers"
)

type SupplierWebhookRequest struct {
	Platform        string `from:"query" validate:"required,oneof=BLING TINY OLIST"`
	PurchaseOrderID string `from:"query" validate:"required,uuid"`
}

type SupplierWebhookController struct {
	publisher types.DomainEventPublisher
}

func NewSupplierWebhookController(publisher types.DomainEventPublisher) *SupplierWebhookController {
	return &SupplierWebhookController{publisher: publisher}
}

func (c *SupplierWebhookController) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Path:   "/procurement/supplier-webhook",
		Method: http.MethodPost,
	}
}

func (c *SupplierWebhookController) Handle(ctx context.Context, r *http.Request) (any, error) {
	var req SupplierWebhookRequest
	if err := types.BindQuery(r, &req); err != nil {
		return nil, err
	}

	rawBody, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, err
	}

	mapper, err := mappers.Factory(req.Platform)
	if err != nil {
		return nil, err
	}

	payload, err := mapper.Map(req.PurchaseOrderID, rawBody)
	if err != nil {
		return nil, err
	}

	event := events.NewExternalShipmentStatusUpdated(payload)
	if err := c.publisher.Publish(ctx, event); err != nil {
		return nil, err
	}

	return map[string]bool{"received": true}, nil
}
```

### Step T8.6 — Go handler: ExternalShipmentStatusUpdated

**Files to write:**
- `packages/api/go/internal/procurement/handlers/external_shipment_status_updated.go`

```go
package handlers

import (
	"context"
	"template/api-go/core/types"
	"template/api-go/internal/procurement/entities"
	"template/api-go/internal/procurement/events"
	"template/api-go/internal/procurement/repositories"
	"github.com/google/uuid"
)

type ExternalShipmentStatusUpdatedHandler struct {
	repo repositories.IInboundShipmentRepository
}

func NewExternalShipmentStatusUpdatedHandler(repo repositories.IInboundShipmentRepository) *ExternalShipmentStatusUpdatedHandler {
	return &ExternalShipmentStatusUpdatedHandler{repo: repo}
}

func (h *ExternalShipmentStatusUpdatedHandler) EventName() string {
	return events.ExternalShipmentStatusUpdatedEventName
}

func (h *ExternalShipmentStatusUpdatedHandler) Handle(ctx context.Context, raw types.RawEvent) error {
	event, err := types.UnmarshalEvent[events.ExternalShipmentStatusUpdatedPayload](raw)
	if err != nil {
		return err
	}
	p := event.Payload

	shipment := entities.NewInboundShipment(
		uuid.New().String(),
		p.PurchaseOrderID,
		p.ExternalShipmentID,
		p.SupplierPlatform,
		p.Status,
		parseTime(p.ExpectedDeliveryAt),
		parseTime(p.DeliveredAt),
		p.RawPayload,
	)

	// InsertIfNew enforces the (supplierPlatform, externalShipmentId) unique constraint
	// at the DB layer — idempotent on replay.
	return h.repo.InsertIfNew(ctx, shipment)
}
```

### Step T8.7 — Go repository

**Files to write:**
- `packages/api/go/internal/procurement/repositories/inbound_shipment.go`

```go
package repositories

import (
	"context"
	"template/api-go/internal/procurement/entities"
)

type IInboundShipmentRepository interface {
	InsertIfNew(ctx context.Context, shipment *entities.InboundShipment) error
}

// PostgresInboundShipmentRepository implements IInboundShipmentRepository.
// INSERT INTO procurement.inbound_shipments (...) ON CONFLICT (supplier_platform, external_shipment_id) DO NOTHING
type PostgresInboundShipmentRepository struct {
	db any // *sql.DB injected via fx
}
```

### Step T8.8 — Go fx module

**Files to write:**
- `packages/api/go/internal/procurement/module.go`

```go
package procurement

import (
	"go.uber.org/fx"
	"template/api-go/internal/procurement/controllers"
	"template/api-go/internal/procurement/handlers"
	"template/api-go/internal/procurement/repositories"
)

var Module = fx.Module("procurement",
	fx.Provide(
		repositories.NewPostgresInboundShipmentRepository,
		handlers.NewExternalShipmentStatusUpdatedHandler,
		provideController,
	),
	fx.Invoke(registerHandler),
)

func provideController(publisher /* types.DomainEventPublisher */ any) *controllers.SupplierWebhookController {
	return controllers.NewSupplierWebhookController(publisher)
}

func registerHandler(handler *handlers.ExternalShipmentStatusUpdatedHandler, mediator /* types.HandlerRegistry */ any) {
	// mediator.Register(handler)
}
```

### Step T8.9 — Wire in main.go

**Files to edit:**
- `packages/api/go/cmd/api/main.go`

Add import and include `procurement.Module` in `fx.New(...)` options list alongside existing modules.

---

## Task T9: BFF reads

**Phase:** 1 — Behavior Slice
**Depends on:** T6 (for `purchase_orders` table data), T8 (for `inbound_shipments` table data)
**Estimated minutes:** 12

Implements the two BFF query use cases and wires them into the already-scaffolded controllers.

### Step T9.1 — GetPurchaseOrderTimeline query

**Files to write:**
- `packages/api/typescript/src/ui/queries/GetPurchaseOrderTimeline.ts`

```typescript
import { injectable, inject } from 'tsyringe'
// Drizzle DB injected
// Queries procurement.purchase_orders JOIN procurement.inbound_shipments
// Returns { purchaseOrderId, status, shipments[] } ordered by receivedAt ASC

export class GetPurchaseOrderTimelineQuery {
  constructor(@inject('DrizzleClient') private readonly db: any) {}

  async execute(input: { storeId: string; purchaseOrderId: string }) {
    // SELECT po.id, po.status, is.* FROM procurement.purchase_orders po
    // LEFT JOIN procurement.inbound_shipments is ON is.purchase_order_id = po.id
    // WHERE po.id = $1 AND po.store_id = $2
    // ORDER BY is.received_at ASC
    throw new Error('implement')
  }
}
```

### Step T9.2 — GetSupplierScorecard query

**Files to write:**
- `packages/api/typescript/src/ui/queries/GetSupplierScorecard.ts`

```typescript
import { injectable, inject } from 'tsyringe'
// Live GROUP BY on procurement.inbound_shipments — no projection class.
// SELECT supplier_platform, purchase_order_id,
//   COUNT(*) AS total_shipments,
//   COUNT(*) FILTER (WHERE delivered_at <= expected_delivery_at) AS on_time_deliveries
// FROM procurement.inbound_shipments
// WHERE purchase_order_id IN (SELECT id FROM procurement.purchase_orders WHERE store_id = $storeId)
//   [AND supplier_platform = $platform]
//   [AND received_at BETWEEN $fromDate AND $toDate]
// GROUP BY supplier_platform, purchase_order_id

export class GetSupplierScorecardQuery {
  constructor(@inject('DrizzleClient') private readonly db: any) {}

  async execute(input: { storeId: string; supplierPlatform?: string; fromDate?: string; toDate?: string }) {
    throw new Error('implement')
  }
}
```

### Step T9.3 — Wire real BFF controllers

**Files to edit:**
- `packages/api/typescript/src/ui/controllers/GetPurchaseOrderTimeline.ts` — inject `GetPurchaseOrderTimelineQuery`, call in `handle`
- `packages/api/typescript/src/ui/controllers/GetSupplierScorecard.ts` — inject `GetSupplierScorecardQuery`, call in `handle`

---

## Task T10: React route + components

**Phase:** 1 — Behavior Slice (parallel with T5–T9, requires only Contract Lock T4)
**Depends on:** T4
**Estimated minutes:** 20

### Step T10.1 — Scaffold route

**Scaffold:**
```bash
bun cli route "(app)/procurement"
cd packages/app/react && bun tsr generate
```

**Files generated:**
- `packages/app/react/src/routes/(app)/procurement/index.tsx`
- `packages/app/react/src/routes/(app)/procurement/-components/` (empty)

### Step T10.2 — Scaffold components

**Scaffold:**
```bash
bun cli component PurchaseOrderFormSection --route "(app)/procurement"
bun cli component InboundShipmentTimelineSection --route "(app)/procurement"
bun cli component SupplierScorecardSection --route "(app)/procurement"
```

### Step T10.3 — PurchaseOrderFormSection

**Files to write:**
- `packages/app/react/src/routes/(app)/procurement/-components/PurchaseOrderFormSection.tsx`

```tsx
import { useForm } from '@tanstack/react-form'
import { usePlacePurchaseOrder } from '@codedm/client-typescript/typescript'
import { PlacePurchaseOrderControllerInputSchema } from '@codedm/client-typescript/typescript'

export function PurchaseOrderFormSection() {
  const mutation = usePlacePurchaseOrder()

  const form = useForm({
    defaultValues: {
      supplierId: '',
      supplierPlatform: 'BLING' as const,
      connectionMode: 'CREDENTIALS' as const,
      expectedDeliveryAt: '',
      lines: [{ productId: '', quantity: 1, unitPriceCents: 0, currency: 'BRL' }],
    },
    validators: {
      onChange: PlacePurchaseOrderControllerInputSchema.shape.body,
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value)
    },
  })

  return (
    <form onSubmit={e => { e.preventDefault(); form.handleSubmit() }}>
      {/* fields for supplierId, supplierPlatform, connectionMode, expectedDeliveryAt, lines */}
      <button type="submit" disabled={mutation.isPending}>Place Order</button>
    </form>
  )
}
```

### Step T10.4 — InboundShipmentTimelineSection

```tsx
import { useGetPurchaseOrderTimeline } from '@codedm/client-typescript/typescript'

export function InboundShipmentTimelineSection({ purchaseOrderId }: { purchaseOrderId: string }) {
  const { data } = useGetPurchaseOrderTimeline(
    { params: { purchaseOrderId } },
    { refetchInterval: 30_000 }, // AC-3: live update via polling
  )

  return (
    <ul>
      {data?.shipments.map(s => (
        <li key={s.shipmentId}>
          {s.externalShipmentId} — {s.status} ({s.deliveredAt ?? 'in transit'})
        </li>
      ))}
    </ul>
  )
}
```

### Step T10.5 — SupplierScorecardSection

```tsx
import { useGetSupplierScorecard } from '@codedm/client-typescript/typescript'

export function SupplierScorecardSection() {
  const { data } = useGetSupplierScorecard(
    { query: {} },
    { refetchInterval: 60_000 }, // AC-4: recomputes when new webhook lands
  )

  return (
    <table>
      <thead><tr><th>Platform</th><th>On-time %</th></tr></thead>
      <tbody>
        {data?.rows.map(r => (
          <tr key={r.supplierId}>
            <td>{r.supplierPlatform}</td>
            <td>{(r.onTimeDeliveryRate * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

### Step T10.6 — Assemble route

**Files to edit:**
- `packages/app/react/src/routes/(app)/procurement/index.tsx`

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { PurchaseOrderFormSection } from './-components/PurchaseOrderFormSection'
import { SupplierScorecardSection } from './-components/SupplierScorecardSection'

export const Route = createFileRoute('/(app)/procurement/')({
  component: ProcurementPage,
})

function ProcurementPage() {
  return (
    <div>
      <h1>Procurement</h1>
      <PurchaseOrderFormSection />
      <SupplierScorecardSection />
    </div>
  )
}
```

Note: `InboundShipmentTimelineSection` is rendered from a detail view or dialog — the `purchaseOrderId` prop comes from a selected order in the form's success callback or a route search param.

---

## Task T11: E2E coverage

**Phase:** 2 — Integration + QA
**Depends on:** T6, T7, T8, T9, T10
**Estimated minutes:** 15

### Step T11.1 — Procurement E2E spec

**Files to write:**
- `packages/e2e/tests/procurement.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Procurement', () => {
  test('AC-1: seller can place a purchase order', async ({ page }) => {
    await page.goto('/app/procurement')
    // fill form: supplier, platform=BLING, lines x1
    // submit → expect success toast / order id visible
    await expect(page.getByText(/order placed/i)).toBeVisible()
  })

  test('AC-2: seller can cancel a DRAFT or PLACED order', async ({ page }) => {
    // place order first
    // click cancel → confirm dialog → expect status=CANCELLED
    await expect(page.getByText(/cancelled/i)).toBeVisible()
  })

  test('AC-3: shipment timeline updates without manual refresh', async ({ page }) => {
    // place order
    // simulate webhook POST to /procurement/supplier-webhook?platform=BLING&purchaseOrderId=<id>
    // wait for polling interval
    // expect new shipment row to appear in InboundShipmentTimelineSection
    await expect(page.getByRole('listitem')).toHaveCount(1)
  })

  test('AC-4: supplier scorecard recomputes when webhook lands', async ({ page }) => {
    // POST webhook → navigate to scorecard → expect BLING row with >0 shipments
    await expect(page.getByRole('row', { name: /BLING/i })).toBeVisible()
  })
})
```

---

## Final Validation — AC Mapping

| AC | Implemented by | Test path |
|---|---|---|
| AC-1: Seller places purchase order | T6 (PlacePurchaseOrder use case + controller) | T11 AC-1 E2E |
| AC-2: Seller cancels; RECEIVED → cannot cancel | T7 (CancelPurchaseOrder use case, `order.cancel()` invariant) | T7.4 unit + T11 AC-2 E2E |
| AC-3: Timeline updates without manual refresh | T9 (GetPurchaseOrderTimeline BFF) + T10.4 (`refetchInterval: 30_000`) | T11 AC-3 E2E |
| AC-4: Scorecard recomputes on webhook | T8 (Go pipeline writes inbound_shipments) + T9 (live GROUP BY) + T10.5 (`refetchInterval: 60_000`) | T11 AC-4 E2E |

---

## Notes

### Domain event ownership
Domain events are saved by use cases via `this.domainEventRepository.save(new XEvent({...}), tx)` — NOT raised by entity methods. The entity's `place()` / `cancel()` methods mutate state and throw on invariant violation; the use case wraps them and saves the event in the same transaction.

### Go migration ownership
All schema changes — including the `inbound_shipments` table written by Go — go through Drizzle at `packages/contracts/db/schema/`. Go's `core/db/sql/migrations/` is test-fixture only. T5 covers both tables in a single migration run.

### SDK regen after controller changes
If any controller signature changes after T4 (Contract Lock), re-run `bun emit-openapi && bun sdk` and update downstream consumers in T10.

### Webhook deduplication
Enforced by unique index on `(supplier_platform, external_shipment_id)` in the DB (T5). The Go handler calls `repo.InsertIfNew()` which maps to `INSERT ... ON CONFLICT DO NOTHING`. No application-layer dedup needed.

### SupplierConnection (rejected aggregate)
Connection config (BLING × CREDENTIALS) lives as fields on `PurchaseOrder`. A future `SupplierIntegration` aggregate can be extracted when multi-order-per-connection or OAuth token management is required.
