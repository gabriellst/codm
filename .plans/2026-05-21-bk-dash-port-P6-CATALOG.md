# P6-CATALOG — BC5 Catalog (Product/Variant projections + ProductCost aggregate) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`)
> syntax for tracking. Each Task wraps one observable behavior in an outer
> RED→GREEN cycle. Files land under `packages/api/typescript/src/catalog/`
> and consume the cross-language shapes already authored under
> `packages/contracts/{wire,db}/`.
>
> **Naming note — sub-plan ID vs spec BC number.** The Ralph master plan
> (post-iter 39 rebase) calls this sub-plan **P5-CATALOG** in the
> dependency graph but the file lives at **P6-CATALOG** per Ralph prompt
> instruction. In `.specs/2026-05-21-ddd-modeling-bk-dash.md`, the
> Catalog bounded context is **BC5** (§4 BC5, §7.5/§7.6). The two IDs
> co-exist; commits use `P6 Task N` to match the filename.

**Goal:** Land the Catalog bounded context — the Go-fed canonical `Product` and `Variant` projections (already-authored Drizzle tables `catalog.products` + `catalog.variants`, written by go-worker), the merchant-owned `ProductCost` aggregate with its `ProductCostOption[]` child table (FK CASCADE), the four catalog reads (T16–T19), and the six catalog commands (C27 `CreateProductCost`, C28 `UpdateProductCost`, C29 `DeleteProductCost`, C30 `BulkImportProductCostsFromCsv`, C31 `AddProductTag`, C32 `RemoveProductTag`), all wired into the polyglot template-fullstack monorepo conventions.

**Architecture:** A single TS bounded context at `packages/api/typescript/src/catalog/`, structured per `.claude/skills/bounded-context/SKILL.md` and modelled after the in-repo sibling `packages/api/typescript/src/auth/`. Two **canonical projections** (`ProductProjection`, `VariantProjection`) — **Go-written, TS-read** — receive `integration.shared.product.updated` and `integration.shared.variant.updated` from the go-worker outbox via two projector entries (declared on `BoundedContext.projectors`) that materialize into the existing `catalog.products` and `catalog.variants` tables (TS-owned Drizzle schema, Go-owned writes via sqlc). The **`ProductCost` aggregate** is write-side TS, persists as parent header `catalog.product_costs` (4 columns + storeProductUnq) + child rows `catalog.product_cost_options` (one row per time-effective slice, items[] as JSONB); FK CASCADE handles cleanup on edit/delete. A separate **`ProductTag`** path mutates the `tags` JSONB column on the canonical projection — this is the spec-sanctioned exception ("tags are merchant-owned metadata"). CSV import (C30) streams rows through `papaparse`, validates against the same shared `ProductCostOptionInput` schema, and emits `ProductCostCreated`/`ProductCostUpdated` per row, returning `CsvImportRowResult[]` per spec §7.0.

**Tech Stack:** TypeScript, Bun, Drizzle (catalog schema already shipped), tsyringe-neo, Zod, `@template/core-typescript`, `@template/contracts` (generated wire + DB), PostgreSQL (PGlite for integration tests), bun:test, papaparse (CSV).
**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md` §4 BC5, §7.5/§7.6 (commands C27–C32, reads T16–T19), §7.0 (CsvImportRowResult, ProductCostOptionInput), §7.13 (inbound `product.updated` / `variant.updated`), §7.14 (CatalogErrors glossary).
**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan row "P5-CATALOG"; filename per Ralph prompt is **P6-CATALOG**).
**Depends on sub-plans:**
- **Iter 41 (contracts/wire/)** — `wire/enums/{product-status,product-cost-type,quantity-modifier,sales-platform,currency-code}.tsp` + `wire/events/{product-updated,variant-updated,integration-handshake-succeeded}.tsp` (all authored).
- **Iter 42 (contracts/db/schema/)** — `db/schema/catalog.ts` (already authored: `products` 21c/4ix, `variants` 23c/4ix, `product_costs` 7c/2ix header, `product_cost_options` child with FK CASCADE).
- **PG-GO-WORKER** — supplies `integration.shared.product.updated` + `integration.shared.variant.updated` from `packages/api/go/internal/sync/`. This sub-plan does NOT add go-worker code; integration tests dispatch the events directly via the local `RedisExternalMediator` test harness.
- **P1-IDENTITY** — `userId` (ctx auth) for command attribution in controllers (Task 24).
- **P2-TENANCY** — `Store` + `StoreMembership` for ownership-guard middleware reused by every catalog controller.
- **P4-INTEGRATION** — `StoreIntegration` + `StoreIntegrationRepository` for `storeIntegrationId` validation (C27) AND publisher of `integration.shared.store_integration.data_wipe_requested` consumed in Task 25.

**Tasks:** 26
**Estimated minutes:** ~510

---

## Convention reference (absorbed during planning, NOT to be re-read by /build)

- **Structural sibling** chosen for shape: `packages/api/typescript/src/auth/` — the only fully-fleshed TS BC in the template-fullstack monorepo (controllers/, entities/, enums/, errors/, events/, handlers/{internal,external}.ts, middlewares/, objects/, repositories/<Name>Repository/{interface,Drizzle,Mock,index}.ts, services/, usecases/, index.ts, registry.ts). We **add** the `projections/` subtree (auth has none — projection conventions come from `.claude/skills/projection/typescript/SKILL.md` and `.claude/skills/projector/typescript/SKILL.md`).
- **BoundedContext entry shape** — `packages/api/typescript/src/auth/index.ts`: `BoundedContext.create({ name, controllers, internalHandlers, externalHandlers, registry: INSTANCE_REGISTRY })` from `@template/core-typescript`. Catalog adds the `projectors` field (auto-registered to `InternalMediator` per `core/src/types/BoundedContext.ts` line 77–110). `name: 'catalog'`.
- **Use case shape** — `packages/api/typescript/src/auth/usecases/RegisterUser.ts`: `@injectable()` class extends `Handler<typeof InputSchema, typeof OutputSchema>` with `readonly name`, `readonly inputSchema`, `readonly outputSchema`, `protected async handle(input, tx?)` wrapped in `this.withTransaction(tx, ...)`, emits events via `this.domainEventRepository.save(event, tx)`.
- **Controller shape** — `packages/api/typescript/src/auth/controllers/GetSession.ts` + `core/src/types/Controller.ts`: abstract `readonly path: \`/${string}\``, `readonly method`, `readonly description`, optional `middlewares[]`; input/output schemas carry `.example([{...}])` envelopes; returns `{ status: HttpStatusCode, data, cookie? }`.
- **Repository shape** — `packages/api/typescript/src/auth/repositories/UserRepository/`: abstract base class `UserRepository`, `DrizzleUserRepository`, `MockUserRepository`, barrel `index.ts`. DI bindings declared in `<ctx>/registry.ts` under `mock | integration | real`.
- **Domain event shape** — read `core/src/types/BaseEvent.ts` + `BaseDomainEvent.ts`; events extend `BaseDomainEvent` with `static readonly name = 'catalog.<dotted_name>' as const` + `static schema = z.domainEvent({...})`.
- **Integration events** — already authored as TypeSpec under `packages/contracts/wire/events/`; **TS consumers import generated classes** from `@template/contracts-typescript/wire` (or path equivalent; verify exact import path with `grep -r "integration.shared.product.updated" packages/api/typescript/src/`). These extend `BaseIntegrationEvent` and arrive on `ExternalMediator` (`core/src/services/Mediator/RedisExternalMediator.ts`).
- **Projection shape** — `.claude/skills/projection/typescript/SKILL.md`: free record class `constructor(public props: <Name>ProjectionProps)`, no base class, exported `<Name>ProjectionEvent` union, method-overloaded `static create(event)` + `applyEvent(event)`, companion `<Name>ProjectionRepository` (abstract base + Drizzle + Mock).
- **Projector shape** — `.claude/skills/projector/typescript/SKILL.md` + `core/src/types/Projector.ts`: `abstract class Projector<E = any>` with `abstract readonly events: readonly string[]` + `abstract handle(event, tx?)`. Implementations are `@injectable()` and use plain `switch (event.name)` with exhaustiveness via `default: const _: never = event`.
- **Test sandbox** — sibling test in `packages/api/typescript/src/auth/controllers/GetSession.test.ts`. Integration TestBed harness uses PGlite via `@template/core-typescript`. Given helpers placed near suites that need them; flow tests deferred to PE-E2E.
- **CSV parsing** — `papaparse` is the chosen library (added in Task 17 if absent). Errors surface as `CSV_PARSE_ERROR` per spec §7.14.
- **OpenAPI controllers** — every Controller's input/output schema needs `.example([{...}])` envelopes so the SDK gets realistic mock data (see `getSchemaExamples` in `core/src/types/Controller.ts:24`).
- **Path aliases** — mirror `@auth/*` (defined in `packages/api/typescript/tsconfig.json`); add `"@catalog/*": ["src/catalog/*"]` in Task 1.
- **Schema imports** — `import { products, variants, productCosts, productCostOptions, catalogSchema } from '@template/contracts/db/schema/catalog'` (verify the exact published export path with `grep -r "@template/contracts" packages/api/typescript/src/auth`).

