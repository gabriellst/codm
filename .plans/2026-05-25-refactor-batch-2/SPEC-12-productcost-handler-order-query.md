# SPEC-12: `ProductCostApplicationHandler` reads orders via `OrderQueryService` — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Remove the two direct `db.select().from(orders)` calls from
`ProductCostApplicationHandler` — replacing them with
`OrderQueryService.findById` and `OrderQueryService.findByStore` — so the
handler holds no raw Drizzle access for order reads. Drop the now-unused
`private readonly db: DrizzleClient` constructor param; keep `DrizzleClient`
as a type-only import (still needed for the `tx as unknown as DrizzleClient`
casts passed to `overrideRepo`).

**Architecture:** Two atomic commits: (1) wire `OrderQueryService` into the
handler + rewrite the two read paths; (2) update the test to mock
`OrderQueryService` instead of seeding `orders` rows directly via Drizzle.
No schema changes; no migration. `sales/registry.ts` gets the
`OrderQueryService` token registered for mock/integration/real so the
container can resolve the handler.

**Tech Stack:** TypeScript + Bun + tsyringe-neo + `bun:test` + PGlite
integration harness.

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-12-productcost-handler-order-query.md`
**Tasks:** 2
**Estimated minutes:** 35

> **Planner note — `DrizzleClient` stays as type import.** After dropping
> `private readonly db: DrizzleClient`, the constructor no longer takes a
> `DrizzleClient` argument. But `DrizzleClient` is still referenced as a type
> on lines 123 and 134 (`tx as unknown as DrizzleClient`) for the repo calls.
> Switch the import to `type DrizzleClient` (import type) to satisfy the
> no-unused-value-import rule without removing the type reference.

> **Planner note — `OrderRow` alias becomes `OrderQueryResult`.** The handler
> currently aliases `typeof orders.$inferSelect` as `OrderRow` and passes it
> to `applyForOrder`. After the switch the handler operates on whatever shape
> `OrderQueryService` returns. That shape (defined inside the service per the
> `/query` skill) must include: `id`, `storeId`, `externalCreatedAt`,
> `storeIntegrationExternalId`, `lines` (typed as `OrderLine[]`). The internal
> `OrderLine` interface stays unchanged. The `applyForOrder` private method
> signature changes from `order: OrderRow` to `order: OrderQueryResult` (or
> the inferred type from `OrderQueryService`).

> **Planner note — SPEC-11 must land first.** `OrderQueryService` (abstract
> class + `DrizzleOrderQueryService` + `MockOrderQueryService` + barrel in
> `src/sales/services/OrderQueryService/`) must exist before this plan's
> Task 1 runs. The plan assumes those files are present. If SPEC-11 is not
> yet merged, block this plan at Task 1 Step 1.

> **Planner note — test strategy flip.** The existing test uses `integration`
> mode and seeds the `orders` table directly via `db.insert(orders)` to
> exercise the handler. After this change, the handler no longer reads from
> the table directly, so the test switches: it stays in `integration` mode but
> overrides `OrderQueryService` with `MockOrderQueryService` (the same pattern
> as `MockProductCostQueryService` today). The `db.insert(orders)` helper is
> removed; `orderQuery.nextOrder` / `orderQuery.nextStoreOrders` are seeded
> instead. The three existing test cases (`OrderUpdated → resolves per-line
> cost`, `no matching cost → empty`, `idempotent`) are preserved verbatim; only
> how state is staged changes.

---

## Task 1: Handler reads orders via `OrderQueryService`

**Files:**
- Modify: `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts`
- Modify: `packages/api/typescript/src/sales/registry.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler
**Depends on:** SPEC-11

- [ ] **Step 1: Confirm `OrderQueryService` exists (pre-condition)**

```bash
ls packages/api/typescript/src/sales/services/OrderQueryService/
```

Expected: `OrderQueryService.ts`, `DrizzleOrderQueryService.ts`,
`MockOrderQueryService.ts`, `index.ts`. If any are missing, stop — SPEC-11
must land first.

- [ ] **Step 2: Write the failing assertion (RED)**

The current handler imports `orders` from `@template/contracts/db` and calls
`db.select().from(orders)`. The acceptance criterion is zero `from(orders)`
calls in the handler. The existing test passes today because the handler reads
the DB directly. After this task the handler must route through the service
instead.

Run the grep to confirm the current state:

```bash
grep -n "from(orders)" packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts
```

Expected: 2 matches (lines 69 and 139). This is the RED state.

- [ ] **Step 3: Rewrite the handler**

