# Sales Coupon Management (CRUD) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle. Backend artifacts use **scaffold-then-mutate**
> (`bun cli` + delta-only `edit` blocks); existing files use diff edits.

**Goal:** A store admin can list, create, edit, and delete percentage discount coupons from `/app/coupons`, with one Zod schema validating the form and the command.

**Architecture:** A `Coupon` aggregate + `CouponCode` value object in `sales`, persisted via a Drizzle `CouponRepository` (unique `code`). Three command use cases (`Create`/`Update`/`Delete`) + one BFF `ListCoupons` read, each behind a controller. A `(app)/coupons` route renders a `CouponListSection` table and a `CouponForm` dialog, consuming the regenerated SDK.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, TanStack Router/Query, Zod, Tailwind.

**Spec:** .specs/2026-05-27-sales-coupon-crud-design.md
**Tasks:** 6
**Estimated minutes:** 240

> Single bounded context (`sales`); no events/projections/cross-service. Migration
> has no backfill. Tests run in `integration` mode (PGlite) using the Drizzle repo —
> no Mock repo / `mock`-env binding needed (no flow test).

---

## Task T1: Admin creates a coupon

**Files to write:**
- Create: `packages/api/typescript/src/sales/objects/CouponCode.ts`
- Create: `packages/api/typescript/src/sales/entities/Coupon.ts`
- Create: `packages/api/typescript/src/sales/repositories/CouponRepository/CouponRepository.ts`
- Create: `packages/api/typescript/src/sales/repositories/CouponRepository/DrizzleCouponRepository.ts`
- Create: `packages/api/typescript/src/sales/usecases/CreateCoupon.ts`
- Create: `packages/api/typescript/src/sales/controllers/CreateCoupon.ts`
- Modify: `packages/api/typescript/src/sales/errors/index.ts` — add coupon error codes
- Modify: `packages/contracts/db/schema/sales.ts` — add the `coupons` table
- Modify: `packages/api/typescript/src/sales/registry.ts` — bind `CouponRepository`
- Test: `packages/api/typescript/src/sales/objects/CouponCode.test.ts`
- Test: `packages/api/typescript/src/sales/entities/Coupon.test.ts`
- Test: `packages/api/typescript/src/sales/usecases/CreateCoupon.test.ts`

**Files to read:**
- `packages/api/typescript/src/sales/entities/OrderOverride.ts`
- `packages/api/typescript/src/sales/registry.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /value-object, /entity, /repository, /db-modelling, /migrate, /usecase, /controller, /test
**Depends on:** (none)

### Step T1.1 — Scaffold the artifacts

```bash
bun cli value-object sales CouponCode --primitive
bun cli entity sales Coupon --aggregate
bun cli repository sales Coupon
bun cli usecase sales CreateCoupon
bun cli controller sales CreateCoupon
```

### Step T1.2 — Add coupon error codes

Modify `packages/api/typescript/src/sales/errors/index.ts`:

```diff
- export type SalesDomainErrors = 'INVALID_ORDER_OVERRIDE_FIELDS'
+ export type SalesDomainErrors = 'INVALID_ORDER_OVERRIDE_FIELDS' | 'INVALID_COUPON_CODE' | 'INVALID_DISCOUNT_PERCENT'
```

```diff
- export type SalesApplicationErrors = 'ORDER_NOT_FOUND' | 'INVALID_LINE_ID'
+ export type SalesApplicationErrors = 'ORDER_NOT_FOUND' | 'INVALID_LINE_ID' | 'COUPON_ALREADY_EXISTS' | 'COUPON_NOT_FOUND'
```

In the `registerErrorCodes({...})` call, after the `INVALID_LINE_ID` entry add:

```typescript
	INVALID_COUPON_CODE: HttpStatusCode.UNPROCESSABLE_ENTITY,
	INVALID_DISCOUNT_PERCENT: HttpStatusCode.UNPROCESSABLE_ENTITY,
	COUPON_ALREADY_EXISTS: HttpStatusCode.CONFLICT,
	COUPON_NOT_FOUND: HttpStatusCode.NOT_FOUND,
