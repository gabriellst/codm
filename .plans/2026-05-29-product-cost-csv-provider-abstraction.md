# ProductCost CSV Import — Provider Abstraction (MANUAL + SHOPIFY) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Let a store operator bulk-import product costs from either the bespoke MANUAL CSV or a Shopify product export, choosing the provider explicitly, with one bulk write and typed per-row error codes.

**Architecture:** A `ProductCostCsvParser` facade (DI port) routes on a `ProductCostCsvProvider` enum to a per-provider Parser (papaparse → canonical `ParsedProductCostRow[]`) + Processor (resolve identity + group → `ProductCostBuildInput[]`). The `BulkImportProductCostsFromCsv` use case persists the builds via a new `ProductCostRepository.saveMany` + `DomainEventRepository.saveMany` in one transaction. Shopify identity is resolved by `handle` + `variants.title` (the `option1/2/3` join the Go sync writes) via a new bulk `ProductQueryService.resolveProductsWithVariantsByHandles`. Row failures are typed `CatalogCsvImportErrors` codes (the `/errors` vocabulary), surfaced as partial-success data.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, Zod, papaparse

**Spec:** .specs/2026-05-29-product-cost-csv-provider-abstraction-design.md
**Tasks:** 6
**Estimated minutes:** 255

---

## Task T1: Define the provider enum + CSV import-error vocabulary

**Files to write:**
- Create: `packages/api/typescript/src/catalog/enums/ProductCostCsvProvider.ts`
- Create: `packages/api/typescript/src/catalog/enums/index.ts`
- Modify: `packages/api/typescript/src/catalog/errors/index.ts` — add `CatalogCsvImportErrors` union + register codes
- Modify: `packages/api/typescript/src/shared/index.ts` — register the local enum for a clean SDK `$ref`

**Files to read:**
- `packages/api/typescript/src/billing/errors/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /errors
**Depends on:** (none)

### Step T1.1 — Create the provider enum

```typescript
// packages/api/typescript/src/catalog/enums/ProductCostCsvProvider.ts
// Provider format for a ProductCost CSV import. NOT a contracts wire enum —
// it never crosses a service boundary; it's consumed only by the catalog
// controller + use case (and surfaced to the SDK via the controller schema).
export enum ProductCostCsvProvider {
	MANUAL = 'MANUAL',
	SHOPIFY = 'SHOPIFY',
}
```

### Step T1.2 — Barrel-export the enum

```typescript
// packages/api/typescript/src/catalog/enums/index.ts
export { ProductCostCsvProvider } from './ProductCostCsvProvider'
```

### Step T1.3 — Add the typed import-error vocabulary

Modify `packages/api/typescript/src/catalog/errors/index.ts`:

Add the CSV-import union and fold it into `CatalogApplicationErrors` (so it flows into `ApplicationErrors` → `Errors`), then register the codes. Type aliases are order-independent, so the union can be declared right after the `CatalogApplicationErrors` block:

```typescript
// ─── CSV Import Errors ────────────────────────────────────────────────────────
// Per-row failure codes for BulkImportProductCostsFromCsv. Collected into the
// command's partial-success `errors[]` (typed, never a loose message); the few
// fatal codes (CSV_EMPTY / CSV_MISSING_REQUIRED_COLUMN) are returned as a row-0
// entry. Registered BAD_REQUEST so any future throw resolves correctly.
export type CatalogCsvImportErrors =
	| 'CSV_EMPTY'
	| 'CSV_MISSING_REQUIRED_COLUMN'
	| 'CSV_INVALID_PRODUCT_ID'
	| 'CSV_INVALID_CURRENCY'
	| 'CSV_INVALID_COUNTRY'
	| 'CSV_INVALID_START_DATE'
	| 'CSV_INVALID_END_DATE'
	| 'CSV_VARIANT_IDS_REQUIRED'
	| 'CSV_INVALID_VARIANT_ID'
	| 'CSV_INVALID_QUANTITY'
	| 'CSV_INVALID_QUANTITY_MODIFIER'
	| 'CSV_INVALID_UNIT_COST'
	| 'CSV_INVALID_SHIPPING'
	| 'CSV_INVALID_COST_TYPE'
	| 'CSV_INVALID_COST'
	| 'CSV_DISPLAY_NAME_TOO_LONG'
	| 'CSV_MISSING_HANDLE'
	| 'CSV_UNKNOWN_HANDLE'
	| 'CSV_BLANK_VARIANT_NAME'
	| 'CSV_UNRESOLVED_VARIANT'
	| 'CSV_ROW_INVALID'
```

Fold it into the existing `CatalogApplicationErrors` union:

```diff
 export type CatalogApplicationErrors =
 	| 'PRODUCT_NOT_FOUND'
 	| 'PRODUCT_VARIANT_NOT_FOUND'
 	| 'PRODUCT_COST_NOT_FOUND'
 	/** The referenced StoreIntegration does not exist or belongs to a different Store. */
 	| 'STORE_INTEGRATION_NOT_FOUND'
+	| CatalogCsvImportErrors
```

Inside the existing `registerErrorCodes({ … })` call, append (after the Application block):

```typescript
	// CSV import — per-row + fatal failure codes (BAD_REQUEST)
	CSV_EMPTY: HttpStatusCode.BAD_REQUEST,
	CSV_MISSING_REQUIRED_COLUMN: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_PRODUCT_ID: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_CURRENCY: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_COUNTRY: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_START_DATE: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_END_DATE: HttpStatusCode.BAD_REQUEST,
	CSV_VARIANT_IDS_REQUIRED: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_VARIANT_ID: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_QUANTITY: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_QUANTITY_MODIFIER: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_UNIT_COST: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_SHIPPING: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_COST_TYPE: HttpStatusCode.BAD_REQUEST,
	CSV_INVALID_COST: HttpStatusCode.BAD_REQUEST,
	CSV_DISPLAY_NAME_TOO_LONG: HttpStatusCode.BAD_REQUEST,
	CSV_MISSING_HANDLE: HttpStatusCode.BAD_REQUEST,
	CSV_UNKNOWN_HANDLE: HttpStatusCode.BAD_REQUEST,
	CSV_BLANK_VARIANT_NAME: HttpStatusCode.BAD_REQUEST,
	CSV_UNRESOLVED_VARIANT: HttpStatusCode.BAD_REQUEST,
	CSV_ROW_INVALID: HttpStatusCode.BAD_REQUEST,
```

(The catalog `registry.ts` already value-imports `./errors`, so these register at load — no extra wiring.)

### Step T1.4 — Register the enum for OpenAPI `$ref` naming

Modify `packages/api/typescript/src/shared/index.ts`:

```diff
 import * as wireEnums from '@bk-dash/contracts-typescript/wire/enums'
+import { ProductCostCsvProvider } from '@catalog/enums'
```

```diff
-openapi.registerEnums(wireEnums)
+openapi.registerEnums({ ...wireEnums, ProductCostCsvProvider })
```

### Step T1.5 — Type-check

Run: `bun tsc`
Expected: 0 errors.

### Step T1.6 — Commit

```bash
git add packages/api/typescript/src/catalog/enums packages/api/typescript/src/catalog/errors/index.ts packages/api/typescript/src/shared/index.ts
git commit -m "feat(catalog): ProductCostCsvProvider enum + CSV import-error vocabulary (Task T1)"
```

---

## Task T2: Repository persists many ProductCosts in one write

**Files to write:**
- Modify: `packages/api/typescript/src/catalog/repositories/ProductCostRepository/ProductCostRepository.ts` — add abstract `saveMany`
- Modify: `packages/api/typescript/src/catalog/repositories/ProductCostRepository/DrizzleProductCostRepository.ts` — multi-row upsert
- Modify: `packages/api/typescript/src/catalog/repositories/ProductCostRepository/MockProductCostRepository.ts` — loop set
- Test: `packages/api/typescript/src/catalog/repositories/ProductCostRepository/DrizzleProductCostRepository.test.ts` — add a batch case

**Files to read:**
- `packages/api/typescript/src/catalog/repositories/ProductCostRepository/DrizzleProductCostRepository.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /test
**Depends on:** (none)

### Step T2.1 — Write the failing test

Add this case to `DrizzleProductCostRepository.test.ts` (inside the existing `describe`, reuse its `build()` helper, `STORE_A`, `STORE_INTEGRATION_A`, `PRODUCT_A`, `PRODUCT_B`):

```typescript
	it('saveMany inserts new rows and upserts existing ones in one batch', async () => {
		// Seed one existing aggregate.
		const existing = build({ productId: PRODUCT_A, displayName: 'before' })
		await repo.save(existing)
		const versionBefore = existing.version

		// Mutate the existing one + create a brand-new one.
		existing.update({ displayName: 'after' })
		const fresh = build({ productId: PRODUCT_B })

		const saved = await repo.saveMany([existing, fresh])
		expect(saved).toHaveLength(2)

		const a = await repo.findByStoreAndProduct(STORE_A, PRODUCT_A)
		const b = await repo.findByStoreAndProduct(STORE_A, PRODUCT_B)
		expect(a?.displayName).toBe('after')
		expect(a?.version).toBe(versionBefore + 1) // incremented by saveMany
		expect(b).not.toBeUndefined()
		expect(b?.productId?.value).toBe(PRODUCT_B)
	})

	it('saveMany with an empty array is a no-op', async () => {
		const saved = await repo.saveMany([])
		expect(saved).toEqual([])
	})
```

