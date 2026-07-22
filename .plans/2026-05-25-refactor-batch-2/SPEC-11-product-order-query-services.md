# SPEC-11: `ProductQueryService` + `OrderQueryService` replace the read-models — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Delete the five orphaned Product/Order read-model files (consumed by nothing) and replace them with two properly-structured query services — `ProductQueryService` (abstract + `DrizzleProductQueryService`, querying `catalog.products`, `catalog.product_overrides`, `catalog.variants`) and `OrderQueryService` (abstract + `DrizzleOrderQueryService`, querying `sales.orders` and `sales.order_overrides`) — both registered in their context registries and both providing the exact methods SPEC-12's `ProductCostApplicationHandler` needs (`findById`, `findByStore`). Return shapes are defined inside the service using Zod, following the `ProductCostQueryService` template.

**Architecture:** Four atomic commits: (1) `ProductQueryService` created, catalog read-models deleted; (2) `OrderQueryService` created, sales read-models deleted; (3) registries wired (catalog + sales); (4) orphaned test files for deleted read-models removed. The `MonetaryAmount` used in return shapes imports from `src/shared/objects/` (SPEC-01, Wave 1). Methods are driven purely by SPEC-12's consumer needs — `findById(orderId)` and `findByStore(storeId)` on `OrderQueryService`; `findById(productId)` and `findByIds(productIds)` on `ProductQueryService` (the real consumer of these is SPEC-12's variant-lookup path inside `ProductCostApplicationHandler`, which resolves productIds from order lines). No speculative methods.

**Tech Stack:** TypeScript + Bun + Drizzle + Zod (`@template/core-typescript`), `bun:test`, PGlite integration harness, tsyringe-neo.

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-11-product-order-query-services.md`
**Tasks:** 4
**Estimated minutes:** 90

> **Planner note — MonetaryAmount dependency.** The return shapes of both services reference money values. They must import `MonetaryAmount` from `src/shared/objects/` as established by SPEC-01 (Wave 1). Do not re-import from `sales/readmodels/objects/`. If SPEC-01 has not landed yet, this spec is blocked — wave ordering ensures SPEC-01 precedes SPEC-11.

> **Planner note — read-model test deletion.** `catalog/readmodels/ProductReadModel.test.ts`, `ProductVariantReadModel.test.ts`, and `sales/readmodels/OrderReadModel.test.ts`, `OrderLineReadModel.test.ts`, `OrderTransactionReadModel.test.ts`, plus `sales/readmodels/objects/objects.test.ts`, are test files for the orphaned schemas. They are deleted alongside their source files because no code will re-import those schemas — the shapes are absorbed into the service's internal Zod schemas. There is no schema to re-test; the `DrizzleProductQueryService` and `DrizzleOrderQueryService` integration tests cover the real query behavior.

> **Planner note — sales readmodels/objects helper VOs.** `PostalAddress` and `UtmTags` in `sales/readmodels/objects/` are referenced only from `OrderReadModel.ts`. Once the read-model is deleted and its shape absorbed into `DrizzleOrderQueryService`, these two helper schemas move inline into the service file (they are small enough to keep colocated). The `sales/readmodels/objects/` directory and its barrel are deleted entirely.

> **Planner note — catalog/readmodels barrel.** After Task 1 deletes `ProductReadModel.ts` and `ProductVariantReadModel.ts`, the `catalog/readmodels/index.ts` barrel must also be deleted (nothing will import from it). Same for `sales/readmodels/index.ts` after Task 2.

> **Planner note — sales registry.** SPEC-10 will have removed projection-repo bindings from `sales/registry.ts` before this spec runs. Task 3 adds `OrderQueryService` bindings into whatever state the registry is in post-SPEC-10. The plan targets the SPEC-10-completed registry shape.

> **Planner note — `OrderQueryService` return shape.** The `ProductCostApplicationHandler` (SPEC-12) accesses `order.id`, `order.storeId`, `order.storeIntegrationExternalId`, `order.externalCreatedAt`, and `order.lines` (as `{ id, productId, variantId, quantity }[]`). The Drizzle return shape is derived from the `orders` table columns and the `orderOverrides` left-join. Keep the DTO minimal — only fields the handler actually reads. The full public-facing `OrderReadModelSchema` shape (with all monetary totals, customer info, etc.) was for the now-deleted read-model and is not needed here.

> **Planner note — `ProductQueryService` return shape.** No SPEC-11 caller needs product data yet; SPEC-12 only needs order data. However, the spec mandates that `ProductQueryService` exists with at least one tested method. The natural minimal set is `findById(productId)` and `findByIds(productIds[])` — returning the canonical product shape (id, storeId, title, handle, status, tags from `productOverrides`). These match the `GetProductDetail` use-case pattern already in the codebase and provide a useful read port without speculation.

---

## Task 1: `ProductQueryService` created; catalog read-model files deleted

**Files:**
- Create: `packages/api/typescript/src/catalog/services/ProductQueryService/ProductQueryService.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductQueryService/DrizzleProductQueryService.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductQueryService/MockProductQueryService.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductQueryService/index.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductQueryService/DrizzleProductQueryService.test.ts`
- Delete: `packages/api/typescript/src/catalog/readmodels/ProductReadModel.ts`
- Delete: `packages/api/typescript/src/catalog/readmodels/ProductReadModel.test.ts`
- Delete: `packages/api/typescript/src/catalog/readmodels/ProductVariantReadModel.ts`
- Delete: `packages/api/typescript/src/catalog/readmodels/ProductVariantReadModel.test.ts`
- Delete: `packages/api/typescript/src/catalog/readmodels/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /query
**Depends on:** (none — first task in this spec; SPEC-10 and SPEC-01 are wave prerequisites)

