# SPEC-10: Strip TS Projections + Projection Repositories — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle. Delete/relocate Tasks keep
> `bun tsc` + `bun run test` green at every commit boundary.

**Goal:** Remove every `Projection`, `Projector`, and `ProjectionRepository` class on the TS side (all in `sales/`). The cart→order link write is relocated inline to the two handlers that called it; `CartLinkedToOrderEvent` still publishes. The `orders` table is unchanged (it was always the backing store for `OrderProjectionRepository`); no migration is needed.

**Architecture:** Three atomic commits: (1) delete `OrderProjection` + `OrderProjector` + `OrderProjectionRepository`; (2) delete `CartProjectionRepository` and relocate its logic inline into the two handlers + update their tests; (3) clean up `registry.ts`, repository barrel, and projections barrel. Each commit must keep `bun tsc` + `bun run test` green.

**Tech Stack:** TypeScript + Bun + Drizzle. No migration (verified: `order_projections` table does not exist in the Drizzle schema — `DrizzleOrderProjectionRepository` wrote to the canonical `orders` table; no separate projection table was ever created).

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-10-strip-projections.md`
**Tasks:** 3
**Estimated minutes:** 60

> **Planner note — no `order_projections` migration.** The spec mentions dropping an `order_projections` table, but inspection of the contracts schema and all migration SQL files confirms that table does not exist. `DrizzleOrderProjectionRepository` read/wrote the canonical `orders` table directly (via `onConflictDoUpdate`). The "migration" step is therefore a no-op: no new migration file is needed, and the `carts` table is untouched.

> **Planner note — `OrderProjectionRepository.getLineIds` has zero external readers.** After deletion, no use case or handler calls `getLineIds` — `UpdateOrderOverride` does not use it (it uses `OrderOverrideRepository`). Safe to delete with its tests.

> **Planner note — handler tests use `MockCartProjectionRepository` via DI mock mode.** After Task 2 removes the abstract `CartProjectionRepository`, the two handler tests must be rewritten to seed data directly into the `orders` + `carts` tables via `DrizzleClient` (integration mode) or inline logic. The handlers themselves switch to direct Drizzle. The handler test assertions (linking behaviour, `CartLinkedToOrderEvent` republished) must remain fully covered.

> **Planner note — `BoundedContext.create` passes `projectors` as a namespace import.** After Task 1, `sales/index.ts` imports `* as projectors from './projections/projectors'` which will resolve to an empty barrel. The barrel must export nothing (empty file is fine); `BoundedContext.create` accepts an empty projectors object.

---

## Task 1: Delete `OrderProjection`, `OrderProjector`, and `OrderProjectionRepository`

> Zero-risk: `OrderProjectionRepository` is only called from `OrderProjector`, which is itself called by the framework via the projectors barrel. No use case or controller reads these classes. `GetOrdersList` reads `orders` directly.

**Files:**
- Delete: `packages/api/typescript/src/sales/projections/OrderProjection.ts`
- Delete: `packages/api/typescript/src/sales/projections/OrderProjection.test.ts`
- Delete: `packages/api/typescript/src/sales/projections/projectors/OrderProjector.ts`
- Modify: `packages/api/typescript/src/sales/projections/index.ts` — remove the `OrderProjection` re-export; leave the file empty (or delete it; keep it empty for the barrel to still exist)
- Modify: `packages/api/typescript/src/sales/projections/projectors/index.ts` — remove `OrderProjector` export; leave the file empty
- Delete: `packages/api/typescript/src/sales/repositories/OrderProjectionRepository/OrderProjectionRepository.ts`
- Delete: `packages/api/typescript/src/sales/repositories/OrderProjectionRepository/MockOrderProjectionRepository.ts`
- Delete: `packages/api/typescript/src/sales/repositories/OrderProjectionRepository/MockOrderProjectionRepository.test.ts`
- Delete: `packages/api/typescript/src/sales/repositories/OrderProjectionRepository/DrizzleOrderProjectionRepository.ts`
- Delete: `packages/api/typescript/src/sales/repositories/OrderProjectionRepository/DrizzleOrderProjectionRepository.test.ts`
- Delete: `packages/api/typescript/src/sales/repositories/OrderProjectionRepository/index.ts`
- Modify: `packages/api/typescript/src/sales/repositories/index.ts` — remove the `OrderProjectionRepository` re-export line
- Modify: `packages/api/typescript/src/sales/registry.ts` — remove all `OrderProjectionRepository` bindings (mock / integration / real)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /projection, /repository
**Depends on:** (none — SPEC-17 Wave 0 must be done, but that removes `/ui`; this removes `sales/`)

- [ ] **Step 1: Verify zero external readers (pre-flight)**

Run:
```bash
grep -rn "OrderProjectionRepository\|OrderProjector\|OrderProjection" \
  packages/api/typescript/src/ --include="*.ts" \
  | grep -v "sales/projections\|sales/repositories/OrderProjection\|sales/registry"