```

### Step T1.3 — Add the `coupons` table + migrate

Modify `packages/contracts/db/schema/sales.ts` — append a `coupons` table (mirrors the existing `salesSchema.table(...)` style; `uniqueIndex`, `integer`, `boolean`, `timestamp` are already imported at the top):

```typescript
export const coupons = salesSchema.table(
	'coupons',
	{
		id: uuid('id').primaryKey(),
		code: text('code').notNull(),
		discountPercent: integer('discount_percent').notNull(),
		active: boolean('active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(0),
	},
	t => [uniqueIndex('coupons_code_unique').on(t.code)],
)
```

Then generate + apply the migration:

```bash
bun migrate:create
bun migrate:dev
```

### Step T1.4 — Mutate the CouponCode value object

```edit path=packages/api/typescript/src/sales/objects/CouponCode.ts
<<<<<<< SEARCH
	.transform(v => v.trim())
=======
	.regex(/^[A-Z0-9]{4,12}$/, { error: 'INVALID_COUPON_CODE' as DomainErrors })
	.transform(v => v.trim().toUpperCase())
>>>>>>> REPLACE
```

### Step T1.5 — Mutate the Coupon entity

Add the `CouponCode` import:

```edit path=packages/api/typescript/src/sales/entities/Coupon.ts
<<<<<<< SEARCH
import { DomainErrors } from '../errors'
=======
import { CouponCode } from '../objects/CouponCode'
import { DomainErrors } from '../errors'
>>>>>>> REPLACE
```

Replace the placeholder schema field with the coupon shape (the `discountPercent` bounds are the `INVALID_DISCOUNT_PERCENT` invariant, AC-3):

```edit path=packages/api/typescript/src/sales/entities/Coupon.ts
<<<<<<< SEARCH
	name: z.string().min(1, { error: 'TODO_NAME_REQUIRED' as DomainErrors }),
=======
	code: z.string(),
	discountPercent: z.number().int().min(1, { error: 'INVALID_DISCOUNT_PERCENT' as DomainErrors }).max(100, { error: 'INVALID_DISCOUNT_PERCENT' as DomainErrors }),
	active: z.boolean(),
>>>>>>> REPLACE
```

Replace the `create` factory (validates the code through the VO, defaults `active`):

```edit path=packages/api/typescript/src/sales/entities/Coupon.ts
<<<<<<< SEARCH
	static create(data: { name: string }): Coupon {
		return new Coupon({
			name: data.name.trim(),
		})
	}
=======
	static create(data: { code: string; discountPercent: number }): Coupon {
		return new Coupon({
			code: CouponCode.create(data.code).value,
			discountPercent: data.discountPercent,
			active: true,
		})
	}
>>>>>>> REPLACE
```

### Step T1.6 — Mutate the repository (add `findByCode` + real Drizzle)

Abstract port — add `findByCode` beside `findById`:

```edit path=packages/api/typescript/src/sales/repositories/CouponRepository/CouponRepository.ts
<<<<<<< SEARCH
	abstract findById(id: string, tx?: Transaction): Promise<Coupon | undefined>
=======
	abstract findById(id: string, tx?: Transaction): Promise<Coupon | undefined>
	abstract findByCode(code: string, tx?: Transaction): Promise<Coupon | undefined>
>>>>>>> REPLACE
```

Drizzle impl — wire the real table + `findByCode` + persistence mapping:

```edit path=packages/api/typescript/src/sales/repositories/CouponRepository/DrizzleCouponRepository.ts
<<<<<<< SEARCH
// import { coupon } from '@template/contracts/db'
=======
import { coupons } from '@template/contracts/db'
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/repositories/CouponRepository/DrizzleCouponRepository.ts
<<<<<<< SEARCH
		const result = await tryCatchAsync(async () => {
			// const rows = await dbClient.select().from(coupon).where(eq(coupon.id, id)).limit(1)
			// return rows[0]
			return undefined as any
		})

		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}
