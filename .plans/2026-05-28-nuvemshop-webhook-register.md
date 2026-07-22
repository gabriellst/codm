# NuvemShop Webhook Registration — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** When a NuvemShop sales-channel integration activates, its order/product webhooks register automatically against the Go ingest URL — idempotent, retry-on-failure — and the NuvemShop store id is sourced correctly from the OAuth token response.

**Architecture:** T1 fixes `NuvemShopOAuthCodeExchanger` to read the store id from the token response's `user_id` (the current `input.credentials.storeId` read is dead since inputTokens was cleared) and carries it in the sealed credentials via `outputTokens.storeId`. T2 adds `NuvemShopWebhookRegister` — a sibling of the shipped `ShopifyWebhookRegister`, differing only in provider specifics (Tiendanube host, `Authentication: bearer`, `{event,url}` body, `order/*`+`product/*` topics) — wired into `WebhookRegisterFactory` + the registry. The existing `RegisterIntegrationWebhooksHandler` is unchanged; NuvemShop stops being a `PLATFORM_NOT_SUPPORTED` skip.

**Tech Stack:** TypeScript, Bun, tsyringe, Zod, node fetch (injected for tests)

**Spec:** .specs/2026-05-28-nuvemshop-webhook-register-design.md
**Tasks:** 2
**Estimated minutes:** 95

> Single bounded context (`integration`). No migration, no new contract enum, no HTTP controller → **no SDK Contract Lock task** (`NuvemShopDescription` is a local Zod schema, not a `packages/contracts` TypeSpec source — no regen).

---

## Task T1: NuvemShop OAuth resolves the real store id from the token response

**Files to write:**
- Modify: `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopOAuthCodeExchanger.ts` — parse `user_id`; identifier + `tokens.storeId` = `String(user_id)`; drop the dead `input.credentials.storeId` read
- Modify: `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopDescription.ts` — add `storeId` to `NuvemShopOAuthDescriptionSchema.outputTokens`
- Test: `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopOAuthCodeExchanger.test.ts`