---

## File Structure

Each Task is classified by **wave** and **parallelism class** per `.claude/skills/task-breakdown/SKILL.md` (this plan crosses 1 BC + 26 artifacts → invokes task-breakdown). W1=foundation, W2=schema/glue (Drizzle already exists — no migration task), W3=entity+repository+projection, W4=write-side use cases, W5=projectors+handlers, W6=reads/queries, W7=controllers+CSV+contract lock, W8=cross-context handler + final validation.

| Task | Wave | Class | File(s) |
|---|---|---|---|
| 1  | W1 | serial — Contract Lock entry | `catalog/` skeleton (folders, `index.ts`, `registry.ts`, path-alias) wired into MainRouter |
| 2  | W1 | parallel-now | `catalog/errors/index.ts` — `CatalogDomainErrors` + `CatalogApplicationErrors` + registration with `GlobalErrorMapper` |
| 3  | W1 | parallel-now | `catalog/events/ProductCostCreatedEvent.ts` |
| 4  | W1 | parallel-now | `catalog/events/ProductCostUpdatedEvent.ts` |
| 5  | W1 | parallel-now | `catalog/events/ProductCostDeletedEvent.ts` |
| 6  | W1 | parallel-now | `catalog/events/ProductTagAddedEvent.ts` |
| 7  | W1 | parallel-now | `catalog/events/ProductTagRemovedEvent.ts` + `catalog/events/index.ts` barrel |
| 8  | W2 | serial-after-W1 | Drizzle schema RE-EXPORT (`catalog/repositories/_schema.ts` thin barrel re-exporting `@template/contracts/db/schema/catalog`) + drift test asserting the four tables exist with expected column counts |
| 9  | W3 | serial-after-Task-8 | `catalog/entities/ProductCost.ts` (aggregate root) + `catalog/entities/ProductCostOption.ts` (child value object) + tests |
| 10 | W3 | parallel-after-Task-9 | `catalog/repositories/ProductCostRepository/*` (interface + Drizzle + Mock + register in `registry.ts`) |
| 11 | W3 | parallel-after-Task-8 | `catalog/projections/ProductProjection.ts` + `ProductProjectionRepository/*` |
| 12 | W3 | parallel-after-Task-8 | `catalog/projections/VariantProjection.ts` + `VariantProjectionRepository/*` |
| 13 | W4 | serial-after-Task-10 | `catalog/usecases/CreateProductCost.ts` + test (C27) + `tests/given/givenProductCost.ts` |
| 14 | W4 | parallel-after-Task-13 | `catalog/usecases/UpdateProductCost.ts` + test (C28) |
| 15 | W4 | parallel-after-Task-13 | `catalog/usecases/DeleteProductCost.ts` + test (C29) |
| 16 | W5 | serial-after-Task-11 | `catalog/projections/projectors/ProductProjector.ts` + test |
| 17 | W5 | serial-after-Task-12 | `catalog/projections/projectors/VariantProjector.ts` + test |
| 18 | W4 | serial-after-Task-13 | `catalog/services/ProductCostCsvParser.ts` + `catalog/usecases/BulkImportProductCostsFromCsv.ts` + test (C30) |
| 19 | W4 | serial-after-Task-11 | `catalog/usecases/AddProductTag.ts` + test (C31) |
| 20 | W4 | serial-after-Task-19 | `catalog/usecases/RemoveProductTag.ts` + test (C32) |
| 21 | W6 | parallel-after-Task-11,12 | `catalog/usecases/queries/ListProducts.ts` (T16) + test |
| 22 | W6 | parallel-after-Task-21 | `catalog/usecases/queries/GetProductDetail.ts` (T17) + test |
| 23 | W6 | parallel-after-Task-21 | `catalog/usecases/queries/ListProductCosts.ts` (T18) + test |
| 24 | W6 | parallel-after-Task-21 | `catalog/usecases/queries/ListProductTags.ts` (T19) + test |
| 25 | W7 | serial-after-W4+W6 — **Contract Lock** | All 10 controllers (6 commands + 4 reads) + `bun sdk` regen committed separately |
| 26 | W8 | serial-after-Task-25 | `catalog/handlers/external.ts` + `StoreIntegrationDataWipeHandler.ts` (cascade canonical, preserve merchant) — **Final Validation** at the end of this task: AC mapping + `bun tsc && bun lint && bun run test` clean |

---

## Task 1: Bounded context skeleton wired into MainRouter

**Files:**
- Create: `packages/api/typescript/src/catalog/` (full subtree per `/bounded-context` skill — empty index files in each folder)
- Create: `packages/api/typescript/src/catalog/index.ts` (`BoundedContext.create` entry, mirror `src/auth/index.ts`)
- Create: `packages/api/typescript/src/catalog/registry.ts` (stub — bindings added in Tasks 10/11/12)
- Create: `packages/api/typescript/src/catalog/handlers/internal.ts` + `external.ts` (empty exports for now)
- Create: `packages/api/typescript/src/catalog/controllers/index.ts` (empty barrel)
- Create: `packages/api/typescript/src/catalog/catalog.context.test.ts` (RED test)
- Modify: `packages/api/typescript/tsconfig.json` — add `"@catalog/*": ["src/catalog/*"]` next to `@auth/*`
- Modify: `packages/api/typescript/src/index.ts` (or wherever MainRouter assembles BCs — discover via `grep -n "auth" packages/api/typescript/src/index.ts`) — import + mount `CatalogRouter`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context