=======
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(coupons).where(eq(coupons.id, id)).limit(1)
			return rows[0]
		})

		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByCode(code: string, tx?: DrizzleClient): Promise<Coupon | undefined> {
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(coupons).where(eq(coupons.code, code)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/repositories/CouponRepository/DrizzleCouponRepository.ts
<<<<<<< SEARCH
		// await dbClient
		// 	.insert(coupon)
		// 	.values(data)
		// 	.onConflictDoUpdate({
		// 		target: coupon.id,
		// 		set: { ...data, id: undefined },
		// 	})

		return entity
=======
		await dbClient
			.insert(coupons)
			.values(data as typeof coupons.$inferInsert)
			.onConflictDoUpdate({ target: coupons.id, set: { ...data, id: undefined } as Partial<typeof coupons.$inferInsert> })

		return entity
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/repositories/CouponRepository/DrizzleCouponRepository.ts
<<<<<<< SEARCH
		// await dbClient.delete(coupon).where(eq(coupon.id, id))
=======
		await dbClient.delete(coupons).where(eq(coupons.id, id))
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/repositories/CouponRepository/DrizzleCouponRepository.ts
<<<<<<< SEARCH
		return {
			id: entity.id.value,
			// Map entity props to columns
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
=======
		return {
			id: entity.id.value,
			code: entity.code,
			discountPercent: entity.discountPercent,
			active: entity.active,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
>>>>>>> REPLACE
```

### Step T1.7 — Bind the repository in the sales registry

Modify `packages/api/typescript/src/sales/registry.ts`:

```diff
+ import { CouponRepository } from './repositories/CouponRepository/CouponRepository'
+ import { DrizzleCouponRepository } from './repositories/CouponRepository/DrizzleCouponRepository'
```

In each of the `integration` and `real` arrays, add:

```typescript
		{ token: CouponRepository, instance: DrizzleCouponRepository },
```

### Step T1.8 — Mutate the CreateCoupon use case

```edit path=packages/api/typescript/src/sales/usecases/CreateCoupon.ts
<<<<<<< SEARCH
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
=======
import { BaseError, Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Coupon } from '@sales/entities'
import { CouponRepository } from '../repositories/CouponRepository/CouponRepository'
import type { ApplicationErrors } from '../errors'
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/usecases/CreateCoupon.ts
<<<<<<< SEARCH
	// Define input schema
=======
	code: z.string(),
	discountPercent: z.number(),
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/usecases/CreateCoupon.ts
<<<<<<< SEARCH
	// Define output schema
=======
	id: z.string(),
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/usecases/CreateCoupon.ts
<<<<<<< SEARCH
	// constructor(private repo: SomeRepository) {
	// 	super()
	// }
=======
	constructor(private readonly coupons: CouponRepository) {
		super()
	}
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/usecases/CreateCoupon.ts
<<<<<<< SEARCH
			// Implement business logic
			return {} as this['output']
=======
			const existing = await this.coupons.findByCode(input.code, tx)
			if (existing) throw new BaseError<ApplicationErrors>('COUPON_ALREADY_EXISTS')
			const coupon = Coupon.create({ code: input.code, discountPercent: input.discountPercent })
			await this.coupons.save(coupon, tx)
			return { id: coupon.id.value }
>>>>>>> REPLACE
```

### Step T1.9 — Mutate the CreateCoupon controller

```edit path=packages/api/typescript/src/sales/controllers/CreateCoupon.ts
<<<<<<< SEARCH
			name: z.string().min(1).max(255),
=======
			code: z.string().min(4).max(12),
			discountPercent: z.number().int().min(1).max(100),
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/controllers/CreateCoupon.ts
<<<<<<< SEARCH
		// TODO: Delegate to use case
		return {
			status: HttpStatusCode.OK,
			data: {} as any,
		}
=======
		const result = await this.createCoupon.execute(body)
		return { status: HttpStatusCode.CREATED, data: result }
>>>>>>> REPLACE
```

> The controller's `this.createCoupon` is injected by the framework from the
> `CreateCoupon` use-case token; the scaffolded controller already wires the
> constructor convention used across `sales` controllers.

### Step T1.10 — Write the behavior tests (RED)

Create `packages/api/typescript/src/sales/objects/CouponCode.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { CouponCode } from './CouponCode'

describe('CouponCode', () => {
  it('upper-cases and accepts a valid code', () => {
    expect(CouponCode.create('save10').value).toBe('SAVE10')
  })
  it('rejects a code outside ^[A-Z0-9]{4,12}$ with INVALID_COUPON_CODE', () => {
    expect(() => CouponCode.create('a!')).toThrow(BaseError)
  })
})
```

Create `packages/api/typescript/src/sales/entities/Coupon.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { Coupon } from './Coupon'

describe('Coupon', () => {
  it('creates an active coupon from a code + discount', () => {
    const c = Coupon.create({ code: 'SAVE10', discountPercent: 10 })
    expect(c.code).toBe('SAVE10')
    expect(c.active).toBe(true)
  })
  it('rejects a discount outside 1-100 with INVALID_DISCOUNT_PERCENT', () => {
    expect(() => Coupon.create({ code: 'SAVE10', discountPercent: 0 })).toThrow(BaseError)
    expect(() => Coupon.create({ code: 'SAVE10', discountPercent: 101 })).toThrow(BaseError)
  })
})
```

Create `packages/api/typescript/src/sales/usecases/CreateCoupon.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { CreateCoupon } from './CreateCoupon'
import { CouponRepository } from '../repositories/CouponRepository/CouponRepository'

describe('CreateCoupon', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer
  let usecase: CreateCoupon

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer, ownerId: 'tenant' })
    usecase = testBed.resolve(CreateCoupon)
  })
  beforeEach(async () => { await testBed.reset() })
  afterAll(async () => { await testBed.destroy() })

  it('persists a new coupon and returns its id', async () => {
    const { id } = await usecase.execute({ code: 'SAVE10', discountPercent: 10 })
    const saved = await testBed.resolve(CouponRepository).findByCode('SAVE10')
    expect(saved?.id.value).toBe(id)
    expect(saved?.discountPercent).toBe(10)
  })

  it('rejects a duplicate code with COUPON_ALREADY_EXISTS', async () => {
    await usecase.execute({ code: 'SAVE10', discountPercent: 10 })
    await expect(usecase.execute({ code: 'SAVE10', discountPercent: 20 })).rejects.toThrow('COUPON_ALREADY_EXISTS')
  })
})
```

### Step T1.11 — Run tests, type-check, lint

Run: `bun test packages/api/typescript/src/sales/objects/CouponCode.test.ts packages/api/typescript/src/sales/entities/Coupon.test.ts packages/api/typescript/src/sales/usecases/CreateCoupon.test.ts`
Then: `bun tsc && bun lint`
Expected: all green; 0 errors. (If `@sales/entities` doesn't yet re-export `Coupon`, the scaffold's barrel append covers it; confirm `entities/index.ts` exports `Coupon`.)

### Step T1.12 — Commit

```bash
git add packages/api/typescript/src/sales/ packages/contracts/db/schema/sales.ts packages/contracts/db/migrations/
git commit -m "feat(sales): create discount coupon (entity + repo + use case + controller) (Task T1)"
```

---

## Task T2: Admin lists and searches coupons

**Files to write:**
- Create: `packages/api/typescript/src/sales/usecases/ListCoupons.ts`
- Create: `packages/api/typescript/src/sales/controllers/ListCoupons.ts`
- Test: `packages/api/typescript/src/sales/usecases/ListCoupons.test.ts`

**Files to read:**
- `packages/api/typescript/src/sales/usecases/CreateCoupon.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /controller, /test
**Depends on:** T1