**Files to read:**
- `packages/api/typescript/src/integration/services/shopify/ShopifyOAuthCodeExchanger.ts` — sibling exchanger + its colocated test conventions (fetch-stub shape)
- `packages/api/typescript/src/integration/services/OAuthCodeExchanger/OAuthCodeExchanger.ts` — the `OAuthExchangeResult` type (`tokens`, `identifier`, `displayName?`, `contactEmail?`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /schema, /test
**Depends on:** (none)

### Step T1.1 — Write the failing test

```typescript
// packages/api/typescript/src/integration/services/nuvemshop/NuvemShopOAuthCodeExchanger.test.ts
import { describe, it, expect } from 'bun:test'
import { NuvemShopOAuthCodeExchanger } from './NuvemShopOAuthCodeExchanger'

const app = { appId: 'app_42', clientId: 'cid', clientSecret: 'csecret' }

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('NuvemShopOAuthCodeExchanger', () => {
	it('sources the store id from the token response user_id (identifier + tokens.storeId)', async () => {
		const fetchStub = (async (url: URL | RequestInfo) => {
			// Token exchange POST → returns access_token + scope + user_id; /store GET → enrichment.
			if (String(url).includes('/apps/')) {
				return jsonResponse({ access_token: 'nsat_token', scope: 'read_orders', user_id: 1234567 })
			}
			return jsonResponse({ id: 1234567, name: 'Acme NuvemShop', email: 'owner@acme.com' })
		}) as unknown as typeof fetch
		const exchanger = new NuvemShopOAuthCodeExchanger(app, fetchStub)

		const result = await exchanger.exchange({ code: 'auth_code_abc', credentials: {} })

		expect(result.identifier).toBe('1234567')
		expect(result.tokens.storeId).toBe('1234567')
		expect(result.tokens.accessToken).toBe('nsat_token')
		expect(result.tokens.scope).toBe('read_orders')
	})

	it('throws OAUTH_CODE_EXCHANGE_FAILED when the token response omits user_id', async () => {
		const fetchStub = (async () => jsonResponse({ access_token: 'nsat_token', scope: 'read_orders' })) as unknown as typeof fetch
		const exchanger = new NuvemShopOAuthCodeExchanger(app, fetchStub)
		let caught: unknown = null
		try {
			await exchanger.exchange({ code: 'auth_code_abc', credentials: {} })
		} catch (e) {
			caught = e
		}
		expect((caught as { name: string }).name).toBe('OAUTH_CODE_EXCHANGE_FAILED')
	})

	it('maps empty authorization code to OAUTH_CODE_EXCHANGE_FAILED', async () => {
		const exchanger = new NuvemShopOAuthCodeExchanger(app, (async () => jsonResponse({})) as unknown as typeof fetch)
		let caught: unknown = null
		try {
			await exchanger.exchange({ code: '', credentials: {} })
		} catch (e) {
			caught = e
		}
		expect((caught as { name: string }).name).toBe('OAUTH_CODE_EXCHANGE_FAILED')
	})
})
```

### Step T1.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/integration/services/nuvemshop/NuvemShopOAuthCodeExchanger.test.ts`
Expected: FAIL — the first two assertions fail (`result.tokens.storeId` undefined; `identifier` is `''` because the current code reads `input.credentials.storeId`).

### Step T1.3 — Source the store id from `user_id` in the exchanger

Modify `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopOAuthCodeExchanger.ts`:

Add `user_id` to the response schema:

```diff
 const NuvemShopTokenResponseSchema = z.object({
 	access_token: z.string().min(1),
 	scope: z.string().optional(),
+	user_id: z.union([z.number(), z.string()]),
 })
```

Replace the store-id sourcing + the `return` block (the `identifier` now comes from the parsed `user_id`, not the dead `input.credentials.storeId`):

```diff
-		// The storeId is the merchant-provided identifier (from inputTokens.storeId)
-		const storeId = input.credentials.storeId ?? ''
+		// The store id is the provider's user_id from the token response — the
+		// canonical NuvemShop store id (inputTokens is empty; nothing is merchant-supplied).
+		const storeId = String(parsed.data.user_id)
 		const shopInfo = await this.fetchStoreInfo(storeId, parsed.data.access_token)

 		return {
 			tokens: {
 				accessToken: parsed.data.access_token,
+				storeId,
 				...(parsed.data.scope !== undefined && { scope: parsed.data.scope }),
 			},
 			identifier: storeId,
 			...(shopInfo.displayName !== undefined && { displayName: shopInfo.displayName }),
 			...(shopInfo.contactEmail !== undefined && { contactEmail: shopInfo.contactEmail }),
 		}
```

(`NuvemShopTokenResponseSchema.safeParse` already runs and throws `OAUTH_CODE_EXCHANGE_FAILED` on an unexpected shape — adding `user_id` as required means a response without it now fails that existing guard, satisfying the second test.)

### Step T1.4 — Add `storeId` to the OAuth description outputTokens

Modify `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopDescription.ts`:

```diff
-	outputTokens: z.object({ accessToken: z.string(), scope: z.string() }),
+	outputTokens: z.object({ accessToken: z.string(), scope: z.string(), storeId: z.string().min(1) }),
```

### Step T1.5 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test src/integration/services/nuvemshop/NuvemShopOAuthCodeExchanger.test.ts`
Expected: PASS — 3 tests pass.

### Step T1.6 — Type-check + lint

Run: `cd packages/api/typescript && bun x tsc --noEmit && cd - && bun lint`
Expected: 0 errors. (A pre-existing `CurrencyCode` error in `src/marketing/entities/StoreIntegrationMarketingAccess.test.ts` is unrelated — ignore it.)

### Step T1.7 — Commit

```bash
git add packages/api/typescript/src/integration/services/nuvemshop/NuvemShopOAuthCodeExchanger.ts \
        packages/api/typescript/src/integration/services/nuvemshop/NuvemShopDescription.ts \
        packages/api/typescript/src/integration/services/nuvemshop/NuvemShopOAuthCodeExchanger.test.ts
git commit -m "fix(integration): source NuvemShop store id from OAuth user_id + carry it in outputTokens (Task T1)"
```

---

## Task T2: NuvemShop registers its webhooks idempotently

**Files to write:**
- Create: `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopWebhookRegister.ts`
- Modify: `packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegisterFactory.ts` — add `NuvemShopWebhookRegister` ctor param + `[SALES_CHANNEL][NUVEM_SHOP]` table entry
- Modify: `packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegister.test.ts` — add NuvemShop register describe block + update the factory-test constructions for the new ctor param
- Modify: `packages/api/typescript/src/integration/registry.ts` — add `MOCK_WEBHOOK_REGISTER_NUVEMSHOP` + bind `NuvemShopWebhookRegister` (mock + real)
- Modify: `packages/api/typescript/src/integration/handlers/RegisterIntegrationWebhooksHandler.test.ts` — add the NuvemShop activation case (AC-7)

**Files to read:**
- `packages/api/typescript/src/integration/services/shopify/ShopifyWebhookRegister.ts` — the sibling impl to mirror (GET-then-POST-missing, buildIngestUrl, error handling, deleteWebhooks)
- `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopDescription.ts` — `NuvemShopOAuthDescriptionSchema.shape.outputTokens` (now `{ accessToken, scope, storeId }` after T1) to parse against
- `packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegister.test.ts` — existing test structure (jsonResponse helper, factory describe block) to extend
- `packages/api/typescript/src/integration/handlers/RegisterIntegrationWebhooksHandler.test.ts` — the givenActivated helper shape to add a NuvemShop case

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T1

### Step T2.1 — Add the failing NuvemShop register tests

Append a NuvemShop describe block to `packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegister.test.ts` (the file already imports `WebhookRegister`, `WebhookRegisterFactory`, `MockWebhookRegister`, `ShopifyWebhookRegister`, `Config`, the enums, and has a `jsonResponse` helper):

```typescript
// add to the imports at the top:
import { NuvemShopWebhookRegister } from '../nuvemshop/NuvemShopWebhookRegister'

const NUVEM_SHOP = { type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.NUVEM_SHOP } as const
const NS_STORE_ID = '1234567'
const nsCreds = { accessToken: 'nsat_token', scope: 'read_orders', storeId: NS_STORE_ID }
const NS_TOPICS = [
	'order/cancelled', 'order/created', 'order/edited', 'order/fulfilled',
	'order/packed', 'order/paid', 'order/updated', 'product/created', 'product/updated',
]
const NS_TOPIC_EVENT: Record<string, string> = {
	'order/cancelled': 'sync.external_order_updated',
	'order/created': 'sync.external_order_updated',
	'order/edited': 'sync.external_order_updated',
	'order/fulfilled': 'sync.external_order_updated',
	'order/packed': 'sync.external_order_updated',
	'order/paid': 'sync.external_order_updated',
	'order/updated': 'sync.external_order_updated',
	'product/created': 'sync.external_product_updated',
	'product/updated': 'sync.external_product_updated',
}

describe('NuvemShopWebhookRegister', () => {
	it('POSTs every canonical topic to the tiendanube store webhooks endpoint, each carrying its mapped event', async () => {
		const posted: Array<{ event: string; url: string; auth: string | null }> = []
		const fetchStub = (async (url: URL | RequestInfo, init?: RequestInit) => {
			const method = init?.method ?? 'GET'
			expect(String(url)).toBe(`https://api.tiendanube.com/v1/${NS_STORE_ID}/webhooks`)
			if (method === 'GET') return jsonResponse([])
			const body = JSON.parse(String(init?.body)) as { event: string; url: string }
			posted.push({ event: body.event, url: body.url, auth: new Headers(init?.headers).get('Authentication') })
			return jsonResponse({ id: posted.length }, 201)
		}) as unknown as typeof fetch
		const register = new NuvemShopWebhookRegister(fetchStub)

		await register.registerWebhooks({ credentials: nsCreds, storeIntegrationId: STORE_INTEGRATION_ID, storeId: STORE_ID })

		expect(posted.map(p => p.event).sort()).toEqual([...NS_TOPICS].sort())
		for (const { event, url, auth } of posted) {
			expect(auth).toBe('bearer nsat_token')
			const u = new URL(url)
			expect(u.origin + u.pathname).toBe(`${Config.env.GO_WEBHOOK_PUBLIC_URL}/webhooks`)
			expect(u.searchParams.get('platform')).toBe('NUVEM_SHOP')
			expect(u.searchParams.get('event')).toBe(NS_TOPIC_EVENT[event])
			expect(u.searchParams.get('integrationId')).toBe(STORE_INTEGRATION_ID)
			expect(u.searchParams.get('storeId')).toBe(STORE_ID)
		}
	})

	it('is idempotent — POSTs only topics not already registered (matched by event)', async () => {
		const posted: string[] = []
		const fetchStub = (async (url: URL | RequestInfo, init?: RequestInit) => {
			const method = init?.method ?? 'GET'
			if (method === 'GET') return jsonResponse([{ id: 1, event: 'order/created' }, { id: 2, event: 'product/updated' }])
			const body = JSON.parse(String(init?.body)) as { event: string }
			posted.push(body.event)
			return jsonResponse({ id: posted.length }, 201)
		}) as unknown as typeof fetch
		const register = new NuvemShopWebhookRegister(fetchStub)

		await register.registerWebhooks({ credentials: nsCreds, storeIntegrationId: STORE_INTEGRATION_ID, storeId: STORE_ID })

		expect(posted).not.toContain('order/created')
		expect(posted).not.toContain('product/updated')
		expect(posted).toContain('order/cancelled')
		expect(posted.length).toBe(NS_TOPICS.length - 2)
	})

	it('throws WEBHOOK_REGISTRATION_FAILED on a non-2xx register response', async () => {
		const fetchStub = (async (url: URL | RequestInfo, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'GET') return jsonResponse([])
			return new Response('{"error":"nope"}', { status: 422 })
		}) as unknown as typeof fetch
		const register = new NuvemShopWebhookRegister(fetchStub)
		let caught: unknown = null
		try {
			await register.registerWebhooks({ credentials: nsCreds, storeIntegrationId: STORE_INTEGRATION_ID, storeId: STORE_ID })
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('WEBHOOK_REGISTRATION_FAILED')
	})

	it('throws WEBHOOK_REGISTRATION_FAILED when credentials are missing storeId (fails outputTokens parse)', async () => {
		const register = new NuvemShopWebhookRegister((async () => jsonResponse([])) as unknown as typeof fetch)
		let caught: unknown = null
		try {
			await register.registerWebhooks({
				credentials: { accessToken: 'nsat_token', scope: 'read_orders' },
				storeIntegrationId: STORE_INTEGRATION_ID,
				storeId: STORE_ID,
			})
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('WEBHOOK_REGISTRATION_FAILED')
	})

	it('declares its (type, platform) pair', () => {
		const register = new NuvemShopWebhookRegister()
		expect(register.type).toBe(StoreIntegrationType.SALES_CHANNEL)
		expect(register.platform).toBe(SalesPlatform.NUVEM_SHOP)
	})
})
```

Also update the existing `AuthorizeUrlBuilderFactory`-style factory describe block in this file: every `new WebhookRegisterFactory(new ShopifyWebhookRegister())` construction now needs the NuvemShop arg — `new WebhookRegisterFactory(new ShopifyWebhookRegister(), new NuvemShopWebhookRegister())`. And add an assertion that `factory.get(NUVEM_SHOP)` returns the NuvemShop instance:

```typescript
// inside the existing 'WebhookRegisterFactory' describe — update constructions + add:
it('returns the constructor-injected register for SALES_CHANNEL:NUVEM_SHOP', () => {
	const shopify = new ShopifyWebhookRegister()
	const nuvem = new NuvemShopWebhookRegister()
	const factory = new WebhookRegisterFactory(shopify, nuvem)
	expect(factory.get(NUVEM_SHOP)).toBe(nuvem)
})
```

### Step T2.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/integration/services/WebhookRegister/WebhookRegister.test.ts`
Expected: FAIL with `Cannot find module '../nuvemshop/NuvemShopWebhookRegister'`.

