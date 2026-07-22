# SPEC-11: Port `ProductCostHandler` + `ProductCostSolver` from bk-dash

**Wave:** 6   **Stream:** B   **Depends on:** SPEC-10, SPEC-12 (multi-event support)   **Status:** done

## Motivation

`OrderOverrideFields` already has a `productCostByLine: { lineId, cost }[]` field, but nothing computes and writes it. The bk-dash implementation has a `ProductCostHandler` that:
- Listens for `OrderSync`, `ProductCostCreated`, `ProductCostDeleted`, `FixProductCosts` events
- Resolves applicable cost rules per order line (by product, by variant, by date interval, by country)
- Uses `ProductCostSolver` to compute per-line cost
- Bulk-writes the result onto each order

Port this to the new polyglot template, adapted to:
- Drizzle (instead of Mongoose)
- Event-driven via mediator + multi-event handler (SPEC-12)
- Sales BC writes `OrderOverride.productCostByLine` (catalog BC owns the cost rules)

## Reference

**Source** (read this before implementing):
- Handler: `/Users/gabrielaraujo/Desktop/Projetos/bk-company/bk-dash-backend/backend-old/src/modules/products/handlers/ProductCostHandler.ts` (~594 lines)
- Solver: `/Users/gabrielaraujo/Desktop/Projetos/bk-company/bk-dash-backend/backend-old/src/modules/products/utils/ProductCostSolver/` (multiple files)
- CSV processing (related, may be in scope of P6 plan, not this spec): `backend-old/src/modules/products/utils/ProductCostCsv/`

Read both files / folders end-to-end. The math in `ProductCostSolver` is non-trivial and must be ported faithfully — the solver picks the "optimal" cost from overlapping cost rules.

## Scope

### Port `ProductCostSolver` (pure utility)