### Step T2.1 — Scaffold

```bash
bun cli query ListCoupons
bun cli controller sales ListCoupons --method get --path /sales/coupons
```

> `ListCoupons` is a BFF read — the `query` skeleton injects `db: DrizzleClient` and
> queries the `coupons` table directly (no repository).

### Step T2.2 — Mutate the ListCoupons query

```edit path=packages/api/typescript/src/ui/usecases/ListCoupons.ts
<<<<<<< SEARCH
import { Handler, DrizzleClient, z } from '@template/core-typescript'
=======
import { Handler, DrizzleClient, z } from '@template/core-typescript'
import { coupons } from '@template/contracts/db'
import { ilike } from 'drizzle-orm'
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/ui/usecases/ListCoupons.ts
<<<<<<< SEARCH
	// Define input (e.g., userId, filters)
=======
	code: z.string().optional(),
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/ui/usecases/ListCoupons.ts
<<<<<<< SEARCH
	// Define frontend-shaped output
=======
	coupons: z.array(z.object({ id: z.string(), code: z.string(), discountPercent: z.number(), active: z.boolean() })),
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/ui/usecases/ListCoupons.ts
<<<<<<< SEARCH
		// Direct Drizzle access — no repository abstraction
		// const rows = await this.db.select().from(table).where(eq(table.id, input.id))
		return {} as this['output']
=======
		const rows = await this.db
			.select({ id: coupons.id, code: coupons.code, discountPercent: coupons.discountPercent, active: coupons.active })
			.from(coupons)
			.where(input.code ? ilike(coupons.code, `%${input.code}%`) : undefined)
		return { coupons: rows }
>>>>>>> REPLACE
```

### Step T2.3 — Mutate the ListCoupons controller

```edit path=packages/api/typescript/src/sales/controllers/ListCoupons.ts
<<<<<<< SEARCH
		// TODO: Delegate to use case
		return {
			status: HttpStatusCode.OK,
			data: {} as any,
		}
=======
		const result = await this.listCoupons.execute(query ?? {})
		return { status: HttpStatusCode.OK, data: result }
>>>>>>> REPLACE
```