- [ ] **Step 1: Write the failing test** — `packages/api/typescript/src/catalog/catalog.context.test.ts`:
```typescript
import { describe, expect, it } from 'bun:test'
import CatalogRouter from './index'

describe('catalog bounded context', () => {
  it('exports a Router with prefix /catalog', () => {
    expect(CatalogRouter).toBeDefined()
    // Mirror auth's assertion shape — `grep -n "prefix" packages/api/typescript/src/auth/*.test.ts` if uncertain.
    expect(CatalogRouter.name).toBe('catalog')
  })
})
```

- [ ] **Step 2: Verify failure** — `bun test packages/api/typescript/src/catalog/catalog.context.test.ts` → FAIL `Cannot find module './index'`.

- [ ] **Step 3: Implement** — copy the auth `index.ts` shape verbatim, change `name: ''` to `name: 'catalog'`. Stub `registry.ts`:
```typescript
import './errors'
import type { InstanceRegistry } from '@template/core-typescript'
export const INSTANCE_REGISTRY: InstanceRegistry = { mock: [], integration: [], real: [] }
```
Wire MainRouter (search `packages/api/typescript/src/index.ts` for how `auth` is mounted, follow the same import + spread pattern).

- [ ] **Step 4: Verify pass** — `bun test packages/api/typescript/src/catalog/catalog.context.test.ts && bun tsc && bun lint` → all green.

- [ ] **Step 5: Commit** — `feat(catalog): bounded-context skeleton + MainRouter wiring (P6 Task 1)`

---

## Task 2: Catalog error glossary

**Files:**
- Create: `packages/api/typescript/src/catalog/errors/index.ts`
- Create: `packages/api/typescript/src/catalog/errors/index.test.ts`
- Modify: `packages/api/typescript/core/src/utils/GlobalErrorMapper.ts` (register new codes → HTTP statuses) — OR confirm `errors/index.ts` self-registers via side-effect import in `registry.ts` (auth pattern; verify by reading `src/auth/errors/index.ts`).

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /errors
**Depends on:** Task 1

Per spec §7.14 CatalogErrors:

- `PRODUCT_NOT_FOUND` → 404
- `VARIANT_NOT_FOUND` → 404
- `PRODUCT_COST_NOT_FOUND` → 404
- `PRODUCT_COST_SCOPE_LOCKED` → 422 (scope immutable on UPDATE)
- `DUPLICATE_PRODUCT_COST_SCOPE` → 409 (CREATE with same `(storeId, productId)` already exists)
- `INVALID_DATE_RANGE` → 422
- `TAG_TOO_LONG` → 422
- `CSV_PARSE_ERROR` → 400

- [ ] **Step 1: Write the failing test** — assert every code is a member of `CatalogDomainErrors | CatalogApplicationErrors`, asserts `GlobalErrorMapper` returns the listed HTTP status for each.

- [ ] **Step 3: Implement**
```typescript
export type CatalogDomainErrors =
  | 'PRODUCT_NOT_FOUND' | 'VARIANT_NOT_FOUND'
  | 'PRODUCT_COST_SCOPE_LOCKED' | 'INVALID_DATE_RANGE' | 'TAG_TOO_LONG'

export type CatalogApplicationErrors =
  | 'PRODUCT_COST_NOT_FOUND' | 'DUPLICATE_PRODUCT_COST_SCOPE' | 'CSV_PARSE_ERROR'

export type DomainErrors = CatalogDomainErrors
export type ApplicationErrors = CatalogApplicationErrors
export type Errors = DomainErrors | ApplicationErrors
```
Register HTTP statuses per the auth pattern (re-read `src/auth/errors/index.ts` for the exact registration call).

- [ ] **Step 5: Commit** — `feat(catalog): error glossary — 8 codes per spec §7.14 (P6 Task 2)`

---

## Task 3: ProductCostCreatedEvent

**Files:**
- Create: `packages/api/typescript/src/catalog/events/ProductCostCreatedEvent.ts`
- Test: deferred to Task 13 (use case test exercises event emission; the event-only file does not warrant a standalone test per `/event` skill).

**Skills:** /event
**Depends on:** Task 2

```typescript
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ProductCostCreatedEventSchema = z.domainEvent({
  productCostId: z.string(),
  storeId: z.string(),
  productId: z.string(),
  type: z.enum(['SINGLE', 'MULTIPLE']),
})

export class ProductCostCreatedEvent extends BaseDomainEvent<typeof ProductCostCreatedEventSchema> {
  static override readonly name = 'catalog.product_cost.created' as const
  static readonly schema = ProductCostCreatedEventSchema
}
```

- [ ] **Step 5: Commit** — `feat(catalog): ProductCostCreatedEvent (P6 Task 3)`

---

## Task 4: ProductCostUpdatedEvent

Mirror Task 3. Payload: `{ productCostId, storeId, changedFields: string[] }`. Name `catalog.product_cost.updated`.

- [ ] Commit: `feat(catalog): ProductCostUpdatedEvent (P6 Task 4)`

---

## Task 5: ProductCostDeletedEvent

Mirror Task 3. Payload: `{ productCostId, storeId }`. Name `catalog.product_cost.deleted`.

- [ ] Commit: `feat(catalog): ProductCostDeletedEvent (P6 Task 5)`

---

## Task 6: ProductTagAddedEvent

Payload: `{ productId, storeId, tag, userId }`. Name `catalog.product_tag.added`. The `userId` field is the audit trail per spec §4 BC5 (tag mutations are the merchant-owned canonical exception). Per spec C31: emit only on actual change — the use case in Task 19 owns the no-op detection.

- [ ] Commit: `feat(catalog): ProductTagAddedEvent (P6 Task 6)`

---

## Task 7: ProductTagRemovedEvent + events barrel

Payload: `{ productId, storeId, tag, userId }`. Name `catalog.product_tag.removed`. Create `catalog/events/index.ts` re-exporting all 5 events.

- [ ] **Step 1: Test** — `events/index.test.ts` asserts every event has the expected dotted name:
```typescript
expect(ProductCostCreatedEvent.name).toBe('catalog.product_cost.created')
expect(ProductCostUpdatedEvent.name).toBe('catalog.product_cost.updated')
expect(ProductCostDeletedEvent.name).toBe('catalog.product_cost.deleted')
expect(ProductTagAddedEvent.name).toBe('catalog.product_tag.added')
expect(ProductTagRemovedEvent.name).toBe('catalog.product_tag.removed')
```

- [ ] Commit: `feat(catalog): ProductTagRemovedEvent + events barrel (P6 Task 7)`

---

## Task 8: Drizzle schema re-export + drift test

**Files:**
- Create: `packages/api/typescript/src/catalog/repositories/_schema.ts` — thin barrel re-exporting the four tables from `@template/contracts/db/schema/catalog`:
```typescript
export { products, variants, productCosts, productCostOptions, catalogSchema } from '@template/contracts/db/schema/catalog'
```
- Create: `packages/api/typescript/src/catalog/repositories/_schema.drift.test.ts` — asserts the four tables and their unique index `products_platform_external_id_unq` are present at runtime against an integration TestBed (PGlite). This guards against the Drizzle schema drifting under our feet between iterations.

**Skills:** /db-modelling (consult-only — no schema changes here; the iter 42 schema is the source of truth)
**Depends on:** Task 7
**Notes:** **No migration is generated in this Task.** Per master plan iter 42, `bun run drizzle:generate` already produced the `catalog` schema migration under `packages/contracts/db/migrations/`. If TestBed's PGlite seed shows tables missing, fix the migration pipeline upstream — **do not** add migration files here.

- [ ] **Step 1: Test** — integration suite:
```typescript
import { TestBed } from '@template/core-typescript/testing'
const { db } = await TestBed.create('integration')
const rows = await db.execute(sql`select tablename from pg_tables where schemaname='catalog' order by tablename`)
expect(rows.map(r => r.tablename)).toEqual(['product_cost_options','product_costs','products','variants'])
```
- [ ] **Step 5: Commit** — `feat(catalog): schema re-export + drift test (P6 Task 8)`

---

## Task 9: ProductCost aggregate + ProductCostOption child

**Files:**
- Create: `packages/api/typescript/src/catalog/entities/ProductCost.ts` (aggregate root)
- Create: `packages/api/typescript/src/catalog/entities/ProductCostOption.ts` (child value object — one per row in `catalog.product_cost_options`)
- Create: `packages/api/typescript/src/catalog/entities/ProductCost.test.ts`
- Create: `packages/api/typescript/src/catalog/entities/ProductCostOption.test.ts`
- Create: `packages/api/typescript/src/catalog/entities/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity /value-object
**Depends on:** Task 2, Task 8

Per spec §4 BC5 + §7.0:

- `ProductCost` carries identity + scope: `{ id, storeId, productId, type: 'SINGLE'|'MULTIPLE', options: ProductCostOption[] }`. Scope `(storeId, productId)` is unique (DB unique index `product_costs_store_product_unq`) and **immutable after creation** — `UpdateProductCost` may NOT change it (raises `PRODUCT_COST_SCOPE_LOCKED`).
- `ProductCostOption` carries the time-effective slice: `{ id, productCostId, currency, country?, startDate, endDate?, shipping: MonetaryAmount, items: ProductCostOptionItem[] }`. `items[]` stored as JSONB on the row per iter 42 decision (`items` jsonb in `product_cost_options`).
- `ProductCostOptionItem` (the JSONB shape, not a DB table): `{ id, variantIds: string[], variantsHash, quantity, quantityModifier: QuantityModifier, unitCost: MonetaryAmount, shipping: MonetaryAmount }`. `variantsHash = sha256(sorted(variantIds).join(','))` — used for fast equality checks during projection lookups.

Invariants on `ProductCost`:
1. `options.length >= 1` after create.
2. Every option's `endDate >= startDate` when both present (`INVALID_DATE_RANGE`).
3. If `type === 'SINGLE'`, every `item.variantIds` must be empty (cost applies to all variants).
4. If `type === 'MULTIPLE'`, every `item.variantIds.length >= 1`.

Methods:
- `static create({ storeId, productId, type, options })` — validates 1–4.
- `replaceOptions(options: ProductCostOptionInput[])` — re-validates 1–4.
- `mergeOptions(...)`, `addOption(...)` deferred unless C28 spec requires (it does not — full replace is the spec contract).

Tests:
- Happy create with SINGLE + 1 option + 0 items[].
- Happy create with MULTIPLE + 1 option + 2 items[] each with `variantIds=['v1','v2']`.
- `endDate < startDate` → throws `INVALID_DATE_RANGE`.
- `type=SINGLE` with non-empty `variantIds` on item → throws `INVALID_DATE_RANGE` (or a dedicated code — check spec §7.14 for whether SINGLE+variantIds collision has its own code; if not, reuse `INVALID_DATE_RANGE` and document the conflation).
- `variantsHash` stable for the same `variantIds` (order-independent).
- `variantsHash` different for different `variantIds`.

- [ ] **Step 5: Commit** — `feat(catalog): ProductCost aggregate + ProductCostOption child (P6 Task 9)`

---

## Task 10: ProductCostRepository (interface + Drizzle + Mock)

**Files:**
- Create: `packages/api/typescript/src/catalog/repositories/ProductCostRepository/ProductCostRepository.ts` (abstract base)
- Create: `packages/api/typescript/src/catalog/repositories/ProductCostRepository/DrizzleProductCostRepository.ts`
- Create: `packages/api/typescript/src/catalog/repositories/ProductCostRepository/DrizzleProductCostRepository.test.ts`
- Create: `packages/api/typescript/src/catalog/repositories/ProductCostRepository/MockProductCostRepository.ts`
- Create: `packages/api/typescript/src/catalog/repositories/ProductCostRepository/index.ts`
- Modify: `packages/api/typescript/src/catalog/repositories/index.ts`
- Modify: `packages/api/typescript/src/catalog/registry.ts` (bind `ProductCostRepository` → `MockProductCostRepository` for `mock`, → `DrizzleProductCostRepository` for `integration|real`)

**Skills:** /repository
**Depends on:** Task 9

Interface:
```typescript
import type { Transaction } from '@template/core-typescript'
import type { ProductCost } from '@catalog/entities'

export abstract class ProductCostRepository {
  abstract findById(id: string, tx?: Transaction): Promise<ProductCost | null>
  /** For C27 DUPLICATE_PRODUCT_COST_SCOPE precheck — scope is (storeId, productId). */
  abstract findByScope(storeId: string, productId: string, tx?: Transaction): Promise<ProductCost | null>
  /** T18 ProductCostsList — paginated with effectiveOnDate overlap filter. */
  abstract listByStoreIds(args: {
    storeIds: string[]
    productIds?: string[]
    variantIds?: string[]
    type?: 'SINGLE' | 'MULTIPLE'
    currency?: string
    country?: string
    effectiveOnDate?: string
    page: number
    limit: number
  }, tx?: Transaction): Promise<{ items: ProductCost[]; total: number }>
  /** T17 ProductDetail nested data. */
  abstract listByProductId(productId: string, tx?: Transaction): Promise<ProductCost[]>
  abstract save(productCost: ProductCost, tx?: Transaction): Promise<void>
  abstract delete(id: string, tx?: Transaction): Promise<void>
  /** NOT used by data-wipe — merchant aggregate preserved per spec §4 BC5. */
}
```

Drizzle implementation notes:
- `save()` upserts the parent row in `product_costs`, then **replaces** the child rows in `product_cost_options` (DELETE WHERE product_cost_id = ? then INSERT ... — FK CASCADE makes this safe). The `items` JSONB column is serialized via the entity's `toPersistence()` helper.
- `findById()` joins `product_costs` × `product_cost_options` and reconstructs the aggregate.
- All operations use `tx` when present, fall back to top-level `db` otherwise (mirror `DrizzleUserRepository`).

Tests (integration mode, PGlite):
- `save()` round-trips a ProductCost with 2 options × 3 items[] each.
- `findByScope(storeId, productId)` returns the saved row.
- `listByStoreIds({ effectiveOnDate: '2026-05-21' })` returns only options whose `startDate <= '2026-05-21' AND (endDate IS NULL OR endDate >= '2026-05-21')`.
- `delete()` cascades children via FK.
- `findByScope` returns null for unknown scope.

- [ ] **Step 5: Commit** — `feat(catalog): ProductCostRepository — interface + Drizzle + Mock (P6 Task 10)`

---

## Task 11: ProductProjection + ProductProjectionRepository

**Files:**
- Create: `packages/api/typescript/src/catalog/projections/ProductProjection.ts`
- Create: `packages/api/typescript/src/catalog/projections/ProductProjection.test.ts`
- Create: `packages/api/typescript/src/catalog/projections/ProductProjectionRepository/ProductProjectionRepository.ts`
- Create: `packages/api/typescript/src/catalog/projections/ProductProjectionRepository/DrizzleProductProjectionRepository.ts`
- Create: `packages/api/typescript/src/catalog/projections/ProductProjectionRepository/DrizzleProductProjectionRepository.test.ts`
- Create: `packages/api/typescript/src/catalog/projections/ProductProjectionRepository/MockProductProjectionRepository.ts`
- Create: `packages/api/typescript/src/catalog/projections/ProductProjectionRepository/index.ts`
- Modify: `packages/api/typescript/src/catalog/registry.ts`

**Skills:** /projection /repository
**Depends on:** Task 8

Per `/projection/typescript/SKILL.md` §"Citizen Definition": free record, flat schema, no base class, exported `<Name>ProjectionEvent` union, method-overloaded `static create(event)` + `applyEvent(event)`.

Event union for `ProductProjection`:
- `ProductUpdatedEvent` (from `@template/contracts` generated TS — `integration.shared.product.updated`) — create when `isNew=true`, mutate when `isNew=false`
- `ProductTagAddedEvent` — mutate
- `ProductTagRemovedEvent` — mutate

`StoreIntegrationDataWipeRequestedEvent` is intentionally **not** in this union — cascade deletion is done by the `external.ts` handler (Task 26) via `repo.deleteByStoreIntegrationId`, not via `applyEvent` (projections don't model deletion of themselves).

Schema mirror of `catalog.products` columns (subset relevant to the read model):
```typescript
export const ProductProjectionSchema = z.object({
  id: z.string(),                       // uuid PK
  storeId: z.string(),
  storeIntegrationId: z.string(),
  storeIntegrationExternalId: z.string(),
  platform: z.string(),                 // SalesPlatform string
  externalId: z.string(),
  title: z.string(),
  handle: z.string().nullable(),
  description: z.string().nullable(),
  vendor: z.string().nullable(),
  productType: z.string().nullable(),
  imageUrl: z.string().nullable(),
  status: z.enum(['ACTIVE','ARCHIVED','DRAFT']),
  tags: z.array(z.string()),
  minPriceCents: z.bigint().nullable(),
  maxPriceCents: z.bigint().nullable(),
  currency: z.string().nullable(),
  externalCreatedAt: z.string(),        // ISO8601
  version: z.number(),
})
```

Event handlers in the projection:
- `static create(event: ProductUpdatedEvent)`: builds props from event payload. **Note:** the current `wire/events/product-updated.tsp` carries `{ platform, externalId, storeIntegrationExternalId, status, isNew }` — i.e., it does NOT carry `title/handle/description/...`. Per the spec rule that **Go owns the canonical write**, the projector must hydrate the missing fields by **reading the row Go just wrote** (one extra SELECT against `catalog.products` keyed by `(platform, externalId)` via the unique index). This is the "Go-fed" pattern: the event is a *signal* (with `isNew` discriminator), the source of truth is the row. Document this clearly in the projector test (Task 16).
- `applyEvent(event: ProductUpdatedEvent)`: re-hydrate the full props from the canonical row (the row Go just UPSERTed) — `findByPlatformExternalId(platform, externalId)` returns the new state; the projection's job is to assert the read model is consistent. **Reason:** the event carries no `changedFields`; the canonical row is the truth.
- `applyEvent(event: ProductTagAddedEvent)`: idempotent — append `tag` to `tags` only if absent.
- `applyEvent(event: ProductTagRemovedEvent)`: idempotent — remove `tag` from `tags` if present.

`ProductProjectionRepository` ops:
- `findByKey(productId, tx?)` — by uuid PK
- `findByPlatformExternalId(platform, externalId, tx?)` — by unique index (used by projector to hydrate)
- `save(p, tx?)` — full row update (used after tag mutations; not used after `ProductUpdatedEvent` because Go already UPSERTed)
- `insertIfNew(...)` — **not used in catalog** because Go owns the writes; the TS-side `save` is only for tag updates which touch the `tags` JSONB column.
- `updateTags(productId, tags, tx?)` — narrow atomic UPDATE that only writes the `tags` column (avoids racing with Go's broader UPSERT). **This is the trigger-justified atomic op** per `/projector/typescript/SKILL.md`: hot row + cache-mirror.
- `deleteByStoreIntegrationId(storeIntegrationId, tx?)` — bulk op for Task 26.
- `listForUi(args, tx?)` — paginated for T16.
- `findDetailedById(productId, tx?)` — for T17.
- `listTagsAggregated(storeIds, tx?)` — for T19, `SELECT jsonb_array_elements_text(tags) AS tag, COUNT(*) FROM catalog.products WHERE store_id = ANY(?) GROUP BY tag`.

- [ ] **Step 1: Test** — projection: `create(ProductUpdatedEvent { isNew: true })` shapes props; `applyEvent(ProductTagAddedEvent('foo'))` idempotent on second call; `applyEvent(ProductTagRemovedEvent)` idempotent when tag absent. **Repository:** round-trip via `save`, `updateTags` writes only `tags` column (other columns unchanged), `deleteByStoreIntegrationId` deletes all rows for a given integration.
- [ ] **Step 5: Commit** — `feat(catalog): ProductProjection + ProductProjectionRepository (P6 Task 11)`

---

## Task 12: VariantProjection + VariantProjectionRepository

Mirror Task 11 against the `variants` table. Event union: `VariantUpdatedEvent` only (no tag events for variants). Schema mirrors `catalog.variants` (23 columns; `optionLabels` JSONB, `unitPriceCents`/`compareAtPriceCents` BIGINT, `productId` FK-free per the schema comment).

Repo ops:
- `findByKey(variantId, tx?)`
- `findByPlatformExternalId(platform, externalId, tx?)` — for projector hydration
- `findByIds(ids, tx?)` — used by `CreateProductCost` (Task 13) to validate `variantIds` belong to the same store
- `listByProductId(productId, tx?)` — for T17
- `deleteByStoreIntegrationId(storeIntegrationId, tx?)` — Task 26
- `save(v, tx?)` — only for non-canonical updates (none in spec scope today; keep for symmetry)

- [ ] **Step 5: Commit** — `feat(catalog): VariantProjection + VariantProjectionRepository (P6 Task 12)`

---

## Task 13: CreateProductCost use case (C27)

**Files:**
- Create: `packages/api/typescript/src/catalog/usecases/CreateProductCost.ts`
- Create: `packages/api/typescript/src/catalog/usecases/CreateProductCost.test.ts`
- Modify: `packages/api/typescript/src/catalog/usecases/index.ts`
- Create: `packages/api/typescript/tests/given/givenProductCost.ts` (helper for downstream tests; mirror auth's `tests/given/` layout — discover via `find packages/api/typescript -name "given*.ts"`)

**Skills:** /usecase /test
**Depends on:** Task 10, Task 11, Task 12, Task 3

Per spec §7.5 C27 — orchestration:
1. **Resolve store integration** via `StoreIntegrationRepository.findById(storeIntegrationId)` (cross-context from P4) — throw `STORE_INTEGRATION_NOT_FOUND` if missing.
2. **Validate product exists** via `ProductProjectionRepository.findByKey(productId)` — throw `PRODUCT_NOT_FOUND` if missing.
3. **Validate variants** — for every `options[i].items[j].variantIds[k]`: `VariantProjectionRepository.findByIds(uniqueVariantIds)` — throw `VARIANT_NOT_FOUND` if any unresolved. Cross-check each variant's `storeIntegrationId === input.storeIntegrationId` (defence against cross-tenant linking).
4. **Scope uniqueness** — `ProductCostRepository.findByScope(storeId, productId)` — throw `DUPLICATE_PRODUCT_COST_SCOPE` if hit.
5. `ProductCost.create({ storeId, productId, type, options })` — entity validates `INVALID_DATE_RANGE` and the SINGLE/MULTIPLE variantIds invariant.
6. `productCostRepository.save(pc, tx)`.
7. `domainEventRepository.save(new ProductCostCreatedEvent({ entityId: pc.id, ownerId: storeId, payload: { productCostId: pc.id, storeId, productId, type } }), tx)`.
8. Return `{ productCostId: pc.id }`.

Test cases (per `/test` skill — orchestration only; field validation lives in entity test):
- Happy: creates, saves event in same UoW.
- Missing integration → `STORE_INTEGRATION_NOT_FOUND` (assert no row written).
- Missing product → `PRODUCT_NOT_FOUND`.
- Variant in `variantIds[]` not found → `VARIANT_NOT_FOUND`.
- Variant from different `storeIntegrationId` → `VARIANT_NOT_FOUND`.
- Existing same-scope cost → `DUPLICATE_PRODUCT_COST_SCOPE`.

**Per user memory** (`givenEvent is for cross-process boundaries`): do NOT seed `shared.events` in the test; assert event emission via spying on `domainEventRepository.save` (mock or integration capture).

- [ ] **Step 5: Commit** — `feat(catalog): CreateProductCost use case (C27, P6 Task 13)`

---

## Task 14: UpdateProductCost use case (C28)

**Files:** colocated `UpdateProductCost.{ts,test.ts}`.
**Skills:** /usecase
**Depends on:** Task 13

Per spec §7.5 C28. Lookup by `productCostId` → `PRODUCT_COST_NOT_FOUND` if missing. **Scope is immutable** — `Input` shape does not accept `storeId`/`productId`/`type`; if a future controller passes them and they differ from the stored row, throw `PRODUCT_COST_SCOPE_LOCKED`. Apply `options` via `pc.replaceOptions(input.options)` (entity throws `INVALID_DATE_RANGE`). Compute `changedFields[]` (`['options']` plus any scope-attempted changes for the audit log) for the event payload. Save entity + emit `ProductCostUpdatedEvent`.

Tests: happy update of options, `PRODUCT_COST_NOT_FOUND`, `INVALID_DATE_RANGE` propagates from entity, `PRODUCT_COST_SCOPE_LOCKED` raised when input attempts scope change, `changedFields` populated in event payload.

- [ ] Commit: `feat(catalog): UpdateProductCost use case (C28, P6 Task 14)`

---

## Task 15: DeleteProductCost use case (C29)

`productCostRepository.findById` → `PRODUCT_COST_NOT_FOUND` if absent. `repo.delete(id, tx)` (FK CASCADE removes child rows automatically per iter 42 schema). Emit `ProductCostDeletedEvent`.

Tests: happy path, missing, FK cascade verified (post-delete `SELECT COUNT(*) FROM catalog.product_cost_options WHERE product_cost_id = ?` returns 0).

- [ ] Commit: `feat(catalog): DeleteProductCost use case (C29, P6 Task 15)`

---

## Task 16: ProductProjector

**Files:**
- Create: `packages/api/typescript/src/catalog/projections/projectors/ProductProjector.ts`
- Create: `packages/api/typescript/src/catalog/projections/projectors/ProductProjector.test.ts`
- Modify: `packages/api/typescript/src/catalog/index.ts` (`BoundedContext.create({ ..., projectors: { ProductProjector } })`)
- Modify: `packages/api/typescript/src/catalog/registry.ts` (no binding — projector is `@injectable()` and resolved by container; verify via `core/src/types/BoundedContext.ts` line 86)

**Skills:** /projector
**Depends on:** Task 11

```typescript
import { injectable } from 'tsyringe-neo'
import { Projector, type Transaction } from '@template/core-typescript'
import { ProductProjection, type ProductProjectionEvent } from '@catalog/projections/ProductProjection'
import { ProductProjectionRepository } from '@catalog/projections/ProductProjectionRepository'