- [ ] **Step 1: Write the failing integration test (RED)**

Create `packages/api/typescript/src/catalog/services/ProductQueryService/DrizzleProductQueryService.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Id } from '@template/core-typescript'
import { products, productOverrides } from '@template/contracts/db'
import { DrizzleProductQueryService } from './DrizzleProductQueryService'

const STORE_ID = '019e4d24-6524-7041-9e1c-8108180cddae'
const PRODUCT_ID = Id.fromSeed('product', 'SHOPIFY', 'prod-1').value
const PRODUCT_ID_2 = Id.fromSeed('product', 'SHOPIFY', 'prod-2').value

describe('DrizzleProductQueryService', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer
  let service: DrizzleProductQueryService
  let db: any

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer })
    db = testBed.resolve('DrizzleClient' as any)
  })
  beforeEach(async () => {
    await testBed.reset()
    service = testBed.resolve(DrizzleProductQueryService)
  })
  afterAll(async () => {
    await testBed.destroy()
  })

  async function seedProduct(id: string, externalId: string, overrideTags?: string[]): Promise<void> {
    await db.insert(products).values({
      id,
      storeId: STORE_ID,
      storeIntegrationId: '11111111-0001-4000-8000-000000000001',
      storeIntegrationExternalId: 'acme.myshopify.com',
      platform: 'SHOPIFY',
      externalId,
      title: `Product ${externalId}`,
      handle: `product-${externalId}`,
      status: 'ACTIVE',
      externalCreatedAt: new Date('2026-01-01T00:00:00Z'),
    })
    if (overrideTags !== undefined) {
      await db.insert(productOverrides).values({
        id: Id.fromSeed('product_override', id, STORE_ID).value,
        productId: id,
        storeId: STORE_ID,
        tags: JSON.stringify(overrideTags),
      })
    }
  }

  it('findById returns null when product does not exist', async () => {
    const result = await service.findById('00000000-0000-0000-0000-000000000000')
    expect(result).toBeNull()
  })

  it('findById returns the product with its tags from productOverrides', async () => {
    await seedProduct(PRODUCT_ID, 'prod-1', ['bestseller'])
    const result = await service.findById(PRODUCT_ID)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(PRODUCT_ID)
    expect(result!.storeId).toBe(STORE_ID)
    expect(result!.title).toBe('Product prod-1')
    expect(result!.handle).toBe('product-prod-1')
    expect(result!.status).toBe('ACTIVE')
    expect(result!.tags).toEqual(['bestseller'])
  })

  it('findById returns empty tags when no override exists', async () => {
    await seedProduct(PRODUCT_ID, 'prod-1')
    const result = await service.findById(PRODUCT_ID)
    expect(result!.tags).toEqual([])
  })

  it('findByIds returns all matching products', async () => {
    await seedProduct(PRODUCT_ID, 'prod-1', ['a'])
    await seedProduct(PRODUCT_ID_2, 'prod-2', ['b'])
    const results = await service.findByIds([PRODUCT_ID, PRODUCT_ID_2])
    expect(results).toHaveLength(2)
    const ids = results.map(p => p.id)
    expect(ids).toContain(PRODUCT_ID)
    expect(ids).toContain(PRODUCT_ID_2)
  })

  it('findByIds with empty array returns empty array', async () => {
    const results = await service.findByIds([])
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/api/typescript && bun test src/catalog/services/ProductQueryService/DrizzleProductQueryService.test.ts
```