> The scaffolded `list` controller already declares a `z.paginatedQuery`-shaped input
> and destructures `const { query } = request`; the use case accepts an optional
> `code` filter, so passing `query` through is sufficient.

### Step T2.4 — Write the behavior test (RED)

Create `packages/api/typescript/src/sales/usecases/ListCoupons.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { ListCoupons } from '@ui/usecases/ListCoupons'
import { CreateCoupon } from './CreateCoupon'

describe('ListCoupons', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer, ownerId: 'tenant' })
  })
  beforeEach(async () => { await testBed.reset() })
  afterAll(async () => { await testBed.destroy() })

  it('returns all coupons, and filters by code substring', async () => {
    await testBed.resolve(CreateCoupon).execute({ code: 'SAVE10', discountPercent: 10 })
    await testBed.resolve(CreateCoupon).execute({ code: 'WELCOME', discountPercent: 20 })

    const all = await testBed.resolve(ListCoupons).execute({})
    expect(all.coupons).toHaveLength(2)

    const filtered = await testBed.resolve(ListCoupons).execute({ code: 'SAVE' })
    expect(filtered.coupons.map(c => c.code)).toEqual(['SAVE10'])
  })
})
```

### Step T2.5 — Run tests, type-check, lint

Run: `bun test packages/api/typescript/src/sales/usecases/ListCoupons.test.ts && bun tsc && bun lint`
Expected: green; 0 errors.

### Step T2.6 — Commit

```bash
git add packages/api/typescript/src/sales/ packages/api/typescript/src/ui/usecases/ListCoupons.ts
git commit -m "feat(sales): list + search coupons (BFF query) (Task T2)"
```

---

## Task T3: Admin edits a coupon

**Files to write:**
- Create: `packages/api/typescript/src/sales/usecases/UpdateCoupon.ts`
- Create: `packages/api/typescript/src/sales/controllers/UpdateCoupon.ts`
- Modify: `packages/api/typescript/src/sales/entities/Coupon.ts` — add `changeDiscount` / `activate` / `deactivate`
- Test: `packages/api/typescript/src/sales/usecases/UpdateCoupon.test.ts`

**Files to read:**
- `packages/api/typescript/src/sales/usecases/CreateCoupon.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /usecase, /controller, /test
**Depends on:** T2

### Step T3.1 — Add entity mutation methods

```edit path=packages/api/typescript/src/sales/entities/Coupon.ts
<<<<<<< SEARCH
	// Mutation methods:
	// updateName(name: string): void {
	// 	this.name = name; this.validate()
	// }
=======
	changeDiscount(percent: number): void {
		this.discountPercent = percent
		this.validate()
	}

	activate(): void {
		this.active = true
	}

	deactivate(): void {
		this.active = false
	}