@injectable()
export class ProductProjector extends Projector<ProductProjectionEvent> {
  constructor(private repo: ProductProjectionRepository) { super() }

  readonly events = [
    'integration.shared.product.updated',
    'catalog.product_tag.added',
    'catalog.product_tag.removed',
  ] as const

  async handle(event: ProductProjectionEvent, tx?: Transaction): Promise<void> {
    switch (event.name) {
      case 'integration.shared.product.updated': {
        // Go already UPSERTed the row. Our job is to keep any TS-only
        // derived state in sync (none today — tags are mutated only by
        // catalog.product_tag.* events) OR to no-op if nothing to do.
        // We still no-op explicitly so the projector is registered to
        // the event for observability + future read-cache invalidation.
        return
      }
      case 'catalog.product_tag.added':
      case 'catalog.product_tag.removed': {
        const proj = await this.repo.findByKey(event.payload.productId, tx)
        if (!proj) return // replay-safe no-op
        proj.applyEvent(event)
        await this.repo.updateTags(proj.props.id, proj.props.tags, tx)
        return
      }
      default: { const _: never = event; throw new Error(`Unhandled ${(_ as any).name}`) }
    }
  }
}
```

- [ ] **Step 1: Test** — integration TestBed:
  1. Seed a `catalog.products` row directly via `db.insert(products).values({...})` (simulating Go).
  2. Dispatch `ProductTagAddedEvent('foo')` → row's `tags` JSONB contains 'foo'.
  3. Dispatch again → still one 'foo' (idempotent).
  4. Dispatch `ProductTagRemovedEvent('foo')` → row's `tags` is `[]`.
  5. Dispatch `integration.shared.product.updated` → no error, no observable mutation (this is the documented no-op path).
- [ ] Commit: `feat(catalog): ProductProjector (P6 Task 16)`

---

## Task 17: VariantProjector

Mirror Task 16 against `VariantProjection`. Event union: `VariantUpdatedEvent` only — the projector no-ops on the event today (Go owns the canonical write), but registers for it so the event is observable on the InternalMediator + ExternalMediator. Test asserts no error on dispatch.

- [ ] Commit: `feat(catalog): VariantProjector (P6 Task 17)`

---

## Task 18: BulkImportProductCostsFromCsv (C30) + CSV parser service

**Files:**
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser.ts` (pure parser — `papaparse` wrapper; throws `CSV_PARSE_ERROR` with row metadata on malformed input)
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser.test.ts`
- Create: `packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.ts`
- Create: `packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.test.ts`
- Modify: `packages/api/typescript/package.json` — add `papaparse` + `@types/papaparse` if absent (`bun add papaparse @types/papaparse` from `packages/api/typescript/`)
- Modify: `packages/api/typescript/src/catalog/services/index.ts`

**Skills:** /service /usecase
**Depends on:** Task 13, Task 14

Per spec §7.5 C30. CSV column contract (proposed — confirm with backend-old reference if disagreement; see Open Question 2):

| Column | Type | Required |
|---|---|---|
| `productExternalId` | string | yes |
| `variantExternalIds` | string (\| separated) | conditional (required when `type=MULTIPLE`) |
| `type` | `SINGLE` \| `MULTIPLE` | yes |
| `currency` | ISO 4217 | yes |
| `country` | ISO 3166 alpha-2 | no |
| `startDate` | YYYY-MM-DD | yes |
| `endDate` | YYYY-MM-DD | no |
| `quantity` | integer | yes |
| `quantityModifier` | `EQ` \| `GT` \| `GTE` \| `LT` \| `LTE` | yes |
| `unitCostCents` | bigint | yes |
| `unitCostCurrency` | ISO 4217 | yes |
| `itemShippingCents` | bigint | yes |
| `optionShippingCents` | bigint | yes |

Algorithm (streaming, single UoW per spec C30):
1. `parser.parse(input.csvContent)` — throws `CSV_PARSE_ERROR` on syntactic failure (carries `rowNumber` if mid-stream).
2. Group rows by `(productExternalId, type, currency, country, startDate, endDate)` — each group is one `ProductCostOption` with N `items`.
3. **Per (productExternalId, type)**: resolve to canonical via `ProductProjectionRepository.findByPlatformExternalId`. If absent, emit `CsvImportRowResult { rowNumber, status: 'ERROR', errorMessage: 'PRODUCT_NOT_FOUND' }` for every row in that group and skip.
4. Look up existing `ProductCost` via `findByScope(storeId, productId)`. If exists → call `UpdateProductCost` internally (within same UoW, no new HTTP); if not → call `CreateProductCost`.
5. If `input.dryRun === true`: perform validation only and rollback the transaction (per spec — return totals without commit; emit zero events).
6. Aggregate `CsvImportRowResult[]` per spec §7.0 (`{ rowNumber, status: 'CREATED'|'UPDATED'|'SKIPPED'|'ERROR', errorMessage? }`).

Tests:
- 3-row happy CSV (one new + one update + one skip-because-duplicate-row) → status counts match.
- Malformed CSV → throws `CSV_PARSE_ERROR` at the use-case boundary.
- `dryRun=true` → returns `CsvImportRowResult[]` with the same statuses but `productCostRepository.listByStoreIds` post-call returns empty (assert rollback).
- Row-level ERROR (e.g. `productExternalId` doesn't map to a canonical product) → that row marked `ERROR`, other rows still committed.

- [ ] Commit: `feat(catalog): BulkImportProductCostsFromCsv with streaming parser (C30, P6 Task 18)`

---

## Task 19: AddProductTag use case (C31)

**Files:** `catalog/usecases/AddProductTag.{ts,test.ts}`
**Skills:** /usecase
**Depends on:** Task 6, Task 11

Per spec §7.5 C31:
1. `ProductProjectionRepository.findByKey(productId)` → throw `PRODUCT_NOT_FOUND` if missing.
2. `tag.length > 50` → throw `TAG_TOO_LONG` (placeholder threshold — see Open Question 3).
3. **Idempotent — only emit on actual change**: if `proj.props.tags.includes(tag)`, return `{ ok: true, changed: false }` (no event, no projection mutation).
4. Emit `ProductTagAddedEvent({ productId, storeId, tag, userId })` only when tag is new. The projector (Task 16) writes the JSONB.

This is the canonical exception in §4 BC5: a TS-side write-side use case mutates a Go-owned projection. The convergence safety analysis (Open Question 4) shows tag mutations + Go's broader UPSERT touch disjoint columns, so order doesn't matter.

Tests: happy add, duplicate → no event emitted (assert via mock spy on `domainEventRepository.save`), missing product, tag-too-long.

- [ ] Commit: `feat(catalog): AddProductTag (C31, P6 Task 19)`

---

## Task 20: RemoveProductTag use case (C32)

Mirror Task 19. No `TAG_TOO_LONG` check. Emit on actual change only. `findByKey` → `PRODUCT_NOT_FOUND`. Idempotent when tag absent.

- [ ] Commit: `feat(catalog): RemoveProductTag (C32, P6 Task 20)`

---

## Task 21: ListProducts query (T16)

**Files:**
- Create: `packages/api/typescript/src/catalog/usecases/queries/ListProducts.ts`
- Create: `packages/api/typescript/src/catalog/usecases/queries/ListProducts.test.ts`

**Skills:** /query
**Depends on:** Task 11

Spec §7.5 T16. BFF read pattern — query directly against `catalog.products` + variant count subquery (`(SELECT COUNT(*) FROM catalog.variants v WHERE v.product_id = p.id) AS variant_count`). Filters: `storeIds[]` (required, multistore), optional `storeIntegrationIds[]`, `search` (ILIKE on `title` + `handle`), `tags[]` (`tags @> ?::jsonb`), `productType`, `status`. Paginated via `z.paginatedQuery({...})`.

Map result to spec Output shape (lines 2933–2950 in spec). `platform` is already on the `catalog.products` row — no cross-context join needed.

- [ ] Commit: `feat(catalog): ListProducts query (T16, P6 Task 21)`

---

## Task 22: GetProductDetail query (T17)

Spec §7.5 T17. Single product fetch + `variants[]` (from `catalog.variants WHERE product_id = ?`) + `productCosts[]` (from `productCostRepository.listByProductId(productId)`) + `campaignBindings[]` (cross-context read from P7-MARKETING; if P7 not landed, return `[]` and add `// TODO(P7-MARKETING): join CampaignProductBinding when available` — see Open Question 5).