Expected: FAIL — `Cannot find module './DrizzleProductQueryService'`.

- [ ] **Step 3: Create `ProductQueryService.ts` (abstract class + return shape)**

Create `packages/api/typescript/src/catalog/services/ProductQueryService/ProductQueryService.ts`:

```ts
import { z } from '@template/core-typescript'
import type Z from 'zod'

/**
 * Internal return shape for ProductQueryService.
 * Defined here (inside the service) rather than in a separate read-model file,
 * per the query-service convention (feedback_query_service_naming_and_zod).
 *
 * Fields: the minimal canonical product shape BFF + cost-resolution consumers need.
 * `tags` comes from `product_overrides` (SPEC-10 moved tags off the canonical row).
 */
export const ProductQueryDTOSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  storeIntegrationId: z.string().uuid(),
  platform: z.string(),
  externalId: z.string(),
  title: z.string(),
  handle: z.string().nullable(),
  status: z.string(),
  tags: z.array(z.string()),
  externalCreatedAt: z.coerce.date(),
})

export type ProductQueryDTO = Z.infer<typeof ProductQueryDTOSchema>

/**
 * Cross-BC read port for the Catalog. Surfaces canonical product data
 * (joined with product_overrides for tags) so other bounded contexts
 * can resolve product details without coupling to catalog internals.
 *
 * Naming per feedback_query_service_naming_and_zod convention.
 */
export abstract class ProductQueryService {
  abstract findById(productId: string): Promise<ProductQueryDTO | null>
  abstract findByIds(productIds: string[]): Promise<ProductQueryDTO[]>
}
```

- [ ] **Step 4: Create `DrizzleProductQueryService.ts`**

Create `packages/api/typescript/src/catalog/services/ProductQueryService/DrizzleProductQueryService.ts`:

```ts
import { injectable } from 'tsyringe-neo'
import { eq, inArray } from 'drizzle-orm'
import { DrizzleClient } from '@template/core-typescript'
import { products, productOverrides } from '@template/contracts/db'
import { ProductQueryService, type ProductQueryDTO } from './ProductQueryService'

@injectable()
export class DrizzleProductQueryService extends ProductQueryService {
  constructor(private readonly db: DrizzleClient) {
    super()
  }

  async findById(productId: string): Promise<ProductQueryDTO | null> {
    const rows = await this.db
      .select({
        id: products.id,
        storeId: products.storeId,
        storeIntegrationId: products.storeIntegrationId,
        platform: products.platform,
        externalId: products.externalId,
        title: products.title,
        handle: products.handle,
        status: products.status,
        externalCreatedAt: products.externalCreatedAt,
        tags: productOverrides.tags,
      })
      .from(products)
      .leftJoin(productOverrides, eq(productOverrides.productId, products.id))
      .where(eq(products.id, productId))
      .limit(1)

    if (rows.length === 0) return null
    return this.mapRow(rows[0]!)
  }

  async findByIds(productIds: string[]): Promise<ProductQueryDTO[]> {
    if (productIds.length === 0) return []
    const rows = await this.db
      .select({
        id: products.id,
        storeId: products.storeId,
        storeIntegrationId: products.storeIntegrationId,
        platform: products.platform,
        externalId: products.externalId,
        title: products.title,
        handle: products.handle,
        status: products.status,
        externalCreatedAt: products.externalCreatedAt,
        tags: productOverrides.tags,
      })
      .from(products)
      .leftJoin(productOverrides, eq(productOverrides.productId, products.id))
      .where(inArray(products.id, productIds))

    return rows.map(r => this.mapRow(r))
  }

  private mapRow(row: {
    id: string
    storeId: string
    storeIntegrationId: string
    platform: string
    externalId: string
    title: string
    handle: string | null
    status: string
    externalCreatedAt: Date
    tags: unknown
  }): ProductQueryDTO {
    return {
      id: row.id,
      storeId: row.storeId,
      storeIntegrationId: row.storeIntegrationId,
      platform: row.platform,
      externalId: row.externalId,
      title: row.title,
      handle: row.handle,
      status: row.status,
      externalCreatedAt: row.externalCreatedAt,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    }
  }
}
```