>>>>>>> REPLACE
```

### Step T3.2 — Scaffold the update command

```bash
bun cli usecase sales UpdateCoupon
bun cli controller sales UpdateCoupon
```

### Step T3.3 — Mutate the UpdateCoupon use case

```edit path=packages/api/typescript/src/sales/usecases/UpdateCoupon.ts
<<<<<<< SEARCH
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
=======
import { BaseError, Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { CouponRepository } from '../repositories/CouponRepository/CouponRepository'
import type { ApplicationErrors } from '../errors'
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/usecases/UpdateCoupon.ts
<<<<<<< SEARCH
	// Define input schema
=======
	id: z.string(),
	discountPercent: z.number().optional(),
	active: z.boolean().optional(),
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/usecases/UpdateCoupon.ts
<<<<<<< SEARCH
	// Define output schema
=======
	id: z.string(),
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/usecases/UpdateCoupon.ts
<<<<<<< SEARCH
	// constructor(private repo: SomeRepository) {
	// 	super()
	// }
=======
	constructor(private readonly coupons: CouponRepository) {
		super()
	}
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/usecases/UpdateCoupon.ts
<<<<<<< SEARCH
			// Implement business logic
			return {} as this['output']
=======
			const coupon = await this.coupons.findById(input.id, tx)
			if (!coupon) throw new BaseError<ApplicationErrors>('COUPON_NOT_FOUND')
			if (input.discountPercent !== undefined) coupon.changeDiscount(input.discountPercent)
			if (input.active === true) coupon.activate()
			if (input.active === false) coupon.deactivate()
			await this.coupons.save(coupon, tx)
			return { id: coupon.id.value }
>>>>>>> REPLACE
```

### Step T3.4 — Mutate the UpdateCoupon controller

The scaffolded `update` controller declares `params: { id }` + a `body` with `name`,
and destructures `const { params, body } = request`. Replace the body shape and the
delegation:

```edit path=packages/api/typescript/src/sales/controllers/UpdateCoupon.ts
<<<<<<< SEARCH
			name: z.string().min(1).max(255),
=======
			discountPercent: z.number().int().min(1).max(100).optional(),
			active: z.boolean().optional(),
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/controllers/UpdateCoupon.ts
<<<<<<< SEARCH
		// TODO: Delegate to use case
		return {
			status: HttpStatusCode.OK,
			data: {} as any,
		}
=======
		await this.updateCoupon.execute({ id: params.id, ...body })
		return { status: HttpStatusCode.OK, data: undefined }
>>>>>>> REPLACE
```

### Step T3.5 — Write the behavior test (RED)

Create `packages/api/typescript/src/sales/usecases/UpdateCoupon.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { CreateCoupon } from './CreateCoupon'
import { UpdateCoupon } from './UpdateCoupon'
import { CouponRepository } from '../repositories/CouponRepository/CouponRepository'

describe('UpdateCoupon', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer, ownerId: 'tenant' })
  })
  beforeEach(async () => { await testBed.reset() })
  afterAll(async () => { await testBed.destroy() })

  it('updates discount and active, persisting the change', async () => {
    const { id } = await testBed.resolve(CreateCoupon).execute({ code: 'SAVE10', discountPercent: 10 })
    await testBed.resolve(UpdateCoupon).execute({ id, discountPercent: 25, active: false })
    const saved = await testBed.resolve(CouponRepository).findById(id)
    expect(saved?.discountPercent).toBe(25)
    expect(saved?.active).toBe(false)
  })

  it('raises COUPON_NOT_FOUND for a missing id', async () => {
    await expect(testBed.resolve(UpdateCoupon).execute({ id: crypto.randomUUID(), active: false }))
      .rejects.toThrow('COUPON_NOT_FOUND')
  })
})
```

### Step T3.6 — Run tests, type-check, lint

Run: `bun test packages/api/typescript/src/sales/usecases/UpdateCoupon.test.ts && bun tsc && bun lint`
Expected: green; 0 errors.

### Step T3.7 — Commit

```bash
git add packages/api/typescript/src/sales/
git commit -m "feat(sales): edit a coupon's discount + active state (Task T3)"
```

---

## Task T4: Admin deletes a coupon

**Files to write:**
- Create: `packages/api/typescript/src/sales/usecases/DeleteCoupon.ts`
- Create: `packages/api/typescript/src/sales/controllers/DeleteCoupon.ts`
- Test: `packages/api/typescript/src/sales/usecases/DeleteCoupon.test.ts`

**Files to read:**
- `packages/api/typescript/src/sales/usecases/UpdateCoupon.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /test
**Depends on:** T3

### Step T4.1 — Scaffold

```bash
bun cli usecase sales DeleteCoupon
bun cli controller sales DeleteCoupon
```

### Step T4.2 — Mutate the DeleteCoupon use case

```edit path=packages/api/typescript/src/sales/usecases/DeleteCoupon.ts
<<<<<<< SEARCH
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
=======
import { BaseError, Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { CouponRepository } from '../repositories/CouponRepository/CouponRepository'
import type { ApplicationErrors } from '../errors'
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/usecases/DeleteCoupon.ts
<<<<<<< SEARCH
	// Define input schema
=======
	id: z.string(),
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/usecases/DeleteCoupon.ts
<<<<<<< SEARCH
	// constructor(private repo: SomeRepository) {
	// 	super()
	// }
=======
	constructor(private readonly coupons: CouponRepository) {
		super()
	}
>>>>>>> REPLACE
```

```edit path=packages/api/typescript/src/sales/usecases/DeleteCoupon.ts
<<<<<<< SEARCH
			// Implement business logic
			return {} as this['output']
=======
			const coupon = await this.coupons.findById(input.id, tx)
			if (!coupon) throw new BaseError<ApplicationErrors>('COUPON_NOT_FOUND')
			await this.coupons.delete(input.id, tx)
			return {} as this['output']
>>>>>>> REPLACE
```