```

Expected output: only the comment in `GetOrdersList.ts` (line 45 — "rather than routing through the OrderProjectionRepository"). No live import of these classes from outside the projection folder.

- [ ] **Step 2: Delete the projection and projector files**

```bash
git rm packages/api/typescript/src/sales/projections/OrderProjection.ts
git rm packages/api/typescript/src/sales/projections/OrderProjection.test.ts
git rm packages/api/typescript/src/sales/projections/projectors/OrderProjector.ts
```

- [ ] **Step 3: Clear the projection barrels**

Modify `packages/api/typescript/src/sales/projections/index.ts` — replace its contents with an empty barrel:

```ts
// projections barrel — all TS projections removed (SPEC-10)
```

Modify `packages/api/typescript/src/sales/projections/projectors/index.ts` — replace its contents with an empty barrel:

```ts
// projectors barrel — OrderProjector removed (SPEC-10)
```

- [ ] **Step 4: Delete the OrderProjectionRepository folder**

```bash
git rm packages/api/typescript/src/sales/repositories/OrderProjectionRepository/OrderProjectionRepository.ts
git rm packages/api/typescript/src/sales/repositories/OrderProjectionRepository/MockOrderProjectionRepository.ts
git rm packages/api/typescript/src/sales/repositories/OrderProjectionRepository/MockOrderProjectionRepository.test.ts
git rm packages/api/typescript/src/sales/repositories/OrderProjectionRepository/DrizzleOrderProjectionRepository.ts
git rm packages/api/typescript/src/sales/repositories/OrderProjectionRepository/DrizzleOrderProjectionRepository.test.ts
git rm packages/api/typescript/src/sales/repositories/OrderProjectionRepository/index.ts
```

- [ ] **Step 5: Update the repositories barrel**

Modify `packages/api/typescript/src/sales/repositories/index.ts`:

```ts
export * from './OrderOverrideRepository'
export * from './CartProjectionRepository'
```

(Remove the `export * from './OrderProjectionRepository'` line.)

- [ ] **Step 6: Update `registry.ts` — drop `OrderProjectionRepository` bindings**

Modify `packages/api/typescript/src/sales/registry.ts`:

```ts
import './errors' // side-effect: register error codes
import type { InstanceRegistry } from '@template/core-typescript'
import { OrderOverrideRepository } from './repositories/OrderOverrideRepository/OrderOverrideRepository'
import { MockOrderOverrideRepository } from './repositories/OrderOverrideRepository/MockOrderOverrideRepository'
import { DrizzleOrderOverrideRepository } from './repositories/OrderOverrideRepository/DrizzleOrderOverrideRepository'
import { CartProjectionRepository } from './repositories/CartProjectionRepository/CartProjectionRepository'
import { MockCartProjectionRepository } from './repositories/CartProjectionRepository/MockCartProjectionRepository'
import { DrizzleCartProjectionRepository } from './repositories/CartProjectionRepository/DrizzleCartProjectionRepository'
import { SalesOrderSamplingService } from './services/SalesOrderSamplingService'
import { OrderSamplingService } from '../tenancy/services/OrderSamplingService'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [
		{ token: OrderOverrideRepository, instance: MockOrderOverrideRepository },
		{ token: CartProjectionRepository, instance: MockCartProjectionRepository },
	],
	integration: [
		{ token: OrderOverrideRepository, instance: DrizzleOrderOverrideRepository },
		{ token: CartProjectionRepository, instance: DrizzleCartProjectionRepository },
		{ token: OrderSamplingService, instance: SalesOrderSamplingService },
	],
	real: [
		{ token: OrderOverrideRepository, instance: DrizzleOrderOverrideRepository },
		{ token: CartProjectionRepository, instance: DrizzleCartProjectionRepository },
		{ token: OrderSamplingService, instance: SalesOrderSamplingService },
	],
}
```

- [ ] **Step 7: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors. If `GetOrdersList.ts` has a dangling comment referencing `OrderProjectionRepository`, it's a comment only — no type error.

- [ ] **Step 8: Run the test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass. The deleted test files (`OrderProjection.test.ts`, `DrizzleOrderProjectionRepository.test.ts`, `MockOrderProjectionRepository.test.ts`) are no longer discovered. The `BoundedContext.create` in `sales/index.ts` receives an empty `projectors` object — that is valid.

- [ ] **Step 9: Verify grep AC (partial)**

```bash
grep -rn "extends Projector\|OrderProjectionRepository" \
  packages/api/typescript/src/ --include="*.ts" | grep -v "ui/"
