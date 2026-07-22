# Shopify Post-Activation Timezone Enrichment — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** When a Shopify store activates, fetch its real IANA timezone from `shop.json` and write it straight onto the tenancy `Store` via `StoreRepository`; separately drop the dead `updatedByUserId` from `UpdateStorePreferences`.

**Architecture:** `ShopifyAdditionalPlatformHandler.run()` (already the Shopify post-activation step, invoked by `RunAdditionalPlatformHandler` on `IntegrationActivatedEvent`) gains a best-effort timezone step after webhook registration: fetch `shop.json`, and if a timezone comes back, load the `Store` through tenancy's `StoreRepository` (the sanctioned cross-context-via-repository pattern), call `store.updatePreferences({ timezone }, { hasOrders: false })`, and save. No event, no new handler, no contract. A second, independent task removes `updatedByUserId` from `UpdateStorePreferences`.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, Zod

**Spec:** .specs/2026-05-28-shopify-timezone-enrichment-design.md
**Tasks:** 2
**Estimated minutes:** 65

---

## Task T1: Shopify activation applies the store timezone

**Files to write:**
- Modify: `packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.ts` — inject `StoreRepository` + `fetchFn`; after webhooks, fetch `shop.json` and apply the timezone inline (best-effort)
- Modify: `packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.test.ts` — add integration-mode tests for the apply + skip paths
- Modify: `packages/api/typescript/src/integration/registry.ts` — real `useFactory` resolves `StoreRepository`

**Files to read:**
- `packages/api/typescript/src/integration/services/shopify/ShopifyWebhookRegister.ts`
- `packages/api/typescript/src/tenancy/entities/Store.ts`
- `packages/api/typescript/tests/support/given/stores.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler, /service, /test
**Depends on:** (none)

### Step T1.1 — Write the failing test

Add these two integration-mode tests to `ShopifyAdditionalPlatformHandler.test.ts`. The existing pure-unit webhook tests stay as-is — they construct the handler with no `StoreRepository`, so the timezone step is skipped. The new block uses `TestBed` (PGlite) so a real `StoreRepository` + a seeded `Store` are available. A single `fetch` stub routes by URL: `shop.json` → the shop payload, `webhooks.json` → the register's list/POST.

Append to the file (new `describe` block; keep the existing one):

```typescript
import { afterAll, beforeAll, beforeEach, describe as describe2, it as it2, expect as expect2 } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { givenStore } from '@test/support/given'
import { StoreRepository } from '@tenancy/repositories/StoreRepository'