- [ ] **Step 5: Create `MockProductQueryService.ts`**

Create `packages/api/typescript/src/catalog/services/ProductQueryService/MockProductQueryService.ts`:

```ts
import { injectable } from 'tsyringe-neo'
import { ProductQueryService, type ProductQueryDTO } from './ProductQueryService'

@injectable()
export class MockProductQueryService extends ProductQueryService {
  /** Seed products the next find calls return. */
  nextProducts: ProductQueryDTO[] = []

  async findById(productId: string): Promise<ProductQueryDTO | null> {
    return this.nextProducts.find(p => p.id === productId) ?? null
  }

  async findByIds(productIds: string[]): Promise<ProductQueryDTO[]> {
    return this.nextProducts.filter(p => productIds.includes(p.id))
  }
}
```

- [ ] **Step 6: Create the barrel `index.ts`**

Create `packages/api/typescript/src/catalog/services/ProductQueryService/index.ts`:

```ts
export { ProductQueryService, ProductQueryDTOSchema, type ProductQueryDTO } from './ProductQueryService'
export { DrizzleProductQueryService } from './DrizzleProductQueryService'
export { MockProductQueryService } from './MockProductQueryService'
```

- [ ] **Step 7: Run the test to verify it passes (GREEN)**

```bash
cd packages/api/typescript && bun test src/catalog/services/ProductQueryService/DrizzleProductQueryService.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 8: Delete the orphaned catalog read-model files**

Remove the following files (they have zero non-test importers):

```bash
rm packages/api/typescript/src/catalog/readmodels/ProductReadModel.ts
rm packages/api/typescript/src/catalog/readmodels/ProductReadModel.test.ts
rm packages/api/typescript/src/catalog/readmodels/ProductVariantReadModel.ts
rm packages/api/typescript/src/catalog/readmodels/ProductVariantReadModel.test.ts
rm packages/api/typescript/src/catalog/readmodels/index.ts
rmdir packages/api/typescript/src/catalog/readmodels
```

- [ ] **Step 9: Verify no remaining imports of the deleted schemas**

```bash
grep -r "ProductReadModel\|ProductVariantReadModel" packages/api/typescript/src --include="*.ts"
```

Expected: zero output. If any import remains, fix it before continuing.

- [ ] **Step 10: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 11: Run full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass.

- [ ] **Step 12: Commit**

Use `/commit`:

```
feat(catalog): ProductQueryService + delete orphaned ProductReadModel (SPEC-11 Task 1)
```

Stage: `packages/api/typescript/src/catalog/services/ProductQueryService/` (new files), `packages/api/typescript/src/catalog/readmodels/` (deleted).

---

## Task 2: `OrderQueryService` created; sales read-model files deleted

**Files:**
- Create: `packages/api/typescript/src/sales/services/OrderQueryService/OrderQueryService.ts`
- Create: `packages/api/typescript/src/sales/services/OrderQueryService/DrizzleOrderQueryService.ts`
- Create: `packages/api/typescript/src/sales/services/OrderQueryService/MockOrderQueryService.ts`
- Create: `packages/api/typescript/src/sales/services/OrderQueryService/index.ts`
- Create: `packages/api/typescript/src/sales/services/OrderQueryService/DrizzleOrderQueryService.test.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/OrderReadModel.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/OrderReadModel.test.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/OrderLineReadModel.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/OrderLineReadModel.test.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/OrderTransactionReadModel.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/OrderTransactionReadModel.test.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/objects/MonetaryAmount.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/objects/PostalAddress.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/objects/UtmTags.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/objects/objects.test.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/objects/index.ts`
- Delete: `packages/api/typescript/src/sales/readmodels/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /query
**Depends on:** 1