### Step T2.2 — Run test to verify it fails

Run: `bun test packages/api/typescript/src/catalog/repositories/ProductCostRepository/DrizzleProductCostRepository.test.ts`
Expected: FAIL — `repo.saveMany is not a function`.

### Step T2.3 — Add `saveMany` to the port

Modify `ProductCostRepository.ts` — add to the abstract class, after `findById`:

```typescript
	/**
	 * Bulk insert-or-update. One multi-row INSERT … ON CONFLICT (id) DO UPDATE.
	 * Backs BulkImportProductCostsFromCsv so an N-row import is a single write
	 * instead of N round-trips. Increments each entity's version. Order preserved.
	 */
	abstract saveMany(entities: ProductCost[], tx?: Transaction): Promise<ProductCost[]>
```

Confirm `Transaction` is imported at the top of the port (it is used by the sibling methods).

### Step T2.4 — Implement in Drizzle

Modify `DrizzleProductCostRepository.ts` — add after `save`. (`sql` is already imported.)

```typescript
	async saveMany(entities: ProductCost[], tx?: DrizzleClient): Promise<ProductCost[]> {
		if (entities.length === 0) return []
		for (const entity of entities) entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = entities.map(e => this.toPersistence(e))
			await dbc
				.insert(productCosts)
				.values(data)
				.onConflictDoUpdate({
					target: productCosts.id,
					// Multi-row upsert: the SET clause must reference the incoming
					// row (`excluded.*`), not a single captured `data` object.
					set: {
						storeId: sql`excluded.store_id`,
						storeIntegrationId: sql`excluded.store_integration_id`,
						productId: sql`excluded.product_id`,
						costType: sql`excluded.cost_type`,
						displayName: sql`excluded.display_name`,
						options: sql`excluded.options`,
						deletedAt: sql`excluded.deleted_at`,
						updatedAt: new Date(),
						version: sql`excluded.version`,
					},
				})
			return entities
		})
		if (!result.success) throw result.error
		return result.data
	}
```

### Step T2.5 — Implement in Mock

Modify `MockProductCostRepository.ts` — add after `save`:

```typescript
	async saveMany(entities: ProductCost[], _tx?: Transaction): Promise<ProductCost[]> {
		for (const entity of entities) {
			entity.incrementVersion()
			this.rows.set(entity.id.value, entity)
		}
		return entities
	}
```

### Step T2.6 — Run test to verify it passes

Run: `bun test packages/api/typescript/src/catalog/repositories/ProductCostRepository/DrizzleProductCostRepository.test.ts`
Expected: PASS.

### Step T2.7 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T2.8 — Commit

```bash
git add packages/api/typescript/src/catalog/repositories/ProductCostRepository
git commit -m "feat(catalog): ProductCostRepository.saveMany bulk upsert (Task T2)"
```

---

## Task T3: Resolve Shopify handles → internal product/variant ids by variant title

**Files to write:**
- Modify: `packages/api/typescript/src/catalog/services/ProductQueryService/ProductQueryService.ts` — add resolver + Zod return shape
- Modify: `packages/api/typescript/src/catalog/services/ProductQueryService/DrizzleProductQueryService.ts` — impl
- Modify: `packages/api/typescript/src/catalog/services/ProductQueryService/MockProductQueryService.ts` — impl
- Modify: `packages/api/typescript/src/catalog/services/ProductQueryService/index.ts` — export type
- Test: `packages/api/typescript/src/catalog/services/ProductQueryService/DrizzleProductQueryService.test.ts` — add resolver case

**Files to read:**
- `packages/api/typescript/src/catalog/services/ProductQueryService/DrizzleProductQueryService.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /test
**Depends on:** (none)

### Step T3.1 — Write the failing test

Add to `DrizzleProductQueryService.test.ts`. First extend the existing contracts/db import to include `variants`:

```diff
-import { products, productOverrides } from '@bk-dash/contracts/db'
+import { products, productOverrides, variants } from '@bk-dash/contracts/db'
```

Reuse its `seedProduct` helper; add a `seedVariant` helper and a resolver case.

```typescript
	async function seedVariant(id: string, productId: string, externalId: string, title: string): Promise<void> {
		await db.insert(variants).values({
			id,
			productId,
			storeIntegrationId: '11111111-0001-4000-8000-000000000001',
			storeIntegrationExternalId: 'acme.myshopify.com',
			platform: 'SHOPIFY',
			externalId,
			productExternalId: 'prod-1',
			title,
			status: 'ACTIVE',
			externalCreatedAt: new Date('2026-01-01T00:00:00Z'),
		})
	}

	it('resolveProductsWithVariantsByHandles maps handle → product + variants by title', async () => {
		await seedProduct(PRODUCT_ID, 'prod-1')
		await seedVariant(Id.fromSeed('variant', 'SHOPIFY', 'v1').value, PRODUCT_ID, 'v1', 'Black / M')
		await seedVariant(Id.fromSeed('variant', 'SHOPIFY', 'v2').value, PRODUCT_ID, 'v2', 'Black / L')

		const result = await service.resolveProductsWithVariantsByHandles('11111111-0001-4000-8000-000000000001', ['product-prod-1'])
		expect(result).toHaveLength(1)
		expect(result[0]!.productId).toBe(PRODUCT_ID)
		expect(result[0]!.handle).toBe('product-prod-1')
		const titles = result[0]!.variants.map(v => v.title).sort()
		expect(titles).toEqual(['Black / L', 'Black / M'])
	})

	it('resolveProductsWithVariantsByHandles returns [] for unknown handles + [] input', async () => {
		expect(await service.resolveProductsWithVariantsByHandles('11111111-0001-4000-8000-000000000001', [])).toEqual([])
		expect(await service.resolveProductsWithVariantsByHandles('11111111-0001-4000-8000-000000000001', ['nope'])).toEqual([])
	})
```

### Step T3.2 — Run test to verify it fails

Run: `bun test packages/api/typescript/src/catalog/services/ProductQueryService/DrizzleProductQueryService.test.ts`
Expected: FAIL — `service.resolveProductsWithVariantsByHandles is not a function`.

### Step T3.3 — Add the port method + return shape

Modify `ProductQueryService.ts` — add the schema/type after `ProductQueryDTO`, and the abstract method:

```typescript
export const ResolvedProductWithVariantsSchema = z.object({
	handle: z.string(),
	productId: z.string().uuid(),
	variants: z.array(z.object({ title: z.string(), variantId: z.string().uuid() })),
})

export type ResolvedProductWithVariants = Z.infer<typeof ResolvedProductWithVariantsSchema>
```

```typescript
	/**
	 * Bulk-resolve catalog products + their variants by handle, scoped to a
	 * StoreIntegration. Backs the Shopify ProductCost CSV import: a row's
	 * (handle, composed option name) maps to (productId, variantId) where the
	 * composed name matches `variants.title`. Variants with a null title are
	 * omitted (unmatchable).
	 */
	abstract resolveProductsWithVariantsByHandles(storeIntegrationId: string, handles: string[]): Promise<ResolvedProductWithVariants[]>
```

### Step T3.4 — Implement in Drizzle

Modify `DrizzleProductQueryService.ts`. Add `and` to the drizzle-orm import and `variants` to the contracts/db import:

```diff
-import { eq, inArray } from 'drizzle-orm'
+import { and, eq, inArray } from 'drizzle-orm'
-import { products, productOverrides } from '@bk-dash/contracts/db'
+import { products, productOverrides, variants } from '@bk-dash/contracts/db'
```

```diff
-import { ProductQueryService, type ProductQueryDTO } from './ProductQueryService'
+import { ProductQueryService, type ProductQueryDTO, type ResolvedProductWithVariants } from './ProductQueryService'
```

Add the method to the class:

```typescript
	async resolveProductsWithVariantsByHandles(storeIntegrationId: string, handles: string[]): Promise<ResolvedProductWithVariants[]> {
		if (handles.length === 0) return []
		const prodRows = await this.db
			.select({ id: products.id, handle: products.handle })
			.from(products)
			.where(and(eq(products.storeIntegrationId, storeIntegrationId), inArray(products.handle, handles)))
		const resolvable = prodRows.filter((p): p is { id: string; handle: string } => p.handle !== null)
		if (resolvable.length === 0) return []

		const productIds = resolvable.map(p => p.id)
		const variantRows = await this.db
			.select({ productId: variants.productId, id: variants.id, title: variants.title })
			.from(variants)
			.where(and(eq(variants.storeIntegrationId, storeIntegrationId), inArray(variants.productId, productIds)))

		const byProduct = new Map<string, { title: string; variantId: string }[]>()
		for (const v of variantRows) {
			if (v.title === null) continue
			const list = byProduct.get(v.productId) ?? []
			list.push({ title: v.title, variantId: v.id })
			byProduct.set(v.productId, list)
		}

		return resolvable.map(p => ({ handle: p.handle, productId: p.id, variants: byProduct.get(p.id) ?? [] }))
	}