```

Expected: zero results (the `/ui` context still has `VideoFeedProjector` until SPEC-17 runs; this task scopes to `sales/`).

- [ ] **Step 10: Commit**

Use `/commit`:

```
refactor(sales): SPEC-10 delete OrderProjection + OrderProjector + OrderProjectionRepository (Task 1)
```

Stage: all deleted/modified files from Steps 2–6.

---

## Task 2: Delete `CartProjectionRepository`; inline cart-link logic into the two handlers

> The real work: the two handlers that called `cartRepo.linkToOrderByExternalCartId(...)` switch to direct Drizzle. The atomic two-step (SELECT order → UPDATE cart WHERE `linked_order_id IS NULL`) is inlined as a private static helper on each handler (or extracted to a shared module file). Handler tests are rewritten to use integration mode (real PGlite) so the actual SQL can be exercised. `CartLinkedToOrderEvent` still publishes on success.

**Files:**
- Modify: `packages/api/typescript/src/sales/handlers/PixelCheckoutCompletedLinkCartHandler.ts` — replace `CartProjectionRepository` injection with `DrizzleClient`; inline the two-step SQL
- Modify: `packages/api/typescript/src/sales/handlers/OrderUpdatedLinkCartHandler.ts` — same
- Modify: `packages/api/typescript/src/sales/handlers/PixelCheckoutCompletedLinkCartHandler.test.ts` — rewrite to integration mode (seed via Drizzle; assert via Drizzle)
- Modify: `packages/api/typescript/src/sales/handlers/OrderUpdatedLinkCartHandler.test.ts` — same
- Delete: `packages/api/typescript/src/sales/repositories/CartProjectionRepository/CartProjectionRepository.ts`
- Delete: `packages/api/typescript/src/sales/repositories/CartProjectionRepository/MockCartProjectionRepository.ts`
- Delete: `packages/api/typescript/src/sales/repositories/CartProjectionRepository/DrizzleCartProjectionRepository.ts`
- Delete: `packages/api/typescript/src/sales/repositories/CartProjectionRepository/DrizzleCartProjectionRepository.test.ts`
- Delete: `packages/api/typescript/src/sales/repositories/CartProjectionRepository/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler, /repository, /test
**Depends on:** 1

- [ ] **Step 1: Write the failing handler tests (RED)**

Rewrite `packages/api/typescript/src/sales/handlers/PixelCheckoutCompletedLinkCartHandler.test.ts` to integration mode. The old mock-mode tests relied on `MockCartProjectionRepository`; after this task the handler injects `DrizzleClient` directly, so integration mode is required to exercise the SQL.

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { DrizzleClient, ExternalMediator, SpyMediator } from '@template/core-typescript'
import { PixelEventType, SalesPlatform, CurrencyCode, PaymentStatus } from '@template/contracts-typescript/wire/enums'
import { PixelEventRecordedEvent } from '@template/contracts-typescript/wire/events'
import { PixelCheckoutCompletedLinkCartHandler } from './PixelCheckoutCompletedLinkCartHandler'
import { carts, orders } from '@template/contracts/db'
import { Id } from '@template/core-typescript'

const STORE = Id.fromSeed('store', '1').value
const STORE_INT = Id.fromSeed('storeInt', '1').value
const CART_ID = 'cccccccc-0001-4000-8000-000000000001'
const ORDER_ID = 'dddddddd-0001-4000-8000-000000000001'
const SHOP = 'acme.myshopify.com'
const EXTERNAL_CART = 'shopify_cart_abc'
const EXTERNAL_ORDER = 'shopify_order_xyz'