- [ ] **Step 1: Write the failing integration test (RED)**

Create `packages/api/typescript/src/sales/services/OrderQueryService/DrizzleOrderQueryService.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Id } from '@template/core-typescript'
import { orders } from '@template/contracts/db'
import { DrizzleOrderQueryService } from './DrizzleOrderQueryService'

const STORE_ID = '019e4d24-6524-7041-9e1c-8108180cddae'
const SI_EXTERNAL = 'acme.myshopify.com'
const PLATFORM = 'SHOPIFY'
const ORDER_EXTERNAL_1 = 'shopify_order_1'
const ORDER_EXTERNAL_2 = 'shopify_order_2'
const ORDER_ID_1 = Id.fromSeed('order', PLATFORM, ORDER_EXTERNAL_1).value
const ORDER_ID_2 = Id.fromSeed('order', PLATFORM, ORDER_EXTERNAL_2).value

const baseOrder = {
  storeId: STORE_ID,
  storeIntegrationId: '11111111-0001-4000-8000-000000000001',
  storeIntegrationExternalId: SI_EXTERNAL,
  platform: PLATFORM,
  externalCreatedAt: new Date('2026-05-01T10:00:00Z'),
  subtotalCents: 0n,
  discountTotalCents: 0n,
  shippingTotalCents: 0n,
  taxTotalCents: 0n,
  totalCents: 1000n,
  totalCurrency: 'USD',
  paymentStatus: 'PAID',
  paymentMethod: 'CREDIT_CARD',
  paymentGateway: 'STRIPE',
  transactions: [],
}

describe('DrizzleOrderQueryService', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer
  let service: DrizzleOrderQueryService
  let db: any

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer })
    db = testBed.resolve('DrizzleClient' as any)
  })
  beforeEach(async () => {
    await testBed.reset()
    service = testBed.resolve(DrizzleOrderQueryService)
  })
  afterAll(async () => {
    await testBed.destroy()
  })

  it('findById returns null when order does not exist', async () => {
    const result = await service.findById('00000000-0000-0000-0000-000000000000')
    expect(result).toBeNull()
  })

  it('findById returns an order with its lines', async () => {
    const lines = [{ id: 'line-1', productId: 'prod-a', variantId: 'var-a', quantity: 2 }]
    await db.insert(orders).values({ id: ORDER_ID_1, externalId: ORDER_EXTERNAL_1, lines, ...baseOrder })
    const result = await service.findById(ORDER_ID_1)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(ORDER_ID_1)
    expect(result!.storeId).toBe(STORE_ID)
    expect(result!.storeIntegrationExternalId).toBe(SI_EXTERNAL)
    expect(result!.lines).toHaveLength(1)
    expect(result!.lines[0]!.id).toBe('line-1')
    expect(result!.lines[0]!.quantity).toBe(2)
  })

  it('findByStore returns all orders for a store', async () => {
    const lines = [{ id: 'line-1', productId: 'prod-a', variantId: 'var-a', quantity: 1 }]
    await db.insert(orders).values([
      { id: ORDER_ID_1, externalId: ORDER_EXTERNAL_1, lines, ...baseOrder },
      { id: ORDER_ID_2, externalId: ORDER_EXTERNAL_2, lines: [], ...baseOrder },
    ])
    const results = await service.findByStore(STORE_ID)
    expect(results).toHaveLength(2)
    const ids = results.map(o => o.id)
    expect(ids).toContain(ORDER_ID_1)
    expect(ids).toContain(ORDER_ID_2)
  })

  it('findByStore returns empty array when store has no orders', async () => {
    const results = await service.findByStore(STORE_ID)
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/api/typescript && bun test src/sales/services/OrderQueryService/DrizzleOrderQueryService.test.ts
```