### Step T4.3 — Mutate the DeleteCoupon controller

The scaffolded `delete` controller declares `params: { id }`, destructures
`const { params } = request`, and outputs `z.void()`:

```edit path=packages/api/typescript/src/sales/controllers/DeleteCoupon.ts
<<<<<<< SEARCH
		// TODO: Delegate to use case
		return {
			status: HttpStatusCode.OK,
			data: {} as any,
		}
=======
		await this.deleteCoupon.execute({ id: params.id })
		return { status: HttpStatusCode.OK, data: undefined }
>>>>>>> REPLACE
```

### Step T4.4 — Write the behavior test (RED)

Create `packages/api/typescript/src/sales/usecases/DeleteCoupon.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { CreateCoupon } from './CreateCoupon'
import { DeleteCoupon } from './DeleteCoupon'
import { CouponRepository } from '../repositories/CouponRepository/CouponRepository'

describe('DeleteCoupon', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer, ownerId: 'tenant' })
  })
  beforeEach(async () => { await testBed.reset() })
  afterAll(async () => { await testBed.destroy() })

  it('removes the coupon', async () => {
    const { id } = await testBed.resolve(CreateCoupon).execute({ code: 'SAVE10', discountPercent: 10 })
    await testBed.resolve(DeleteCoupon).execute({ id })
    expect(await testBed.resolve(CouponRepository).findById(id)).toBeUndefined()
  })

  it('raises COUPON_NOT_FOUND for a missing id', async () => {
    await expect(testBed.resolve(DeleteCoupon).execute({ id: crypto.randomUUID() }))
      .rejects.toThrow('COUPON_NOT_FOUND')
  })
})
```

### Step T4.5 — Run tests, type-check, lint

Run: `bun test packages/api/typescript/src/sales/usecases/DeleteCoupon.test.ts && bun tsc && bun lint`
Expected: green; 0 errors.

### Step T4.6 — Commit

```bash
git add packages/api/typescript/src/sales/
git commit -m "feat(sales): delete a coupon (Task T4)"
```

---

## Task T5: Contract Lock — SDK regen for the coupon endpoints

**Files to write:**
- Regen: `packages/api/typescript/src/api/openapi.json`
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T4

### Step T5.1 — Regenerate OpenAPI + SDK

```bash
bun emit-openapi && bun sdk
```

### Step T5.2 — Verify regen produced the coupon operations

```bash
git diff --stat packages/client/dist/ packages/api/typescript/src/api/openapi.json
```

Expected: `openapi.json` changed; `packages/client/dist/` gains hooks for the four
coupon operations (`useCreateCoupon`, `useListCoupons`, `useUpdateCoupon`,
`useDeleteCoupon`) + their Zod schemas.

### Step T5.3 — Type-check after regen

Run: `bun tsc`
Expected: 0 errors across all workspaces.

### Step T5.4 — Commit

```bash
git add packages/api/typescript/src/api/openapi.json packages/client/dist/
git commit -m "chore(sdk): regenerate openapi+sdk for coupon endpoints (Task T5)"
```

---

## Task T6: Admin manages coupons from the /app/coupons screen

**Files to write:**
- Create: `packages/app/react/src/routes/(app)/coupons/index.tsx` (route shell + search param schema)
- Create: `packages/app/react/src/routes/(app)/coupons/-components/CouponListSection/index.tsx`
- Create: `packages/app/react/src/routes/(app)/coupons/-forms/CouponForm/index.tsx`
- Create: `packages/app/react/src/routes/(app)/coupons/-stores/useCouponDialogStore.ts`
- Test: `packages/e2e/tests/coupons.spec.ts`

**Files to read:**
- `packages/app/react/src/routes/(app)/dashboard/index.tsx`
- `packages/app/react/src/routes/(app)/dashboard/-components/OverviewSection/index.tsx`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /route, /component, /form, /store
**Depends on:** T5

### Step T6.1 — Scaffold the screen

```bash
bun cli route (app)/coupons --search "code?:string"
bun cli component (app)/coupons CouponListSection --recipe section --sdk Coupon --state query,search --skeleton --i18n coupons
bun cli store CouponDialog --route (app)/coupons
bun cli form CouponForm --route (app)/coupons --sdk createCoupon
```

> The `route` scaffolds the URL contract with a `code` search param; the
> `CouponListSection` recipe wires `useListCoupons` + the code search + an inline
> skeleton; the store holds dialog open/editing-id; the form binds the SDK
> `createCoupon` schema.

