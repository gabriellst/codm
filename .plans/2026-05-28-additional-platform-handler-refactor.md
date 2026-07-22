# AdditionalPlatformHandler — Post-Activation Dispatch Consolidation — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. This is a behavior-preserving refactor
> (Kind: chore) — the migrated existing webhook tests are the safety net,
> not new red→green. The outer assertion is "webhooks still register on
> activation, now via AdditionalPlatformHandler" — green integration suite + tsc.

**Goal:** Replace the `WebhookRegister` dispatch layer with a single per-`(type, platform)` `AdditionalPlatformHandler` umbrella that owns all of a platform's post-activation work, calling the concrete webhook registers directly with typed credentials — with no change to what webhooks get registered.

**Architecture:** A new `AdditionalPlatformHandler` abstract + factory (keyed by `(type, platform)`, same shape as `AuthorizeUrlBuilderFactory`) becomes the one post-activation dispatch point. A single subscriber `RunAdditionalPlatformHandler` (replacing `RegisterIntegrationWebhooksHandler`) loads the integration, opens the sealed credentials, resolves the platform's handler, and runs it. `ShopifyAdditionalPlatformHandler` / `NuvemShopAdditionalPlatformHandler` parse the opened credentials to their typed shape and call the concrete `ShopifyWebhookRegister` / `NuvemShopWebhookRegister` directly. The `WebhookRegister` abstract/factory/mock and the old standalone handler are deleted; `buildIngestUrl` relocates to a plain helper.

**Tech Stack:** TypeScript, Bun, tsyringe, Zod, node fetch (injected for tests)

**Spec:** .specs/2026-05-28-additional-platform-handler-refactor-design.md
**Tasks:** 1
**Estimated minutes:** 110

> One atomic Task. The re-typing of the registers (dropping `Record<string,string>`) forces dropping the `WebhookRegister` abstract, which forces removing the factory + old handler, which forces the new dispatch — so these cannot be split into independently-green Tasks. Single bounded context (`integration`); no migration, no contract, no SDK regen, no behavior change.

---

## Task T1: Post-activation webhook registration runs through AdditionalPlatformHandler

**Files to write:**
- Create: `packages/api/typescript/src/integration/services/WebhookRegister/buildWebhookIngestUrl.ts`
- Create: `packages/api/typescript/src/integration/services/WebhookRegister/buildWebhookIngestUrl.test.ts`
- Create: `packages/api/typescript/src/integration/services/AdditionalPlatformHandler/AdditionalPlatformHandler.ts`
- Create: `packages/api/typescript/src/integration/services/AdditionalPlatformHandler/AdditionalPlatformHandlerFactory.ts`
- Create: `packages/api/typescript/src/integration/services/AdditionalPlatformHandler/MockAdditionalPlatformHandler.ts`
- Create: `packages/api/typescript/src/integration/services/AdditionalPlatformHandler/index.ts`
- Create: `packages/api/typescript/src/integration/services/AdditionalPlatformHandler/AdditionalPlatformHandler.test.ts`
- Create: `packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.ts`
- Create: `packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.test.ts`
- Create: `packages/api/typescript/src/integration/services/shopify/ShopifyWebhookRegister.test.ts`
- Create: `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopAdditionalPlatformHandler.ts`
- Create: `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopAdditionalPlatformHandler.test.ts`
- Create: `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopWebhookRegister.test.ts`
- Create: `packages/api/typescript/src/integration/handlers/RunAdditionalPlatformHandler.ts`
- Create: `packages/api/typescript/src/integration/handlers/RunAdditionalPlatformHandler.test.ts`
- Modify: `packages/api/typescript/src/integration/services/shopify/ShopifyWebhookRegister.ts` — drop `extends WebhookRegister`, typed creds, import `buildWebhookIngestUrl`, drop internal parse
- Modify: `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopWebhookRegister.ts` — same
- Modify: `packages/api/typescript/src/integration/services/WebhookRegister/index.ts` — re-export only `buildWebhookIngestUrl`
- Modify: `packages/api/typescript/src/integration/handlers/internal.ts` — swap the export
- Modify: `packages/api/typescript/src/integration/registry.ts` — swap WebhookRegister bindings for AdditionalPlatformHandler bindings
- Delete: `packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegister.ts`
- Delete: `packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegisterFactory.ts`
- Delete: `packages/api/typescript/src/integration/services/WebhookRegister/MockWebhookRegister.ts`
- Delete: `packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegister.test.ts`
- Delete: `packages/api/typescript/src/integration/handlers/RegisterIntegrationWebhooksHandler.ts`
- Delete: `packages/api/typescript/src/integration/handlers/RegisterIntegrationWebhooksHandler.test.ts`

**Files to read:**
- `packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/AuthorizeUrlBuilderFactory.ts` — the factory shape (PlatformForType mapped type, `.get()` throw) to mirror
- `packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/MockAuthorizeUrlBuilder.ts` — mock shape to mirror
- `packages/api/typescript/src/integration/handlers/RegisterIntegrationWebhooksHandler.ts` — the load/open/dispatch preamble being moved into RunAdditionalPlatformHandler
- `packages/api/typescript/src/integration/services/shopify/ShopifyWebhookRegister.ts` + `ShopifyDescription.ts` — current register + `ShopifyCredentialsDescriptionSchema.outputTokens`
- `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopWebhookRegister.ts` + `NuvemShopDescription.ts` — current register + `NuvemShopOAuthDescriptionSchema.outputTokens`
- `packages/api/typescript/src/integration/registry.ts` — current WebhookRegister bindings to swap

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /handler, /test
**Depends on:** (none)

### Step T1.1 — Relocate `buildIngestUrl` to a plain helper

Create `packages/api/typescript/src/integration/services/WebhookRegister/buildWebhookIngestUrl.ts`:

```typescript
import { Config } from '@template/core-typescript'
import type {
	SalesPlatform,
	CheckoutPlatform,
	PaymentGatewayPlatform,
	MarketingPlatform,
	InfoproductPlatform,
} from '@template/contracts-typescript/wire/enums'

export type WebhookIngestPlatform =
	| SalesPlatform
	| CheckoutPlatform
	| PaymentGatewayPlatform
	| MarketingPlatform
	| InfoproductPlatform

/**
 * Builds the public Go ingest URL the provider POSTs to. Matches the Go intake
 * controller's required query params exactly (`packages/api/go/internal/webhooks/controllers/webhook.go`):
 * `platform` (the platform enum value), `event` (a canonical `sync.external_*`
 * SyncEventName), `integrationId` (the StoreIntegration id), `storeId`. One URL
 * is built PER TOPIC — each carries its own `event`.
 */
export function buildWebhookIngestUrl(input: {
	platform: WebhookIngestPlatform
	event: string
	integrationId: string
	storeId: string
}): string {
	const params = new URLSearchParams({
		platform: input.platform,
		event: input.event,
		integrationId: input.integrationId,
		storeId: input.storeId,
	})
	return `${Config.env.GO_WEBHOOK_PUBLIC_URL}/webhooks?${params.toString()}`
}
```