Errors: `PRODUCT_NOT_FOUND`.

- [ ] Commit: `feat(catalog): GetProductDetail query (T17, P6 Task 22)`

---

## Task 23: ListProductCosts query (T18)

Spec §7.5 T18. Filters per spec input; `effectiveOnDate` overlap is computed at the SQL level against `product_cost_options.start_date..end_date` (`start_date <= :date AND (end_date IS NULL OR end_date >= :date)`). Multistore. Returns parent + nested options[] + items[] JSONB.

- [ ] Commit: `feat(catalog): ListProductCosts query (T18, P6 Task 23)`

---

## Task 24: ListProductTags query (T19)

Spec §7.5 T19. `SELECT tag, COUNT(*) AS usage_count FROM (SELECT jsonb_array_elements_text(tags) AS tag, store_id FROM catalog.products WHERE store_id = ANY(?)) GROUP BY tag ORDER BY usage_count DESC`. Use `ProductProjectionRepository.listTagsAggregated`.

- [ ] Commit: `feat(catalog): ListProductTags query (T19, P6 Task 24)`

---

## Task 25: Controllers + SDK regeneration — **Contract Lock**

**Files:**
- Create: `packages/api/typescript/src/catalog/controllers/CreateProductCost.ts` (POST `/product-costs`) — C27
- Create: `packages/api/typescript/src/catalog/controllers/UpdateProductCost.ts` (PATCH `/product-costs/:productCostId`) — C28
- Create: `packages/api/typescript/src/catalog/controllers/DeleteProductCost.ts` (DELETE `/product-costs/:productCostId`) — C29
- Create: `packages/api/typescript/src/catalog/controllers/BulkImportProductCostsFromCsv.ts` (POST `/product-costs/import`) — C30
- Create: `packages/api/typescript/src/catalog/controllers/AddProductTag.ts` (POST `/products/:productId/tags`) — C31
- Create: `packages/api/typescript/src/catalog/controllers/RemoveProductTag.ts` (DELETE `/products/:productId/tags/:tag`) — C32
- Create: `packages/api/typescript/src/catalog/controllers/ListProducts.ts` (GET `/products`) — T16
- Create: `packages/api/typescript/src/catalog/controllers/GetProductDetail.ts` (GET `/products/:productId`) — T17
- Create: `packages/api/typescript/src/catalog/controllers/ListProductCosts.ts` (GET `/product-costs`) — T18
- Create: `packages/api/typescript/src/catalog/controllers/ListProductTags.ts` (GET `/product-tags`) — T19
- Modify: `packages/api/typescript/src/catalog/controllers/index.ts`
- Regenerate: SDK via `bun sdk` (writes to `packages/client/`)
- Commit: regenerated OpenAPI JSON + `packages/client/` artifacts in a **separate** commit