```

### Step T3.5 — Implement in Mock

Modify `MockProductQueryService.ts` — add a seed field + method:

```diff
-import { ProductQueryService, type ProductQueryDTO } from './ProductQueryService'
+import { ProductQueryService, type ProductQueryDTO, type ResolvedProductWithVariants } from './ProductQueryService'
```

```typescript
	/** Seed the rows the next resolveProductsWithVariantsByHandles call returns. */
	nextResolved: ResolvedProductWithVariants[] = []

	async resolveProductsWithVariantsByHandles(_storeIntegrationId: string, handles: string[]): Promise<ResolvedProductWithVariants[]> {
		return this.nextResolved.filter(p => handles.includes(p.handle))
	}
```

### Step T3.6 — Export the type

Modify `index.ts`:

```diff
-export { ProductQueryService, ProductQueryDTOSchema, type ProductQueryDTO } from './ProductQueryService'
+export { ProductQueryService, ProductQueryDTOSchema, type ProductQueryDTO, ResolvedProductWithVariantsSchema, type ResolvedProductWithVariants } from './ProductQueryService'
```

### Step T3.7 — Run test to verify it passes

Run: `bun test packages/api/typescript/src/catalog/services/ProductQueryService/DrizzleProductQueryService.test.ts`
Expected: PASS.

### Step T3.8 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T3.9 — Commit

```bash
git add packages/api/typescript/src/catalog/services/ProductQueryService
git commit -m "feat(catalog): ProductQueryService.resolveProductsWithVariantsByHandles (Task T3)"
```

---

## Task T4: Operator imports a MANUAL CSV end-to-end through the new abstraction

**Files to write:**
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/types.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/ProductCostCsvParser.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/BaseProductCostCsvParser.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/ManualProductCostCsvParser.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/processors/ManualProductCostCsvProcessor.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/DefaultProductCostCsvParser.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/MockProductCostCsvParser.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/index.ts`
- Modify: `packages/api/typescript/src/catalog/registry.ts` — bind `ProductCostCsvParser`
- Modify: `packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.ts` — DU input, facade, saveMany, typed errors
- Modify: `packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.test.ts` — provider + typed codes
- Modify: `packages/api/typescript/src/catalog/controllers/BulkImportProductCostsFromCsvController.ts` — body DU
- Test: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/ManualProductCostCsvParser.test.ts`
- Modify: `packages/api/typescript/package.json` — add `papaparse` + `@types/papaparse`

**Files to read:**
- `packages/api/typescript/src/catalog/entities/ProductCost.ts`
- `packages/api/typescript/src/integration/controllers/AuthorizeIntegrationController.ts`
- `packages/api/typescript/src/catalog/enums/index.ts`
- `packages/api/typescript/src/catalog/errors/index.ts`
- `packages/api/typescript/src/catalog/repositories/ProductCostRepository/ProductCostRepository.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /usecase, /controller, /schema, /test
**Depends on:** T1, T2

### Step T4.1 — Add the papaparse dependency

```bash
cd packages/api/typescript && bun add papaparse && bun add -d @types/papaparse && cd ../../..
```
Expected: `papaparse` in dependencies, `@types/papaparse` in devDependencies.

### Step T4.2 — Shared types for the parser pipeline

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/types.ts
import type { ProductCostType, QuantityModifier, CurrencyCode } from '@bk-dash/contracts-typescript/wire/enums'
import type { ProductCostCsvProvider } from '../../enums'
import type { CatalogCsvImportErrors } from '../../errors'
import type { ProductCostOptionInput } from '../../entities/ProductCost'

/** Per-import context handed to parser + processor. currency/effectiveDate/endDate are SHOPIFY-only. */
export interface ParseContext {
	provider: ProductCostCsvProvider
	csvContent: string
	storeId: string
	storeIntegrationId: string
	currency?: CurrencyCode
	effectiveDate?: string
	endDate?: string
}

/** Canonical row a provider parser emits. MANUAL fills the internal-id path
 *  (productId/variantIds); SHOPIFY fills the external path (handle/variantName)
 *  and leaves resolution to its processor. */
export interface ParsedProductCostRow {
	row: number
	productId?: string | null
	variantIds?: string[]
	handle?: string
	variantName?: string
	costType: ProductCostType
	displayName?: string
	currency: CurrencyCode
	country?: string
	startDate: string
	endDate?: string
	quantity: number
	quantityModifier: QuantityModifier
	unitCost: { amountCents: number; currency: CurrencyCode }
	shipping: { amountCents: number; currency: CurrencyCode }
}

/** One aggregate-to-persist, grouped per (product) with its contributing CSV rows. */
export interface ProductCostBuildInput {
	productId: string | null
	costType: ProductCostType
	displayName?: string
	options: ProductCostOptionInput[]
	sourceRows: number[]
}

export interface ProductCostCsvRowError {
	row: number
	code: CatalogCsvImportErrors
	value?: string
}

export interface ProductCostCsvParseResult {
	builds: ProductCostBuildInput[]
	errors: ProductCostCsvRowError[]
}

/** Resolves canonical rows into per-product builds (identity for MANUAL, DB
 *  resolution + grouping for SHOPIFY). */
export interface ProductCostCsvProcessor {
	process(rows: ParsedProductCostRow[], ctx: ParseContext): Promise<ProductCostCsvParseResult>
}
```

### Step T4.3 — The facade port

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/ProductCostCsvParser.ts
import type { ParseContext, ProductCostCsvParseResult } from './types'

/**
 * Provider-agnostic entry point for ProductCost CSV import. Routes on
 * ctx.provider to a per-provider Parser (CSV → canonical rows) + Processor
 * (rows → per-product builds), merging their row errors. Persistence + events
 * stay in the use case.
 */
export abstract class ProductCostCsvParser {
	abstract parse(ctx: ParseContext): Promise<ProductCostCsvParseResult>
}
```

### Step T4.4 — Base parser (papaparse tokenize + per-row validate)

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/BaseProductCostCsvParser.ts
import Papa from 'papaparse'
import type { ParseContext, ParsedProductCostRow, ProductCostCsvRowError } from '../types'

export type RowResult = { ok: true; value: ParsedProductCostRow } | { ok: false; error: ProductCostCsvRowError }

/**
 * Shared CSV tokenization for provider parsers. papaparse handles quoted
 * fields, embedded commas/newlines, and BOM. Subclasses declare their required
 * columns, header normalization (MANUAL preserves camelCase; SHOPIFY lowercases),
 * and per-row validation.
 */
export abstract class BaseProductCostCsvParser {
	protected abstract readonly requiredColumns: readonly string[]
	protected abstract normalizeHeader(header: string): string
	protected abstract validateRow(row: Record<string, string>, rowIndex: number, ctx: ParseContext): RowResult