### Step T6.2 — Mutate the dialog store (open/edit state)

```edit path=packages/app/react/src/routes/(app)/coupons/-stores/useCouponDialogStore.ts
<<<<<<< SEARCH
// TODO: define state
=======
open: boolean
editingId: string | null
>>>>>>> REPLACE
```

> If the store scaffold's placeholder differs, set the store's state to
> `{ open: boolean; editingId: string | null }` with `openCreate()`,
> `openEdit(id)`, and `close()` actions. The list/form read it via the store hook.

### Step T6.3 — Wire the list section (table + actions)

Render a table of `useListCoupons({ code })` rows — columns code · discountPercent ·
active · row actions (Edit → `openEdit(id)`, Delete → confirm → `useDeleteCoupon`). The
`code` filter reads from the route search param (`routeApi.useSearch()`); loading shows
the inline skeleton; empty state lives in the section. Mutations invalidate the
`useListCoupons` query key on success.

### Step T6.4 — Wire the CouponForm (create + edit in a dialog)

The form validates with the SDK schema (`createCoupon` body schema — `code`,
`discountPercent`) and, when `editingId` is set, submits via `useUpdateCoupon`
(omitting `code`, which is immutable post-create); otherwise `useCreateCoupon`. On
success it closes the dialog and invalidates the list query. Known errors surface by
code: `COUPON_ALREADY_EXISTS` → field error on `code`; unknown →
`toast.error(t('common.errors.unexpected'))`.

### Step T6.5 — Regenerate the route tree + type-check

```bash
cd packages/app/react && bun tsr generate && cd ../../..
bun tsc && bun lint
```

Expected: route tree includes `/coupons`; 0 errors.

### Step T6.6 — E2E happy path

Create `packages/e2e/tests/coupons.spec.ts` covering: open `/app/coupons`, create a
coupon via the dialog, see it in the list, edit its discount, delete it. (Follow the
`/e2e` skill's `given` + route-mock helpers.)

### Step T6.7 — Commit

```bash
git add packages/app/react/src/routes/\(app\)/coupons/ packages/app/react/src/routeTree.gen.ts packages/e2e/tests/coupons.spec.ts
git commit -m "feat(app): coupons management screen — list, create, edit, delete (Task T6)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun test packages/api/typescript/src/sales/` — entity/VO/use-case tests pass
- [ ] `bun e2e --grep "coupon"` — the coupons screen happy path passes
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `packages/api/typescript/src/sales/usecases/ListCoupons.test.ts:"returns all coupons, and filters by code substring"`
  - AC-2 → `packages/api/typescript/src/sales/usecases/CreateCoupon.test.ts:"persists a new coupon …"` + `"rejects a duplicate code …"`
  - AC-3 → `packages/api/typescript/src/sales/entities/Coupon.test.ts:"rejects a discount outside 1-100 …"`
  - AC-4 → `packages/api/typescript/src/sales/usecases/UpdateCoupon.test.ts:"updates discount and active …"` + `"raises COUPON_NOT_FOUND …"`
  - AC-5 → `packages/api/typescript/src/sales/usecases/DeleteCoupon.test.ts:"removes the coupon"` + `"raises COUPON_NOT_FOUND …"`
  - AC-6 → `packages/api/typescript/src/sales/objects/CouponCode.test.ts:"rejects a code outside ^[A-Z0-9]{4,12}$ …"`
  - AC-7 → `packages/e2e/tests/coupons.spec.ts` (form validates via the SDK schema — create/edit happy path)

## Notes

- **Scaffold-then-mutate** — every backend artifact is `bun cli`-generated then mutated with `edit` blocks; `bun scripts/review-plan.ts <this plan> --dry-run` reconstructs the backend files (render skeleton + apply edits) and reviews them. Frontend artifacts (route/section/form/store) are scaffolded + edited but reconstructed only in snippet mode (frontend generator reconstruction lands with Phase C wiring into review-plan).
- **Migration** lives in `packages/contracts` (`bun migrate:create` generates, `bun migrate:dev` applies). The `coupons` table precedes any repo/use-case Task that reads it (Step T1.3, before T1.6).
- **`code` is immutable** after create — `UpdateCoupon` changes only `discountPercent`/`active`; the form omits `code` in edit mode.
- **No Mock repo** — use-case tests run in `integration` mode (PGlite + `DrizzleCouponRepository`); the registry binds Coupon only in `integration`/`real`.