describe('PixelCheckoutCompletedLinkCartHandler (inline Drizzle)', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer
  let handler: PixelCheckoutCompletedLinkCartHandler
  let db: DrizzleClient
  let externalSpy: SpyMediator

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer })
    handler = testBed.resolve(PixelCheckoutCompletedLinkCartHandler)
    db = testBed.resolve(DrizzleClient as any) as DrizzleClient
    externalSpy = testContainer.resolve(ExternalMediator as any) as SpyMediator
  })
  beforeEach(async () => {
    await testBed.reset()
    externalSpy.reset()
  })
  afterAll(async () => {
    await testBed.destroy()
  })

  async function seedCart(opts: { linkedOrderId?: string | null } = {}): Promise<void> {
    await (db as any).insert(carts).values({
      id: CART_ID,
      storeId: STORE,
      storeIntegrationId: STORE_INT,
      storeIntegrationExternalId: SHOP,
      platform: SalesPlatform.SHOPIFY,
      externalCartId: EXTERNAL_CART,
      lines: [],
      totalCents: BigInt(0),
      currency: 'USD',
      linkedOrderId: opts.linkedOrderId ?? null,
    })
  }

  async function seedOrder(): Promise<void> {
    await (db as any).insert(orders).values({
      id: ORDER_ID,
      storeId: STORE,
      storeIntegrationId: STORE_INT,
      storeIntegrationExternalId: SHOP,
      platform: SalesPlatform.SHOPIFY,
      externalId: EXTERNAL_ORDER,
      externalCreatedAt: new Date('2026-05-15T00:00:00.000Z'),
      subtotalCents: BigInt(0),
      discountTotalCents: BigInt(0),
      shippingTotalCents: BigInt(0),
      taxTotalCents: BigInt(0),
      totalCents: BigInt(10_000),
      totalCurrency: CurrencyCode.USD,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'CARD',
      paymentGateway: 'STRIPE',
      lines: [],
      transactions: [],
      cartToken: EXTERNAL_CART,
    })
  }

  function pixelEvent(eventType: PixelEventType): PixelEventRecordedEvent {
    return new PixelEventRecordedEvent({
      ownerId: STORE,
      payload: {
        platform: SalesPlatform.SHOPIFY,
        storeIntegrationExternalId: SHOP,
        eventType,
        cartExternalId: EXTERNAL_CART,
        productExternalId: 'shopify_prod_1',
      },
    })
  }

  it('non-CHECKOUT_COMPLETED events are a no-op', async () => {
    await seedCart()
    await seedOrder()

    await handler.handle(pixelEvent(PixelEventType.PAGE_VIEW))

    const rows = await (db as any).select().from(carts)
    expect(rows[0].linkedOrderId).toBeNull()
    expect(externalSpy.getPublished()).toHaveLength(0)
  })

  it('CHECKOUT_COMPLETED with both cart + order present → links + publishes cart.linked_to_order', async () => {
    await seedCart()
    await seedOrder()

    await handler.handle(pixelEvent(PixelEventType.CHECKOUT_COMPLETED))

    const rows = await (db as any).select().from(carts)
    expect(rows[0].linkedOrderId).toBe(ORDER_ID)

    const published = externalSpy.getPublished()
    expect(published).toHaveLength(1)
    const evt = published[0] as { name: string; payload: { cartExternalId: string; orderExternalId: string } }
    expect(evt.name).toBe('integration.shared.cart.linked_to_order')
    expect(evt.payload.cartExternalId).toBe(EXTERNAL_CART)
    expect(evt.payload.orderExternalId).toBe(EXTERNAL_ORDER)
  })

  it('CHECKOUT_COMPLETED with no order yet → drop silently', async () => {
    await seedCart()

    await handler.handle(pixelEvent(PixelEventType.CHECKOUT_COMPLETED))

    const rows = await (db as any).select().from(carts)
    expect(rows[0].linkedOrderId).toBeNull()
    expect(externalSpy.getPublished()).toHaveLength(0)
  })

  it('CHECKOUT_COMPLETED with no cart yet → drop silently', async () => {
    await seedOrder()

    await handler.handle(pixelEvent(PixelEventType.CHECKOUT_COMPLETED))

    expect(externalSpy.getPublished()).toHaveLength(0)
  })

  it('CHECKOUT_COMPLETED with cart already linked → idempotent no-op', async () => {
    await seedCart({ linkedOrderId: ORDER_ID })
    await seedOrder()

    await handler.handle(pixelEvent(PixelEventType.CHECKOUT_COMPLETED))

    const rows = await (db as any).select().from(carts)
    expect(rows[0].linkedOrderId).toBe(ORDER_ID)
    expect(externalSpy.getPublished()).toHaveLength(0)
  })
})
```

Write the analogous integration-mode test for `OrderUpdatedLinkCartHandler.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { DrizzleClient, ExternalMediator, SpyMediator } from '@template/core-typescript'
import { CurrencyCode, PaymentStatus, SalesPlatform } from '@template/contracts-typescript/wire/enums'
import { OrderUpdatedEvent } from '@template/contracts-typescript/wire/events'
import { OrderUpdatedLinkCartHandler } from './OrderUpdatedLinkCartHandler'
import { carts, orders } from '@template/contracts/db'
import { Id } from '@template/core-typescript'