- Location: `packages/api/typescript/src/catalog/services/ProductCostSolver/ProductCostSolver.ts`
- Pure function / class: takes `(costs, variantQuantityMap, variantProductMap)` and returns the resolved per-line cost.
- No IO. No DI required.
- Translate bk-dash types:
  - `ProductCostFormatted` → keep the shape but use Zod schemas
  - `Currency` (bk-dash) → `CurrencyCode` (template's wire enum)
  - `Decimal.js` (Prisma) → `number` (cents, integer) or `bigint` if precision matters — verify what the existing OrderOverride.productCostByLine uses
- Port tests if bk-dash has them; otherwise write tests covering: single cost match, multiple overlapping costs (solver picks optimal), no cost match (returns empty), country/variant filter mismatches.

### Cross-BC port: `ProductCostQueryService` in catalog BC

```ts
// catalog/services/ProductCostQueryService/ProductCostQueryService.ts
export const ApplicableProductCostSchema = z.object({
  costId: z.instance(Id),
  options: z.array(ProductCostOptionSchema),
  type: z.enum(ProductCostType),
  // ... per bk-dash's ProductCostForProcessing shape
})

export abstract class ProductCostQueryService {
  abstract findApplicable(input: {
    storeId: Id
    productExternalIds?: string[]
    variantExternalIds?: string[]
    interval?: { start: Date; end: Date }
  }): Promise<z.infer<typeof ApplicableProductCostSchema>[]>
}
```

Drizzle impl in catalog BC joins `product_costs` + `product_cost_options` + `product_cost_option_items` and filters per the input criteria.

### New handler in sales BC

The handler subscribes to multiple events using SPEC-12's multi-event support:

```ts
// sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts
@injectable()
export class ProductCostApplicationHandler extends EventHandler<
  readonly [typeof OrderUpdatedEvent, typeof ProductCostCreatedEvent, typeof ProductCostDeletedEvent]
> {
  readonly event = [OrderUpdatedEvent, ProductCostCreatedEvent, ProductCostDeletedEvent] as const

  constructor(
    private readonly orderOverrideRepo: OrderOverrideRepository,
    private readonly orderProjectionRepo: OrderProjectionRepository,
    private readonly costQueryService: ProductCostQueryService,
    private readonly solver: ProductCostSolver,
  ) { super() }

  async handle(event: this['input'], tx?: Transaction): Promise<void> {
    switch (event.name) {
      case OrderUpdatedEvent.name: {
        // Single-order path: recompute cost for THIS order
        return this.applyForOneOrder(event as OrderUpdatedEvent, tx)
      }
      case ProductCostCreatedEvent.name:
      case ProductCostDeletedEvent.name: {
        // Bulk path: recompute for all orders matching the affected products/variants
        return this.recomputeAffected(event, tx)
      }
    }
  }

  private async applyForOneOrder(event: OrderUpdatedEvent, tx?: Transaction): Promise<void> {
    const order = event.payload.entity   // post-SPEC-14, full entity is in payload
    const costs = await this.costQueryService.findApplicable({
      storeId: new Id(order.storeId),
      productExternalIds: order.lines.map(l => l.productExternalId),
      variantExternalIds: order.lines.flatMap(l => l.variantExternalId ? [l.variantExternalId] : []),
      interval: { start: order.createdAt, end: order.createdAt },
    })

    const productCostByLine = this.solver.solve({ order, costs })

    let override = await this.orderOverrideRepo.findByOrderId(new Id(order.id), tx)
    if (!override) {
      override = OrderOverride.create({ orderId: new Id(order.id), storeIntegrationExternalId: order.storeIntegrationExternalId })
    }
    override.setProductCostByLine(productCostByLine)
    await this.orderOverrideRepo.save(override, tx)
  }

  private async recomputeAffected(event: ProductCostCreatedEvent | ProductCostDeletedEvent, tx?: Transaction): Promise<void> {
    // Bulk: find affected orders, iterate. For a large store this may be slow —
    // see Notes for the deferred-job alternative.
    // ...
  }
}
```

### `OrderOverride.setProductCostByLine`

If `OrderOverride` entity doesn't already have a method to set `productCostByLine`, add it:

```ts
setProductCostByLine(byLine: ProductCostByLineEntry[]): void {
  this.props.productCostByLine = byLine
  this.props.updatedAt = new Date()
}
```

(Validates via `OrderOverrideFieldsSchema` on save.)

### Wiring

- Register `ProductCostQueryService` (interface + Drizzle impl + Mock) in catalog BC's `registry.ts`.
- Register `ProductCostSolver` (no interface needed — just `@injectable()` the class) in catalog BC.
- Register `ProductCostApplicationHandler` in sales BC's `handlers/external.ts` (it consumes cross-BC events from catalog AND integration events from Go-sync).

## Affected files

- `packages/api/typescript/src/catalog/services/ProductCostSolver/**` — NEW
- `packages/api/typescript/src/catalog/services/ProductCostQueryService/**` — NEW (interface + Drizzle + Mock)
- `packages/api/typescript/src/catalog/registry.ts` — register new services
- `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts` — NEW
- `packages/api/typescript/src/sales/handlers/external.ts` — barrel-export the new parent
- `packages/api/typescript/src/sales/entities/OrderOverride.ts` — add `setProductCostByLine` method if missing
- Tests for handler + solver + query service

## Acceptance criteria

- [ ] `ProductCostSolver` ported with matching algorithm (verify with at least 3 fixture cases mirroring bk-dash test outputs).
- [ ] `ProductCostQueryService` returns the right shape; Drizzle impl tested with a seeded catalog dataset.
- [ ] `ProductCostApplicationHandler` subscribes to 3 events; handles each correctly.
- [ ] For an `OrderUpdated` event: `OrderOverride.productCostByLine` gets populated with the resolved costs.
- [ ] For a `ProductCostCreated` / `Deleted`: affected orders' OrderOverrides are recomputed (basic synchronous path is acceptable for v1; see Notes).
- [ ] Idempotency: replaying the same event produces the same OrderOverride state.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean — handler tests, solver tests, query service tests.

## Out of scope

- `BulkImportProductCostsFromCsv` use case — that's part of the existing P6-CATALOG plan (commands C30), not this spec.
- A background-job version of the bulk-recompute path — v1 does it synchronously inline. If perf becomes an issue, follow up with a job-based path.
- Webhook-based "fix all costs for this store" admin command — bk-dash has `FixProductCostsEvent`; we omit it for v1 and add a dedicated use case (`RecomputeAllProductCostsForStore`) only if a real merchant ask emerges.
- Sending a "product costs processed" email — bk-dash's notification logic, out of scope here.

## Notes

- **Read the bk-dash source end-to-end before implementing.** The solver algorithm is the tricky part — the `for (const [variantId] of variantQuantityMap)` loop with multi-filter cost matching has subtle precedence rules (specific variant matches preferred over generic).
- For the bulk path (`recomputeAffected`): bk-dash uses MongoDB `bulkWrite` with batches of 5000. Drizzle's equivalent is per-row updates inside a transaction; for v1, iterate sequentially. If a real store has 10K+ orders affected by a cost change, performance will be a problem — add a `RecomputeProductCostsJob` (Job pattern in core) that the handler enqueues instead of doing inline. Defer to a follow-up.
- bk-dash uses per-virtualStore mutex (`Mutex` from `async-mutex`) to serialize processing per store. The new architecture uses Drizzle's row-level locking + transaction isolation — no app-level mutex needed.
- `productCostByLine` shape (per `OrderOverrideFieldsSchema`): `{ lineId: string; cost: { amountCents: number; currency: CurrencyCode } }[]`. The solver returns this directly.
- Memory rule (potential): if this spec discovers a cleaner pattern for cross-BC query services that we want to standardize, capture in `feedback_query_service_naming_and_zod.md` (already exists).