**Skills:** /controller /schema /sdk
**Reviewer:** spec-compliance-reviewer **must** verify every Input/Output/Errors literal in spec §7.5 maps 1:1 to the Zod schemas. This is the contract-lock for downstream consumers (PE-E2E, app-react).

Per `core/src/types/Controller.ts:24` — schemas need `.example([{...}])` envelopes so the OpenAPI generator can populate mock data. Ctx envelope: pick `user.id` (from P1-IDENTITY auth middleware). Pagination via `z.paginatedQuery({...})` for list endpoints. Auth + tenancy middlewares come from P1/P2 and stack via `middlewares: [AuthMiddleware, TenantOwnershipMiddleware]`.

- [ ] **Step 1: Test** — one colocated controller test per command verifies status codes (201 for C27 + C30, 204 for C28/C29/C31/C32, 200 for reads) + that the response body matches the OpenAPI example. Use TestBed `integration` + supertest-style request execution.
- [ ] **Step 3: Implement** all 10 controllers.
- [ ] **Step 4: Verify + Contract Lock** — `bun tsc && bun lint && bun run test && bun sdk` — all green.
- [ ] **Step 5: Commit** (two commits)
  - `feat(catalog): controllers — 6 commands + 4 reads (P6 Task 25)`
  - `chore(sdk): regenerate after catalog controllers (P6 Task 25 SDK)`