Create `packages/api/typescript/src/integration/services/WebhookRegister/buildWebhookIngestUrl.test.ts` (migrate the existing `WebhookRegister.buildIngestUrl` cases verbatim, calling the new function):

```typescript
import { describe, it, expect } from 'bun:test'
import { Config } from '@template/core-typescript'
import { SalesPlatform } from '@template/contracts-typescript/wire/enums'
import { buildWebhookIngestUrl } from './buildWebhookIngestUrl'

describe('buildWebhookIngestUrl', () => {
	it('builds the Go ingest URL with platform/event/integrationId/storeId query params', () => {
		const url = new URL(
			buildWebhookIngestUrl({
				platform: SalesPlatform.SHOPIFY,
				event: 'sync.external_order_updated',
				integrationId: '019e4d24-7000-7041-9e1c-8108180cddae',
				storeId: '019e4d24-6524-7041-9e1c-8108180cddae',
			}),
		)
		expect(url.origin + url.pathname).toBe(`${Config.env.GO_WEBHOOK_PUBLIC_URL}/webhooks`)
		expect(url.searchParams.get('platform')).toBe('SHOPIFY')
		expect(url.searchParams.get('event')).toBe('sync.external_order_updated')
		expect(url.searchParams.get('integrationId')).toBe('019e4d24-7000-7041-9e1c-8108180cddae')
		expect(url.searchParams.get('storeId')).toBe('019e4d24-6524-7041-9e1c-8108180cddae')
	})
})
```

Replace `packages/api/typescript/src/integration/services/WebhookRegister/index.ts` contents entirely with:

```typescript
export { buildWebhookIngestUrl, type WebhookIngestPlatform } from './buildWebhookIngestUrl'
```

### Step T1.2 — Re-type ShopifyWebhookRegister (drop abstract + typed creds)

Replace `packages/api/typescript/src/integration/services/shopify/ShopifyWebhookRegister.ts` entirely:

```typescript
import { BaseError, tryCatchAsync, type z } from '@template/core-typescript'
import { SalesPlatform, SyncEventName } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import { buildWebhookIngestUrl } from '../WebhookRegister/buildWebhookIngestUrl'
import { ShopifyCredentialsDescriptionSchema } from './ShopifyDescription'

const SHOPIFY_API_VERSION = '2024-07'

/** Typed opened-credential shape — the descriptor's outputTokens. The calling AdditionalPlatformHandler parses Record→this before calling. */
export type ShopifyWebhookCredentials = z.infer<typeof ShopifyCredentialsDescriptionSchema.shape.outputTokens>

const SHOPIFY_TOPIC_EVENTS: Record<string, SyncEventName> = {
	'orders/create': SyncEventName.EXTERNAL_ORDER_UPDATED,
	'orders/updated': SyncEventName.EXTERNAL_ORDER_UPDATED,
	'products/create': SyncEventName.EXTERNAL_PRODUCT_UPDATED,
	'products/update': SyncEventName.EXTERNAL_PRODUCT_UPDATED,
	'order_transactions/create': SyncEventName.EXTERNAL_TRANSACTION_UPDATED,
}

interface ShopifyWebhook {
	id: number
	topic: string
}

/**
 * Shopify webhook registration. Lists existing webhooks and POSTs only the
 * missing topics, each carrying its canonical `event` (via buildWebhookIngestUrl).
 * Idempotent on retry. Credentials arrive already typed + parsed by the caller.
 * Any non-2xx / network / schema error throws WEBHOOK_REGISTRATION_FAILED.
 * `fetchFn` is constructor-injected for test isolation.
 */
export class ShopifyWebhookRegister {
	readonly platform = SalesPlatform.SHOPIFY

	constructor(private readonly fetchFn: typeof fetch = fetch) {}

	async registerWebhooks(input: { credentials: ShopifyWebhookCredentials; storeIntegrationId: string; storeId: string }): Promise<void> {
		const { shopDomain, accessToken } = input.credentials

		const existing = await this.listWebhooks(shopDomain, accessToken)
		const existingTopics = new Set(existing.map(w => w.topic))
		const missing = Object.keys(SHOPIFY_TOPIC_EVENTS).filter(topic => !existingTopics.has(topic))

		for (const topic of missing) {
			const address = buildWebhookIngestUrl({
				platform: this.platform,
				event: SHOPIFY_TOPIC_EVENTS[topic]!,
				integrationId: input.storeIntegrationId,
				storeId: input.storeId,
			})
			const result = await tryCatchAsync(() =>
				this.fetchFn(this.webhooksUrl(shopDomain), {
					method: 'POST',
					headers: { 'content-type': 'application/json', accept: 'application/json', 'X-Shopify-Access-Token': accessToken },
					body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
				}),
			)
			if (!result.success) {
				throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', `Shopify webhook register network error: ${result.error.message}`)
			}
			if (!result.data.ok) {
				throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', `Shopify webhook register HTTP ${result.data.status} for topic ${topic}`)
			}
		}
	}

	async deleteWebhooks(input: { credentials: ShopifyWebhookCredentials }): Promise<void> {
		const { shopDomain, accessToken } = input.credentials
		const existing = await this.listWebhooks(shopDomain, accessToken)
		for (const webhook of existing) {
			const result = await tryCatchAsync(() =>
				this.fetchFn(this.webhooksUrl(shopDomain, webhook.id), {
					method: 'DELETE',
					headers: { 'X-Shopify-Access-Token': accessToken },
				}),
			)
			if (!result.success || !result.data.ok) {
				throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', `Shopify webhook delete failed for id ${webhook.id}`)
			}
		}
	}

	private async listWebhooks(shopDomain: string, accessToken: string): Promise<ShopifyWebhook[]> {
		const result = await tryCatchAsync(() =>
			this.fetchFn(this.webhooksUrl(shopDomain), {
				headers: { accept: 'application/json', 'X-Shopify-Access-Token': accessToken },
			}),
		)
		if (!result.success) {
			throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', `Shopify webhook list network error: ${result.error.message}`)
		}
		if (!result.data.ok) {
			throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', `Shopify webhook list HTTP ${result.data.status}`)
		}
		const body = await tryCatchAsync<{ webhooks?: ShopifyWebhook[] }>(() => result.data.json())
		if (!body.success) {
			throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', 'Shopify webhook list returned non-JSON body')
		}
		return body.data.webhooks ?? []
	}

	private webhooksUrl(shopDomain: string, webhookId?: number): string {
		return `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks${webhookId !== undefined ? `/${webhookId}` : ''}.json`
	}
}
```

Create `packages/api/typescript/src/integration/services/shopify/ShopifyWebhookRegister.test.ts` — migrate the Shopify fetch-level cases from the old `WebhookRegister.test.ts`, now passing typed `credentials` (no parse inside):

