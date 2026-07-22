# SPEC-10: Product tags via `ProductOverride` entity

**Wave:** 6   **Stream:** A   **Depends on:** Wave 5 complete   **Status:** done

## Motivation

Product tags today live on the canonical Product (Go-owned, written by go-worker sync pipelines). This couples merchant-controlled metadata (tags) to provider-derived state (everything else in Product), which:
- Forces re-syncs to preserve tags
- Pollutes the canonical/wire Product shape with non-wire concerns
- Makes the read model awkward — every Product read carries the merchant overlay

Sales already does this right: `OrderOverride` is a TS-owned aggregate holding merchant-controlled fields (payment status overrides, revenue overrides, productCostByLine) alongside the Go-owned canonical Order. Apply the same pattern to Product:

- Create `ProductOverride` entity in catalog BC (TS-owned).
- Carry merchant-controlled fields including `tags?: string[]`.
- Drop `tags` from the canonical Product (wire + Go publisher).
- Expose the joined "Product + ProductOverride" view via `ProductQueryService` with Zod output schemas — no need for a materialized read model.

## Scope

### Contracts side

- `packages/contracts/wire/models/product.tsp` (or wherever Product is defined): drop `tags` field. Regenerate.
- `packages/contracts/wire/events/product-updated.tsp`: ensure the event's `entity: Product` reflects the new shape (no tags). After SPEC-14, the entity-carrying shape is in place.
- `packages/contracts/db/schema/catalog.ts` (or wherever `catalog.products` is defined): drop `tags` column from the Drizzle schema. Add new table `catalog.product_overrides`.

Drizzle schema for `product_overrides`:

```ts
export const productOverrides = pgTable('product_overrides', {
  id: uuid('id').primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id').notNull(),
  tags: jsonb('tags').$type<string[]>().default([]),
  // ... other merchant-controlled fields if any
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, t => ({
  productUnq: unique().on(t.productId),  // 1:1 with Product
}))
```

Run `bun migrate:create` (and `bun migrate:dev` to apply).

### Go side

- `packages/api/go/internal/sync/pipelines/shopify_products_pipeline.go`: drop the tags-write code path. Tags are no longer published via the canonical event.
- `packages/api/go/internal/sync/normalizers/shopify/*.go`: drop tags extraction from Shopify webhook payloads (tags-handling moves to TS).
- Go-side tests: update to not assert on tags.

### TS side

#### New entity

```ts
// packages/api/typescript/src/catalog/entities/ProductOverride.ts
import { AggregateRoot, Id, z } from '@template/core-typescript'

export const ProductOverrideSchema = z.object({
  id: z.instance(Id),
  productId: z.instance(Id),
  storeId: z.instance(Id),
  tags: z.array(z.string()).default([]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export class ProductOverride extends AggregateRoot<typeof ProductOverrideSchema> {
  static override schema = ProductOverrideSchema

  static create(data: { productId: Id; storeId: Id; tags?: string[] }): ProductOverride {
    const id = ProductOverride.deterministicId(data.productId, data.storeId)
    return new ProductOverride({
      id,
      productId: data.productId,
      storeId: data.storeId,
      tags: data.tags ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  static deterministicId(productId: Id, storeId: Id): Id {
    return Id.fromSeed('product_override', productId.value, storeId.value)
  }

  setTags(tags: string[]): void {
    this.props.tags = Array.from(new Set(tags.filter(t => t.length > 0)))
    this.props.updatedAt = new Date()
  }
}
```

#### Repository

`packages/api/typescript/src/catalog/repositories/ProductOverrideRepository/{ProductOverrideRepository,DrizzleProductOverrideRepository,MockProductOverrideRepository}.ts`. Standard repo pattern per the repository skill.

#### Use cases

- `catalog/usecases/SetProductTags.ts` — find-or-create ProductOverride for `(productId, storeId)`, call `setTags(...)`, save. Emits `catalog.product_override.tags_updated` domain event.
- `catalog/usecases/AddProductTag.ts` — convenience: appends a single tag (calls `setTags([...existing, newTag])`).
- `catalog/usecases/RemoveProductTag.ts` — same but removes one.

#### Query service