---

## Task 26: external.ts handler (StoreIntegrationDataWipeRequested cascade) + Final Validation

**Files:**
- Modify: `packages/api/typescript/src/catalog/handlers/external.ts` — export `StoreIntegrationDataWipeHandler` so `BoundedContext.create` registers it on `ExternalMediator`.
- Create: `packages/api/typescript/src/catalog/handlers/StoreIntegrationDataWipeHandler.ts`
- Create: `packages/api/typescript/src/catalog/handlers/StoreIntegrationDataWipeHandler.test.ts`
- Modify: `.plans/2026-05-21-bk-dash-port.progress.md` — log P6-CATALOG completion.

**Skills:** /handler
**Depends on:** Task 11, Task 12, Task 25 (after Contract Lock so SDK shape is frozen)

Per spec §4 BC5 IntegrationEventsConsumed + §7.13:

```typescript
import { injectable } from 'tsyringe-neo'
import { EventHandler, type Transaction } from '@template/core-typescript'
import { StoreIntegrationDataWipeRequestedEvent } from '@template/contracts-typescript/wire/events' // confirm exact import path
import { ProductProjectionRepository } from '@catalog/projections/ProductProjectionRepository'
import { VariantProjectionRepository } from '@catalog/projections/VariantProjectionRepository'

@injectable()
export class StoreIntegrationDataWipeHandler extends EventHandler<StoreIntegrationDataWipeRequestedEvent> {
  static override readonly event = StoreIntegrationDataWipeRequestedEvent.name
  constructor(
    private productRepo: ProductProjectionRepository,
    private variantRepo: VariantProjectionRepository,
    // ProductCostRepository INTENTIONALLY NOT INJECTED — merchant aggregate preserved per spec §4 BC5.
  ) { super() }

  async handle(event: StoreIntegrationDataWipeRequestedEvent, tx?: Transaction): Promise<void> {
    await this.variantRepo.deleteByStoreIntegrationId(event.payload.storeIntegrationId, tx)
    await this.productRepo.deleteByStoreIntegrationId(event.payload.storeIntegrationId, tx)
    // Product costs intentionally preserved — merchant data survives reconnects.
  }
}
```

Test (integration TestBed):
- Seed 2 products + 4 variants + 2 product costs via given helpers (`givenProductProjection`, `givenVariantProjection`, `givenProductCost` — Task 13 added the last one).
- Dispatch `StoreIntegrationDataWipeRequestedEvent` for the relevant `storeIntegrationId`.
- Assert: 0 products + 0 variants + **2 product costs remain** (the spec preservation guarantee).
- Assert: products/variants for a *different* `storeIntegrationId` are untouched.

### Final Validation (run inside Task 26 after the handler is green)

- [ ] `bun tsc 2>&1 | tail -5` → 0 errors
- [ ] `bun lint 2>&1 | tail -5` → 0 errors
- [ ] `bun run test 2>&1 | tail -5` → all green, 0 skipped in `packages/api/typescript/src/catalog/**`
- [ ] `bun sdk` → no diff
- [ ] `git log --oneline | grep "P6 Task"` → 26 commits (Tasks 1–26; Task 25 has the extra SDK regen commit so total ≥ 27)
- [ ] Append one-line summary to `.plans/2026-05-21-bk-dash-port.progress.md`.

### AC Mapping (spec §7.5 → test path)

| Spec ID | Description | Test path |
|---|---|---|
| T16 | ProductsList read | `packages/api/typescript/src/catalog/usecases/queries/ListProducts.test.ts` |
| T17 | ProductDetail read | `packages/api/typescript/src/catalog/usecases/queries/GetProductDetail.test.ts` |
| T18 | ProductCostsList read (incl. `effectiveOnDate` overlap) | `packages/api/typescript/src/catalog/usecases/queries/ListProductCosts.test.ts` |
| T19 | ProductTagsList read (aggregated) | `packages/api/typescript/src/catalog/usecases/queries/ListProductTags.test.ts` |
| C27 | CreateProductCost (STORE_INTEGRATION_NOT_FOUND / PRODUCT_NOT_FOUND / VARIANT_NOT_FOUND / DUPLICATE_PRODUCT_COST_SCOPE / INVALID_DATE_RANGE) | `packages/api/typescript/src/catalog/usecases/CreateProductCost.test.ts` |
| C28 | UpdateProductCost (PRODUCT_COST_NOT_FOUND / PRODUCT_COST_SCOPE_LOCKED / INVALID_DATE_RANGE / changedFields) | `packages/api/typescript/src/catalog/usecases/UpdateProductCost.test.ts` |
| C29 | DeleteProductCost (PRODUCT_COST_NOT_FOUND + FK cascade) | `packages/api/typescript/src/catalog/usecases/DeleteProductCost.test.ts` |
| C30 | BulkImportProductCostsFromCsv (CSV_PARSE_ERROR / dryRun rollback / per-row CsvImportRowResult) | `packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.test.ts` |
| C31 | AddProductTag (PRODUCT_NOT_FOUND / TAG_TOO_LONG / idempotency) | `packages/api/typescript/src/catalog/usecases/AddProductTag.test.ts` |
| C32 | RemoveProductTag (PRODUCT_NOT_FOUND / idempotency) | `packages/api/typescript/src/catalog/usecases/RemoveProductTag.test.ts` |
| §4 BC5 inbound `integration.shared.product.updated` registered on ExternalMediator → projector observable | `packages/api/typescript/src/catalog/projections/projectors/ProductProjector.test.ts` |
| §4 BC5 inbound `integration.shared.variant.updated` registered on ExternalMediator | `packages/api/typescript/src/catalog/projections/projectors/VariantProjector.test.ts` |
| §4 BC5 outbound `ProductCostCreated/Updated/Deleted` emitted | covered by C27/C28/C29 use-case tests (assert `domainEventRepository.save` called) |
| §4 BC5 outbound `ProductTagAdded/Removed` emitted only on change | C31/C32 use-case tests (assert no-event branch on duplicate add / absent remove) |
| §4 BC5 inbound `StoreIntegrationDataWipeRequested` → cascade delete canonical, preserve merchant | `packages/api/typescript/src/catalog/handlers/StoreIntegrationDataWipeHandler.test.ts` |