	parse(csvContent: string, ctx: ParseContext): { rows: ParsedProductCostRow[]; errors: ProductCostCsvRowError[] } {
		const parsed = Papa.parse<Record<string, string>>(csvContent, {
			header: true,
			skipEmptyLines: 'greedy',
			transformHeader: h => this.normalizeHeader(h),
		})

		// Non-empty header names only — a whitespace-only header line trims to ''.
		const fields = (parsed.meta.fields ?? []).map(f => f.trim()).filter(f => f.length > 0)
		if (fields.length === 0) {
			return { rows: [], errors: [{ row: 0, code: 'CSV_EMPTY' }] }
		}
		for (const col of this.requiredColumns) {
			if (!fields.includes(col)) {
				return { rows: [], errors: [{ row: 0, code: 'CSV_MISSING_REQUIRED_COLUMN', value: col }] }
			}
		}

		const rows: ParsedProductCostRow[] = []
		const errors: ProductCostCsvRowError[] = []
		parsed.data.forEach((raw, i) => {
			const rowIndex = i + 1 // 1-based, header excluded
			const result = this.validateRow(raw, rowIndex, ctx)
			if (result.ok) rows.push(result.value)
			else errors.push(result.error)
		})
		return { rows, errors }
	}
}
```

### Step T4.5 — MANUAL parser (ports today's buildRow with typed codes)

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/ManualProductCostCsvParser.ts
import { injectable } from 'tsyringe-neo'
import { z } from '@bk-dash/core-typescript'
import { ProductCostType, QuantityModifier, CurrencyCode } from '@bk-dash/contracts-typescript/wire/enums'
import { BaseProductCostCsvParser, type RowResult } from './BaseProductCostCsvParser'
import type { ParseContext } from '../types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

@injectable()
export class ManualProductCostCsvParser extends BaseProductCostCsvParser {
	protected readonly requiredColumns = [
		'productId',
		'currency',
		'startDate',
		'variantIds',
		'quantity',
		'quantityModifier',
		'unitCostAmountCents',
		'unitCostCurrency',
		'shippingAmountCents',
		'shippingCurrency',
		'costType',
	] as const

	protected normalizeHeader(header: string): string {
		return header.trim()
	}

	protected validateRow(row: Record<string, string>, rowIndex: number, _ctx: ParseContext): RowResult {
		const productIdRaw = (row.productId ?? '').trim()
		const productId = productIdRaw === '' || productIdRaw.toLowerCase() === 'null' ? null : productIdRaw
		if (productId !== null && !UUID_RE.test(productId)) {
			return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_PRODUCT_ID', value: productIdRaw } }
		}

		const costTypeStr = (row.costType ?? '').trim()
		if (costTypeStr !== ProductCostType.SINGLE && costTypeStr !== ProductCostType.MULTIPLE) {
			return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_COST_TYPE', value: costTypeStr } }
		}
		const costType = costTypeStr as ProductCostType

		const currencyParse = z.enum(CurrencyCode).safeParse((row.currency ?? '').trim())
		if (!currencyParse.success) return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_CURRENCY', value: row.currency } }
		const currency = currencyParse.data

		const countryRaw = (row.country ?? '').trim()
		const country = countryRaw.length > 0 ? countryRaw : undefined
		if (country !== undefined && country.length !== 2) {
			return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_COUNTRY', value: country } }
		}

		const startDate = (row.startDate ?? '').trim()
		if (!ISO_DATE_RE.test(startDate)) return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_START_DATE', value: startDate } }

		const endDateRaw = (row.endDate ?? '').trim()
		const endDate = endDateRaw.length > 0 ? endDateRaw : undefined
		if (endDate !== undefined && !ISO_DATE_RE.test(endDate)) {
			return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_END_DATE', value: endDate } }
		}

		const variantIds = (row.variantIds ?? '')
			.split('|')
			.map(v => v.trim())
			.filter(v => v.length > 0)
		if (variantIds.length === 0) return { ok: false, error: { row: rowIndex, code: 'CSV_VARIANT_IDS_REQUIRED' } }
		for (const v of variantIds) {
			if (!UUID_RE.test(v)) return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_VARIANT_ID', value: v } }
		}

		const quantity = Number(row.quantity)
		if (!Number.isInteger(quantity) || quantity <= 0) {
			return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_QUANTITY', value: row.quantity } }
		}

		const quantityModifierParse = z.enum(QuantityModifier).safeParse((row.quantityModifier ?? '').trim())
		if (!quantityModifierParse.success) {
			return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_QUANTITY_MODIFIER', value: row.quantityModifier } }
		}

		const unitCostAmountCents = Number(row.unitCostAmountCents)
		if (!Number.isInteger(unitCostAmountCents) || unitCostAmountCents < 0) {
			return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_UNIT_COST', value: row.unitCostAmountCents } }
		}
		const unitCostCurrencyParse = z.enum(CurrencyCode).safeParse((row.unitCostCurrency ?? '').trim())
		if (!unitCostCurrencyParse.success) return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_UNIT_COST', value: row.unitCostCurrency } }

		const shippingAmountCents = Number(row.shippingAmountCents)
		if (!Number.isInteger(shippingAmountCents) || shippingAmountCents < 0) {
			return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_SHIPPING', value: row.shippingAmountCents } }
		}
		const shippingCurrencyParse = z.enum(CurrencyCode).safeParse((row.shippingCurrency ?? '').trim())
		if (!shippingCurrencyParse.success) return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_SHIPPING', value: row.shippingCurrency } }

		const displayNameRaw = (row.displayName ?? '').trim()
		const displayName = displayNameRaw.length > 0 ? displayNameRaw : undefined
		if (displayName !== undefined && displayName.length > 120) {
			return { ok: false, error: { row: rowIndex, code: 'CSV_DISPLAY_NAME_TOO_LONG' } }
		}

		return {
			ok: true,
			value: {
				row: rowIndex,
				productId,
				variantIds,
				costType,
				displayName,
				currency,
				country,
				startDate,
				endDate,
				quantity,
				quantityModifier: quantityModifierParse.data,
				unitCost: { amountCents: unitCostAmountCents, currency: unitCostCurrencyParse.data },
				shipping: { amountCents: shippingAmountCents, currency: shippingCurrencyParse.data },
			},
		}
	}
}
```

### Step T4.6 — MANUAL processor (identity + group by product)

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/processors/ManualProductCostCsvProcessor.ts
import { injectable } from 'tsyringe-neo'
import type { ParsedProductCostRow, ProductCostBuildInput, ProductCostCsvParseResult, ProductCostCsvProcessor } from '../types'

const KIT_KEY = ' kit'

@injectable()
export class ManualProductCostCsvProcessor implements ProductCostCsvProcessor {
	async process(rows: ParsedProductCostRow[]): Promise<ProductCostCsvParseResult> {
		const byProduct = new Map<string, ProductCostBuildInput>()
		for (const r of rows) {
			const key = r.productId === null || r.productId === undefined ? KIT_KEY : r.productId
			const option = {
				currency: r.currency,
				country: r.country,
				startDate: r.startDate,
				endDate: r.endDate,
				shipping: r.shipping,
				items: [
					{
						variantIds: r.variantIds!,
						quantity: r.quantity,
						quantityModifier: r.quantityModifier,
						unitCost: r.unitCost,
						shipping: r.shipping,
					},
				],
			}
			const existing = byProduct.get(key)
			if (existing) {
				existing.options.push(option)
				existing.sourceRows.push(r.row)
			} else {
				byProduct.set(key, {
					productId: r.productId ?? null,
					costType: r.costType,
					displayName: r.displayName,
					options: [option],
					sourceRows: [r.row],
				})
			}
		}
		return { builds: [...byProduct.values()], errors: [] }
	}
}
```

### Step T4.7 — The default facade (registry)

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/DefaultProductCostCsvParser.ts
import { injectable } from 'tsyringe-neo'
import { ProductCostCsvProvider } from '../../enums'
import { ProductCostCsvParser } from './ProductCostCsvParser'
import { ManualProductCostCsvParser } from './parsers/ManualProductCostCsvParser'
import { ManualProductCostCsvProcessor } from './processors/ManualProductCostCsvProcessor'
import type { BaseProductCostCsvParser } from './parsers/BaseProductCostCsvParser'
import type { ParseContext, ProductCostCsvParseResult, ProductCostCsvProcessor } from './types'

@injectable()
export class DefaultProductCostCsvParser extends ProductCostCsvParser {
	private readonly registry: Record<ProductCostCsvProvider, { parser: BaseProductCostCsvParser; processor: ProductCostCsvProcessor }>

	constructor(manualParser: ManualProductCostCsvParser, manualProcessor: ManualProductCostCsvProcessor) {
		super()
		this.registry = {
			[ProductCostCsvProvider.MANUAL]: { parser: manualParser, processor: manualProcessor },
			// SHOPIFY pair registered in Task T5.
		} as Record<ProductCostCsvProvider, { parser: BaseProductCostCsvParser; processor: ProductCostCsvProcessor }>
	}

	async parse(ctx: ParseContext): Promise<ProductCostCsvParseResult> {
		const pair = this.registry[ctx.provider]
		const { rows, errors: parseErrors } = pair.parser.parse(ctx.csvContent, ctx)
		const { builds, errors: processErrors } = await pair.processor.process(rows, ctx)
		return { builds, errors: [...parseErrors, ...processErrors] }
	}
}
```

### Step T4.8 — The mock facade

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/MockProductCostCsvParser.ts
import { injectable } from 'tsyringe-neo'
import { ProductCostCsvParser } from './ProductCostCsvParser'
import type { ParseContext, ProductCostCsvParseResult } from './types'

@injectable()
export class MockProductCostCsvParser extends ProductCostCsvParser {
	/** Seed the result the next parse() returns. */
	nextResult: ProductCostCsvParseResult = { builds: [], errors: [] }

	async parse(_ctx: ParseContext): Promise<ProductCostCsvParseResult> {
		return this.nextResult
	}
}
```

### Step T4.9 — Barrel

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/index.ts
export { ProductCostCsvParser } from './ProductCostCsvParser'
export { DefaultProductCostCsvParser } from './DefaultProductCostCsvParser'
export { MockProductCostCsvParser } from './MockProductCostCsvParser'
export type { ParseContext, ParsedProductCostRow, ProductCostBuildInput, ProductCostCsvRowError, ProductCostCsvParseResult, ProductCostCsvProcessor } from './types'
```

### Step T4.10 — Bind the facade in the registry

Modify `packages/api/typescript/src/catalog/registry.ts`:

```diff
 import { ProductQueryService, MockProductQueryService, DrizzleProductQueryService } from './services/ProductQueryService'
+import { ProductCostCsvParser, DefaultProductCostCsvParser, MockProductCostCsvParser } from './services/ProductCostCsvParser'
```