### Step T2.3 — Write the NuvemShop register

```typescript
// packages/api/typescript/src/integration/services/nuvemshop/NuvemShopWebhookRegister.ts
import { BaseError, tryCatchAsync } from '@template/core-typescript'
import { SalesPlatform, StoreIntegrationType, SyncEventName } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import { WebhookRegister } from '../WebhookRegister/WebhookRegister'
import { NuvemShopOAuthDescriptionSchema } from './NuvemShopDescription'

/**
 * Provider topic → canonical ingest `event`. NuvemShop emits granular order
 * lifecycle topics; they all map to the single canonical EXTERNAL_ORDER_UPDATED
 * (Go re-fetches the full order on receipt). Product topics → EXTERNAL_PRODUCT_UPDATED.
 */
const NUVEMSHOP_TOPIC_EVENTS: Record<string, SyncEventName> = {
	'order/cancelled': SyncEventName.EXTERNAL_ORDER_UPDATED,
	'order/created': SyncEventName.EXTERNAL_ORDER_UPDATED,
	'order/edited': SyncEventName.EXTERNAL_ORDER_UPDATED,
	'order/fulfilled': SyncEventName.EXTERNAL_ORDER_UPDATED,
	'order/packed': SyncEventName.EXTERNAL_ORDER_UPDATED,
	'order/paid': SyncEventName.EXTERNAL_ORDER_UPDATED,
	'order/updated': SyncEventName.EXTERNAL_ORDER_UPDATED,
	'product/created': SyncEventName.EXTERNAL_PRODUCT_UPDATED,
	'product/updated': SyncEventName.EXTERNAL_PRODUCT_UPDATED,
}

interface NuvemShopWebhook {
	id: number
	event: string
}

/**
 * NuvemShop (Tiendanube) webhook registration. Lists existing webhooks
 * (GET /v1/{storeId}/webhooks), POSTs only the missing topics, each with `url`
 * = the Go ingest URL carrying that topic's canonical `event` (built via
 * WebhookRegister.buildIngestUrl). Idempotent on retry. The store id + token
 * come from the sealed credentials, parsed against the OAuth description's
 * outputTokens (single source). Any non-2xx / network / schema error throws
 * WEBHOOK_REGISTRATION_FAILED. `fetchFn` is constructor-injected for tests.
 */
export class NuvemShopWebhookRegister extends WebhookRegister {
	readonly type = StoreIntegrationType.SALES_CHANNEL
	readonly platform = SalesPlatform.NUVEM_SHOP

	constructor(private readonly fetchFn: typeof fetch = fetch) {
		super()
	}

	async registerWebhooks(input: { credentials: Record<string, string>; storeIntegrationId: string; storeId: string }): Promise<void> {
		const { storeId, accessToken } = this.requireCreds(input.credentials)

		const existing = await this.listWebhooks(storeId, accessToken)
		const existingEvents = new Set(existing.map(w => w.event))
		const missing = Object.keys(NUVEMSHOP_TOPIC_EVENTS).filter(topic => !existingEvents.has(topic))

		for (const topic of missing) {
			const ingestUrl = WebhookRegister.buildIngestUrl({
				platform: this.platform,
				event: NUVEMSHOP_TOPIC_EVENTS[topic]!,
				integrationId: input.storeIntegrationId,
				storeId: input.storeId,
			})
			const result = await tryCatchAsync(() =>
				this.fetchFn(this.webhooksUrl(storeId), {
					method: 'POST',
					headers: { 'content-type': 'application/json', accept: 'application/json', Authentication: `bearer ${accessToken}` },
					body: JSON.stringify({ event: topic, url: ingestUrl }),
				}),
			)
			if (!result.success) {
				throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', `NuvemShop webhook register network error: ${result.error.message}`)
			}
			if (!result.data.ok) {
				throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', `NuvemShop webhook register HTTP ${result.data.status} for topic ${topic}`)
			}
		}
	}

	async deleteWebhooks(input: { credentials: Record<string, string> }): Promise<void> {
		const { storeId, accessToken } = this.requireCreds(input.credentials)
		const existing = await this.listWebhooks(storeId, accessToken)
		for (const webhook of existing) {
			const result = await tryCatchAsync(() =>
				this.fetchFn(this.webhooksUrl(storeId, webhook.id), {
					method: 'DELETE',
					headers: { Authentication: `bearer ${accessToken}` },
				}),
			)
			if (!result.success || !result.data.ok) {
				throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', `NuvemShop webhook delete failed for id ${webhook.id}`)
			}
		}
	}

	private async listWebhooks(storeId: string, accessToken: string): Promise<NuvemShopWebhook[]> {
		const result = await tryCatchAsync(() =>
			this.fetchFn(this.webhooksUrl(storeId), {
				headers: { accept: 'application/json', Authentication: `bearer ${accessToken}` },
			}),
		)
		if (!result.success) {
			throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', `NuvemShop webhook list network error: ${result.error.message}`)
		}
		if (!result.data.ok) {
			throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', `NuvemShop webhook list HTTP ${result.data.status}`)
		}
		const body = await tryCatchAsync<NuvemShopWebhook[]>(() => result.data.json())
		if (!body.success) {
			throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', 'NuvemShop webhook list returned non-JSON body')
		}
		return Array.isArray(body.data) ? body.data : []
	}

	private requireCreds(credentials: Record<string, string>): { storeId: string; accessToken: string } {
		const parsed = NuvemShopOAuthDescriptionSchema.shape.outputTokens.safeParse(credentials)
		if (!parsed.success) {
			throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', 'invalid NuvemShop credentials shape')
		}
		return { storeId: parsed.data.storeId, accessToken: parsed.data.accessToken }
	}

	private webhooksUrl(storeId: string, webhookId?: number): string {
		return `https://api.tiendanube.com/v1/${storeId}/webhooks${webhookId !== undefined ? `/${webhookId}` : ''}`
	}
}
```

### Step T2.4 — Register NuvemShop in the factory

Modify `packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegisterFactory.ts`:

```diff
 import { ShopifyWebhookRegister } from '../shopify/ShopifyWebhookRegister'