Expected: FAIL — `Cannot find module './DrizzleOrderQueryService'`.

- [ ] **Step 3: Create `OrderQueryService.ts` (abstract class + return shape)**

Create `packages/api/typescript/src/sales/services/OrderQueryService/OrderQueryService.ts`:

```ts
import { z } from '@template/core-typescript'
import type Z from 'zod'

/**
 * OrderLine shape as consumed by ProductCostApplicationHandler (SPEC-12).
 * Only the fields the handler reads — no monetary totals, no customer data.
 * Those were in the deleted OrderReadModel; they are not needed here.
 */
const OrderLineDTOSchema = z.object({
  id: z.string(),
  productId: z.string().optional(),
  variantId: z.string().optional(),
  quantity: z.number().int().nonnegative(),
})

/**
 * Internal return shape for OrderQueryService.
 * Defined inside the service per the query-service convention
 * (feedback_query_service_naming_and_zod).
 *
 * Shape is driven by the real consumer (ProductCostApplicationHandler, SPEC-12):
 * id, storeId, storeIntegrationExternalId, externalCreatedAt, lines.
 * Keep minimal — no monetary totals until a caller needs them.
 */
export const OrderQueryDTOSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  storeIntegrationExternalId: z.string(),
  externalCreatedAt: z.coerce.date(),
  lines: z.array(OrderLineDTOSchema),
})

export type OrderQueryDTO = Z.infer<typeof OrderQueryDTOSchema>
export type OrderLineDTO = Z.infer<typeof OrderLineDTOSchema>

/**
 * Cross-BC read port for the Sales BC. Surfaces canonical order data
 * (from `sales.orders`) so the write-side `ProductCostApplicationHandler`
 * can resolve orders without a direct Drizzle table import.
 *
 * Naming per feedback_query_service_naming_and_zod convention.
 */
export abstract class OrderQueryService {
  abstract findById(orderId: string): Promise<OrderQueryDTO | null>
  abstract findByStore(storeId: string): Promise<OrderQueryDTO[]>
}
```

- [ ] **Step 4: Create `DrizzleOrderQueryService.ts`**

Create `packages/api/typescript/src/sales/services/OrderQueryService/DrizzleOrderQueryService.ts`:

```ts
import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient } from '@template/core-typescript'
import { orders } from '@template/contracts/db'
import { OrderQueryService, OrderQueryDTOSchema, type OrderQueryDTO } from './OrderQueryService'

type OrderRow = typeof orders.$inferSelect

@injectable()
export class DrizzleOrderQueryService extends OrderQueryService {
  constructor(private readonly db: DrizzleClient) {
    super()
  }

  async findById(orderId: string): Promise<OrderQueryDTO | null> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
    if (rows.length === 0) return null
    return this.mapRow(rows[0]!)
  }

  async findByStore(storeId: string): Promise<OrderQueryDTO[]> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.storeId, storeId))
    return rows.map(r => this.mapRow(r))
  }

  private mapRow(row: OrderRow): OrderQueryDTO {
    const rawLines = (row.lines as { id?: string; productId?: string; variantId?: string; quantity?: number }[]) ?? []
    return OrderQueryDTOSchema.parse({
      id: row.id,
      storeId: row.storeId,
      storeIntegrationExternalId: row.storeIntegrationExternalId,
      externalCreatedAt: row.externalCreatedAt,
      lines: rawLines.map(l => ({
        id: l.id ?? '',
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity ?? 0,
      })),
    })
  }
}
```

- [ ] **Step 5: Create `MockOrderQueryService.ts`**

Create `packages/api/typescript/src/sales/services/OrderQueryService/MockOrderQueryService.ts`:

```ts
import { injectable } from 'tsyringe-neo'
import { OrderQueryService, type OrderQueryDTO } from './OrderQueryService'

@injectable()
export class MockOrderQueryService extends OrderQueryService {
  /** Seed orders the next find calls return. */
  nextOrders: OrderQueryDTO[] = []

  async findById(orderId: string): Promise<OrderQueryDTO | null> {
    return this.nextOrders.find(o => o.id === orderId) ?? null
  }

  async findByStore(storeId: string): Promise<OrderQueryDTO[]> {
    return this.nextOrders.filter(o => o.storeId === storeId)
  }
}
```

- [ ] **Step 6: Create the barrel `index.ts`**

Create `packages/api/typescript/src/sales/services/OrderQueryService/index.ts`:

```ts
export { OrderQueryService, OrderQueryDTOSchema, type OrderQueryDTO, type OrderLineDTO } from './OrderQueryService'
export { DrizzleOrderQueryService } from './DrizzleOrderQueryService'
export { MockOrderQueryService } from './MockOrderQueryService'
```

- [ ] **Step 7: Run the test to verify it passes (GREEN)**

```bash
cd packages/api/typescript && bun test src/sales/services/OrderQueryService/DrizzleOrderQueryService.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 8: Delete the orphaned sales read-model files**

```bash
rm packages/api/typescript/src/sales/readmodels/OrderReadModel.ts
rm packages/api/typescript/src/sales/readmodels/OrderReadModel.test.ts
rm packages/api/typescript/src/sales/readmodels/OrderLineReadModel.ts
rm packages/api/typescript/src/sales/readmodels/OrderLineReadModel.test.ts
rm packages/api/typescript/src/sales/readmodels/OrderTransactionReadModel.ts
rm packages/api/typescript/src/sales/readmodels/OrderTransactionReadModel.test.ts
rm packages/api/typescript/src/sales/readmodels/objects/MonetaryAmount.ts
rm packages/api/typescript/src/sales/readmodels/objects/PostalAddress.ts
rm packages/api/typescript/src/sales/readmodels/objects/UtmTags.ts
rm packages/api/typescript/src/sales/readmodels/objects/objects.test.ts
rm packages/api/typescript/src/sales/readmodels/objects/index.ts
rm packages/api/typescript/src/sales/readmodels/index.ts
rmdir packages/api/typescript/src/sales/readmodels/objects
rmdir packages/api/typescript/src/sales/readmodels
```

- [ ] **Step 9: Verify no remaining imports of the deleted schemas**

```bash
grep -r "OrderReadModel\|OrderLineReadModel\|OrderTransactionReadModel\|readmodels/objects" packages/api/typescript/src --include="*.ts"
```

Expected: zero output. If any import remains, fix it.

- [ ] **Step 10: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 11: Run full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass.

- [ ] **Step 12: Commit**

Use `/commit`:

```
feat(sales): OrderQueryService + delete orphaned OrderReadModel (SPEC-11 Task 2)
```

Stage: `packages/api/typescript/src/sales/services/OrderQueryService/` (new files), `packages/api/typescript/src/sales/readmodels/` (deleted).

---

## Task 3: Both services wired in their context registries

**Files:**
- Modify: `packages/api/typescript/src/catalog/registry.ts` — add `ProductQueryService` bindings
- Modify: `packages/api/typescript/src/sales/registry.ts` — add `OrderQueryService` bindings

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context
**Depends on:** 2

- [ ] **Step 1: Update `catalog/registry.ts`**

Open `packages/api/typescript/src/catalog/registry.ts` and add the `ProductQueryService` import + three environment bindings, mirroring `ProductCostQueryService`:

```ts
import { ProductQueryService, MockProductQueryService, DrizzleProductQueryService } from './services/ProductQueryService'
```

Add to each environment block:

```ts
// mock:
{ token: ProductQueryService, instance: MockProductQueryService },

// integration:
{ token: ProductQueryService, instance: DrizzleProductQueryService },