- [ ] Commit: `feat(catalog): cascade-delete canonical on StoreIntegrationDataWipeRequested + final validation (P6 Task 26)`

---

## Dependency Footer

**Upstream sub-plans (must be complete before P6 build starts):**

1. **Iter 41 (contracts/wire/)** — already authored:
   - `wire/enums/product-status.tsp` (ACTIVE / ARCHIVED / DRAFT)
   - `wire/enums/product-cost-type.tsp` (SINGLE / MULTIPLE)
   - `wire/enums/quantity-modifier.tsp` (EQ / GT / GTE / LT / LTE)
   - `wire/enums/sales-platform.tsp` + `currency-code.tsp` (referenced for store integration linkage)
   - `wire/events/product-updated.tsp` (`integration.shared.product.updated`)
   - `wire/events/variant-updated.tsp` (`integration.shared.variant.updated`)
   - Generated TS bindings under `packages/contracts/generated/typescript/wire/` consumed by this BC.
2. **Iter 42 (contracts/db/schema/catalog.ts)** — already authored:
   - `catalog.products` (21 columns, 4 indexes, unique on `(platform, externalId)`)
   - `catalog.variants` (23 columns, 4 indexes, unique on `(platform, externalId)`)
   - `catalog.product_costs` (7 columns, unique on `(storeId, productId)`)
   - `catalog.product_cost_options` (with FK CASCADE on `productCostId`, `items` JSONB)
3. **PG-GO-WORKER** — Go BCs supply `integration.shared.product.updated` + `integration.shared.variant.updated` from `packages/api/go/internal/sync/` after canonical UPSERT. Per master plan iter 39 caveat, per-provider pipelines are deferred — this sub-plan's Tasks 16/17 assume the Go side emits the event with the agreed shape, but tests dispatch the event class directly via the local mediator harness (per user memory: `givenEvent` is for cross-process boundaries; here we use `ExternalMediator.publish` directly).
4. **P1-IDENTITY** — `userId` (auth context) for command audit (`ProductTagAdded/Removed.payload.userId`) and controller `ctx` envelope.
5. **P2-TENANCY** — `Store` entity + `StoreMembership` for ownership-guard middleware reused by every catalog controller; `storeIds[]` filter in queries (Tasks 21–24).
6. **P4-INTEGRATION** — `StoreIntegration` entity + repository for C27 validation; **publisher** of `StoreIntegrationDataWipeRequestedEvent` consumed by Task 26.

**Downstream sub-plans that depend on P6-CATALOG:**

- **P6-SALES** (master-plan ID P6) — needs `ProductProjection` / `VariantProjection` reads for `Order.lines` enrichment (linking `productExternalId` → `productId`).
- **P7-MARKETING** — `CampaignProductBinding` references `productIds[]` and `variantIds[]`.
- **P11-ANALYTICS** — reads `ProductCost` for margin computation, reads `ProductProjection.tags` for cohort filtering.
- **PE-E2E** — full webhook-ingest → product-projected → product-cost-created → analytics-margin flow.

---

## Notes for /build

- The TS BC home is `packages/api/typescript/src/catalog/` — **not** `packages/api/src/catalog/`. Every path in this plan reflects the polyglot iter-39 rebase.
- Framework primitives import from `@template/core-typescript` (mediator, outbox, UnitOfWork, BaseEntity, Handler, Controller, Projector, z, GlobalErrorMapper). Contracts import from `@template/contracts/{wire,db}` — **verify the exact published name** via `cat packages/contracts/package.json` before the first import.
- The Drizzle catalog schema (`packages/contracts/db/schema/catalog.ts`) is **already authored and migration-generated** in iter 42. No `bun migrate:create` runs in this plan; if PGlite TestBed shows the tables missing, fix the migration pipeline upstream, not here.
- All projector tests use the integration TestBed harness; **never** seed `shared.events` to test the projector — instantiate the integration event class and call `projector.handle(event)` directly (per user memory: "givenEvent is for cross-process boundaries").
- The CSV import (Task 18) is the only `service`-citizen in this plan — keep the parser pure (no DB, no DI) so it can be unit-tested without TestBed.
- If `papaparse` is absent in `packages/api/typescript/package.json`, add it via Task 18 Step 0 (`cd packages/api/typescript && bun add papaparse @types/papaparse`); commit separately as `chore(api): add papaparse for CSV import (P6 Task 18 deps)`.
- **`product_cost_options` is a real child table** (iter 42 decision) — NOT a JSONB array on the parent. The repository (Task 10) replaces child rows via DELETE-then-INSERT inside the FK-cascade window. The `items[]` *within* each option row stays JSONB (atomically read as a document).
- **ProductTag mutations vs. Go canonical writes** — both touch the `catalog.products` row but on disjoint columns (`tags` JSONB vs. everything else). Concurrent writes converge. Document this in code comments and verify in Task 16's interleaved test.

---

## Open Questions

# QUESTION: 1 — **HashedID via P1-IDENTITY constant.** The Ralph prompt mentioned this in iter 39's brief. Iter 42 schema uses `uuid` for PKs; the Go side writes deterministic UUIDv5(platform, externalId) per the spec idempotency rule. Resolution: this sub-plan keeps `id: z.string()` (UUID v5 string) on projection schemas and assumes the Go side computes them. If P1-IDENTITY introduces a `HashedID` VO with helper `HashedID.from(platform, externalId)`, wrap projection PKs in Tasks 11/12 and update fixtures.

# QUESTION: 2 — **CSV column format.** Spec §7.5 C30 does not specify columns. The table in Task 18 is inferred from the spec's `ProductCostOptionInput` shape (§7.0). Confirm against backend-old if a reference CSV exists; otherwise lock these columns by writing the example fixture in Task 18's test.

# QUESTION: 3 — **`TAG_TOO_LONG` threshold.** Spec §7.14 names the error but no length cap. Task 19 uses 50 as a placeholder; confirm with product owner or check backend-old defaults.

# QUESTION: 4 — **Race between Go's `product.updated` UPSERT and TS's `product_tag.added`.** Both touch the `catalog.products` row. Go writes the broader column set via UPSERT; TS writes only `tags` via the narrow `updateTags(...)` atomic op. The narrow update + DB row-level locking ensures convergence regardless of arrival order. Verify in Task 16's interleaved-dispatch test.

# QUESTION: 5 — **`campaignBindings[]` on T17.** Cross-context read from Marketing (P7). If P7 is not landed before P6-CATALOG, Task 22 returns `[]` with a TODO comment. Confirm this ordering is acceptable; if not, defer Task 22's `campaignBindings` field until P7 lands.

# QUESTION: 6 — **`integration.shared.store_integration.data_wipe_requested` exact name.** The event is referenced but not yet authored in `packages/contracts/wire/events/`. Task 26 cannot land until P4-INTEGRATION authors that TypeSpec event AND the generated TS class. Block Task 26 on P4's emit, or stub the consumer (return early on missing event class) and re-enable when P4 ships.

---

*End of P6-CATALOG sub-plan.*