Open
`packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts`
and make the following changes:

**Import changes:**

```ts
// Before:
import { EventHandler, DrizzleClient, Id, type Transaction } from '@template/core-typescript'
import { eq } from 'drizzle-orm'
import { orders } from '@template/contracts/db'

// After:
import { EventHandler, Id, type Transaction } from '@template/core-typescript'
import type { DrizzleClient } from '@template/core-typescript'
import { OrderQueryService } from '../../services/OrderQueryService'
```

Remove `eq` and `orders` entirely. Remove the `DrizzleClient` value import;
add `import type { DrizzleClient }`.

**Type alias change:**

```ts
// Before:
type OrderRow = typeof orders.$inferSelect

// After (use the service's inferred return type):
type OrderQueryResult = Awaited<ReturnType<OrderQueryService['findById']>>
```

**Constructor change:**

```ts
// Before:
constructor(
  private readonly db: DrizzleClient,
  private readonly costQuery: ProductCostQueryService,
  private readonly overrideRepo: OrderOverrideRepository,
) { super() }

// After (drop db):
constructor(
  private readonly orderQuery: OrderQueryService,
  private readonly costQuery: ProductCostQueryService,
  private readonly overrideRepo: OrderOverrideRepository,
) { super() }
```

**`applyForOrderId` rewrite (was ~lines 67–73):**

```ts
private async applyForOrderId(orderId: string, tx?: Transaction): Promise<void> {
  const order = await this.orderQuery.findById(orderId)
  if (!order) return
  await this.applyForOrder(order, tx)
}
```

Remove the `dbc` line and the `select().from(orders)` call entirely.

**`applyForOrder` signature change:**

```ts
// Before:
private async applyForOrder(order: OrderRow, tx?: Transaction): Promise<void> {

// After:
private async applyForOrder(order: NonNullable<OrderQueryResult>, tx?: Transaction): Promise<void> {
```