// real:
{ token: ProductQueryService, instance: DrizzleProductQueryService },
```

After the edit, `INSTANCE_REGISTRY` has 4 tokens per environment (ProductCostRepository, ProductOverrideRepository, ProductCostQueryService, ProductQueryService).

- [ ] **Step 2: Update `sales/registry.ts`**

Open `packages/api/typescript/src/sales/registry.ts` and add the `OrderQueryService` import + bindings. The registry post-SPEC-10 has had projection-repo bindings removed. Add:

```ts
import { OrderQueryService, MockOrderQueryService, DrizzleOrderQueryService } from './services/OrderQueryService'
```

Add to each environment block:

```ts
// mock:
{ token: OrderQueryService, instance: MockOrderQueryService },

// integration:
{ token: OrderQueryService, instance: DrizzleOrderQueryService },

// real:
{ token: OrderQueryService, instance: DrizzleOrderQueryService },
```

- [ ] **Step 3: Verify DI resolves both services**

```bash
cd packages/api/typescript && bun run test src/catalog/services/ProductQueryService/DrizzleProductQueryService.test.ts src/sales/services/OrderQueryService/DrizzleOrderQueryService.test.ts
```

Expected: all 9 tests pass (both services resolve from the container).

- [ ] **Step 4: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 5: Run full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

Use `/commit`:

```
refactor(catalog,sales): register ProductQueryService + OrderQueryService (SPEC-11 Task 3)
```

Stage: `packages/api/typescript/src/catalog/registry.ts`, `packages/api/typescript/src/sales/registry.ts`.

---

## Task 4: Acceptance criteria verification + grep audits

**Files:**
- No file changes — audit and verification only.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none)
**Depends on:** 3

- [ ] **Step 1: Grep — zero orphaned read-model imports**

```bash
grep -r "ProductReadModel\|ProductVariantReadModel\|OrderReadModel\|OrderLineReadModel\|OrderTransactionReadModel" \
  packages/api/typescript/src --include="*.ts"
```

Expected: zero output.

- [ ] **Step 2: Grep — zero `from.*readmodels` cross-file imports**

```bash
grep -r "from.*readmodels" packages/api/typescript/src --include="*.ts"
```

Expected: zero output. Any remaining hits are regressions to fix.

- [ ] **Step 3: Grep — both services exist as abstract classes**

```bash
grep -r "abstract class ProductQueryService\|abstract class OrderQueryService" \
  packages/api/typescript/src --include="*.ts"
```

Expected: exactly two matches (one per file).

- [ ] **Step 4: Grep — both Mock impls exist**

```bash
grep -r "class MockProductQueryService\|class MockOrderQueryService" \
  packages/api/typescript/src --include="*.ts"
```

Expected: exactly two matches.

- [ ] **Step 5: Grep — registries contain both services**

```bash
grep "ProductQueryService\|OrderQueryService" \
  packages/api/typescript/src/catalog/registry.ts \
  packages/api/typescript/src/sales/registry.ts
```

Expected: 3 hits per file (import line + mock binding + drizzle binding in integration/real).

- [ ] **Step 6: Full quality gate**

```bash
cd packages/api/typescript && bun tsc && bun run test
```

Expected: 0 tsc errors; all tests pass.

- [ ] **Step 7: Commit**

Use `/commit`:

```
chore(spec-11): acceptance-criteria audits pass — SPEC-11 complete
```

Stage: nothing new (audit-only task; commit confirms the clean state).

---

## Acceptance Criteria Coverage

| AC | Covered by |
|---|---|
| `ProductQueryService` + `OrderQueryService` exist as abstract classes with Drizzle impls, return shapes defined inside the service | Tasks 1 Step 3–4, Task 2 Step 3–4 |
| Orphaned read-model files deleted; `grep ProductReadModel / OrderReadModel → zero` | Tasks 1 Step 8–9, Task 2 Step 8–9, Task 4 Step 1–2 |
| Both services registered in context registries for mock/integration/real | Task 3 Steps 1–2 |
| At least one method on each service exercised by a test | Task 1 Step 7, Task 2 Step 7 |
| `bun tsc` clean | Tasks 1 Step 10, 2 Step 10, 3 Step 4, 4 Step 6 |
| `bun run test` clean | Tasks 1 Step 11, 2 Step 11, 3 Step 5, 4 Step 6 |