`packages/api/typescript/src/catalog/services/ProductQueryService/ProductQueryService.ts` — cross-BC port. Concrete impl in catalog BC, consumed by sales BC when it needs the joined view.

```ts
export const ProductWithOverrideSchema = z.object({
  product: ProductSchema,                   // canonical from catalog.products
  override: ProductOverrideSchema.optional(),  // null if no override exists yet
})

export abstract class ProductQueryService {
  abstract findByExternalId(platform: string, externalId: string): Promise<z.infer<typeof ProductWithOverrideSchema> | null>
  abstract findByStoreAndExternalIds(storeId: Id, externalIds: string[]): Promise<z.infer<typeof ProductWithOverrideSchema>[]>
  abstract findTagsByStore(storeId: Id): Promise<{ productId: string; tags: string[] }[]>
}
```

(Pattern matches `SubscriptionQueryService` from memory.)

The Drizzle impl JOINs `catalog.products` LEFT JOIN `catalog.product_overrides ON products.id = product_overrides.product_id` and returns the merged shape.

#### Drop the direct read model

If a `ProductWithTagsProjection` (or similar) exists today purely to denormalize tags onto the canonical Product, delete it. Consumers move to `ProductQueryService`.

## Affected files

### Contracts
- `packages/contracts/wire/models/product.tsp` (or equivalent) — drop tags
- `packages/contracts/wire/events/product-updated.tsp` — verify entity shape after SPEC-14
- `packages/contracts/db/schema/catalog.ts` — drop tags column, add `product_overrides` table
- New migration files (generated by `bun migrate:create`)

### Go
- `packages/api/go/internal/sync/pipelines/shopify_products_pipeline.go`
- `packages/api/go/internal/sync/normalizers/shopify/shopify_products_normalize.go` (or similar)
- Go-side tests

### TS
- `packages/api/typescript/src/catalog/entities/ProductOverride.ts` — NEW
- `packages/api/typescript/src/catalog/repositories/ProductOverrideRepository/**` — NEW (4 files: interface, drizzle, mock, index)
- `packages/api/typescript/src/catalog/usecases/SetProductTags.ts` — NEW
- `packages/api/typescript/src/catalog/usecases/AddProductTag.ts` — NEW
- `packages/api/typescript/src/catalog/usecases/RemoveProductTag.ts` — NEW
- `packages/api/typescript/src/catalog/services/ProductQueryService/ProductQueryService.ts` — NEW (port + Drizzle impl)
- `packages/api/typescript/src/catalog/registry.ts` — register new repos + query service
- `packages/api/typescript/src/catalog/controllers/*` — if there's an AddProductTag / RemoveProductTag controller in the P6-CATALOG plan, wire it
- Tests across the above

## Acceptance criteria

- [ ] `tags` removed from canonical Product (wire + Drizzle schema + Go publisher).
- [ ] `ProductOverride` entity exists with `tags` field; `setTags()` enforces uniqueness + non-empty.
- [ ] `ProductOverrideRepository` exists (interface + Drizzle + Mock).
- [ ] `SetProductTags`, `AddProductTag`, `RemoveProductTag` use cases work; each emits the override-updated domain event.
- [ ] `ProductQueryService` exposes the joined view; returns `null` when no override exists.
- [ ] Any `Product` read in the codebase that previously used `product.tags` now goes through `ProductQueryService` (search: `\.tags` access on Product results).
- [ ] Database migration applied; tests pass against the new schema.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.
- [ ] Go test suite clean.

## Out of scope

- Other merchant-controlled Product fields (e.g. custom descriptions) — if discovered, add to `ProductOverride` schema in this spec; else defer.
- Migrating existing data (template repo, no data).
- Sub-tag taxonomies, tag-permission ACLs, etc. — out of scope.

## Notes

- `ProductOverride` is per (productId, storeId) — unique constraint enforces 1:1 with Product. A merchant in two stores has two override rows for the same canonical Product.
- The `ProductQueryService.findTagsByStore` method exists specifically for the merchant-facing "filter Products by tag" UI — frontend hits this endpoint instead of denormalizing tags into a search projection.
- `ProductOverride.deterministicId` uses `Id.fromSeed('product_override', productId.value, storeId.value)` per SPEC-20's per-entity-static pattern.