describe2('ShopifyAdditionalPlatformHandler — timezone enrichment', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let storeRepo: StoreRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		storeRepo = testBed.resolve(StoreRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	// Routes shop.json → the given timezone; everything else (webhooks list/POST) → empty/created.
	function fetchStub(shopJson: unknown, shopStatus = 200): typeof fetch {
		return (async (url: URL | RequestInfo, init?: RequestInit) => {
			const href = String(url)
			if (href.includes('/shop.json')) {
				return new Response(JSON.stringify(shopJson), { status: shopStatus, headers: { 'content-type': 'application/json' } })
			}
			if ((init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify({ webhooks: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
			return new Response(JSON.stringify({ webhook: { id: 1 } }), { status: 201, headers: { 'content-type': 'application/json' } })
		}) as unknown as typeof fetch
	}

	const CREDS = { shopDomain: 'acme.myshopify.com', accessToken: 'shpat_token123' }

	it2('writes the fetched iana_timezone onto the Store after registering webhooks', async () => {
		const store = await givenStore(testBed, { timezone: 'UTC' })
		const fetch = fetchStub({ shop: { iana_timezone: 'America/Sao_Paulo' } })
		const handler = new ShopifyAdditionalPlatformHandler(new ShopifyWebhookRegister(fetch), storeRepo, fetch)

		await handler.run({ storeIntegrationId: store.id.value, storeId: store.id.value, externalId: CREDS.shopDomain, credentials: CREDS })

		const reloaded = await storeRepo.findById(store.id.value)
		expect2(reloaded?.timezone).toBe('America/Sao_Paulo')
	})

	it2('leaves the Store timezone unchanged and does not throw when shop.json fails', async () => {
		const store = await givenStore(testBed, { timezone: 'UTC' })
		const fetch = fetchStub({ error: 'boom' }, 500)
		const handler = new ShopifyAdditionalPlatformHandler(new ShopifyWebhookRegister(fetch), storeRepo, fetch)

		await handler.run({ storeIntegrationId: store.id.value, storeId: store.id.value, externalId: CREDS.shopDomain, credentials: CREDS })

		const reloaded = await storeRepo.findById(store.id.value)
		expect2(reloaded?.timezone).toBe('UTC')
	})

	it2('leaves the Store timezone unchanged when iana_timezone is missing/blank', async () => {
		const store = await givenStore(testBed, { timezone: 'UTC' })
		const fetch = fetchStub({ shop: { iana_timezone: '' } })
		const handler = new ShopifyAdditionalPlatformHandler(new ShopifyWebhookRegister(fetch), storeRepo, fetch)

		await handler.run({ storeIntegrationId: store.id.value, storeId: store.id.value, externalId: CREDS.shopDomain, credentials: CREDS })

		const reloaded = await storeRepo.findById(store.id.value)
		expect2(reloaded?.timezone).toBe('UTC')
	})
})
```

> Note: the aliased `describe2/it2/expect2` import avoids clashing with the existing top-of-file `import { describe, it, expect }`. If the worker prefers, fold these into the existing single import — functionally identical.

### Step T1.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/integration/services/shopify/ShopifyAdditionalPlatformHandler.test.ts`
Expected: FAIL — the new tests fail because the constructor doesn't yet accept `StoreRepository`/`fetchFn` and `run()` doesn't write the timezone (reloaded timezone stays `UTC` in the success case).

### Step T1.3 — Add the timezone step to the handler

Apply these edits to `packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.ts`.

Imports — add `tryCatchAsync` and the tenancy `StoreRepository`:

```edit
<<<<<<< SEARCH
import { BaseError } from '@template/core-typescript'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import { AdditionalPlatformHandler } from '../AdditionalPlatformHandler/AdditionalPlatformHandler'
import { ShopifyCredentialsDescriptionSchema } from './ShopifyDescription'
import { ShopifyWebhookRegister } from './ShopifyWebhookRegister'
=======
import { BaseError, tryCatchAsync } from '@template/core-typescript'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { StoreRepository } from '@tenancy/repositories/StoreRepository'
import type { IntegrationApplicationErrors } from '../../errors'
import { AdditionalPlatformHandler } from '../AdditionalPlatformHandler/AdditionalPlatformHandler'
import { ShopifyCredentialsDescriptionSchema } from './ShopifyDescription'
import { ShopifyWebhookRegister } from './ShopifyWebhookRegister'

const SHOPIFY_API_VERSION = '2024-07'
>>>>>>> REPLACE
```

Constructor — add the optional `StoreRepository` + `fetchFn`. `StoreRepository` is optional so the existing pure-unit webhook tests (which pass no repo) keep working with the timezone step skipped; the registry always provides it in real:

```edit
<<<<<<< SEARCH
	constructor(private readonly webhookRegister: ShopifyWebhookRegister = new ShopifyWebhookRegister()) {
		super()
	}
=======
	constructor(
		private readonly webhookRegister: ShopifyWebhookRegister = new ShopifyWebhookRegister(),
		private readonly storeRepo?: StoreRepository,
		private readonly fetchFn: typeof fetch = fetch,
	) {
		super()
	}
>>>>>>> REPLACE
```

`run()` — after registering webhooks, apply the timezone (best-effort):

```edit
<<<<<<< SEARCH
		await this.webhookRegister.registerWebhooks({
			credentials: parsed.data,
			storeIntegrationId: input.storeIntegrationId,
			storeId: input.storeId,
		})
	}
=======
		await this.webhookRegister.registerWebhooks({
			credentials: parsed.data,
			storeIntegrationId: input.storeIntegrationId,
			storeId: input.storeId,
		})

		await this.applyStoreTimezone(parsed.data.shopDomain, parsed.data.accessToken, input.storeId)
	}

	/**
	 * Best-effort: fetch the merchant's IANA timezone from shop.json and write it
	 * onto the tenancy Store via StoreRepository (cross-context-via-repository).
	 * Webhooks already registered by now, so any failure here is swallowed — a
	 * missing/blank timezone, a vanished Store, or no injected repo is a no-op.
	 * Never throws.
	 */
	private async applyStoreTimezone(shopDomain: string, accessToken: string, storeId: string): Promise<void> {
		if (this.storeRepo === undefined) return
		const timezone = await this.fetchTimezone(shopDomain, accessToken)
		if (timezone === undefined) return
		const store = await this.storeRepo.findById(storeId)
		if (store === undefined) return
		store.updatePreferences({ timezone }, { hasOrders: false })
		await this.storeRepo.save(store)
	}

	private async fetchTimezone(shopDomain: string, accessToken: string): Promise<string | undefined> {
		const result = await tryCatchAsync(() =>
			this.fetchFn(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
				headers: { accept: 'application/json', 'X-Shopify-Access-Token': accessToken },
			}),
		)
		if (!result.success || !result.data.ok) return undefined
		const body = await tryCatchAsync<{ shop?: { iana_timezone?: string } }>(() => result.data.json())
		if (!body.success) return undefined
		const tz = body.data.shop?.iana_timezone
		return tz !== undefined && tz.trim().length > 0 ? tz : undefined
	}
>>>>>>> REPLACE
```

### Step T1.4 — Wire StoreRepository into the real registry binding

Modify `packages/api/typescript/src/integration/registry.ts`.

Add imports near the other service imports (top of file):

```diff
+ import { StoreRepository } from '@tenancy/repositories/StoreRepository'
+ import { ShopifyWebhookRegister } from './services/shopify/ShopifyWebhookRegister'
```

> If `ShopifyWebhookRegister` is already imported, keep the single import.

In the `real` array, replace the Shopify handler binding so the handler is constructed with a resolved `StoreRepository` (the `fetchFn` keeps its default `fetch`):

```diff
- { token: ShopifyAdditionalPlatformHandler, useFactory: () => new ShopifyAdditionalPlatformHandler() },
+ { token: ShopifyAdditionalPlatformHandler, useFactory: c => new ShopifyAdditionalPlatformHandler(new ShopifyWebhookRegister(), c.resolve(StoreRepository)) },
```

The `mock` / `integration` bindings (a `MockAdditionalPlatformHandler` instance) are unchanged — the mock handler does no timezone work.

### Step T1.5 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test src/integration/services/shopify/ShopifyAdditionalPlatformHandler.test.ts`
Expected: PASS — all tests green (3 existing webhook tests + 3 new timezone tests).

### Step T1.6 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors.

### Step T1.7 — Commit

```bash
git add packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.ts \
        packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.test.ts \
        packages/api/typescript/src/integration/registry.ts
git commit -m "feat(integration): apply Shopify store timezone on activation (Task T1)"
```

---

## Task T2: UpdateStorePreferences drops updatedByUserId

**Files to write:**
- Modify: `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.ts` — remove `updatedByUserId` from input + event
- Modify: `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.test.ts` — remove `updatedByUserId` from calls + assertion
- Modify: `packages/api/typescript/src/tenancy/controllers/UpdateStorePreferences.ts` — remove the `updatedByUserId` mapping
- Modify: `packages/api/typescript/src/tenancy/events/StorePreferencesUpdatedEvent.ts` — remove `updatedByUserId` from payload
- Modify: `packages/api/typescript/src/tenancy/events/index.test.ts` — remove `updatedByUserId` from the **StorePreferencesUpdatedEvent** block only

**Files to read:**
- `packages/api/typescript/src/tenancy/usecases/UpdateStoreSettings.ts` (the sibling that KEEPS its `updatedByUserId` — do not touch)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /event, /schema, /test
**Depends on:** (none)

### Step T2.1 — Update the tests first (RED)

Modify `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.test.ts`:
- Delete the `const UPDATER_ID = '00000000-0000-7000-8000-000000000099'` line.
- Remove every `updatedByUserId: UPDATER_ID,` line inside the six `uc.execute({ ... })` calls.
- In the `'empty input → emits StorePreferencesUpdatedEvent (always-publish)'` test, change the assertion `expect(evts[0]!.payload.updatedByUserId).toBe(UPDATER_ID)` to assert the surviving payload shape instead:

```diff
-		await uc.execute({ storeId, updatedByUserId: UPDATER_ID })
+		await uc.execute({ storeId })

		const evts = await readEvents()
		expect(evts).toHaveLength(1)
-		expect(evts[0]!.payload.updatedByUserId).toBe(UPDATER_ID)
+		expect(evts[0]!.payload.store).toBeDefined()
```

Modify `packages/api/typescript/src/tenancy/events/index.test.ts` — in the **`'StorePreferencesUpdatedEvent carries the full Store entity snapshot'`** test only (NOT the `StoreSettingsUpdatedEvent` test above it):

```diff
				} as never,
-				updatedByUserId: USER_ID,
			},
		})
		expect(e.payload.store).toBeDefined()
-		expect(e.payload.updatedByUserId).toBe(USER_ID)
	})
```

### Step T2.2 — Run tests to verify they fail

Run: `cd packages/api/typescript && bun test src/tenancy/usecases/UpdateStorePreferences.test.ts src/tenancy/events/index.test.ts`
Expected: FAIL — `updatedByUserId` is still required by `UpdateStorePreferencesInputSchema` and still emitted, so types/assertions don't line up yet. (TypeScript will also flag the removed `UPDATER_ID`.)

### Step T2.3 — Remove updatedByUserId from the use case

Modify `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.ts`.

Input schema — drop the field:

```diff
export const UpdateStorePreferencesInputSchema = z.object({
	storeId: z.uuid(),
-	updatedByUserId: z.uuid(),
	reportingCurrency: z.enum(CurrencyCode).optional(),
	timezone: z.string().min(1).optional(),
	showStoreNameInNotifications: z.boolean().optional(),
})
```

Event construction — drop the `ownerId` (now optional, omitted) and the payload field:

```diff
			await this.domainEventRepository.save(
				new StorePreferencesUpdatedEvent({
					entityId: input.storeId,
-					ownerId: input.updatedByUserId,
					payload: {
						store: store.toJSON(),
-						updatedByUserId: input.updatedByUserId,
					},
				}),
				tx,
			)
```

### Step T2.4 — Remove updatedByUserId from the event payload schema

Modify `packages/api/typescript/src/tenancy/events/StorePreferencesUpdatedEvent.ts`:

```diff
export const StorePreferencesUpdatedEventSchema = z.domainEvent({
	/** Full Store entity snapshot at publish time (SPEC-08). */
	store: StoreSchema,
-	updatedByUserId: z.uuid(),
})
```

### Step T2.5 — Remove the updatedByUserId mapping from the controller

Modify `packages/api/typescript/src/tenancy/controllers/UpdateStorePreferences.ts` — drop the one line in the `execute(...)` call:

```diff
		await this.updateStorePreferences.execute({
			storeId: request.params.storeId,
-			updatedByUserId: request.ctx.user.id,
			reportingCurrency: request.reportingCurrency,
			timezone: request.timezone,
			showStoreNameInNotifications: request.showStoreNameInNotifications,
		})
```

The controller's `inputSchema` (`ctx.user.id` for auth middleware) and HTTP contract are unchanged — `updatedByUserId` was never part of the wire schema, so no SDK regen is needed.

### Step T2.6 — Run tests to verify they pass

Run: `cd packages/api/typescript && bun test src/tenancy/usecases/UpdateStorePreferences.test.ts src/tenancy/events/index.test.ts`
Expected: PASS — all tests green.

### Step T2.7 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors (confirms no stray `updatedByUserId` reference remains for `UpdateStorePreferences`; `UpdateStoreSettings` still compiles with its own).

### Step T2.8 — Commit

```bash
git add packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.ts \
        packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.test.ts \
        packages/api/typescript/src/tenancy/controllers/UpdateStorePreferences.ts \
        packages/api/typescript/src/tenancy/events/StorePreferencesUpdatedEvent.ts \
        packages/api/typescript/src/tenancy/events/index.test.ts
git commit -m "refactor(tenancy): drop dead updatedByUserId from UpdateStorePreferences (Task T2)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun test affected --base=dev` — affected tests pass
- [ ] E2E: N/A — backend-only change; no user-facing flow. Per project convention (cross-BC behavior is covered by backend tests, e2e deprioritized), coverage is the `ShopifyAdditionalPlatformHandler` integration tests.
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.test.ts:"writes the fetched iana_timezone onto the Store after registering webhooks"`
  - AC-2 → `packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.test.ts:"leaves the Store timezone unchanged and does not throw when shop.json fails"` + `"...when iana_timezone is missing/blank"`
  - AC-3 → `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopAdditionalPlatformHandler.test.ts` (unchanged — NuvemShop handler not touched by T1)
  - AC-4 → `packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.test.ts` + `packages/api/typescript/src/tenancy/events/index.test.ts` (+ `bun tsc` green)

## Notes

- **Cross-context coupling is intentional** (spec Decision 2): `integration` imports tenancy's `StoreRepository` + `Store`. This is the documented api-internal cross-context pattern (CLAUDE.md "importe o Repository dele"), with precedent in `notifications`' `IntegrationHandshakeFailedNotifyHandler`. `TestBed`/`ALL_REGISTRIES` resolves the repo cross-BC.
- **No new event/contract/migration.** The timezone write is a direct repo save; nothing consumes a timezone-change event today.
- **`@tenancy` path alias** is available from integration files (used by test-support given helpers and other BCs). If `bun tsc` cannot resolve `@tenancy/repositories/StoreRepository`, fall back to the relative path `../../../tenancy/repositories/StoreRepository`.
- T1 and T2 touch disjoint files and have no ordering dependency — they may run in parallel.