```typescript
import { describe, it, expect } from 'bun:test'
import { BaseError, Config } from '@template/core-typescript'
import { ShopifyWebhookRegister } from './ShopifyWebhookRegister'

const STORE_INTEGRATION_ID = '019e4d24-7000-7041-9e1c-8108180cddae'
const STORE_ID = '019e4d24-6524-7041-9e1c-8108180cddae'
const creds = { shopDomain: 'acme.myshopify.com', accessToken: 'shpat_token123' }
const SHOPIFY_TOPICS = ['orders/create', 'orders/updated', 'products/create', 'products/update', 'order_transactions/create']
const TOPIC_EVENT: Record<string, string> = {
	'orders/create': 'sync.external_order_updated',
	'orders/updated': 'sync.external_order_updated',
	'products/create': 'sync.external_product_updated',
	'products/update': 'sync.external_product_updated',
	'order_transactions/create': 'sync.external_transaction_updated',
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('ShopifyWebhookRegister', () => {
	it('POSTs every canonical topic when none registered, each address carrying its mapped event', async () => {
		const posted: Array<{ topic: string; address: string }> = []
		const fetchStub = (async (url: URL | RequestInfo, init?: RequestInit) => {
			const method = init?.method ?? 'GET'
			if (method === 'GET') return jsonResponse({ webhooks: [] })
			const body = JSON.parse(String(init?.body)) as { webhook: { topic: string; address: string } }
			posted.push({ topic: body.webhook.topic, address: body.webhook.address })
			return jsonResponse({ webhook: { id: posted.length } }, 201)
		}) as unknown as typeof fetch
		const register = new ShopifyWebhookRegister(fetchStub)

		await register.registerWebhooks({ credentials: creds, storeIntegrationId: STORE_INTEGRATION_ID, storeId: STORE_ID })

		expect(posted.map(p => p.topic).sort()).toEqual([...SHOPIFY_TOPICS].sort())
		for (const { topic, address } of posted) {
			const u = new URL(address)
			expect(u.origin + u.pathname).toBe(`${Config.env.GO_WEBHOOK_PUBLIC_URL}/webhooks`)
			expect(u.searchParams.get('platform')).toBe('SHOPIFY')
			expect(u.searchParams.get('event')).toBe(TOPIC_EVENT[topic])
			expect(u.searchParams.get('integrationId')).toBe(STORE_INTEGRATION_ID)
			expect(u.searchParams.get('storeId')).toBe(STORE_ID)
		}
	})

	it('is idempotent — POSTs only the topics not already registered', async () => {
		const posted: string[] = []
		const fetchStub = (async (url: URL | RequestInfo, init?: RequestInit) => {
			const method = init?.method ?? 'GET'
			if (method === 'GET') return jsonResponse({ webhooks: [{ id: 1, topic: 'orders/create' }, { id: 2, topic: 'products/update' }] })
			const body = JSON.parse(String(init?.body)) as { webhook: { topic: string } }
			posted.push(body.webhook.topic)
			return jsonResponse({ webhook: { id: posted.length } }, 201)
		}) as unknown as typeof fetch
		const register = new ShopifyWebhookRegister(fetchStub)

		await register.registerWebhooks({ credentials: creds, storeIntegrationId: STORE_INTEGRATION_ID, storeId: STORE_ID })

		expect(posted.sort()).toEqual(['order_transactions/create', 'orders/updated', 'products/create'].sort())
	})

	it('throws WEBHOOK_REGISTRATION_FAILED on a non-2xx register response', async () => {
		const fetchStub = (async (url: URL | RequestInfo, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'GET') return jsonResponse({ webhooks: [] })
			return new Response('{"errors":"unauthorized"}', { status: 401 })
		}) as unknown as typeof fetch
		const register = new ShopifyWebhookRegister(fetchStub)
		let caught: unknown = null
		try {
			await register.registerWebhooks({ credentials: creds, storeIntegrationId: STORE_INTEGRATION_ID, storeId: STORE_ID })
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('WEBHOOK_REGISTRATION_FAILED')
	})

	it('throws WEBHOOK_REGISTRATION_FAILED on a network error', async () => {
		const fetchStub = (async () => {
			throw new Error('ECONNREFUSED')
		}) as unknown as typeof fetch
		const register = new ShopifyWebhookRegister(fetchStub)
		let caught: unknown = null
		try {
			await register.registerWebhooks({ credentials: creds, storeIntegrationId: STORE_INTEGRATION_ID, storeId: STORE_ID })
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('WEBHOOK_REGISTRATION_FAILED')
	})

	it('deleteWebhooks removes every registered webhook', async () => {
		const deleted: string[] = []
		const fetchStub = (async (url: URL | RequestInfo, init?: RequestInit) => {
			const method = init?.method ?? 'GET'
			if (method === 'GET') return jsonResponse({ webhooks: [{ id: 11, topic: 'orders/create' }, { id: 22, topic: 'products/update' }] })
			if (method === 'DELETE') {
				deleted.push(String(url))
				return new Response(null, { status: 200 })
			}
			return jsonResponse({})
		}) as unknown as typeof fetch
		const register = new ShopifyWebhookRegister(fetchStub)

		await register.deleteWebhooks({ credentials: creds })

		expect(deleted.some(u => u.includes('/webhooks/11.json'))).toBe(true)
		expect(deleted.some(u => u.includes('/webhooks/22.json'))).toBe(true)
	})
})
```

### Step T1.3 — Re-type NuvemShopWebhookRegister (drop abstract + typed creds)

Replace `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopWebhookRegister.ts` entirely — same transformation: drop `extends WebhookRegister`, `readonly platform = SalesPlatform.NUVEM_SHOP`, typed `credentials: NuvemShopWebhookCredentials = z.infer<typeof NuvemShopOAuthDescriptionSchema.shape.outputTokens>`, no internal parse, import `buildWebhookIngestUrl`. Keep the topic map, Tiendanube host, `Authentication: bearer`, `{event,url}` body, idempotent GET-then-POST-missing, `deleteWebhooks`, `fetchFn` injection:

```typescript
import { BaseError, tryCatchAsync, type z } from '@template/core-typescript'
import { SalesPlatform, SyncEventName } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import { buildWebhookIngestUrl } from '../WebhookRegister/buildWebhookIngestUrl'
import { NuvemShopOAuthDescriptionSchema } from './NuvemShopDescription'

export type NuvemShopWebhookCredentials = z.infer<typeof NuvemShopOAuthDescriptionSchema.shape.outputTokens>

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
 * NuvemShop (Tiendanube) webhook registration. Lists existing webhooks, POSTs
 * only the missing topics, each `url` carrying its canonical `event` (via
 * buildWebhookIngestUrl). Idempotent. Credentials arrive already typed + parsed
 * by the caller. Any non-2xx / network / schema error throws
 * WEBHOOK_REGISTRATION_FAILED. `fetchFn` is constructor-injected for tests.
 */
export class NuvemShopWebhookRegister {
	readonly platform = SalesPlatform.NUVEM_SHOP

	constructor(private readonly fetchFn: typeof fetch = fetch) {}

	async registerWebhooks(input: { credentials: NuvemShopWebhookCredentials; storeIntegrationId: string; storeId: string }): Promise<void> {
		const { storeId, accessToken } = input.credentials

		const existing = await this.listWebhooks(storeId, accessToken)
		const existingEvents = new Set(existing.map(w => w.event))
		const missing = Object.keys(NUVEMSHOP_TOPIC_EVENTS).filter(topic => !existingEvents.has(topic))

		for (const topic of missing) {
			const ingestUrl = buildWebhookIngestUrl({
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

	async deleteWebhooks(input: { credentials: NuvemShopWebhookCredentials }): Promise<void> {
		const { storeId, accessToken } = input.credentials
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

	private webhooksUrl(storeId: string, webhookId?: number): string {
		return `https://api.tiendanube.com/v1/${storeId}/webhooks${webhookId !== undefined ? `/${webhookId}` : ''}`
	}
}
```

Create `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopWebhookRegister.test.ts` — migrate the NuvemShop fetch-level cases from the old `WebhookRegister.test.ts`, passing typed `credentials = { accessToken, scope, storeId }` (no parse inside):

```typescript
import { describe, it, expect } from 'bun:test'
import { BaseError, Config } from '@template/core-typescript'
import { NuvemShopWebhookRegister } from './NuvemShopWebhookRegister'