Add one entry to each of the `mock` / `integration` / `real` arrays:

```typescript
// mock:
{ token: ProductCostCsvParser, instance: MockProductCostCsvParser },
// integration:
{ token: ProductCostCsvParser, instance: DefaultProductCostCsvParser },
// real:
{ token: ProductCostCsvParser, instance: DefaultProductCostCsvParser },
```

### Step T4.11 — Write the failing MANUAL parser unit test

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/ManualProductCostCsvParser.test.ts
import { describe, it, expect } from 'bun:test'
import { ProductCostCsvProvider } from '../../../enums'
import { ManualProductCostCsvParser } from './ManualProductCostCsvParser'
import type { ParseContext } from '../types'

const PRODUCT = 'cccccccc-0001-4000-8000-00000000000a'
const VARIANT = 'dddddddd-0001-4000-8000-000000000001'
const ctx: ParseContext = { provider: ProductCostCsvProvider.MANUAL, csvContent: '', storeId: 's', storeIntegrationId: 'si' }

const HEADER =
	'productId,currency,country,startDate,endDate,variantIds,quantity,quantityModifier,unitCostAmountCents,unitCostCurrency,shippingAmountCents,shippingCurrency,costType,displayName'

describe('ManualProductCostCsvParser', () => {
	const parser = new ManualProductCostCsvParser()

	it('parses a valid row into a canonical ParsedProductCostRow', () => {
		const csv = `${HEADER}\n${PRODUCT},USD,,2026-05-01,,${VARIANT},1,EQ,500,USD,0,USD,SINGLE,`
		const { rows, errors } = parser.parse(csv, ctx)
		expect(errors).toEqual([])
		expect(rows).toHaveLength(1)
		expect(rows[0]!.productId).toBe(PRODUCT)
		expect(rows[0]!.variantIds).toEqual([VARIANT])
		expect(rows[0]!.unitCost).toEqual({ amountCents: 500, currency: 'USD' })
	})

	it('preserves quoted fields containing commas (papaparse)', () => {
		const csv = `${HEADER}\n${PRODUCT},USD,,2026-05-01,,${VARIANT},1,EQ,500,USD,0,USD,SINGLE,"Big, Red Box"`
		const { rows, errors } = parser.parse(csv, ctx)
		expect(errors).toEqual([])
		expect(rows[0]!.displayName).toBe('Big, Red Box')
	})

	it('strips a BOM prefix on the first header', () => {
		const csv = `﻿${HEADER}\n${PRODUCT},USD,,2026-05-01,,${VARIANT},1,EQ,500,USD,0,USD,SINGLE,`
		const { rows, errors } = parser.parse(csv, ctx)
		expect(errors).toEqual([])
		expect(rows).toHaveLength(1)
	})

	it('emits a typed code (not a message) for an invalid currency', () => {
		const csv = `${HEADER}\n${PRODUCT},XXX,,2026-05-01,,${VARIANT},1,EQ,500,USD,0,USD,SINGLE,`
		const { rows, errors } = parser.parse(csv, ctx)
		expect(rows).toEqual([])
		expect(errors).toHaveLength(1)
		expect(errors[0]).toEqual({ row: 1, code: 'CSV_INVALID_CURRENCY', value: 'XXX' })
	})

	it('reports a typed code for a missing required column', () => {
		const { errors } = parser.parse('productId,currency\nx,USD', ctx)
		expect(errors[0]!.row).toBe(0)
		expect(errors[0]!.code).toBe('CSV_MISSING_REQUIRED_COLUMN')
	})
})
```

### Step T4.12 — Run the parser test to verify it fails

Run: `bun test packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/ManualProductCostCsvParser.test.ts`
Expected: FAIL — module not found / class not yet wired (or papaparse missing). After Steps T4.1–T4.5 it should pass.

### Step T4.13 — Run the parser test to verify it passes

Run: `bun test packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/ManualProductCostCsvParser.test.ts`
Expected: PASS — 5 tests.

### Step T4.14 — Rewrite the use case (DU input, facade, saveMany, typed errors)

Replace the body of `packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.ts` with:

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, tryCatch, z, type Transaction, type BaseDomainEvent } from '@bk-dash/core-typescript'
import { CurrencyCode } from '@bk-dash/contracts-typescript/wire/enums'
import { ProductCost } from '../entities/ProductCost'
import { ProductCostCsvProvider } from '../enums'
import { ProductCostRepository } from '../repositories/ProductCostRepository'
import { ProductCostCsvParser } from '../services/ProductCostCsvParser'
import { ProductCostCreatedEvent, ProductCostUpdatedEvent } from '../events'

const baseFields = {
	userId: z.uuid(),
	storeId: z.uuid(),
	storeIntegrationId: z.uuid(),
	csvContent: z.string().min(1),
}

export const BulkImportProductCostsFromCsvInputSchema = z.discriminatedUnion('provider', [
	z.object({ provider: z.literal(ProductCostCsvProvider.MANUAL), ...baseFields }),
	z.object({
		provider: z.literal(ProductCostCsvProvider.SHOPIFY),
		...baseFields,
		currency: z.enum(CurrencyCode),
		effectiveDate: z.iso.date(),
		endDate: z.iso.date().optional(),
	}),
])

export const BulkImportProductCostsFromCsvOutputSchema = z.object({
	createdCount: z.number().int().min(0),
	updatedCount: z.number().int().min(0),
	skippedCount: z.number().int().min(0),
	errors: z.array(
		z.object({
			row: z.number().int().min(0),
			/** A CatalogCsvImportErrors code (registered, i18n-able) — never a raw message. */
			code: z.string(),
			/** The offending raw cell value, for display/debug. */
			value: z.string().optional(),
		}),
	),
})

/**
 * C30 BulkImportProductCostsFromCsv. Routes on `provider` through the
 * ProductCostCsvParser facade (parser + processor per provider), then persists
 * the resulting per-product builds in one transaction via saveMany +
 * DomainEventRepository.saveMany — one Created/Updated event per aggregate.
 * Partial-success: per-row failures accumulate as typed `errors[]` codes.
 */
@injectable()
export class BulkImportProductCostsFromCsv extends Handler<
	typeof BulkImportProductCostsFromCsvInputSchema,
	typeof BulkImportProductCostsFromCsvOutputSchema
> {
	readonly name = 'bulk_import_product_costs_from_csv' as const
	readonly inputSchema = BulkImportProductCostsFromCsvInputSchema
	readonly outputSchema = BulkImportProductCostsFromCsvOutputSchema

	constructor(
		private readonly productCosts: ProductCostRepository,
		private readonly csvParser: ProductCostCsvParser,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const { builds, errors } = await this.csvParser.parse({
			provider: input.provider,
			csvContent: input.csvContent,
			storeId: input.storeId,
			storeIntegrationId: input.storeIntegrationId,
			currency: input.provider === ProductCostCsvProvider.SHOPIFY ? input.currency : undefined,
			effectiveDate: input.provider === ProductCostCsvProvider.SHOPIFY ? input.effectiveDate : undefined,
			endDate: input.provider === ProductCostCsvProvider.SHOPIFY ? input.endDate : undefined,
		})

		const rowErrors: { row: number; code: string; value?: string }[] = [...errors]
		const toSave: ProductCost[] = []
		const events: BaseDomainEvent[] = []
		let createdCount = 0
		let updatedCount = 0

		await this.withTransaction(tx, async tx => {
			for (const build of builds) {
				const existing = await this.productCosts.findByStoreAndProduct(input.storeId, build.productId, tx)
				if (existing) {
					const r = tryCatch(() =>
						existing.update({ displayName: build.displayName, options: [...existing.options.map(o => o.toJSON()), ...build.options] }),
					)
					if (!r.success) {
						rowErrors.push({ row: build.sourceRows[0]!, code: 'CSV_ROW_INVALID', value: errorMessage(r.error) })
						continue
					}
					toSave.push(existing)
					events.push(
						new ProductCostUpdatedEvent({
							entityId: existing.id.value,
							ownerId: existing.storeId.value,
							payload: { productCost: existing.toJSON() },
						}),
					)
					updatedCount++
				} else {
					const r = tryCatch(() =>
						ProductCost.create({
							storeId: input.storeId,
							storeIntegrationId: input.storeIntegrationId,
							productId: build.productId,
							costType: build.costType,
							displayName: build.displayName,
							options: build.options,
						}),
					)
					if (!r.success) {
						rowErrors.push({ row: build.sourceRows[0]!, code: 'CSV_ROW_INVALID', value: errorMessage(r.error) })
						continue
					}
					toSave.push(r.data)
					events.push(
						new ProductCostCreatedEvent({
							entityId: r.data.id.value,
							ownerId: r.data.storeId.value,
							payload: { productCost: r.data.toJSON() },
						}),
					)
					createdCount++
				}
			}

			if (toSave.length > 0) await this.productCosts.saveMany(toSave, tx)
			if (events.length > 0) await this.domainEventRepository.saveMany(events, tx)
		})

		return { createdCount, updatedCount, skippedCount: rowErrors.length, errors: rowErrors }
	}
}

function errorMessage(e: unknown): string {
	if (e instanceof Error) return e.message || e.name
	return String(e)
}
```