+import { NuvemShopWebhookRegister } from '../nuvemshop/NuvemShopWebhookRegister'
```

```diff
-	constructor(shopify: ShopifyWebhookRegister) {
+	constructor(shopify: ShopifyWebhookRegister, nuvemShop: NuvemShopWebhookRegister) {
 		this.registers = {
 			[StoreIntegrationType.SALES_CHANNEL]: {
 				[SalesPlatform.SHOPIFY]: shopify,
+				[SalesPlatform.NUVEM_SHOP]: nuvemShop,
 			},
 		}
 	}
```

### Step T2.5 — Bind NuvemShop register in the integration registry

Modify `packages/api/typescript/src/integration/registry.ts`:

Add the import alongside `ShopifyWebhookRegister`:

```diff
 import { ShopifyWebhookRegister } from './services/shopify/ShopifyWebhookRegister'
+import { NuvemShopWebhookRegister } from './services/nuvemshop/NuvemShopWebhookRegister'
```

After the `MOCK_WEBHOOK_REGISTER_SHOPIFY` line, add:

```typescript
const MOCK_WEBHOOK_REGISTER_NUVEMSHOP = new MockWebhookRegister({ type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.NUVEM_SHOP })
```

In `MOCK_CONNECT_SERVICES`, after the `{ token: ShopifyWebhookRegister, instance: MOCK_WEBHOOK_REGISTER_SHOPIFY }` entry, add (BEFORE the `WebhookRegisterFactory` entry so the factory's deps resolve):

```typescript
{ token: NuvemShopWebhookRegister, instance: MOCK_WEBHOOK_REGISTER_NUVEMSHOP },
```

In the `real` array, after `{ token: ShopifyWebhookRegister, useFactory: () => new ShopifyWebhookRegister() }`, add:

```typescript
{ token: NuvemShopWebhookRegister, useFactory: () => new NuvemShopWebhookRegister() },
```

### Step T2.6 — Add the NuvemShop activation handler test (AC-7)

Modify `packages/api/typescript/src/integration/handlers/RegisterIntegrationWebhooksHandler.test.ts`:

Add a NuvemShop case mirroring the Shopify happy-path. Resolve the shared NuvemShop mock register and assert it receives the call when a NuvemShop integration activates:

```typescript
// add SalesPlatform.NUVEM_SHOP usage; resolve the nuvemshop mock in beforeAll/beforeEach
// alongside the existing shopify mock:
//   mockNuvemRegister = testBed.resolve(WebhookRegisterFactory).get({
//     type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.NUVEM_SHOP,
//   }) as MockWebhookRegister
// reset its lastRegisterInput + nextErrorReason in beforeEach.

it('registers webhooks for an activated NuvemShop integration with the opened credentials', async () => {
	const integration = StoreIntegration.create({
		storeId: STORE_ID,
		platform: { type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.NUVEM_SHOP },
		externalId: '1234567',
		displayName: 'Acme NuvemShop',
		ownerId: OWNER,
	})
	const sealed = await vault.seal({ accessToken: 'nsat_token', scope: 'read_orders', storeId: '1234567' })
	const secret = IntegrationCredentialSecret.create({ storeIntegrationId: integration.id.value, sealed })
	integration.attachCredentialSecret(secret.id.value)
	await storeIntegrationRepo.save(integration)
	await credentialSecretRepo.save(secret)

	await handler.handle(new IntegrationActivatedEvent({
		entityId: integration.id.value,
		ownerId: OWNER,
		payload: { storeIntegrationId: integration.id.value },
	}))

	expect(mockNuvemRegister.lastRegisterInput).not.toBeNull()
	expect(mockNuvemRegister.lastRegisterInput!.storeIntegrationId).toBe(integration.id.value)
	expect(mockNuvemRegister.lastRegisterInput!.credentials.storeId).toBe('1234567')
	expect(mockNuvemRegister.lastRegisterInput!.credentials.accessToken).toBe('nsat_token')
})
```

### Step T2.7 — Run tests to verify they pass

Run: `cd packages/api/typescript && bun test src/integration/services/WebhookRegister/WebhookRegister.test.ts src/integration/handlers/RegisterIntegrationWebhooksHandler.test.ts`
Expected: PASS — WebhookRegister suite (existing + 5 new NuvemShop + 1 new factory) and the handler suite (existing + 1 new NuvemShop case) all green.

### Step T2.8 — Full integration suite + type-check + lint

Run: `cd packages/api/typescript && bun test src/integration/ && bun x tsc --noEmit && cd - && bun lint`
Expected: integration suite green; 0 new tsc errors (ignore the pre-existing marketing `CurrencyCode` error); lint clean. The registry change must not break ConnectIntegration / IntegrationActivatedHandler / IntegrationOAuthCallback.

### Step T2.9 — Commit

```bash
git add packages/api/typescript/src/integration/services/nuvemshop/NuvemShopWebhookRegister.ts \
        packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegisterFactory.ts \
        packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegister.test.ts \
        packages/api/typescript/src/integration/registry.ts \
        packages/api/typescript/src/integration/handlers/RegisterIntegrationWebhooksHandler.test.ts
git commit -m "feat(integration): NuvemShop webhook register + factory/registry wiring (Task T2)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean (modulo the pre-existing marketing `CurrencyCode` error)
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — all backend tests pass (integration BC suite + cross-cutting)
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `NuvemShopOAuthCodeExchanger.test.ts:"sources the store id from the token response user_id"`
  - AC-2 → satisfied by T1.4 (description outputTokens gains `storeId`) + exercised by `NuvemShopWebhookRegister.test.ts:"throws WEBHOOK_REGISTRATION_FAILED when credentials are missing storeId"` (proves the schema requires it)
  - AC-3 → `WebhookRegister.test.ts:"returns the constructor-injected register for SALES_CHANNEL:NUVEM_SHOP"` + the existing `"throws PLATFORM_NOT_SUPPORTED for an unregistered (type, platform)"`
  - AC-4 → `WebhookRegister.test.ts:"POSTs every canonical topic to the tiendanube store webhooks endpoint, each carrying its mapped event"`
  - AC-5 → `WebhookRegister.test.ts:"is idempotent — POSTs only topics not already registered (matched by event)"`
  - AC-6 → `WebhookRegister.test.ts:"throws WEBHOOK_REGISTRATION_FAILED on a non-2xx register response"` + `"...when credentials are missing storeId"`
  - AC-7 → `RegisterIntegrationWebhooksHandler.test.ts:"registers webhooks for an activated NuvemShop integration with the opened credentials"`

## Notes

**No new env / contract.** Reuses `GO_WEBHOOK_PUBLIC_URL` (added in the Shopify webhook-register build) and the `SyncEventName` contract enum. `NuvemShopDescription` is a local Zod schema — no `bun contracts` regen.

**Tiendanube host.** `api.tiendanube.com` is the host the existing `NuvemShopOAuthCodeExchanger` uses (`fetchStoreInfo`), deliberately chosen over the reference monolith's `api.nuvemshop.com.br`.

**Sealed-credential shape.** T1 makes the exchanger seal `storeId` into `tokens`; T2's register parses it back out via the description `outputTokens`. No real NuvemShop integrations predate this (the OAuth identifier was broken), so no backfill.

**`deleteWebhooks` has no caller yet** — defined for symmetry with Shopify; the Disconnect-teardown wiring remains a deferred follow-up.