Body of `applyForOrder` is unchanged — it only accesses `order.id`,
`order.storeId`, `order.externalCreatedAt`, `order.storeIntegrationExternalId`,
and `order.lines`; these must all be present in `OrderQueryResult` (confirmed
from SPEC-11's service definition).

**`recomputeAffected` rewrite (was ~lines 137–145):**

```ts
private async recomputeAffected(storeId: string, variantId: string, tx?: Transaction): Promise<void> {
  const storeOrders = await this.orderQuery.findByStore(storeId)
  for (const order of storeOrders) {
    const lines = (order.lines as OrderLine[]) ?? []
    if (lines.some(l => l.variantId === variantId)) {
      await this.applyForOrder(order, tx)
    }
  }
}
```

Remove the `dbc` line and the `select().from(orders).where(eq(orders.storeId, storeId))` call.

- [ ] **Step 4: Register `OrderQueryService` in `sales/registry.ts`**

Open
`packages/api/typescript/src/sales/registry.ts` and add the import +
registration mirroring how `ProductCostQueryService` is registered in
`catalog/registry.ts`:

```ts
// Add import at the top (after existing imports):
import { OrderQueryService } from './services/OrderQueryService'
import { MockOrderQueryService } from './services/OrderQueryService'
import { DrizzleOrderQueryService } from './services/OrderQueryService'
```

Add to each registry tier inside `INSTANCE_REGISTRY`:

```ts
mock: [
  { token: OrderQueryService, instance: MockOrderQueryService },
  // … existing entries …
],
integration: [
  { token: OrderQueryService, instance: DrizzleOrderQueryService },
  // … existing entries …
],
real: [
  { token: OrderQueryService, instance: DrizzleOrderQueryService },
  // … existing entries …
],
```

- [ ] **Step 5: Verify the grep acceptance criterion (GREEN)**

```bash
grep -n "from(orders)" packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts
```

Expected: **0 matches**.

```bash
grep -n "orders" packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts
```

Expected: 0 matches (the `orders` table import is gone entirely).

- [ ] **Step 6: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors. If `OrderQueryResult` type resolution fails, check that
`OrderQueryService.findById` returns `Promise<X | undefined>` — the
`NonNullable<…>` wrapper handles the undefined branch.

- [ ] **Step 7: Commit**

Use `/commit`:

```
refactor(sales): ProductCostApplicationHandler reads orders via OrderQueryService (SPEC-12 Task 1)
```

Stage: `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts`,
`packages/api/typescript/src/sales/registry.ts`

---

## Task 2: Handler test uses `MockOrderQueryService`

**Files:**
- Modify: `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** 1

- [ ] **Step 1: Confirm the existing test fails (RED)**

After Task 1, the handler no longer injects `DrizzleClient`, so the container
resolves `OrderQueryService` via `DrizzleOrderQueryService` (integration mode).
The test's `seedOrderWithLine` helper inserts a row directly into `orders`, and
`DrizzleOrderQueryService.findById` will still find it — so the test may still
pass. The RED state is: the test references `DrizzleClient` and `orders`
imports that should be removed, and it does not override `OrderQueryService`
with a mock. Run:

```bash
cd packages/api/typescript && bun test src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.test.ts
```

Note the result (may still pass). The task's goal is to make the test
independent of the `orders` table — not to make it fail first — but we verify
it stays green throughout.

- [ ] **Step 2: Rewrite the test**

Replace
`packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.test.ts`
with the following:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Id } from '@template/core-typescript'
import { ProductCostType, QuantityModifier } from '@template/contracts-typescript/wire/enums'
import { OrderUpdatedEvent } from '@template/contracts-typescript/wire/events'
import { ProductCostApplicationHandler } from './ProductCostApplicationHandler'
import { OrderOverrideRepository } from '../../repositories/OrderOverrideRepository/OrderOverrideRepository'
import { ProductCostQueryService, MockProductCostQueryService } from '../../../catalog/services/ProductCostQueryService'
import { OrderQueryService, MockOrderQueryService } from '../../services/OrderQueryService'

const STORE = '019e4d24-6524-7041-9e1c-8108180cddae'
const SI_EXTERNAL = 'acme.myshopify.com'
const PLATFORM = 'SHOPIFY'
const ORDER_EXTERNAL = 'shopify_order_1'
const PRODUCT_ID = Id.fromSeed('product', PLATFORM, 'shopify_prod_1').value
const VARIANT_ID = Id.fromSeed('product_variant', PLATFORM, 'shopify_var_1').value
const ORDER_ID = Id.fromSeed('order', PLATFORM, ORDER_EXTERNAL).value

/** Minimal order shape matching what OrderQueryService.findById returns. */
function makeOrder(quantity: number) {
  return {
    id: ORDER_ID,
    storeId: STORE,
    storeIntegrationExternalId: SI_EXTERNAL,
    externalCreatedAt: new Date('2026-05-01T10:00:00Z'),
    lines: [{ id: 'line-1', productId: PRODUCT_ID, variantId: VARIANT_ID, quantity }],
  }
}

describe('ProductCostApplicationHandler (SPEC-12)', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer
  let handler: ProductCostApplicationHandler
  let overrideRepo: OrderOverrideRepository
  let costQuery: MockProductCostQueryService
  let orderQuery: MockOrderQueryService

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer })
  })
  beforeEach(async () => {
    await testBed.reset()
    // Override both query services with mocks so the handler is fully decoupled
    // from the DB during these tests.
    costQuery = new MockProductCostQueryService()
    orderQuery = new MockOrderQueryService()
    testContainer.registerInstance(ProductCostQueryService as never, costQuery as never)
    testContainer.registerInstance(OrderQueryService as never, orderQuery as never)
    handler = testBed.resolve(ProductCostApplicationHandler)
    overrideRepo = testBed.resolve(OrderOverrideRepository)
  })
  afterAll(async () => {
    await testBed.destroy()
  })

  function orderUpdatedEvent(): OrderUpdatedEvent {
    return new OrderUpdatedEvent({
      ownerId: STORE,
      payload: {
        platform: PLATFORM as any,
        externalId: ORDER_EXTERNAL,
        storeIntegrationExternalId: SI_EXTERNAL,
        paymentStatus: 'PAID' as any,
        totalCents: 0,
        currency: 'USD' as any,
        isNew: true,
        entity: {},
      },
    })
  }

  it('OrderUpdated → resolves per-line cost via OrderQueryService + writes OrderOverride.productCostByLine', async () => {
    orderQuery.nextOrder = makeOrder(2)
    costQuery.nextCosts = [
      {
        costId: 'cost-1',
        costOptionId: 'opt-1',
        type: ProductCostType.SINGLE,
        startDate: new Date('2026-01-01'),
        endDate: null,
        productId: PRODUCT_ID,
        shipping: 0,
        variants: [],
        data: [
          {
            cost: 500,
            costOptionItemId: 'item-1',
            currency: 'USD',
            productId: PRODUCT_ID,
            quantity: 1,
            quantityModifier: QuantityModifier.GTE,
            shipping: 0,
            variants: [VARIANT_ID],
          },
        ],
      },
    ]

    await handler.handle(orderUpdatedEvent() as never)

    const override = await overrideRepo.findByPin(ORDER_ID, SI_EXTERNAL)
    expect(override).toBeDefined()
    const byLine = override!.fields.productCostByLine
    expect(byLine).toHaveLength(1)
    expect(byLine![0]!.lineId).toBe('line-1')
    // 2 units × 500 per unit → 1000 total for the line.
    expect(byLine![0]!.cost.amountCents).toBe(1000)
    expect(byLine![0]!.cost.currency).toBe('USD')
  })

  it('OrderUpdated with no matching cost → no per-line cost entries', async () => {
    orderQuery.nextOrder = makeOrder(1)
    costQuery.nextCosts = []

    await handler.handle(orderUpdatedEvent() as never)

    const override = await overrideRepo.findByPin(ORDER_ID, SI_EXTERNAL)
    expect(override?.fields.productCostByLine ?? []).toHaveLength(0)
  })

  it('is idempotent — replaying the same event yields the same per-line cost', async () => {
    orderQuery.nextOrder = makeOrder(2)
    costQuery.nextCosts = [
      {
        costId: 'cost-1',
        costOptionId: 'opt-1',
        type: ProductCostType.SINGLE,
        startDate: new Date('2026-01-01'),
        endDate: null,
        productId: PRODUCT_ID,
        shipping: 0,
        variants: [],
        data: [
          {
            cost: 500,
            costOptionItemId: 'item-1',
            currency: 'USD',
            productId: PRODUCT_ID,
            quantity: 1,
            quantityModifier: QuantityModifier.GTE,
            shipping: 0,
            variants: [VARIANT_ID],
          },
        ],
      },
    ]

    await handler.handle(orderUpdatedEvent() as never)
    await handler.handle(orderUpdatedEvent() as never)

    const override = await overrideRepo.findByPin(ORDER_ID, SI_EXTERNAL)
    expect(override!.fields.productCostByLine).toHaveLength(1)
    expect(override!.fields.productCostByLine![0]!.cost.amountCents).toBe(1000)
  })

  it('handler reads orders via OrderQueryService, not via Drizzle directly', () => {
    // Structural assertion: the handler class has no `db` property after the
    // constructor refactor. This catches a regression where DrizzleClient is
    // accidentally re-injected.
    const handlerInstance = handler as any
    expect(handlerInstance.db).toBeUndefined()
    // The orderQuery property must be the mock we registered.
    expect(handlerInstance.orderQuery).toBe(orderQuery)
  })
})
```

Key changes vs the old test:
- `DrizzleClient` and `orders` imports removed.
- `MockOrderQueryService` imported and instantiated; registered over
  `OrderQueryService` token (same pattern as `MockProductCostQueryService`).
- `seedOrderWithLine` helper removed; replaced by `makeOrder(quantity)` factory
  that returns the plain object `MockOrderQueryService.nextOrder` expects.
- New structural assertion (`handler reads orders via OrderQueryService`)
  verifies `handlerInstance.db` is `undefined` (no DrizzleClient injected)
  and `handlerInstance.orderQuery` is the mock — catches regressions.
- Three original behavior tests preserved with identical assertions; only
  state staging changes (`orderQuery.nextOrder = makeOrder(N)` instead of
  `db.insert(orders).values({...})`).

- [ ] **Step 3: Run test suite (GREEN)**

```bash
cd packages/api/typescript && bun test src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.test.ts
```

Expected: PASS — 4 tests (3 behavior + 1 structural).

- [ ] **Step 4: Verify grep acceptance criterion**

```bash
grep -n "from(orders)" packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts
```

Expected: **0 matches**.

- [ ] **Step 5: Full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass (no regressions).

- [ ] **Step 6: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

Use `/commit`:

```
test(sales): ProductCostApplicationHandler test uses MockOrderQueryService (SPEC-12 Task 2)
```

Stage: `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.test.ts`

---

## Acceptance Criteria Coverage

| AC | Covered by |
|---|---|
| `grep "from(orders)"` in handler → 0 matches | Task 1 Step 5, Task 2 Step 4 |
| Handler no longer imports the `orders` table | Task 1 Step 3 (import removal) |
| Handler test passes with mocked `OrderQueryService` | Task 2 Step 3 |
| `bun tsc` clean | Task 1 Step 6, Task 2 Step 6 |
| `bun run test` clean | Task 2 Step 5 |