### Step T4.15 — Update the controller body to a provider DU

Modify `packages/api/typescript/src/catalog/controllers/BulkImportProductCostsFromCsvController.ts`:

Replace the input schema + `handle` body wiring. New input schema:

```typescript
import { CurrencyCode } from '@bk-dash/contracts-typescript/wire/enums'
import { ProductCostCsvProvider } from '../enums'

const baseBody = { storeIntegrationId: z.uuid(), csvContent: z.string().min(1) }

export const BulkImportProductCostsFromCsvControllerInputSchema = z.object({
	ctx: z.object({ user: z.object({ id: z.string() }), membership: z.object({ storeId: z.uuid() }) }),
	body: z.discriminatedUnion('provider', [
		z.object({ provider: z.literal(ProductCostCsvProvider.MANUAL), ...baseBody }),
		z.object({
			provider: z.literal(ProductCostCsvProvider.SHOPIFY),
			...baseBody,
			currency: z.enum(CurrencyCode),
			effectiveDate: z.iso.date(),
			endDate: z.iso.date().optional(),
		}),
	]),
})
```

Replace the `handle` body so it forwards the whole DU body:

```typescript
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.cmd.execute({
			...request.body,
			userId: request.ctx.user.id,
			storeId: request.ctx.membership.storeId,
		})
		return { status: HttpStatusCode.OK, data }
	}
```

### Step T4.16 — Update the use-case integration test

Modify `packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.test.ts`. Two changes throughout: every `execute({ … })` gains `provider: ProductCostCsvProvider.MANUAL`, and error assertions check `code` instead of `message`. The grouped semantics also change the created/updated split (one event per aggregate — Decision 10): a product that appears on multiple rows is now created **once** with multiple options, not created-then-updated. Replace the file body's tests with:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { DomainEventRepository, type BaseDomainEvent, type DomainEventConstructor } from '@bk-dash/core-typescript'
import { ProductCostType } from '@bk-dash/contracts-typescript/wire/enums'
import { BulkImportProductCostsFromCsv } from './BulkImportProductCostsFromCsv'
import { ProductCostCsvProvider } from '../enums'
import { ProductCostRepository } from '../repositories/ProductCostRepository'
import { ProductCostCreatedEvent, ProductCostUpdatedEvent } from '../events'

const STORE = 'aaaaaaaa-0001-4000-8000-000000000001'
const STORE_INTEGRATION = 'bbbbbbbb-0001-4000-8000-000000000001'
const PRODUCT_A = 'cccccccc-0001-4000-8000-00000000000a'
const PRODUCT_B = 'cccccccc-0001-4000-8000-00000000000b'
const VARIANT_1 = 'dddddddd-0001-4000-8000-000000000001'
const VARIANT_2 = 'dddddddd-0001-4000-8000-000000000002'
const USER = 'eeeeeeee-0001-4000-8000-000000000001'

const HEADER = [
	'productId', 'currency', 'country', 'startDate', 'endDate', 'variantIds', 'quantity',
	'quantityModifier', 'unitCostAmountCents', 'unitCostCurrency', 'shippingAmountCents', 'shippingCurrency', 'costType', 'displayName',
].join(',')

function row(opts: { productId: string | 'null'; startDate?: string; variantIds?: string; quantity?: string; quantityModifier?: string; costType?: string }): string {
	return [
		opts.productId, 'USD', '', opts.startDate ?? '2026-05-01', '', opts.variantIds ?? VARIANT_1,
		opts.quantity ?? '1', opts.quantityModifier ?? 'EQ', '500', 'USD', '0', 'USD', opts.costType ?? 'SINGLE', '',
	].join(',')
}

describe('BulkImportProductCostsFromCsv (C30) — MANUAL', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let useCase: BulkImportProductCostsFromCsv
	let repo: ProductCostRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		useCase = testBed.resolve(BulkImportProductCostsFromCsv)
		repo = testBed.resolve(ProductCostRepository)
	})
	beforeEach(async () => { await testBed.reset() })
	afterAll(async () => { await testBed.destroy() })

	async function readEvents<E extends BaseDomainEvent>(eventClass: DomainEventConstructor<E>) {
		return testBed.resolve(DomainEventRepository).findByType(eventClass)
	}

	const base = { userId: USER, storeId: STORE, storeIntegrationId: STORE_INTEGRATION, provider: ProductCostCsvProvider.MANUAL as const }

	it('reports a typed code when required columns are missing', async () => {
		const result = await useCase.execute({ ...base, csvContent: 'productId,currency\nu,USD' })
		expect(result.skippedCount).toBe(1)
		expect(result.errors[0]).toEqual({ row: 0, code: 'CSV_MISSING_REQUIRED_COLUMN', value: 'startDate' })
	})

	it('reports a typed code for an empty CSV', async () => {
		const result = await useCase.execute({ ...base, csvContent: '   \n\n' })
		expect(result.skippedCount).toBe(1)
		expect(result.errors[0]!.code).toBe('CSV_EMPTY')
	})

	it('creates one ProductCost per distinct product, merging multiple rows into one aggregate', async () => {
		const csv = [
			HEADER,
			row({ productId: PRODUCT_A }),
			row({ productId: PRODUCT_A, startDate: '2026-06-01', quantity: '10', quantityModifier: 'GTE' }),
			row({ productId: PRODUCT_B, variantIds: VARIANT_2 }),
		].join('\n')

		const result = await useCase.execute({ ...base, csvContent: csv })
		expect(result.createdCount).toBe(2) // A (2 options) + B — one create each
		expect(result.updatedCount).toBe(0) // grouped: A is not created-then-updated
		expect(result.skippedCount).toBe(0)

		expect((await repo.findByStoreAndProduct(STORE, PRODUCT_A))?.options).toHaveLength(2)
		expect((await repo.findByStoreAndProduct(STORE, PRODUCT_B))?.options).toHaveLength(1)
		expect(await readEvents(ProductCostCreatedEvent)).toHaveLength(2)
		expect(await readEvents(ProductCostUpdatedEvent)).toHaveLength(0)
	})

	it('updates a pre-existing aggregate (append) with one Updated event', async () => {
		await useCase.execute({ ...base, csvContent: [HEADER, row({ productId: PRODUCT_A })].join('\n') })
		const result = await useCase.execute({ ...base, csvContent: [HEADER, row({ productId: PRODUCT_A, startDate: '2026-07-01' })].join('\n') })
		expect(result.createdCount).toBe(0)
		expect(result.updatedCount).toBe(1)
		expect((await repo.findByStoreAndProduct(STORE, PRODUCT_A))?.options).toHaveLength(2)
		expect(await readEvents(ProductCostUpdatedEvent)).toHaveLength(1)
	})

	it('reports per-row validation errors without aborting the batch (partial-success)', async () => {
		const csv = [
			HEADER,
			row({ productId: PRODUCT_A }),
			row({ productId: 'not-a-uuid' }),
			row({ productId: PRODUCT_B, quantity: '0' }),
		].join('\n')

		const result = await useCase.execute({ ...base, csvContent: csv })
		expect(result.createdCount).toBe(1) // only A
		expect(result.skippedCount).toBe(2)
		expect(result.errors.find(e => e.row === 2)?.code).toBe('CSV_INVALID_PRODUCT_ID')
		expect(result.errors.find(e => e.row === 3)?.code).toBe('CSV_INVALID_QUANTITY')
	})

	it('handles kit-scoped rows (productId="null") as a distinct uniqueness slot', async () => {
		const result = await useCase.execute({ ...base, csvContent: [HEADER, row({ productId: 'null', costType: 'MULTIPLE' })].join('\n') })
		expect(result.createdCount).toBe(1)
		const kit = await repo.findByStoreAndProduct(STORE, null)
		expect(kit?.productId).toBeNull()
		expect(kit?.costType).toBe(ProductCostType.MULTIPLE)
	})
})
```

### Step T4.17 — Run the use-case test to verify it passes

Run: `bun test packages/api/typescript/src/catalog/usecases/BulkImportProductCostsFromCsv.test.ts`
Expected: PASS — 6 tests.

### Step T4.18 — Type check + lint + full catalog tests

Run: `bun tsc && bun lint && bun test packages/api/typescript/src/catalog`
Expected: 0 errors; catalog suite green.

### Step T4.19 — Commit

```bash
git add packages/api/typescript/src/catalog packages/api/typescript/package.json
git commit -m "feat(catalog): provider-abstracted CSV import (MANUAL) + saveMany persistence (Task T4)"
```

---

## Task T5: Operator imports a Shopify CSV (resolve by handle+title; unresolved → typed skip rows)

**Files to write:**
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/ShopifyProductCostCsvParser.ts`
- Create: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/processors/ShopifyProductCostCsvProcessor.ts`
- Modify: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/DefaultProductCostCsvParser.ts` — register SHOPIFY pair
- Test: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/ShopifyProductCostCsvParser.test.ts`
- Test: `packages/api/typescript/src/catalog/services/ProductCostCsvParser/processors/ShopifyProductCostCsvProcessor.test.ts`

**Files to read:**
- `packages/api/typescript/src/catalog/services/ProductQueryService/MockProductQueryService.ts`
- `packages/api/typescript/src/catalog/services/ProductQueryService/ProductQueryService.ts`
- `packages/api/typescript/src/catalog/services/ProductCostCsvParser/DefaultProductCostCsvParser.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T1, T3, T4