const STORE_INTEGRATION_ID = '019e4d24-7000-7041-9e1c-8108180cddae'
const STORE_ID = '019e4d24-6524-7041-9e1c-8108180cddae'
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

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('NuvemShopWebhookRegister', () => {
	it('POSTs every canonical topic to the tiendanube store endpoint, each carrying its mapped event + bearer auth', async () => {
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
})
```

### Step T1.4 — Create the AdditionalPlatformHandler abstract + factory + mock + barrel

Create `packages/api/typescript/src/integration/services/AdditionalPlatformHandler/AdditionalPlatformHandler.ts`:

```typescript
import type {
	StoreIntegrationType,
	SalesPlatform,
	CheckoutPlatform,
	PaymentGatewayPlatform,
	MarketingPlatform,
	InfoproductPlatform,
} from '@template/contracts-typescript/wire/enums'

export type AdditionalPlatformHandlerPlatform =
	| SalesPlatform
	| CheckoutPlatform
	| PaymentGatewayPlatform
	| MarketingPlatform
	| InfoproductPlatform

/**
 * Per-(type, platform) umbrella for everything a platform does after a
 * StoreIntegration activates. Dispatched by `AdditionalPlatformHandlerFactory`
 * (same shape as HandshakeService / AuthorizeUrlBuilder). The activation
 * subscriber opens the sealed credentials and passes them in (Record); the
 * concrete handler parses them to its typed shape and runs its steps (today:
 * register webhooks via its concrete WebhookRegister). A failure propagates so
 * the outbox retries.
 */
export abstract class AdditionalPlatformHandler {
	abstract readonly type: StoreIntegrationType
	abstract readonly platform: AdditionalPlatformHandlerPlatform

	abstract run(input: {
		storeIntegrationId: string
		storeId: string
		externalId: string
		credentials: Record<string, string>
	}): Promise<void>
}
```

Create `packages/api/typescript/src/integration/services/AdditionalPlatformHandler/AdditionalPlatformHandlerFactory.ts`:

```typescript
import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import type { PlatformProps } from '../index'
import { AdditionalPlatformHandler, type AdditionalPlatformHandlerPlatform } from './AdditionalPlatformHandler'
import { ShopifyAdditionalPlatformHandler } from '../shopify/ShopifyAdditionalPlatformHandler'
import { NuvemShopAdditionalPlatformHandler } from '../nuvemshop/NuvemShopAdditionalPlatformHandler'

type PlatformForType<T extends StoreIntegrationType> = T extends StoreIntegrationType.SALES_CHANNEL
	? SalesPlatform
	: AdditionalPlatformHandlerPlatform

type HandlerRegistry = { [T in StoreIntegrationType]?: Partial<Record<PlatformForType<T>, AdditionalPlatformHandler>> }

/**
 * Per-(type, platform) resolver for AdditionalPlatformHandler impls. Mirrors
 * AuthorizeUrlBuilderFactory: constructor-injected impls, nested record keyed by
 * the platform enum, `.get()` throws PLATFORM_NOT_SUPPORTED for any platform
 * without a handler (marketing/unbuilt). No `.has()` — callers `.get()` + skip.
 */
@injectable()
export class AdditionalPlatformHandlerFactory {
	private readonly handlers: HandlerRegistry

	constructor(shopify: ShopifyAdditionalPlatformHandler, nuvemShop: NuvemShopAdditionalPlatformHandler) {
		this.handlers = {
			[StoreIntegrationType.SALES_CHANNEL]: {
				[SalesPlatform.SHOPIFY]: shopify,
				[SalesPlatform.NUVEM_SHOP]: nuvemShop,
			},
		}
	}

	get(platform: PlatformProps): AdditionalPlatformHandler {
		const byPlatform = this.handlers[platform.type] as Partial<Record<string, AdditionalPlatformHandler>> | undefined
		const handler = byPlatform?.[platform.platform]
		if (handler === undefined) {
			throw new BaseError<IntegrationApplicationErrors>(
				'PLATFORM_NOT_SUPPORTED',
				`no AdditionalPlatformHandler registered for ${platform.type}:${platform.platform}`,
			)
		}
		return handler
	}
}
```

Create `packages/api/typescript/src/integration/services/AdditionalPlatformHandler/MockAdditionalPlatformHandler.ts`:

```typescript
import { BaseError } from '@template/core-typescript'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import { AdditionalPlatformHandler } from './AdditionalPlatformHandler'

/**
 * In-memory stub for tests. Records the last run() input; resolves silently by
 * default. Set `nextErrorReason` to make the next run() throw
 * WEBHOOK_REGISTRATION_FAILED. Type/platform default to SHOPIFY, overridable.
 */
export class MockAdditionalPlatformHandler extends AdditionalPlatformHandler {
	readonly type: AdditionalPlatformHandler['type']
	readonly platform: AdditionalPlatformHandler['platform']

	lastRunInput: { storeIntegrationId: string; storeId: string; externalId: string; credentials: Record<string, string> } | null = null
	nextErrorReason: string | null = null

	constructor(opts: { type?: AdditionalPlatformHandler['type']; platform?: AdditionalPlatformHandler['platform'] } = {}) {
		super()
		this.type = opts.type ?? StoreIntegrationType.SALES_CHANNEL
		this.platform = opts.platform ?? SalesPlatform.SHOPIFY
	}

	async run(input: { storeIntegrationId: string; storeId: string; externalId: string; credentials: Record<string, string> }): Promise<void> {
		if (this.nextErrorReason !== null) {
			throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', this.nextErrorReason)
		}
		this.lastRunInput = input
	}
}
```

Create `packages/api/typescript/src/integration/services/AdditionalPlatformHandler/index.ts`:

```typescript
export { AdditionalPlatformHandler, type AdditionalPlatformHandlerPlatform } from './AdditionalPlatformHandler'
export { AdditionalPlatformHandlerFactory } from './AdditionalPlatformHandlerFactory'
export { MockAdditionalPlatformHandler } from './MockAdditionalPlatformHandler'
```

### Step T1.5 — Create the per-platform handlers

Create `packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.ts`:

```typescript
import { BaseError } from '@template/core-typescript'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import { AdditionalPlatformHandler } from '../AdditionalPlatformHandler/AdditionalPlatformHandler'
import { ShopifyCredentialsDescriptionSchema } from './ShopifyDescription'
import { ShopifyWebhookRegister } from './ShopifyWebhookRegister'

/**
 * Shopify's post-activation work. Parses the opened credentials to the typed
 * Shopify shape, then registers the store's webhooks via ShopifyWebhookRegister.
 * (Spec B2 adds the timezone-fetch step here.) `webhookRegister` defaults to a
 * real instance; tests inject one with a stubbed fetch.
 */
export class ShopifyAdditionalPlatformHandler extends AdditionalPlatformHandler {
	readonly type = StoreIntegrationType.SALES_CHANNEL
	readonly platform = SalesPlatform.SHOPIFY

	constructor(private readonly webhookRegister: ShopifyWebhookRegister = new ShopifyWebhookRegister()) {
		super()
	}

	async run(input: { storeIntegrationId: string; storeId: string; externalId: string; credentials: Record<string, string> }): Promise<void> {
		const parsed = ShopifyCredentialsDescriptionSchema.shape.outputTokens.safeParse(input.credentials)
		if (!parsed.success) {
			throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', 'invalid Shopify credentials shape')
		}
		await this.webhookRegister.registerWebhooks({
			credentials: parsed.data,
			storeIntegrationId: input.storeIntegrationId,
			storeId: input.storeId,
		})
	}
}
```

Create `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopAdditionalPlatformHandler.ts`:

```typescript
import { BaseError } from '@template/core-typescript'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import { AdditionalPlatformHandler } from '../AdditionalPlatformHandler/AdditionalPlatformHandler'
import { NuvemShopOAuthDescriptionSchema } from './NuvemShopDescription'
import { NuvemShopWebhookRegister } from './NuvemShopWebhookRegister'

/**
 * NuvemShop's post-activation work. Parses the opened credentials to the typed
 * NuvemShop shape, then registers the store's webhooks via NuvemShopWebhookRegister.
 */
export class NuvemShopAdditionalPlatformHandler extends AdditionalPlatformHandler {
	readonly type = StoreIntegrationType.SALES_CHANNEL
	readonly platform = SalesPlatform.NUVEM_SHOP

	constructor(private readonly webhookRegister: NuvemShopWebhookRegister = new NuvemShopWebhookRegister()) {
		super()
	}

	async run(input: { storeIntegrationId: string; storeId: string; externalId: string; credentials: Record<string, string> }): Promise<void> {
		const parsed = NuvemShopOAuthDescriptionSchema.shape.outputTokens.safeParse(input.credentials)
		if (!parsed.success) {
			throw new BaseError<IntegrationApplicationErrors>('WEBHOOK_REGISTRATION_FAILED', 'invalid NuvemShop credentials shape')
		}
		await this.webhookRegister.registerWebhooks({
			credentials: parsed.data,
			storeIntegrationId: input.storeIntegrationId,
			storeId: input.storeId,
		})
	}
}
```

Create `packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { ShopifyAdditionalPlatformHandler } from './ShopifyAdditionalPlatformHandler'
import { ShopifyWebhookRegister } from './ShopifyWebhookRegister'

const STORE_INTEGRATION_ID = '019e4d24-7000-7041-9e1c-8108180cddae'
const STORE_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('ShopifyAdditionalPlatformHandler', () => {
	it('parses opened credentials and registers webhooks via the Shopify register', async () => {
		let posted = 0
		const fetchStub = (async (url: URL | RequestInfo, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'GET') return jsonResponse({ webhooks: [] })
			posted++
			return jsonResponse({ webhook: { id: posted } }, 201)
		}) as unknown as typeof fetch
		const handler = new ShopifyAdditionalPlatformHandler(new ShopifyWebhookRegister(fetchStub))

		await handler.run({
			storeIntegrationId: STORE_INTEGRATION_ID,
			storeId: STORE_ID,
			externalId: 'acme.myshopify.com',
			credentials: { shopDomain: 'acme.myshopify.com', accessToken: 'shpat_token123' },
		})

		expect(posted).toBe(5)
	})

	it('throws WEBHOOK_REGISTRATION_FAILED on malformed credentials', async () => {
		const handler = new ShopifyAdditionalPlatformHandler(new ShopifyWebhookRegister((async () => jsonResponse({ webhooks: [] })) as unknown as typeof fetch))
		let caught: unknown = null
		try {
			await handler.run({ storeIntegrationId: STORE_INTEGRATION_ID, storeId: STORE_ID, externalId: '', credentials: { shopDomain: '' } })
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('WEBHOOK_REGISTRATION_FAILED')
	})

	it('declares its (type, platform) pair', () => {
		const handler = new ShopifyAdditionalPlatformHandler()
		expect(handler.type).toBe(StoreIntegrationType.SALES_CHANNEL)
		expect(handler.platform).toBe(SalesPlatform.SHOPIFY)
	})
})
```

Create `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopAdditionalPlatformHandler.test.ts` — same shape: a fetch-stubbed `NuvemShopWebhookRegister`, assert 9 POSTs for valid `{accessToken, scope, storeId}` creds; `WEBHOOK_REGISTRATION_FAILED` for creds missing `storeId`; declares `(SALES_CHANNEL, NUVEM_SHOP)`.

```typescript
import { describe, it, expect } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { NuvemShopAdditionalPlatformHandler } from './NuvemShopAdditionalPlatformHandler'
import { NuvemShopWebhookRegister } from './NuvemShopWebhookRegister'

const STORE_INTEGRATION_ID = '019e4d24-7000-7041-9e1c-8108180cddae'
const STORE_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('NuvemShopAdditionalPlatformHandler', () => {
	it('parses opened credentials and registers webhooks via the NuvemShop register', async () => {
		let posted = 0
		const fetchStub = (async (url: URL | RequestInfo, init?: RequestInit) => {
			if ((init?.method ?? 'GET') === 'GET') return jsonResponse([])
			posted++
			return jsonResponse({ id: posted }, 201)
		}) as unknown as typeof fetch
		const handler = new NuvemShopAdditionalPlatformHandler(new NuvemShopWebhookRegister(fetchStub))

		await handler.run({
			storeIntegrationId: STORE_INTEGRATION_ID,
			storeId: STORE_ID,
			externalId: '1234567',
			credentials: { accessToken: 'nsat_token', scope: 'read_orders', storeId: '1234567' },
		})

		expect(posted).toBe(9)
	})

	it('throws WEBHOOK_REGISTRATION_FAILED on credentials missing storeId', async () => {
		const handler = new NuvemShopAdditionalPlatformHandler(new NuvemShopWebhookRegister((async () => jsonResponse([])) as unknown as typeof fetch))
		let caught: unknown = null
		try {
			await handler.run({ storeIntegrationId: STORE_INTEGRATION_ID, storeId: STORE_ID, externalId: '', credentials: { accessToken: 'x', scope: 'y' } })
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('WEBHOOK_REGISTRATION_FAILED')
	})

	it('declares its (type, platform) pair', () => {
		const handler = new NuvemShopAdditionalPlatformHandler()
		expect(handler.type).toBe(StoreIntegrationType.SALES_CHANNEL)
		expect(handler.platform).toBe(SalesPlatform.NUVEM_SHOP)
	})
})
```

### Step T1.6 — Factory + Mock tests

Create `packages/api/typescript/src/integration/services/AdditionalPlatformHandler/AdditionalPlatformHandler.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { CheckoutPlatform, MarketingPlatform, SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { AdditionalPlatformHandlerFactory } from './AdditionalPlatformHandlerFactory'
import { MockAdditionalPlatformHandler } from './MockAdditionalPlatformHandler'
import { ShopifyAdditionalPlatformHandler } from '../shopify/ShopifyAdditionalPlatformHandler'
import { NuvemShopAdditionalPlatformHandler } from '../nuvemshop/NuvemShopAdditionalPlatformHandler'

const SHOPIFY = { type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.SHOPIFY } as const
const NUVEM_SHOP = { type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.NUVEM_SHOP } as const

describe('AdditionalPlatformHandlerFactory', () => {
	it('returns the constructor-injected handler for each registered (type, platform)', () => {
		const shopify = new ShopifyAdditionalPlatformHandler()
		const nuvem = new NuvemShopAdditionalPlatformHandler()
		const factory = new AdditionalPlatformHandlerFactory(shopify, nuvem)
		expect(factory.get(SHOPIFY)).toBe(shopify)
		expect(factory.get(NUVEM_SHOP)).toBe(nuvem)
	})

	it('throws PLATFORM_NOT_SUPPORTED for an unregistered (type, platform)', () => {
		const factory = new AdditionalPlatformHandlerFactory(new ShopifyAdditionalPlatformHandler(), new NuvemShopAdditionalPlatformHandler())
		for (const pair of [
			{ type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.META },
			{ type: StoreIntegrationType.CHECKOUT, platform: CheckoutPlatform.YAMPI },
		]) {
			let caught: unknown = null
			try {
				factory.get(pair)
			} catch (e) {
				caught = e
			}
			expect((caught as BaseError<any>).name).toBe('PLATFORM_NOT_SUPPORTED')
		}
	})
})

describe('MockAdditionalPlatformHandler', () => {
	it('records the last run input and resolves silently by default', async () => {
		const mock = new MockAdditionalPlatformHandler()
		await mock.run({ storeIntegrationId: 'si', storeId: 's', externalId: 'e', credentials: { a: 'b' } })
		expect(mock.lastRunInput?.storeIntegrationId).toBe('si')
	})

	it('throws WEBHOOK_REGISTRATION_FAILED when nextErrorReason is set', async () => {
		const mock = new MockAdditionalPlatformHandler()
		mock.nextErrorReason = 'simulated'
		let caught: unknown = null
		try {
			await mock.run({ storeIntegrationId: 'si', storeId: 's', externalId: 'e', credentials: {} })
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('WEBHOOK_REGISTRATION_FAILED')
	})
})
```

### Step T1.7 — Create the activation subscriber + its test

Create `packages/api/typescript/src/integration/handlers/RunAdditionalPlatformHandler.ts`:

```typescript
import { injectable } from 'tsyringe-neo'
import { BaseError, CredentialVault, EventHandler, tryCatch } from '@template/core-typescript'
import { PlatformSchema } from '@integration/services'
import { IntegrationActivatedEvent } from '../events'
import { StoreIntegrationRepository } from '../repositories/StoreIntegrationRepository'
import { IntegrationCredentialSecretRepository } from '../repositories/IntegrationCredentialSecretRepository'
import { AdditionalPlatformHandlerFactory } from '../services/AdditionalPlatformHandler'

/**
 * Post-activation dispatch. Independent fan-out subscriber to
 * `integration.store_integration.activated` (the existing IntegrationActivatedHandler
 * bridges the same event to Go). Loads the StoreIntegration, resolves the platform's
 * AdditionalPlatformHandler (skip silently when none — marketing/unbuilt), opens the
 * sealed credentials, and runs the handler. A handler error propagates so the outbox
 * retries; a vanished row / missing secret is a graceful no-op.
 */
@injectable()
export class RunAdditionalPlatformHandler extends EventHandler<typeof IntegrationActivatedEvent> {
	readonly event = IntegrationActivatedEvent

	constructor(
		private readonly storeIntegrationRepo: StoreIntegrationRepository,
		private readonly credentialSecretRepo: IntegrationCredentialSecretRepository,
		private readonly vault: CredentialVault,
		private readonly handlers: AdditionalPlatformHandlerFactory,
	) {
		super()
	}

	async handle(event: this['input']): Promise<this['output']> {
		const integration = await this.storeIntegrationRepo.findById(event.payload.storeIntegrationId)
		if (integration === undefined) return

		const platform = PlatformSchema.parse({ type: integration.type, platform: integration.platform })

		const resolved = tryCatch(() => this.handlers.get(platform))
		if (!resolved.success) {
			if (resolved.error instanceof BaseError && resolved.error.name === 'PLATFORM_NOT_SUPPORTED') return
			throw resolved.error
		}
		const handler = resolved.data

		const secret = await this.credentialSecretRepo.findByStoreIntegrationId(integration.id.value)
		if (secret === undefined) return

		const credentials = await this.vault.open<Record<string, string>>({
			encryptionAlgorithm: secret.encryptionAlgorithm,
			encryptedPayload: secret.encryptedPayload,
		})

		await handler.run({
			storeIntegrationId: integration.id.value,
			storeId: integration.storeId.value,
			externalId: integration.externalId,
			credentials,
		})
	}
}
```

Create `packages/api/typescript/src/integration/handlers/RunAdditionalPlatformHandler.test.ts` — migrate the four cases from the old `RegisterIntegrationWebhooksHandler.test.ts`, resolving the platform handler via `AdditionalPlatformHandlerFactory.get(...)` (a `MockAdditionalPlatformHandler` in mock env) and asserting `lastRunInput`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { CredentialVault } from '@template/core-typescript'
import { MarketingPlatform, SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { RunAdditionalPlatformHandler } from './RunAdditionalPlatformHandler'
import { IntegrationActivatedEvent } from '../events'
import { StoreIntegration } from '../entities/StoreIntegration'
import { IntegrationCredentialSecret } from '../entities/IntegrationCredentialSecret'
import { StoreIntegrationRepository, MockStoreIntegrationRepository } from '../repositories/StoreIntegrationRepository'
import { IntegrationCredentialSecretRepository } from '../repositories/IntegrationCredentialSecretRepository'
import { AdditionalPlatformHandlerFactory, MockAdditionalPlatformHandler } from '../services/AdditionalPlatformHandler'

const STORE_ID = '019e4d24-6524-7041-9e1c-8108180cddae'
const OWNER = 'user-owner-1'

describe('RunAdditionalPlatformHandler', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let handler: RunAdditionalPlatformHandler
	let storeIntegrationRepo: StoreIntegrationRepository
	let credentialSecretRepo: IntegrationCredentialSecretRepository
	let vault: CredentialVault
	let mockShopify: MockAdditionalPlatformHandler

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('mock', { testContainer })
		handler = testBed.resolve(RunAdditionalPlatformHandler)
		storeIntegrationRepo = testBed.resolve(StoreIntegrationRepository)
		credentialSecretRepo = testBed.resolve(IntegrationCredentialSecretRepository)
		vault = testBed.resolve(CredentialVault)
		mockShopify = testBed.resolve(AdditionalPlatformHandlerFactory).get({
			type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.SHOPIFY,
		}) as MockAdditionalPlatformHandler
	})
	beforeEach(async () => {
		await testBed.reset()
		;(storeIntegrationRepo as MockStoreIntegrationRepository).clear()
		mockShopify.lastRunInput = null
		mockShopify.nextErrorReason = null
	})
	afterAll(async () => { await testBed.destroy() })

	async function givenActivatedShopify(): Promise<StoreIntegration> {
		const integration = StoreIntegration.create({
			storeId: STORE_ID,
			platform: { type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.SHOPIFY },
			externalId: 'acme.myshopify.com',
			displayName: 'Acme Store',
			ownerId: OWNER,
		})
		const sealed = await vault.seal({ shopDomain: 'acme.myshopify.com', accessToken: 'shpat_token123' })
		const secret = IntegrationCredentialSecret.create({ storeIntegrationId: integration.id.value, sealed })
		integration.attachCredentialSecret(secret.id.value)
		await storeIntegrationRepo.save(integration)
		await credentialSecretRepo.save(secret)
		return integration
	}

	it('runs the platform handler for an activated Shopify integration with opened credentials', async () => {
		const integration = await givenActivatedShopify()
		await handler.handle(new IntegrationActivatedEvent({ entityId: integration.id.value, ownerId: OWNER, payload: { storeIntegrationId: integration.id.value } }))
		expect(mockShopify.lastRunInput).not.toBeNull()
		expect(mockShopify.lastRunInput!.storeIntegrationId).toBe(integration.id.value)
		expect(mockShopify.lastRunInput!.storeId).toBe(STORE_ID)
		expect(mockShopify.lastRunInput!.externalId).toBe('acme.myshopify.com')
		expect(mockShopify.lastRunInput!.credentials.accessToken).toBe('shpat_token123')
	})

	it('skips silently for a platform with no handler (marketing)', async () => {
		const integration = StoreIntegration.create({
			storeId: STORE_ID,
			platform: { type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.META },
			externalId: 'biz_123', displayName: 'Meta Ads', ownerId: OWNER,
		})
		await storeIntegrationRepo.save(integration)
		await handler.handle(new IntegrationActivatedEvent({ entityId: integration.id.value, ownerId: OWNER, payload: { storeIntegrationId: integration.id.value } }))
		expect(mockShopify.lastRunInput).toBeNull()
	})

	it('propagates the error when the platform handler fails (outbox retries)', async () => {
		const integration = await givenActivatedShopify()
		mockShopify.nextErrorReason = 'provider down'
		let caught: unknown = null
		try {
			await handler.handle(new IntegrationActivatedEvent({ entityId: integration.id.value, ownerId: OWNER, payload: { storeIntegrationId: integration.id.value } }))
		} catch (e) {
			caught = e
		}
		expect((caught as { name: string }).name).toBe('WEBHOOK_REGISTRATION_FAILED')
	})

	it('drops silently when the StoreIntegration row vanished', async () => {
		await handler.handle(new IntegrationActivatedEvent({ entityId: 'nope-aaaa-bbbb-cccc-dddddddddddd', ownerId: OWNER, payload: { storeIntegrationId: 'nope-aaaa-bbbb-cccc-dddddddddddd' } }))
		expect(mockShopify.lastRunInput).toBeNull()
	})
})
```

### Step T1.8 — Swap the activation subscriber barrel

Modify `packages/api/typescript/src/integration/handlers/internal.ts`:

```diff
 export { IntegrationActivatedHandler } from './IntegrationActivatedHandler'
-export { RegisterIntegrationWebhooksHandler } from './RegisterIntegrationWebhooksHandler'
+export { RunAdditionalPlatformHandler } from './RunAdditionalPlatformHandler'
 export { IntegrationDeactivatedHandler } from './IntegrationDeactivatedHandler'
```

### Step T1.9 — Rewire the registry

Modify `packages/api/typescript/src/integration/registry.ts`:

1. Replace the WebhookRegister imports (lines ~28–30) with the AdditionalPlatformHandler imports:

```diff
-import { WebhookRegisterFactory, MockWebhookRegister } from './services/WebhookRegister'
-import { ShopifyWebhookRegister } from './services/shopify/ShopifyWebhookRegister'
-import { NuvemShopWebhookRegister } from './services/nuvemshop/NuvemShopWebhookRegister'
+import { AdditionalPlatformHandlerFactory, MockAdditionalPlatformHandler } from './services/AdditionalPlatformHandler'
+import { ShopifyAdditionalPlatformHandler } from './services/shopify/ShopifyAdditionalPlatformHandler'
+import { NuvemShopAdditionalPlatformHandler } from './services/nuvemshop/NuvemShopAdditionalPlatformHandler'
```

2. Replace the two `MOCK_WEBHOOK_REGISTER_*` consts with `MOCK_ADDITIONAL_*`:

```diff
-const MOCK_WEBHOOK_REGISTER_SHOPIFY = new MockWebhookRegister({ type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.SHOPIFY })
-const MOCK_WEBHOOK_REGISTER_NUVEMSHOP = new MockWebhookRegister({ type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.NUVEM_SHOP })
+const MOCK_ADDITIONAL_SHOPIFY = new MockAdditionalPlatformHandler({ type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.SHOPIFY })
+const MOCK_ADDITIONAL_NUVEMSHOP = new MockAdditionalPlatformHandler({ type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.NUVEM_SHOP })
```

3. In `MOCK_CONNECT_SERVICES`, replace the three WebhookRegister entries with the AdditionalPlatformHandler entries (mock instances + the factory):

```diff
-	{ token: ShopifyWebhookRegister, instance: MOCK_WEBHOOK_REGISTER_SHOPIFY },
-	{ token: NuvemShopWebhookRegister, instance: MOCK_WEBHOOK_REGISTER_NUVEMSHOP },
-	{ token: WebhookRegisterFactory, instance: WebhookRegisterFactory },
+	{ token: ShopifyAdditionalPlatformHandler, instance: MOCK_ADDITIONAL_SHOPIFY },
+	{ token: NuvemShopAdditionalPlatformHandler, instance: MOCK_ADDITIONAL_NUVEMSHOP },
+	{ token: AdditionalPlatformHandlerFactory, instance: AdditionalPlatformHandlerFactory },
```

4. In the `real` array, replace the three WebhookRegister entries:

```diff
-		{ token: ShopifyWebhookRegister, useFactory: () => new ShopifyWebhookRegister() },
-		{ token: NuvemShopWebhookRegister, useFactory: () => new NuvemShopWebhookRegister() },
-		{ token: WebhookRegisterFactory, instance: WebhookRegisterFactory },
+		{ token: ShopifyAdditionalPlatformHandler, useFactory: () => new ShopifyAdditionalPlatformHandler() },
+		{ token: NuvemShopAdditionalPlatformHandler, useFactory: () => new NuvemShopAdditionalPlatformHandler() },
+		{ token: AdditionalPlatformHandlerFactory, instance: AdditionalPlatformHandlerFactory },
```

### Step T1.10 — Delete the retired files

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack
rm packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegister.ts \
   packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegisterFactory.ts \
   packages/api/typescript/src/integration/services/WebhookRegister/MockWebhookRegister.ts \
   packages/api/typescript/src/integration/services/WebhookRegister/WebhookRegister.test.ts \
   packages/api/typescript/src/integration/handlers/RegisterIntegrationWebhooksHandler.ts \
   packages/api/typescript/src/integration/handlers/RegisterIntegrationWebhooksHandler.test.ts
```

### Step T1.11 — Verify the whole integration BC stays green

Run: `cd packages/api/typescript && bun test src/integration/ && bun x tsc --noEmit && cd - && bun lint`
Expected: integration suite green (the migrated register/handler/factory tests all pass — same webhook behavior); 0 NEW tsc errors (ignore the pre-existing `CurrencyCode` error in `src/marketing/entities/StoreIntegrationMarketingAccess.test.ts`); lint clean. Confirm no remaining references: `grep -rn "WebhookRegisterFactory\|MockWebhookRegister\|RegisterIntegrationWebhooksHandler\|extends WebhookRegister\|WebhookRegister.buildIngestUrl" packages/api/typescript/src/integration/` returns nothing.

### Step T1.12 — Commit

```bash
git add packages/api/typescript/src/integration/services/AdditionalPlatformHandler/ \
        packages/api/typescript/src/integration/services/WebhookRegister/ \
        packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.ts \
        packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.test.ts \
        packages/api/typescript/src/integration/services/shopify/ShopifyWebhookRegister.ts \
        packages/api/typescript/src/integration/services/shopify/ShopifyWebhookRegister.test.ts \
        packages/api/typescript/src/integration/services/nuvemshop/NuvemShopAdditionalPlatformHandler.ts \
        packages/api/typescript/src/integration/services/nuvemshop/NuvemShopAdditionalPlatformHandler.test.ts \
        packages/api/typescript/src/integration/services/nuvemshop/NuvemShopWebhookRegister.ts \
        packages/api/typescript/src/integration/services/nuvemshop/NuvemShopWebhookRegister.test.ts \
        packages/api/typescript/src/integration/handlers/RunAdditionalPlatformHandler.ts \
        packages/api/typescript/src/integration/handlers/RunAdditionalPlatformHandler.test.ts \
        packages/api/typescript/src/integration/handlers/internal.ts \
        packages/api/typescript/src/integration/registry.ts
git commit -m "refactor(integration): consolidate post-activation dispatch under AdditionalPlatformHandler (Task T1)"
```

(The `git add` of the two service dirs stages both the new files and the deletions within them.)

---

## Final Validation

- [ ] `bun tsc` — full type check clean (modulo the pre-existing marketing `CurrencyCode` error)
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — all backend tests pass (integration BC suite + cross-cutting)
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `AdditionalPlatformHandler.test.ts:"returns the constructor-injected handler for each registered (type, platform)"` + `"throws PLATFORM_NOT_SUPPORTED for an unregistered (type, platform)"`
  - AC-2 → `ShopifyAdditionalPlatformHandler.test.ts:"parses opened credentials and registers webhooks via the Shopify register"` + `"throws WEBHOOK_REGISTRATION_FAILED on malformed credentials"`; register fetch behavior in `ShopifyWebhookRegister.test.ts`
  - AC-3 → `NuvemShopAdditionalPlatformHandler.test.ts:"parses opened credentials and registers webhooks via the NuvemShop register"`; register fetch behavior in `NuvemShopWebhookRegister.test.ts`
  - AC-4 → `RunAdditionalPlatformHandler.test.ts:"runs the platform handler for an activated Shopify integration with opened credentials"` + `"skips silently for a platform with no handler (marketing)"` + `"propagates the error when the platform handler fails"` + `"drops silently when the StoreIntegration row vanished"`
  - AC-5 → `ShopifyWebhookRegister.test.ts` / `NuvemShopWebhookRegister.test.ts` (typed `credentials`, no abstract) + `buildWebhookIngestUrl.test.ts`
  - AC-6 → Step T1.11 grep returns no references to the deleted symbols; tsc + integration suite green

## Notes

**Behavior-preserving refactor.** No new env, no contract, no SDK regen, no migration. The migrated webhook tests (Shopify 5 topics, NuvemShop 9 topics, idempotency, failure→throw, marketing-skip, graceful no-ops) are the safety net — they assert the same outcomes through the new `AdditionalPlatformHandler` dispatch. If any migrated assertion can't be preserved 1:1, that's a signal the refactor changed behavior — stop and reconcile.

**Spec B2 builds on this.** The Shopify timezone fetch + cross-context enrichment event + tenancy handler land as a step inside `ShopifyAdditionalPlatformHandler.run()` — a follow-up spec, not this one.

**Pre-existing marketing tsc error** (`StoreIntegrationMarketingAccess.test.ts`, `'BRL'`→`CurrencyCode`) is unrelated to this refactor and excluded from the Nx tsc build target.