const STORE = Id.fromSeed('store', '1').value
const STORE_INT = Id.fromSeed('storeInt', '1').value
const CART_ID = 'cccccccc-0001-4000-8000-000000000001'
const ORDER_ID = 'dddddddd-0001-4000-8000-000000000001'
const SHOP = 'acme.myshopify.com'
const EXTERNAL_CART = 'shopify_cart_abc'
const EXTERNAL_ORDER = 'shopify_order_xyz'

describe('OrderUpdatedLinkCartHandler (inline Drizzle)', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer
  let handler: OrderUpdatedLinkCartHandler
  let db: DrizzleClient
  let externalSpy: SpyMediator

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer })
    handler = testBed.resolve(OrderUpdatedLinkCartHandler)
    db = testBed.resolve(DrizzleClient as any) as DrizzleClient
    externalSpy = testContainer.resolve(ExternalMediator as any) as SpyMediator
  })
  beforeEach(async () => {
    await testBed.reset()
    externalSpy.reset()
  })
  afterAll(async () => {
    await testBed.destroy()
  })

  async function seedCart(opts: { linkedOrderId?: string | null } = {}): Promise<void> {
    await (db as any).insert(carts).values({
      id: CART_ID,
      storeId: STORE,
      storeIntegrationId: STORE_INT,
      storeIntegrationExternalId: SHOP,
      platform: SalesPlatform.SHOPIFY,
      externalCartId: EXTERNAL_CART,
      lines: [],
      totalCents: BigInt(0),
      currency: 'USD',
      linkedOrderId: opts.linkedOrderId ?? null,
    })
  }

  async function seedOrder(opts: { cartToken?: string | null } = {}): Promise<void> {
    await (db as any).insert(orders).values({
      id: ORDER_ID,
      storeId: STORE,
      storeIntegrationId: STORE_INT,
      storeIntegrationExternalId: SHOP,
      platform: SalesPlatform.SHOPIFY,
      externalId: EXTERNAL_ORDER,
      externalCreatedAt: new Date('2026-05-15T00:00:00.000Z'),
      subtotalCents: BigInt(0),
      discountTotalCents: BigInt(0),
      shippingTotalCents: BigInt(0),
      taxTotalCents: BigInt(0),
      totalCents: BigInt(10_000),
      totalCurrency: CurrencyCode.USD,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'CARD',
      paymentGateway: 'STRIPE',
      lines: [],
      transactions: [],
      cartToken: opts.cartToken ?? EXTERNAL_CART,
    })
  }

  function orderEvent(opts: { cartToken?: string } = {}): OrderUpdatedEvent {
    return new OrderUpdatedEvent({
      ownerId: STORE,
      payload: {
        platform: SalesPlatform.SHOPIFY,
        externalId: EXTERNAL_ORDER,
        storeIntegrationExternalId: SHOP,
        paymentStatus: PaymentStatus.PAID,
        totalCents: 10_000,
        currency: CurrencyCode.USD,
        isNew: true,
        cartToken: opts.cartToken,
      },
    })
  }

  it('order with no cartToken → no-op', async () => {
    await seedCart()
    await seedOrder({ cartToken: EXTERNAL_CART })

    await handler.handle(orderEvent({}))

    const rows = await (db as any).select().from(carts)
    expect(rows[0].linkedOrderId).toBeNull()
    expect(externalSpy.getPublished()).toHaveLength(0)
  })

  it('order with cartToken + both rows present → links + republishes cart.linked_to_order', async () => {
    await seedCart()
    await seedOrder({ cartToken: EXTERNAL_CART })

    await handler.handle(orderEvent({ cartToken: EXTERNAL_CART }))

    const rows = await (db as any).select().from(carts)
    expect(rows[0].linkedOrderId).toBe(ORDER_ID)

    const published = externalSpy.getPublished()
    expect(published).toHaveLength(1)
    const evt = published[0] as { name: string; payload: { cartExternalId: string; orderExternalId: string } }
    expect(evt.name).toBe('integration.shared.cart.linked_to_order')
    expect(evt.payload.cartExternalId).toBe(EXTERNAL_CART)
    expect(evt.payload.orderExternalId).toBe(EXTERNAL_ORDER)
  })

  it("order with cartToken but no matching cart → drop (pixel hasn't arrived yet)", async () => {
    await seedOrder({ cartToken: EXTERNAL_CART })

    await handler.handle(orderEvent({ cartToken: EXTERNAL_CART }))

    expect(externalSpy.getPublished()).toHaveLength(0)
  })

  it('order with cartToken but cart already linked → idempotent no-op + no republish', async () => {
    await seedCart({ linkedOrderId: ORDER_ID })
    await seedOrder({ cartToken: EXTERNAL_CART })

    await handler.handle(orderEvent({ cartToken: EXTERNAL_CART }))

    const rows = await (db as any).select().from(carts)
    expect(rows[0].linkedOrderId).toBe(ORDER_ID)
    expect(externalSpy.getPublished()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail (RED)**

```bash
cd packages/api/typescript && bun test \
  src/sales/handlers/PixelCheckoutCompletedLinkCartHandler.test.ts \
  src/sales/handlers/OrderUpdatedLinkCartHandler.test.ts
```

Expected: FAIL — `CartProjectionRepository` not resolved (still exists but the test no longer seeds a mock) or because the new test tries to resolve `PixelCheckoutCompletedLinkCartHandler` which still injects the old `CartProjectionRepository`.

- [ ] **Step 3: Rewrite `PixelCheckoutCompletedLinkCartHandler.ts`**

Replace the file contents — inject `DrizzleClient` instead of `CartProjectionRepository`; inline the two-step SQL as a private helper:

```ts
import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator, DrizzleClient } from '@template/core-typescript'
import { and, eq, isNull } from 'drizzle-orm'
import { PixelEventRecordedEvent, CartLinkedToOrderEvent } from '@template/contracts-typescript/wire/events'
import { PixelEventType } from '@template/contracts-typescript/wire/enums'
import { carts, orders } from '@template/contracts/db'

type CartLinkResult =
  | { linked: false }
  | { linked: true; cartId: string; orderId: string; orderExternalId: string }

/**
 * External handler subscribing to the Go-published
 * `integration.shared.pixel_event.recorded` event. On CHECKOUT_COMPLETED
 * the cart's `linked_order_id` is stamped if a matching order has already
 * been ingested by Go (orders.cart_token = externalCartId).
 *
 * Symmetric to OrderUpdatedLinkCartHandler (order-first path).
 * Republishes `integration.shared.cart.linked_to_order` so Analytics can
 * close the cart-abandonment loop in its own projections.
 *
 * Cart link is now inline Drizzle (SPEC-10 — CartProjectionRepository removed).
 */
@injectable()
export class PixelCheckoutCompletedLinkCartHandler extends EventHandler<typeof PixelEventRecordedEvent> {
  readonly event = PixelEventRecordedEvent

  constructor(
    private readonly db: DrizzleClient,
    private readonly externalMediator: ExternalMediator,
  ) {
    super()
  }

  async handle(event: this['input']): Promise<void> {
    if (event.payload.eventType !== PixelEventType.CHECKOUT_COMPLETED) {
      return
    }

    const result = await this.linkToOrder(event.payload.platform, event.payload.cartExternalId)
    if (!result.linked) return

    await this.externalMediator.publish(
      new CartLinkedToOrderEvent({
        ownerId: event.ownerId ?? '',
        payload: {
          platform: event.payload.platform,
          cartExternalId: event.payload.cartExternalId,
          orderExternalId: result.orderExternalId,
          storeIntegrationExternalId: event.payload.storeIntegrationExternalId,
        },
      }),
    )
  }

  /**
   * Two-step inline link — identical logic to the former
   * DrizzleCartProjectionRepository.linkToOrderByExternalCartId:
   *   1. SELECT the matching order's (id, externalId) by (platform, cart_token).
   *   2. UPDATE carts SET linked_order_id WHERE linked_order_id IS NULL.
   * The conditional UPDATE keeps it idempotent across concurrent deliveries.
   */
  private async linkToOrder(platform: string, externalCartId: string): Promise<CartLinkResult> {
    const orderRows = await this.db
      .select({ id: orders.id, externalId: orders.externalId })
      .from(orders)
      .where(and(eq(orders.platform, platform), eq(orders.cartToken, externalCartId)))
      .limit(1)
    const order = (orderRows as Array<{ id: string; externalId: string }>)[0]
    if (!order) return { linked: false }

    const updated = await this.db
      .update(carts)
      .set({ linkedOrderId: order.id })
      .where(and(eq(carts.platform, platform), eq(carts.externalCartId, externalCartId), isNull(carts.linkedOrderId)))
      .returning({ cartId: carts.id })
    const row = (updated as Array<{ cartId: string }>)[0]
    if (!row) return { linked: false }

    return { linked: true, cartId: row.cartId, orderId: order.id, orderExternalId: order.externalId }
  }
}
```

- [ ] **Step 4: Rewrite `OrderUpdatedLinkCartHandler.ts`**

Replace the file contents — same pattern:

```ts
import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator, DrizzleClient } from '@template/core-typescript'
import { and, eq, isNull } from 'drizzle-orm'
import { OrderUpdatedEvent, CartLinkedToOrderEvent } from '@template/contracts-typescript/wire/events'
import { carts, orders } from '@template/contracts/db'

type CartLinkResult =
  | { linked: false }
  | { linked: true; cartId: string; orderId: string; orderExternalId: string }

/**
 * External handler subscribing to Go-published
 * `integration.shared.order.updated`. Symmetric to
 * `PixelCheckoutCompletedLinkCartHandler` for the case where the order
 * arrives AFTER the pixel CHECKOUT_COMPLETED.
 *
 * Drops events without a cartToken (manual / draft orders, providers
 * without a checkout-pixel pipeline). Otherwise the same atomic
 * `linkToOrder` two-step — idempotent across both directions.
 *
 * Cart link is now inline Drizzle (SPEC-10 — CartProjectionRepository removed).
 */
@injectable()
export class OrderUpdatedLinkCartHandler extends EventHandler<typeof OrderUpdatedEvent> {
  readonly event = OrderUpdatedEvent

  constructor(
    private readonly db: DrizzleClient,
    private readonly externalMediator: ExternalMediator,
  ) {
    super()
  }

  async handle(event: this['input']): Promise<void> {
    const cartToken = event.payload.cartToken
    if (!cartToken) return

    const result = await this.linkToOrder(event.payload.platform, cartToken)
    if (!result.linked) return

    await this.externalMediator.publish(
      new CartLinkedToOrderEvent({
        ownerId: event.ownerId ?? '',
        payload: {
          platform: event.payload.platform,
          cartExternalId: cartToken,
          orderExternalId: result.orderExternalId,
          storeIntegrationExternalId: event.payload.storeIntegrationExternalId,
        },
      }),
    )
  }

  private async linkToOrder(platform: string, externalCartId: string): Promise<CartLinkResult> {
    const orderRows = await this.db
      .select({ id: orders.id, externalId: orders.externalId })
      .from(orders)
      .where(and(eq(orders.platform, platform), eq(orders.cartToken, externalCartId)))
      .limit(1)
    const order = (orderRows as Array<{ id: string; externalId: string }>)[0]
    if (!order) return { linked: false }

    const updated = await this.db
      .update(carts)
      .set({ linkedOrderId: order.id })
      .where(and(eq(carts.platform, platform), eq(carts.externalCartId, externalCartId), isNull(carts.linkedOrderId)))
      .returning({ cartId: carts.id })
    const row = (updated as Array<{ cartId: string }>)[0]
    if (!row) return { linked: false }

    return { linked: true, cartId: row.cartId, orderId: order.id, orderExternalId: order.externalId }
  }
}
```

- [ ] **Step 5: Delete the `CartProjectionRepository` folder**

```bash
git rm packages/api/typescript/src/sales/repositories/CartProjectionRepository/CartProjectionRepository.ts
git rm packages/api/typescript/src/sales/repositories/CartProjectionRepository/MockCartProjectionRepository.ts
git rm packages/api/typescript/src/sales/repositories/CartProjectionRepository/DrizzleCartProjectionRepository.ts
git rm packages/api/typescript/src/sales/repositories/CartProjectionRepository/DrizzleCartProjectionRepository.test.ts
git rm packages/api/typescript/src/sales/repositories/CartProjectionRepository/index.ts
```

- [ ] **Step 6: Run tests to verify they pass (GREEN)**

```bash
cd packages/api/typescript && bun test \
  src/sales/handlers/PixelCheckoutCompletedLinkCartHandler.test.ts \
  src/sales/handlers/OrderUpdatedLinkCartHandler.test.ts
```

Expected: PASS — 5 tests for `PixelCheckoutCompletedLinkCartHandler`, 4 for `OrderUpdatedLinkCartHandler`.

- [ ] **Step 7: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 8: Full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

Use `/commit`:

```
refactor(sales): SPEC-10 delete CartProjectionRepository; inline cart-link into handlers (Task 2)
```

Stage: both handler `.ts` files, both handler `.test.ts` files, all 5 deleted `CartProjectionRepository/` files.

---

## Task 3: Final cleanup — repository barrel + registry; verify AC grep

> Minimal cleanup task: remove the `CartProjectionRepository` re-export from the repository barrel (already partially done in Task 2 via `git rm` of the index file, but the barrel `repositories/index.ts` still references it), ensure `registry.ts` has no projection-repo bindings (already done in Task 1), and run the spec's acceptance-criteria grep to confirm zero `extends Projector` / `ProjectionRepository` in the codebase.

**Files:**
- Modify: `packages/api/typescript/src/sales/repositories/index.ts` — remove the `CartProjectionRepository` re-export line (only `OrderOverrideRepository` remains)
- Verify: grep AC; no files to create

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository
**Depends on:** 2

- [ ] **Step 1: Update the repositories barrel**

Modify `packages/api/typescript/src/sales/repositories/index.ts` — after Task 2 the `CartProjectionRepository` folder is deleted; the barrel must not reference it:

```ts
export * from './OrderOverrideRepository'
```

(The `CartProjectionRepository` export line was still present from Task 1 — Task 1 only removed `OrderProjectionRepository`. Task 2 deleted the folder; this task removes the dangling barrel entry.)

- [ ] **Step 2: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 3: Full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass.

- [ ] **Step 4: Acceptance criteria grep — zero projection abstractions**

```bash
grep -rn "extends Projector\|ProjectionRepository" \
  packages/api/typescript/src/ --include="*.ts"
```

Expected: **zero results** (the `/ui` context is removed by SPEC-17 before this wave runs; if SPEC-17 has not run yet, filter out `ui/` and expect zero for the `sales/` subtree).

```bash
grep -rn "extends Projector\|ProjectionRepository" \
  packages/api/typescript/src/sales/ --include="*.ts"
```

Expected: zero results unconditionally.

- [ ] **Step 5: Verify `registry.ts` has no projection-repo bindings**

```bash
grep "ProjectionRepository\|Projector" \
  packages/api/typescript/src/sales/registry.ts
```

Expected: empty output.

- [ ] **Step 6: Verify app boots (DI resolves)**

```bash
cd packages/api/typescript && bun tsc && bun run test src/sales/
```

The `sales/index.ts` passes empty `projectors` to `BoundedContext.create`. This must resolve without error. Expected: test suite for the sales context passes.

- [ ] **Step 7: Commit**

Use `/commit`:

```
refactor(sales): SPEC-10 clean up repository barrel; AC grep zero (Task 3)
```

Stage: `packages/api/typescript/src/sales/repositories/index.ts`.

---

## Acceptance Criteria Coverage

| AC | Covered by |
|---|---|
| No `Projection`, `Projector`, or `ProjectionRepository` classes remain (`grep extends Projector`, `ProjectionRepository` → zero in sales/) | Task 3 Step 4 |
| `sales/registry.ts` has no projection-repo bindings; app boots (DI resolves) | Task 3 Steps 5–6 |
| Cart→order link still works (both pixel-first and order-first handlers); `CartLinkedToOrderEvent` still publishes | Task 2 Steps 6–8 |
| `carts` table unchanged; no migration generated | (structural — no migration file created; verified by absence) |
| `bun tsc` clean | Tasks 1–3 each run `bun tsc` |
| `bun run test` clean | Tasks 1 Step 8, 2 Step 8, 3 Step 3 |