### Step T5.1 — Shopify parser

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/ShopifyProductCostCsvParser.ts
import { injectable } from 'tsyringe-neo'
import { ProductCostType, QuantityModifier } from '@bk-dash/contracts-typescript/wire/enums'
import { BaseProductCostCsvParser, type RowResult } from './BaseProductCostCsvParser'
import type { ParseContext } from '../types'

/**
 * Shopify product-export rows. Identifies product by `handle` and variant by
 * the composed option name (`option1/2/3 value` joined by " / "), matched
 * downstream against `variants.title`. currency/dates come from the request
 * (ctx) since the export carries neither. Headers are lowercased for lookup.
 */
@injectable()
export class ShopifyProductCostCsvParser extends BaseProductCostCsvParser {
	protected readonly requiredColumns = ['handle', 'cost per item'] as const

	protected normalizeHeader(header: string): string {
		return header.trim().toLowerCase()
	}

	protected validateRow(row: Record<string, string>, rowIndex: number, ctx: ParseContext): RowResult {
		const handle = (row.handle ?? '').trim()
		if (handle.length === 0) return { ok: false, error: { row: rowIndex, code: 'CSV_MISSING_HANDLE' } }

		const costRaw = (row['cost per item'] ?? '').trim()
		const cost = Number(costRaw)
		if (!Number.isFinite(cost) || cost < 0) return { ok: false, error: { row: rowIndex, code: 'CSV_INVALID_COST', value: costRaw } }

		const variantName = [row['option1 value'], row['option2 value'], row['option3 value']]
			.map(v => (v ?? '').trim())
			.filter(v => v.length > 0)
			.join(' / ')

		return {
			ok: true,
			value: {
				row: rowIndex,
				handle,
				variantName,
				costType: ProductCostType.SINGLE,
				currency: ctx.currency!,
				startDate: ctx.effectiveDate!,
				endDate: ctx.endDate,
				quantity: 1,
				quantityModifier: QuantityModifier.EQ,
				unitCost: { amountCents: Math.round(cost * 100), currency: ctx.currency! },
				shipping: { amountCents: 0, currency: ctx.currency! },
			},
		}
	}
}
```

### Step T5.2 — Shopify processor (resolve + group)

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/processors/ShopifyProductCostCsvProcessor.ts
import { injectable } from 'tsyringe-neo'
import { ProductCostType } from '@bk-dash/contracts-typescript/wire/enums'
import { ProductQueryService } from '../../ProductQueryService'
import type { ProductCostOptionInput } from '../../../entities/ProductCost'
import type { ParseContext, ParsedProductCostRow, ProductCostBuildInput, ProductCostCsvParseResult, ProductCostCsvProcessor, ProductCostCsvRowError } from '../types'

/**
 * Groups Shopify rows by handle, bulk-resolves (handle → product + variants by
 * title) via ProductQueryService, and emits one SINGLE-cost build per resolved
 * product. Unknown handle / blank or unmatched variant name → typed skip rows.
 */
@injectable()
export class ShopifyProductCostCsvProcessor implements ProductCostCsvProcessor {
	constructor(private readonly products: ProductQueryService) {}

	async process(rows: ParsedProductCostRow[], ctx: ParseContext): Promise<ProductCostCsvParseResult> {
		const errors: ProductCostCsvRowError[] = []
		const byHandle = new Map<string, ParsedProductCostRow[]>()
		for (const r of rows) {
			const list = byHandle.get(r.handle!) ?? []
			list.push(r)
			byHandle.set(r.handle!, list)
		}

		const resolved = await this.products.resolveProductsWithVariantsByHandles(ctx.storeIntegrationId, [...byHandle.keys()])
		const byHandleResolved = new Map(resolved.map(p => [p.handle, p]))

		const builds: ProductCostBuildInput[] = []
		for (const [handle, handleRows] of byHandle) {
			const product = byHandleResolved.get(handle)
			if (!product) {
				for (const r of handleRows) errors.push({ row: r.row, code: 'CSV_UNKNOWN_HANDLE', value: handle })
				continue
			}
			const variantByTitle = new Map(product.variants.map(v => [v.title, v.variantId]))
			const items: ProductCostOptionInput['items'] = []
			const sourceRows: number[] = []
			for (const r of handleRows) {
				if (!r.variantName) {
					errors.push({ row: r.row, code: 'CSV_BLANK_VARIANT_NAME', value: handle })
					continue
				}
				const variantId = variantByTitle.get(r.variantName)
				if (!variantId) {
					errors.push({ row: r.row, code: 'CSV_UNRESOLVED_VARIANT', value: r.variantName })
					continue
				}
				items.push({ variantIds: [variantId], quantity: r.quantity, quantityModifier: r.quantityModifier, unitCost: r.unitCost, shipping: r.shipping })
				sourceRows.push(r.row)
			}
			if (items.length === 0) continue
			const first = handleRows[0]!
			builds.push({
				productId: product.productId,
				costType: ProductCostType.SINGLE,
				options: [{ currency: first.currency, startDate: first.startDate, endDate: first.endDate, shipping: { amountCents: 0, currency: first.currency }, items }],
				sourceRows,
			})
		}

		return { builds, errors }
	}
}
```

(The items accumulator is typed via `ProductCostOptionInput['items']` — no new export on the entity is needed, so `ProductCost.ts` stays untouched and out of this Task's scope.)

### Step T5.3 — Register the SHOPIFY pair in the facade

Modify `DefaultProductCostCsvParser.ts`:

```diff
 import { ManualProductCostCsvParser } from './parsers/ManualProductCostCsvParser'
 import { ManualProductCostCsvProcessor } from './processors/ManualProductCostCsvProcessor'
+import { ShopifyProductCostCsvParser } from './parsers/ShopifyProductCostCsvParser'
+import { ShopifyProductCostCsvProcessor } from './processors/ShopifyProductCostCsvProcessor'
```

```diff
-	constructor(manualParser: ManualProductCostCsvParser, manualProcessor: ManualProductCostCsvProcessor) {
+	constructor(
+		manualParser: ManualProductCostCsvParser,
+		manualProcessor: ManualProductCostCsvProcessor,
+		shopifyParser: ShopifyProductCostCsvParser,
+		shopifyProcessor: ShopifyProductCostCsvProcessor,
+	) {
 		super()
 		this.registry = {
 			[ProductCostCsvProvider.MANUAL]: { parser: manualParser, processor: manualProcessor },
-			// SHOPIFY pair registered in Task T5.
+			[ProductCostCsvProvider.SHOPIFY]: { parser: shopifyParser, processor: shopifyProcessor },
-		} as Record<ProductCostCsvProvider, { parser: BaseProductCostCsvParser; processor: ProductCostCsvProcessor }>
+		}
 	}
```

### Step T5.4 — Write the failing Shopify parser test

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/parsers/ShopifyProductCostCsvParser.test.ts
import { describe, it, expect } from 'bun:test'
import { CurrencyCode, ProductCostType, QuantityModifier } from '@bk-dash/contracts-typescript/wire/enums'
import { ProductCostCsvProvider } from '../../../enums'
import { ShopifyProductCostCsvParser } from './ShopifyProductCostCsvParser'
import type { ParseContext } from '../types'

const ctx: ParseContext = {
	provider: ProductCostCsvProvider.SHOPIFY,
	csvContent: '',
	storeId: 's',
	storeIntegrationId: 'si',
	currency: CurrencyCode.USD,
	effectiveDate: '2026-05-01',
}

describe('ShopifyProductCostCsvParser', () => {
	const parser = new ShopifyProductCostCsvParser()

	it('parses handle + cost per item + composed variant name; cost → cents; meta from ctx', () => {
		const csv = 'Handle,Title,Option1 Value,Option2 Value,Option3 Value,Cost per item\nshirt,Shirt,Black,M,,12.50'
		const { rows, errors } = parser.parse(csv, ctx)
		expect(errors).toEqual([])
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({
			handle: 'shirt',
			variantName: 'Black / M',
			currency: CurrencyCode.USD,
			startDate: '2026-05-01',
			costType: ProductCostType.SINGLE,
			quantity: 1,
			quantityModifier: QuantityModifier.EQ,
			unitCost: { amountCents: 1250, currency: CurrencyCode.USD },
		})
	})

	it('handles quoted titles with commas and blank option values', () => {
		const csv = 'Handle,Option1 Value,Option2 Value,Option3 Value,Cost per item\n"my,handle",,,,5'
		const { rows } = parser.parse(csv, ctx)
		expect(rows[0]!.handle).toBe('my,handle')
		expect(rows[0]!.variantName).toBe('') // no options → blank (processor flags it)
	})

	it('emits CSV_INVALID_COST for a non-numeric cost', () => {
		const csv = 'Handle,Cost per item\nshirt,abc'
		const { errors } = parser.parse(csv, ctx)
		expect(errors[0]).toEqual({ row: 1, code: 'CSV_INVALID_COST', value: 'abc' })
	})
})
```

### Step T5.5 — Write the failing Shopify processor test

```typescript
// packages/api/typescript/src/catalog/services/ProductCostCsvParser/processors/ShopifyProductCostCsvProcessor.test.ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { CurrencyCode, ProductCostType, QuantityModifier } from '@bk-dash/contracts-typescript/wire/enums'
import { MockProductQueryService } from '../../ProductQueryService'
import { ShopifyProductCostCsvProcessor } from './ShopifyProductCostCsvProcessor'
import { ProductCostCsvProvider } from '../../../enums'
import type { ParseContext, ParsedProductCostRow } from '../types'

const PRODUCT = 'cccccccc-0001-4000-8000-00000000000a'
const VARIANT = 'dddddddd-0001-4000-8000-000000000001'
const ctx: ParseContext = {
	provider: ProductCostCsvProvider.SHOPIFY, csvContent: '', storeId: 's', storeIntegrationId: 'si',
	currency: CurrencyCode.USD, effectiveDate: '2026-05-01',
}

function shopifyRow(over: Partial<ParsedProductCostRow> & { row: number; handle: string; variantName: string }): ParsedProductCostRow {
	return {
		costType: ProductCostType.SINGLE, currency: CurrencyCode.USD, startDate: '2026-05-01',
		quantity: 1, quantityModifier: QuantityModifier.EQ,
		unitCost: { amountCents: 1250, currency: CurrencyCode.USD }, shipping: { amountCents: 0, currency: CurrencyCode.USD },
		...over,
	}
}

describe('ShopifyProductCostCsvProcessor', () => {
	let products: MockProductQueryService
	let processor: ShopifyProductCostCsvProcessor

	beforeEach(() => {
		products = new MockProductQueryService()
		processor = new ShopifyProductCostCsvProcessor(products)
	})

	it('resolves handle + variant title into one SINGLE build per product', async () => {
		products.nextResolved = [{ handle: 'shirt', productId: PRODUCT, variants: [{ title: 'Black / M', variantId: VARIANT }] }]
		const { builds, errors } = await processor.process([shopifyRow({ row: 1, handle: 'shirt', variantName: 'Black / M' })], ctx)
		expect(errors).toEqual([])
		expect(builds).toHaveLength(1)
		expect(builds[0]!.productId).toBe(PRODUCT)
		expect(builds[0]!.options[0]!.items[0]!.variantIds).toEqual([VARIANT])
	})

	it('flags unknown handle, blank variant name, and unmatched variant with typed codes', async () => {
		products.nextResolved = [{ handle: 'shirt', productId: PRODUCT, variants: [{ title: 'Black / M', variantId: VARIANT }] }]
		const { builds, errors } = await processor.process(
			[
				shopifyRow({ row: 1, handle: 'unknown', variantName: 'X' }),
				shopifyRow({ row: 2, handle: 'shirt', variantName: '' }),
				shopifyRow({ row: 3, handle: 'shirt', variantName: 'Red / L' }),
			],
			ctx,
		)
		expect(builds).toHaveLength(0)
		expect(errors.find(e => e.row === 1)?.code).toBe('CSV_UNKNOWN_HANDLE')
		expect(errors.find(e => e.row === 2)?.code).toBe('CSV_BLANK_VARIANT_NAME')
		expect(errors.find(e => e.row === 3)?.code).toBe('CSV_UNRESOLVED_VARIANT')
	})
})
```

### Step T5.6 — Run the Shopify tests to verify they fail then pass

Run: `bun test packages/api/typescript/src/catalog/services/ProductCostCsvParser`
Expected: after T5.1–T5.3, PASS — Shopify parser (3) + processor (2) + Manual parser (5).

### Step T5.7 — Type check + lint + full catalog suite

Run: `bun tsc && bun lint && bun test packages/api/typescript/src/catalog`
Expected: 0 errors; green.

### Step T5.8 — Commit

```bash
git add packages/api/typescript/src/catalog/services/ProductCostCsvParser
git commit -m "feat(catalog): Shopify ProductCost CSV provider (resolve by handle+title) (Task T5)"
```

---

## Task T6: Contract Lock — SDK regen

**Files to write:**
- Regen: `packages/contracts/**` openapi output + `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T4

### Step T6.1 — Regenerate OpenAPI + SDK

```bash
bun emit-openapi && bun sdk
```

### Step T6.2 — Verify the regen reflects the new contract

```bash
git diff --stat packages/client
```
Expected: the import-csv operation's request type now carries `provider` (+ Shopify `currency`/`effectiveDate`/`endDate`); the response `errors[]` item shape is `{ row, code, value? }`.

### Step T6.3 — Type-check after regen

Run: `bun tsc`
Expected: 0 errors across all workspaces.

### Step T6.4 — Commit

```bash
git add packages/client packages/api/typescript/src
git commit -m "chore(sdk): regenerate openapi+sdk for product-cost CSV providers (Task T6)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — TS + Go suites pass (Go unaffected; ensure DB migrated if it runs)
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `ProductCostCsvProvider`/`CatalogCsvImportErrors` compile + used in SDK after T6 (`git diff packages/client`); verified by `bun tsc` (T6.3)
  - AC-2 → `BulkImportProductCostsFromCsvController` DU (T4.15); validation exercised by `BulkImportProductCostsFromCsv.test.ts` provider-keyed `execute` calls (T4.16)
  - AC-3 → `ShopifyProductCostCsvProcessor.test.ts:"resolves handle + variant title into one SINGLE build per product"` + `DrizzleProductQueryService.test.ts:"resolveProductsWithVariantsByHandles maps handle → product + variants by title"`
  - AC-4 → `ShopifyProductCostCsvProcessor.test.ts:"flags unknown handle, blank variant name, and unmatched variant with typed codes"`
  - AC-5 → `BulkImportProductCostsFromCsv.test.ts` MANUAL suite (T4.16) — end-state equivalence; created/updated counts now per-aggregate (Decision 10)
  - AC-6 → `ManualProductCostCsvParser.test.ts:"preserves quoted fields…"/"strips a BOM prefix…"` + `ShopifyProductCostCsvParser.test.ts:"handles quoted titles with commas…"`
  - AC-7 → `DrizzleProductCostRepository.test.ts:"saveMany inserts new rows and upserts existing ones in one batch"`
  - AC-8 → `BulkImportProductCostsFromCsv.test.ts:"creates one ProductCost per distinct product…"` + `"updates a pre-existing aggregate…"` (event counts via `findByType`)
  - AC-9 → `ManualProductCostCsvParser.test.ts:"emits a typed code (not a message)…"` + use-case error assertions on `code` (T4.16)
  - AC-10 → Final Validation `bun tsc` / `bun lint` / `bun run test` + T6 SDK regen

## Notes

- **New dependencies:** `papaparse` (dep) + `@types/papaparse` (devDep) in `packages/api/typescript` (Step T4.1).
- **No migration, no `packages/contracts` change.** The provider enum (`/enum`) and CSV import-error codes (`/errors`) live in the `catalog` context; both reach the SDK through the controller schema + the `openapi.registerEnums` registration in `shared/index.ts`.
- **DI:** the 4 concrete parser/processor classes are `@injectable()` and constructor-injected into `DefaultProductCostCsvParser`; tsyringe auto-resolves them (the Shopify processor's `ProductQueryService` dep is already registered). Only the `ProductCostCsvParser` *port* gets a registry binding.
- **Behavior change (Decision 10):** events are now one-per-aggregate (was one-per-row); within a single import a product is created once with all its options, so the created/updated split differs from the pre-refactor row-by-row counts. The `errors[].message` field is replaced by `{ code, value? }` — surfaced via the T6 SDK regen (no frontend consumer exists today).
- **Resolution depends on synced catalog:** Shopify rows only resolve against `products`/`variants` the Go sync has materialized; an un-synced store yields all-skipped rows with `CSV_UNKNOWN_HANDLE` / `CSV_UNRESOLVED_VARIANT`.
- **Reference mirrored:** `bk-dash-backend/backend-old/src/modules/products/utils/ProductCostCsv/` (parser+processor+registry) and `processors/shopify.ts` (group-by-handle, bulk resolve, variant-title match, skip-on-unresolved).
