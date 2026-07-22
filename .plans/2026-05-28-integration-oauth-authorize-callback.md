# Integration OAuth Authorize + Callback — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** A store owner can click "Login with Shopify / Meta / Google Ads / NuvemShop / Tiktok", land at the provider, grant access, and return to `/app/integrations` with a persisted, active `StoreIntegration` — the OAuth code, client secret, and tokens never touch the browser.

**Architecture:** Two new HTTP routes (`POST /integrations/oauth/authorize`, `GET /integrations/oauth/callback/:platform`) bracketing the existing `ConnectIntegration` use case. A stateless HMAC `state` token (`OAuthStateTokenService`, mirroring `tenancy/services/InvitationTokenService.ts`) binds the round-trip. A per-platform `AuthorizeUrlBuilder` factory (mirroring the existing `OAuthCodeExchangerFactory` / `HandshakeServiceFactory` pattern) owns provider-specific URL shapes. The callback verifies state, calls `ConnectIntegration.execute()` in-process via DI, and returns a 302 redirect to the SPA via the framework's `headers.Location` + `status: MOVED_TEMPORARILY` shape. `POST /integrations`'s body schema is narrowed to non-OAuth modes so OAuth becomes physically unreachable through HTTP.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, Zod, node:crypto (HMAC-SHA256, timingSafeEqual)

**Spec:** .specs/2026-05-28-integration-oauth-authorize-callback-design.md
**Tasks:** 6
**Estimated minutes:** 210

> Single bounded context (`integration`). No migration, no projection, no domain/integration event, no cross-service contract. The existing `ConnectIntegration` event triplet still emits — this plan only adds the front-half routes and supporting services around it.

---

## Task T1: State token rejects tampered / expired / platform-mismatched envelopes

**Files to write:**
- Create: `packages/api/typescript/src/integration/services/OAuthStateTokenService.ts`
- Modify: `packages/api/typescript/src/integration/errors/index.ts` — add 4 error codes (`OAUTH_STATE_INVALID`, `OAUTH_STATE_EXPIRED`, `OAUTH_STATE_PLATFORM_MISMATCH`, `OAUTH_USER_DENIED`) + HTTP mappings
- Test: `packages/api/typescript/src/integration/services/OAuthStateTokenService.test.ts`

**Files to read:**
- `packages/api/typescript/src/tenancy/services/InvitationTokenService.ts` — the HMAC envelope analog this mirrors

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /errors, /service, /test
**Depends on:** (none)

### Step T1.1 — Write the failing test

```typescript
import { describe, it, expect } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { SalesPlatform, MarketingPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { OAuthStateTokenService } from './OAuthStateTokenService'

describe('OAuthStateTokenService', () => {
	const service = new OAuthStateTokenService()
	const basePayload = {
		userId: '019e4d24-7100-7041-9e1c-8108180cddbb',
		storeId: '019e4d24-6524-7041-9e1c-8108180cddae',
		type: StoreIntegrationType.SALES_CHANNEL,
		platform: SalesPlatform.SHOPIFY,
		identifier: 'acme.myshopify.com',
	} as const

	it('round-trips a valid payload', () => {
		const state = service.generate({ ...basePayload, ttlSec: 300 })
		const verified = service.verify(state, { expectedPlatform: SalesPlatform.SHOPIFY })
		expect(verified.userId).toBe(basePayload.userId)
		expect(verified.storeId).toBe(basePayload.storeId)
		expect(verified.platform).toBe(SalesPlatform.SHOPIFY)
		expect(verified.identifier).toBe('acme.myshopify.com')
	})

	it('omits identifier when not provided (Meta/Google/etc.)', () => {
		const state = service.generate({
			userId: basePayload.userId,
			storeId: basePayload.storeId,
			type: StoreIntegrationType.MARKETING_PLATFORM,
			platform: MarketingPlatform.GOOGLE_ADS,
			ttlSec: 300,
		})
		const verified = service.verify(state, { expectedPlatform: MarketingPlatform.GOOGLE_ADS })
		expect(verified.identifier).toBeUndefined()
	})

	it('throws OAUTH_STATE_INVALID when the signature is tampered', () => {
		const state = service.generate({ ...basePayload, ttlSec: 300 })
		const [b64, sig] = state.split('.') as [string, string]
		const tampered = `${b64}.${sig.slice(0, -1)}${sig.slice(-1) === 'a' ? 'b' : 'a'}`
		let caught: unknown = null
		try {
			service.verify(tampered, { expectedPlatform: SalesPlatform.SHOPIFY })
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('OAUTH_STATE_INVALID')
	})

	it('throws OAUTH_STATE_INVALID for a malformed envelope (wrong segment count)', () => {
		let caught: unknown = null
		try {
			service.verify('not-a-valid-envelope', { expectedPlatform: SalesPlatform.SHOPIFY })
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('OAUTH_STATE_INVALID')
	})

	it('throws OAUTH_STATE_EXPIRED when exp is in the past', () => {
		const state = service.generate({ ...basePayload, ttlSec: -1 })
		let caught: unknown = null
		try {
			service.verify(state, { expectedPlatform: SalesPlatform.SHOPIFY })
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('OAUTH_STATE_EXPIRED')
	})

	it('throws OAUTH_STATE_PLATFORM_MISMATCH when the callback platform differs from the payload', () => {
		const state = service.generate({ ...basePayload, ttlSec: 300 })
		let caught: unknown = null
		try {
			service.verify(state, { expectedPlatform: MarketingPlatform.META })
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('OAUTH_STATE_PLATFORM_MISMATCH')
	})

	it('two calls with the same payload mint distinct envelopes (nonce)', () => {
		const a = service.generate({ ...basePayload, ttlSec: 300 })
		const b = service.generate({ ...basePayload, ttlSec: 300 })
		expect(a).not.toBe(b)
	})
})
```

### Step T1.2 — Run test to verify it fails

Run: `bun test packages/api/typescript/src/integration/services/OAuthStateTokenService.test.ts`
Expected: FAIL with `Cannot find module './OAuthStateTokenService'`

### Step T1.3 — Add error codes

Modify `packages/api/typescript/src/integration/errors/index.ts`:
- In `IntegrationApplicationErrors` union, append: `| 'OAUTH_STATE_INVALID' | 'OAUTH_STATE_EXPIRED' | 'OAUTH_STATE_PLATFORM_MISMATCH' | 'OAUTH_USER_DENIED'`
- In `registerErrorCodes({...})` block, append entries:
  ```typescript
  OAUTH_STATE_INVALID: HttpStatusCode.UNAUTHORIZED,
  OAUTH_STATE_EXPIRED: HttpStatusCode.UNAUTHORIZED,
  OAUTH_STATE_PLATFORM_MISMATCH: HttpStatusCode.UNAUTHORIZED,
  OAUTH_USER_DENIED: HttpStatusCode.BAD_REQUEST,
  ```

### Step T1.4 — Write the service

```typescript
// packages/api/typescript/src/integration/services/OAuthStateTokenService.ts
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { injectable } from 'tsyringe-neo'
import { BaseError, Config, tryCatch } from '@template/core-typescript'
import type { StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../errors'
import type { PlatformProps } from './index'

export interface OAuthStatePayload {
	userId: string
	storeId: string
	type: StoreIntegrationType
	platform: PlatformProps['platform']
	identifier?: string
	nonce: string
	exp: number // unix seconds
}

/**
 * HMAC-signed OAuth `state` envelope: `${base64url(JSON.stringify(payload))}.${sig}`.
 *
 * Mirrors `tenancy/services/InvitationTokenService` shape. `sig` covers the
 * base64url payload with HMAC-SHA256(JWT_SECRET); verify uses timingSafeEqual.
 * `nonce` is a fresh UUIDv4 per call so two concurrent authorize requests for
 * the same (user, store, platform) mint distinct tokens. TTL is caller-supplied
 * (the AuthorizeIntegration use case sets 300s per spec Decision 2).
 *
 * verify() takes an `expectedPlatform` — the callback URL's path param — and
 * throws OAUTH_STATE_PLATFORM_MISMATCH if it disagrees with the payload's
 * platform, so a state minted for one provider cannot be replayed at another.
 */
@injectable()
export class OAuthStateTokenService {
	generate(input: {
		userId: string
		storeId: string
		type: StoreIntegrationType
		platform: PlatformProps['platform']
		identifier?: string
		ttlSec: number
	}): string {
		const exp = Math.floor(Date.now() / 1000) + input.ttlSec
		const payload: OAuthStatePayload = {
			userId: input.userId,
			storeId: input.storeId,
			type: input.type,
			platform: input.platform,
			nonce: randomUUID(),
			exp,
			...(input.identifier !== undefined && { identifier: input.identifier }),
		}
		const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
		const sig = createHmac('sha256', Config.env.JWT_SECRET).update(b64).digest('base64url')
		return `${b64}.${sig}`
	}

	verify(state: string, opts: { expectedPlatform: PlatformProps['platform'] }): OAuthStatePayload {
		const parts = state.split('.')
		if (parts.length !== 2) throw new BaseError<IntegrationApplicationErrors>('OAUTH_STATE_INVALID')
		const [b64, sig] = parts as [string, string]
		if (!b64 || !sig) throw new BaseError<IntegrationApplicationErrors>('OAUTH_STATE_INVALID')

		const expected = createHmac('sha256', Config.env.JWT_SECRET).update(b64).digest('base64url')
		const a = Buffer.from(sig)
		const b = Buffer.from(expected)
		if (a.length !== b.length || !timingSafeEqual(a, b)) {
			throw new BaseError<IntegrationApplicationErrors>('OAUTH_STATE_INVALID')
		}

		const parsed = tryCatch<OAuthStatePayload>(() => JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')))
		if (!parsed.success) throw new BaseError<IntegrationApplicationErrors>('OAUTH_STATE_INVALID')
		const payload = parsed.data

		if (payload.exp < Math.floor(Date.now() / 1000)) {
			throw new BaseError<IntegrationApplicationErrors>('OAUTH_STATE_EXPIRED')
		}
		if (payload.platform !== opts.expectedPlatform) {
			throw new BaseError<IntegrationApplicationErrors>('OAUTH_STATE_PLATFORM_MISMATCH')
		}

		return payload
	}
}
```

### Step T1.5 — Run test to verify it passes

Run: `bun test packages/api/typescript/src/integration/services/OAuthStateTokenService.test.ts`
Expected: PASS — 7 tests pass

### Step T1.6 — Type-check + lint

Run: `cd packages/api/typescript && bun x tsc --noEmit && cd - && bun lint`
Expected: 0 errors

### Step T1.7 — Commit

```bash
git add packages/api/typescript/src/integration/services/OAuthStateTokenService.ts \
        packages/api/typescript/src/integration/services/OAuthStateTokenService.test.ts \
        packages/api/typescript/src/integration/errors/index.ts
git commit -m "feat(integration): OAuth state token service + error codes (Task T1)"
```

---

## Task T2: Per-platform authorize URLs render with correct params + derived redirect_uri

**Files to write:**
- Create: `packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/AuthorizeUrlBuilder.ts`
- Create: `packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/AuthorizeUrlBuilderFactory.ts`
- Create: `packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/MockAuthorizeUrlBuilder.ts`
- Create: `packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/index.ts`
- Create: `packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/AuthorizeUrlBuilder.test.ts`
- Create: `packages/api/typescript/src/integration/services/shopify/ShopifyAuthorizeUrlBuilder.ts`
- Create: `packages/api/typescript/src/integration/services/meta/MetaAuthorizeUrlBuilder.ts`
- Create: `packages/api/typescript/src/integration/services/google-ads/GoogleAdsAuthorizeUrlBuilder.ts`
- Create: `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopAuthorizeUrlBuilder.ts`
- Create: `packages/api/typescript/src/integration/services/tiktok/TiktokAuthorizeUrlBuilder.ts`
- Modify: `packages/api/typescript/core/src/utils/Config.ts` — add OAuth app credential env entries (renamed per spec)
- Modify: `packages/api/typescript/src/integration/services/shopify/ShopifyDescription.ts` — export `ShopifyOAuthScopes`
- Modify: `packages/api/typescript/src/integration/services/meta/MetaDescription.ts` — export `MetaOAuthScopes`; clear OAuth `inputTokens`
- Modify: `packages/api/typescript/src/integration/services/google-ads/GoogleAdsDescription.ts` — export `GoogleAdsOAuthScopes`; clear OAuth `inputTokens`
- Modify: `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopDescription.ts` — export `NuvemShopOAuthScopes`; clear OAuth `inputTokens`
- Modify: `packages/api/typescript/src/integration/services/tiktok/TiktokDescription.ts` — export `TiktokOAuthScopes`; clear OAuth `inputTokens`

**Files to read:**
- `packages/api/typescript/src/integration/services/HandshakeService/HandshakeServiceFactory.ts` — the factory pattern this mirrors

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T1

### Step T2.1 — Extend Config.env with OAuth app credentials

Modify `packages/api/typescript/core/src/utils/Config.ts`:

In the `env: {...}` block, append:

```typescript
// Provider-app OAuth credentials. Each is the platform's "your app" client_id /
// client_secret pair from the provider's developer console. Empty in dev fails the
// authorize flow at the provider; production must set them. Names align with the
// spec — Decision 8.
SHOPIFY_APP_CLIENT_ID: process.env.SHOPIFY_APP_CLIENT_ID ?? '',
SHOPIFY_APP_CLIENT_SECRET: process.env.SHOPIFY_APP_CLIENT_SECRET ?? '',
META_APP_CLIENT_ID: process.env.META_APP_CLIENT_ID ?? '',
META_APP_CLIENT_SECRET: process.env.META_APP_CLIENT_SECRET ?? '',
GOOGLE_ADS_CLIENT_ID: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
GOOGLE_ADS_CLIENT_SECRET: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
NUVEMSHOP_APP_CLIENT_ID: process.env.NUVEMSHOP_APP_CLIENT_ID ?? '',
NUVEMSHOP_APP_CLIENT_SECRET: process.env.NUVEMSHOP_APP_CLIENT_SECRET ?? '',
NUVEMSHOP_APP_ID: process.env.NUVEMSHOP_APP_ID ?? '',
TIKTOK_APP_CLIENT_ID: process.env.TIKTOK_APP_CLIENT_ID ?? '',
TIKTOK_APP_CLIENT_SECRET: process.env.TIKTOK_APP_CLIENT_SECRET ?? '',
```

(`NUVEMSHOP_APP_ID` stays — distinct from `client_id`, used in NuvemShop's authorize URL path: `https://www.nuvemshop.com.br/apps/${APP_ID}/authorize`.)

### Step T2.2 — Write the consolidated test (one describe per builder + factory)

```typescript
// packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/AuthorizeUrlBuilder.test.ts
import { describe, it, expect } from 'bun:test'
import { BaseError, Config } from '@template/core-typescript'
import { CheckoutPlatform, MarketingPlatform, SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { AuthorizeUrlBuilderFactory } from './AuthorizeUrlBuilderFactory'
import { MockAuthorizeUrlBuilder } from './MockAuthorizeUrlBuilder'
import { ShopifyAuthorizeUrlBuilder } from '../shopify/ShopifyAuthorizeUrlBuilder'
import { MetaAuthorizeUrlBuilder } from '../meta/MetaAuthorizeUrlBuilder'
import { GoogleAdsAuthorizeUrlBuilder } from '../google-ads/GoogleAdsAuthorizeUrlBuilder'
import { NuvemShopAuthorizeUrlBuilder } from '../nuvemshop/NuvemShopAuthorizeUrlBuilder'
import { TiktokAuthorizeUrlBuilder } from '../tiktok/TiktokAuthorizeUrlBuilder'

const STATE = 'stub-state-token'

describe('ShopifyAuthorizeUrlBuilder', () => {
	it('builds an authorize URL anchored on the shop domain with scopes + derived redirect_uri', () => {
		const b = new ShopifyAuthorizeUrlBuilder({ clientId: 'shp_client', clientSecret: 'unused-here' })
		const url = new URL(b.build({ identifier: 'acme.myshopify.com', state: STATE }))
		expect(url.host).toBe('acme.myshopify.com')
		expect(url.pathname).toBe('/admin/oauth/authorize')
		expect(url.searchParams.get('client_id')).toBe('shp_client')
		expect(url.searchParams.get('scope')).toBe('read_products,read_orders,read_customers')
		expect(url.searchParams.get('state')).toBe(STATE)
		expect(url.searchParams.get('redirect_uri')).toBe(`${Config.env.API_URL}/integrations/oauth/callback/shopify`)
	})

	it('throws if identifier is missing (Shopify needs the shop domain to build the host)', () => {
		const b = new ShopifyAuthorizeUrlBuilder({ clientId: 'x', clientSecret: 'y' })
		expect(() => b.build({ state: STATE })).toThrow()
	})
})

describe('MetaAuthorizeUrlBuilder', () => {
	it('builds a Facebook OAuth dialog URL with required params', () => {
		const b = new MetaAuthorizeUrlBuilder({ clientId: 'meta_client', clientSecret: 'unused' })
		const url = new URL(b.build({ state: STATE }))
		expect(url.host).toBe('www.facebook.com')
		expect(url.pathname.startsWith('/v')).toBe(true) // versioned path /v19.0/dialog/oauth
		expect(url.pathname.endsWith('/dialog/oauth')).toBe(true)
		expect(url.searchParams.get('client_id')).toBe('meta_client')
		expect(url.searchParams.get('response_type')).toBe('code')
		expect(url.searchParams.get('state')).toBe(STATE)
		expect(url.searchParams.get('redirect_uri')).toBe(`${Config.env.API_URL}/integrations/oauth/callback/meta`)
		expect(url.searchParams.get('scope')).not.toBeNull()
	})
})

describe('GoogleAdsAuthorizeUrlBuilder', () => {
	it('includes access_type=offline and prompt=consent for refresh-token issuance', () => {
		const b = new GoogleAdsAuthorizeUrlBuilder({ clientId: 'g_client', clientSecret: 'unused' })
		const url = new URL(b.build({ state: STATE }))
		expect(url.host).toBe('accounts.google.com')
		expect(url.pathname).toBe('/o/oauth2/v2/auth')
		expect(url.searchParams.get('client_id')).toBe('g_client')
		expect(url.searchParams.get('response_type')).toBe('code')
		expect(url.searchParams.get('access_type')).toBe('offline')
		expect(url.searchParams.get('prompt')).toBe('consent')
		expect(url.searchParams.get('state')).toBe(STATE)
		expect(url.searchParams.get('redirect_uri')).toBe(`${Config.env.API_URL}/integrations/oauth/callback/google_ads`)
		expect(url.searchParams.get('scope')).not.toBeNull()
	})
})

describe('NuvemShopAuthorizeUrlBuilder', () => {
	it("embeds the appId in the path (NuvemShop's authorize URL shape)", () => {
		const b = new NuvemShopAuthorizeUrlBuilder({ appId: 'app_42', clientId: 'unused', clientSecret: 'unused' })
		const url = new URL(b.build({ state: STATE }))
		expect(url.host).toBe('www.nuvemshop.com.br')
		expect(url.pathname).toBe('/apps/app_42/authorize')
		expect(url.searchParams.get('state')).toBe(STATE)
	})
})

describe('TiktokAuthorizeUrlBuilder', () => {
	it('builds a Tiktok marketing-api auth URL with the app key + redirect_uri + state', () => {
		const b = new TiktokAuthorizeUrlBuilder({ clientId: 'tt_app_key', clientSecret: 'unused' })
		const url = new URL(b.build({ state: STATE }))
		expect(url.host).toBe('business-api.tiktok.com')
		// Tiktok uses `app_id` (not client_id) on the auth URL
		expect(url.searchParams.get('app_id') ?? url.searchParams.get('client_id')).toBe('tt_app_key')
		expect(url.searchParams.get('state')).toBe(STATE)
		expect(url.searchParams.get('redirect_uri')).toBe(`${Config.env.API_URL}/integrations/oauth/callback/tiktok`)
	})
})

describe('MockAuthorizeUrlBuilder', () => {
	it('returns a deterministic URL containing the state param', () => {
		const m = new MockAuthorizeUrlBuilder({
			type: StoreIntegrationType.SALES_CHANNEL,
			platform: SalesPlatform.SHOPIFY,
		})
		const url = new URL(m.build({ state: STATE }))
		expect(url.host).toBe('mock-auth.invalid')
		expect(url.searchParams.get('state')).toBe(STATE)
	})

	it('echoes the identifier into the URL when provided', () => {
		const m = new MockAuthorizeUrlBuilder({
			type: StoreIntegrationType.SALES_CHANNEL,
			platform: SalesPlatform.SHOPIFY,
		})
		const url = new URL(m.build({ identifier: 'acme.myshopify.com', state: STATE }))
		expect(url.searchParams.get('identifier')).toBe('acme.myshopify.com')
	})
})

describe('AuthorizeUrlBuilderFactory', () => {
	it('returns the constructor-injected builder for each registered (type, platform)', () => {
		const shopify = new ShopifyAuthorizeUrlBuilder({ clientId: 'x', clientSecret: 'y' })
		const meta = new MetaAuthorizeUrlBuilder({ clientId: 'x', clientSecret: 'y' })
		const google = new GoogleAdsAuthorizeUrlBuilder({ clientId: 'x', clientSecret: 'y' })
		const nuvem = new NuvemShopAuthorizeUrlBuilder({ appId: 'a', clientId: 'x', clientSecret: 'y' })
		const tiktok = new TiktokAuthorizeUrlBuilder({ clientId: 'x', clientSecret: 'y' })
		const f = new AuthorizeUrlBuilderFactory(shopify, meta, google, nuvem, tiktok)

		expect(f.get({ type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.SHOPIFY })).toBe(shopify)
		expect(f.get({ type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.NUVEM_SHOP })).toBe(nuvem)
		expect(f.get({ type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.META })).toBe(meta)
		expect(f.get({ type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.GOOGLE_ADS })).toBe(google)
		expect(f.get({ type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.TIKTOK })).toBe(tiktok)
	})

	it('throws PLATFORM_NOT_SUPPORTED for an unregistered (type, platform)', () => {
		const f = new AuthorizeUrlBuilderFactory(
			new ShopifyAuthorizeUrlBuilder({ clientId: 'x', clientSecret: 'y' }),
			new MetaAuthorizeUrlBuilder({ clientId: 'x', clientSecret: 'y' }),
			new GoogleAdsAuthorizeUrlBuilder({ clientId: 'x', clientSecret: 'y' }),
			new NuvemShopAuthorizeUrlBuilder({ appId: 'a', clientId: 'x', clientSecret: 'y' }),
			new TiktokAuthorizeUrlBuilder({ clientId: 'x', clientSecret: 'y' }),
		)
		let caught: unknown = null
		try {
			f.get({ type: StoreIntegrationType.CHECKOUT, platform: CheckoutPlatform.YAMPI })
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('PLATFORM_NOT_SUPPORTED')
	})
})
```

### Step T2.3 — Run test to verify it fails

Run: `bun test packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/AuthorizeUrlBuilder.test.ts`
Expected: FAIL with `Cannot find module './AuthorizeUrlBuilderFactory'`

### Step T2.4 — Write the abstract + factory + mock + barrel

```typescript
// packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/AuthorizeUrlBuilder.ts
import { BaseError, Config } from '@template/core-typescript'
import {
	MarketingPlatform,
	SalesPlatform,
	StoreIntegrationType,
	type CheckoutPlatform,
	type InfoproductPlatform,
	type PaymentGatewayPlatform,
} from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import type { PlatformProps } from '../index'

export type AuthorizeUrlBuilderPlatform =
	| SalesPlatform
	| CheckoutPlatform
	| PaymentGatewayPlatform
	| MarketingPlatform
	| InfoproductPlatform

/**
 * Lower-snake URL path segment per platform that has an `AuthorizeUrlBuilder`.
 * Lives next to the abstract class so `deriveRedirectUri` can stay static on
 * the base (no circular import with the factory). Consumed by builders (to
 * compose `redirect_uri`) and by the callback controller (to dispatch from the
 * `:platform` path param).
 */
export const PLATFORM_PATH_SEGMENTS = {
	[SalesPlatform.SHOPIFY]: 'shopify',
	[SalesPlatform.NUVEM_SHOP]: 'nuvem_shop',
	[MarketingPlatform.META]: 'meta',
	[MarketingPlatform.GOOGLE_ADS]: 'google_ads',
	[MarketingPlatform.TIKTOK]: 'tiktok',
} as const satisfies Partial<Record<AuthorizeUrlBuilderPlatform, string>>

export type PlatformPathSegment = (typeof PLATFORM_PATH_SEGMENTS)[keyof typeof PLATFORM_PATH_SEGMENTS]

/**
 * Per-platform OAuth authorize URL builder. Builds the URL the user's browser
 * is redirected to so the provider can present its consent screen. The
 * `state` param is opaque to the builder — the caller (AuthorizeIntegration
 * use case) mints it via `OAuthStateTokenService` and passes it through.
 *
 * `identifier` is the pre-handshake identifier some providers need to compose
 * the URL (Shopify: the shop domain becomes the host). Most providers ignore
 * it — they discover the identifier from the token response post-callback.
 *
 * Dispatched by `(type, platform)` via `AuthorizeUrlBuilderFactory`.
 */
export abstract class AuthorizeUrlBuilder {
	abstract readonly type: StoreIntegrationType
	abstract readonly platform: AuthorizeUrlBuilderPlatform

	abstract build(input: { identifier?: string; state: string }): string

	/**
	 * Derived redirect URI for a (type, platform) pair — single source of truth so
	 * provider dashboards + outgoing URLs never drift. Throws
	 * PLATFORM_NOT_SUPPORTED when the platform has no registered path segment.
	 */
	static deriveRedirectUri(platform: PlatformProps): string {
		const segment = PLATFORM_PATH_SEGMENTS[platform.platform as keyof typeof PLATFORM_PATH_SEGMENTS]
		if (segment === undefined) {
			throw new BaseError<IntegrationApplicationErrors>(
				'PLATFORM_NOT_SUPPORTED',
				`no callback path segment registered for ${platform.type}:${platform.platform}`,
			)
		}
		return `${Config.env.API_URL}/integrations/oauth/callback/${segment}`
	}

	/** Instance shortcut — impls just write `this.redirectUri`. */
	protected get redirectUri(): string {
		return AuthorizeUrlBuilder.deriveRedirectUri({ type: this.type, platform: this.platform } as PlatformProps)
	}
}
```

```typescript
// packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/AuthorizeUrlBuilderFactory.ts
import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import { MarketingPlatform, SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import type { PlatformProps } from '../index'
import { AuthorizeUrlBuilder, PLATFORM_PATH_SEGMENTS, type AuthorizeUrlBuilderPlatform, type PlatformPathSegment } from './AuthorizeUrlBuilder'
import { ShopifyAuthorizeUrlBuilder } from '../shopify/ShopifyAuthorizeUrlBuilder'
import { MetaAuthorizeUrlBuilder } from '../meta/MetaAuthorizeUrlBuilder'
import { GoogleAdsAuthorizeUrlBuilder } from '../google-ads/GoogleAdsAuthorizeUrlBuilder'
import { NuvemShopAuthorizeUrlBuilder } from '../nuvemshop/NuvemShopAuthorizeUrlBuilder'
import { TiktokAuthorizeUrlBuilder } from '../tiktok/TiktokAuthorizeUrlBuilder'

type BuilderRegistry = Partial<Record<StoreIntegrationType, Partial<Record<AuthorizeUrlBuilderPlatform, AuthorizeUrlBuilder>>>>

/**
 * Per-(type, platform) resolver for AuthorizeUrlBuilder impls. Mirrors
 * `HandshakeServiceFactory` / `OAuthCodeExchangerFactory`: constructor-injected
 * builders, nested record keyed by the actual platform enum unions (not
 * `string`). Adding a provider = add a constructor param + table entry.
 *
 * `.get()` throws `PLATFORM_NOT_SUPPORTED` for any (type, platform) without a
 * registered builder (credential/manual platforms have no authorize URL). No
 * `.has()` — callers just call `.get()` and let it throw fail-fast.
 */
@injectable()
export class AuthorizeUrlBuilderFactory {
	private readonly builders: BuilderRegistry

	constructor(
		shopify: ShopifyAuthorizeUrlBuilder,
		meta: MetaAuthorizeUrlBuilder,
		google: GoogleAdsAuthorizeUrlBuilder,
		nuvem: NuvemShopAuthorizeUrlBuilder,
		tiktok: TiktokAuthorizeUrlBuilder,
	) {
		this.builders = {
			[StoreIntegrationType.SALES_CHANNEL]: {
				[SalesPlatform.SHOPIFY]: shopify,
				[SalesPlatform.NUVEM_SHOP]: nuvem,
			},
			[StoreIntegrationType.MARKETING_PLATFORM]: {
				[MarketingPlatform.META]: meta,
				[MarketingPlatform.GOOGLE_ADS]: google,
				[MarketingPlatform.TIKTOK]: tiktok,
			},
		}
	}

	get(platform: PlatformProps): AuthorizeUrlBuilder {
		const builder = this.builders[platform.type]?.[platform.platform]
		if (builder === undefined) {
			throw new BaseError<IntegrationApplicationErrors>(
				'PLATFORM_NOT_SUPPORTED',
				`no AuthorizeUrlBuilder registered for ${platform.type}:${platform.platform}`,
			)
		}
		return builder
	}
}

/**
 * Reverse lookup: lower-snake path segment → (type, platform). Used by the
 * callback controller to dispatch from the `:platform` path param to the
 * enum pair. Derived from PLATFORM_PATH_SEGMENTS so the two maps can't drift.
 */
export const PATH_SEGMENT_TO_PLATFORM: Record<PlatformPathSegment, PlatformProps> = {
	shopify: { type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.SHOPIFY },
	nuvem_shop: { type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.NUVEM_SHOP },
	meta: { type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.META },
	google_ads: { type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.GOOGLE_ADS },
	tiktok: { type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.TIKTOK },
}

export { PLATFORM_PATH_SEGMENTS, type PlatformPathSegment }
```

```typescript
// packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/MockAuthorizeUrlBuilder.ts
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { AuthorizeUrlBuilder } from './AuthorizeUrlBuilder'

/**
 * In-memory authorize-URL stub for tests. Default: builds a deterministic URL
 * on `mock-auth.invalid` that echoes `state` (and `identifier` when provided)
 * as query params. Tests can override `nextUrl` for canned values.
 *
 * Type/platform default to SHOPIFY but can be overridden via constructor.
 */
export class MockAuthorizeUrlBuilder extends AuthorizeUrlBuilder {
	readonly type: AuthorizeUrlBuilder['type']
	readonly platform: AuthorizeUrlBuilder['platform']

	nextUrl: string | null = null

	constructor(opts: { type?: AuthorizeUrlBuilder['type']; platform?: AuthorizeUrlBuilder['platform'] } = {}) {
		super()
		this.type = opts.type ?? StoreIntegrationType.SALES_CHANNEL
		this.platform = opts.platform ?? SalesPlatform.SHOPIFY
	}

	build(input: { identifier?: string; state: string }): string {
		if (this.nextUrl !== null) return this.nextUrl
		const params = new URLSearchParams({ state: input.state })
		if (input.identifier !== undefined) params.set('identifier', input.identifier)
		return `https://mock-auth.invalid/?${params.toString()}`
	}
}
```

```typescript
// packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/index.ts
export { AuthorizeUrlBuilder, PLATFORM_PATH_SEGMENTS, type PlatformPathSegment, type AuthorizeUrlBuilderPlatform } from './AuthorizeUrlBuilder'
export { AuthorizeUrlBuilderFactory, PATH_SEGMENT_TO_PLATFORM } from './AuthorizeUrlBuilderFactory'
export { MockAuthorizeUrlBuilder } from './MockAuthorizeUrlBuilder'
```

### Step T2.5 — Refactor each OAuth descriptor: export scope const + clear inputTokens for discovered-identifier platforms

Two coordinated changes per descriptor:

**(a) Scope consts.** Each builder needs the runtime scope list to compose
`?scope=...` — derived from the existing `scopes: z.tuple([...])` (single source).

**(b) Empty `inputTokens` for OAuth platforms where the identifier is discovered
post-token (Meta / Google Ads / NuvemShop / Tiktok).** The current descriptor
shapes (`{ businessAccountId: z.string().min(1) }` etc.) assume a 2-step UI where
the user supplies the identifier before hitting Connect. The spec's design has the
callback call ConnectIntegration in-process with no intervening picker, so the
identifier comes from the token-exchange response — not from input. Without this
fix, the OAuth leaves in `PlatformConnectBodySchema` reject `credentials: {}` at
schema-validation time and the callback fails before reaching the exchanger.

Shopify keeps `inputTokens: { shopDomain }` — it really is user-supplied (goes
into the authorize URL host).

Modify `packages/api/typescript/src/integration/services/shopify/ShopifyDescription.ts`:

After `export const ShopifyOAuthDescriptionSchema = z.object({...})`, append:

```typescript
/** Runtime scope list derived from the descriptor — single source for handshake + authorize URL. */
export const ShopifyOAuthScopes = ShopifyOAuthDescriptionSchema.shape.scopes.def.items.map(item => item.value)
```

Modify `packages/api/typescript/src/integration/services/meta/MetaDescription.ts`:

Clear the OAuth descriptor's `inputTokens` (Meta business account id is discovered post-token):

```diff
 export const MetaOAuthDescriptionSchema = z.object({
 	...
-	inputTokens: z.object({ businessAccountId: z.string().min(1) }),
+	inputTokens: z.object({}),
 	...
 })
```

After that schema, append:

```typescript
export const MetaOAuthScopes = MetaOAuthDescriptionSchema.shape.scopes.def.items.map(item => item.value)
```

Modify `packages/api/typescript/src/integration/services/google-ads/GoogleAdsDescription.ts`:

```diff
 export const GoogleAdsOAuthDescriptionSchema = z.object({
 	...
-	inputTokens: z.object({ customerId: z.string().min(1) }),
+	inputTokens: z.object({}),
 	...
 })
```

Append:

```typescript
export const GoogleAdsOAuthScopes = GoogleAdsOAuthDescriptionSchema.shape.scopes.def.items.map(item => item.value)
```

Modify `packages/api/typescript/src/integration/services/nuvemshop/NuvemShopDescription.ts`:

```diff
 export const NuvemShopOAuthDescriptionSchema = z.object({
 	...
-	inputTokens: z.object({ storeId: z.string().min(1) }),
+	inputTokens: z.object({}),
 	...
 })
```

Append:

```typescript
export const NuvemShopOAuthScopes = NuvemShopOAuthDescriptionSchema.shape.scopes.def.items.map(item => item.value)
```

Modify `packages/api/typescript/src/integration/services/tiktok/TiktokDescription.ts`:

```diff
 export const TiktokOAuthDescriptionSchema = z.object({
 	...
-	inputTokens: z.object({ advertiserId: z.string().min(1) }),
+	inputTokens: z.object({}),
 	...
 })
```

Append:

```typescript
export const TiktokOAuthScopes = TiktokOAuthDescriptionSchema.shape.scopes.def.items.map(item => item.value)
```

If Zod v4's typing on `tuple.def.items[].value` requires a contained type assertion to
satisfy tsc, place it **once per descriptor** (e.g. `as readonly string[]` on the
final `.map(...)` result) — never propagate the cast to the builders.

The existing exchangers (`MetaOAuthCodeExchanger.ts:71` reads `input.credentials.businessAccountId ?? ''`, etc.) already defensively coalesce missing fields, so they keep working with empty credentials. Their unit tests pass canned credentials in directly and aren't affected by this descriptor change.

### Step T2.6 — Write the per-platform impls

```typescript
// packages/api/typescript/src/integration/services/shopify/ShopifyAuthorizeUrlBuilder.ts
import { BaseError, Config } from '@template/core-typescript'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import { AuthorizeUrlBuilder } from '../AuthorizeUrlBuilder/AuthorizeUrlBuilder'
import { ShopifyOAuthScopes } from './ShopifyDescription'

/**
 * Shopify authorize: `https://{shopDomain}/admin/oauth/authorize?client_id=...
 * &scope=...&state=...&redirect_uri=...`. `identifier` is REQUIRED — it's the
 * shop domain that becomes the URL host. Scopes come from `ShopifyOAuthScopes`
 * (derived from the descriptor — same set the handshake validates against).
 *
 * Constructor `app` defaults to `Config.env` so production wiring is just
 * `useFactory: () => new ShopifyAuthorizeUrlBuilder()`. Tests construct with
 * explicit values: `new ShopifyAuthorizeUrlBuilder({ clientId: 'x', clientSecret: 'y' })`.
 */
export class ShopifyAuthorizeUrlBuilder extends AuthorizeUrlBuilder {
	readonly type = StoreIntegrationType.SALES_CHANNEL
	readonly platform = SalesPlatform.SHOPIFY

	constructor(
		private readonly app: { clientId: string; clientSecret: string } = {
			clientId: Config.env.SHOPIFY_APP_CLIENT_ID,
			clientSecret: Config.env.SHOPIFY_APP_CLIENT_SECRET,
		},
	) {
		super()
	}

	build(input: { identifier?: string; state: string }): string {
		if (input.identifier === undefined || input.identifier.length === 0) {
			throw new BaseError<IntegrationApplicationErrors>(
				'INTEGRATION_MISSING_CREDENTIAL_FIELD',
				'Shopify authorize requires the shop domain as identifier',
			)
		}
		const params = new URLSearchParams({
			client_id: this.app.clientId,
			scope: ShopifyOAuthScopes.join(','),
			state: input.state,
			redirect_uri: this.redirectUri,
		})
		return `https://${input.identifier}/admin/oauth/authorize?${params.toString()}`
	}
}
```

```typescript
// packages/api/typescript/src/integration/services/meta/MetaAuthorizeUrlBuilder.ts
import { Config } from '@template/core-typescript'
import { MarketingPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { AuthorizeUrlBuilder } from '../AuthorizeUrlBuilder/AuthorizeUrlBuilder'
import { MetaOAuthScopes } from './MetaDescription'

const META_GRAPH_VERSION = 'v19.0'

/**
 * Meta (Facebook) authorize: `https://www.facebook.com/${VERSION}/dialog/oauth?
 *  client_id=...&response_type=code&scope=...&state=...&redirect_uri=...`.
 * Identifier is unused — Meta discovers the business id from the token response.
 */
export class MetaAuthorizeUrlBuilder extends AuthorizeUrlBuilder {
	readonly type = StoreIntegrationType.MARKETING_PLATFORM
	readonly platform = MarketingPlatform.META

	constructor(
		private readonly app: { clientId: string; clientSecret: string } = {
			clientId: Config.env.META_APP_CLIENT_ID,
			clientSecret: Config.env.META_APP_CLIENT_SECRET,
		},
	) {
		super()
	}

	build(input: { identifier?: string; state: string }): string {
		const params = new URLSearchParams({
			client_id: this.app.clientId,
			response_type: 'code',
			scope: MetaOAuthScopes.join(','),
			state: input.state,
			redirect_uri: this.redirectUri,
		})
		return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`
	}
}
```

```typescript
// packages/api/typescript/src/integration/services/google-ads/GoogleAdsAuthorizeUrlBuilder.ts
import { Config } from '@template/core-typescript'
import { MarketingPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { AuthorizeUrlBuilder } from '../AuthorizeUrlBuilder/AuthorizeUrlBuilder'
import { GoogleAdsOAuthScopes } from './GoogleAdsDescription'

/**
 * Google OAuth: `https://accounts.google.com/o/oauth2/v2/auth?...`.
 * `access_type=offline` + `prompt=consent` are required to receive a refresh
 * token (otherwise Google issues a session-only access token on re-consent).
 * Identifier is unused — Google Ads customer id is discovered post-token.
 */
export class GoogleAdsAuthorizeUrlBuilder extends AuthorizeUrlBuilder {
	readonly type = StoreIntegrationType.MARKETING_PLATFORM
	readonly platform = MarketingPlatform.GOOGLE_ADS

	constructor(
		private readonly app: { clientId: string; clientSecret: string } = {
			clientId: Config.env.GOOGLE_ADS_CLIENT_ID,
			clientSecret: Config.env.GOOGLE_ADS_CLIENT_SECRET,
		},
	) {
		super()
	}

	build(input: { identifier?: string; state: string }): string {
		const params = new URLSearchParams({
			client_id: this.app.clientId,
			response_type: 'code',
			access_type: 'offline',
			prompt: 'consent',
			scope: GoogleAdsOAuthScopes.join(' '),
			state: input.state,
			redirect_uri: this.redirectUri,
		})
		return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
	}
}
```

```typescript
// packages/api/typescript/src/integration/services/nuvemshop/NuvemShopAuthorizeUrlBuilder.ts
import { Config } from '@template/core-typescript'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { AuthorizeUrlBuilder } from '../AuthorizeUrlBuilder/AuthorizeUrlBuilder'

/**
 * NuvemShop authorize: `https://www.nuvemshop.com.br/apps/${APP_ID}/authorize?state=...`.
 * The provider's URL embeds the app id in the path (not the query). NuvemShop's
 * token endpoint reads its own configured redirect_uri from the app's dashboard
 * config, so this URL does NOT carry `redirect_uri`. Identifier unused — store
 * id is in the token response (`user_id`).
 */
export class NuvemShopAuthorizeUrlBuilder extends AuthorizeUrlBuilder {
	readonly type = StoreIntegrationType.SALES_CHANNEL
	readonly platform = SalesPlatform.NUVEM_SHOP

	constructor(
		private readonly app: { appId: string; clientId: string; clientSecret: string } = {
			appId: Config.env.NUVEMSHOP_APP_ID,
			clientId: Config.env.NUVEMSHOP_APP_CLIENT_ID,
			clientSecret: Config.env.NUVEMSHOP_APP_CLIENT_SECRET,
		},
	) {
		super()
	}

	build(input: { identifier?: string; state: string }): string {
		const params = new URLSearchParams({ state: input.state })
		return `https://www.nuvemshop.com.br/apps/${this.app.appId}/authorize?${params.toString()}`
	}
}
```

```typescript
// packages/api/typescript/src/integration/services/tiktok/TiktokAuthorizeUrlBuilder.ts
import { Config } from '@template/core-typescript'
import { MarketingPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { AuthorizeUrlBuilder } from '../AuthorizeUrlBuilder/AuthorizeUrlBuilder'

/**
 * Tiktok Marketing API authorize: `https://business-api.tiktok.com/portal/auth?
 *  app_id=...&state=...&redirect_uri=...`. Tiktok uses `app_id` (not
 *  `client_id`) on the auth URL; the same value goes under `client_id` on the
 * token-exchange endpoint. Identifier unused — advertiser id post-token.
 */
export class TiktokAuthorizeUrlBuilder extends AuthorizeUrlBuilder {
	readonly type = StoreIntegrationType.MARKETING_PLATFORM
	readonly platform = MarketingPlatform.TIKTOK

	constructor(
		private readonly app: { clientId: string; clientSecret: string } = {
			clientId: Config.env.TIKTOK_APP_CLIENT_ID,
			clientSecret: Config.env.TIKTOK_APP_CLIENT_SECRET,
		},
	) {
		super()
	}

	build(input: { identifier?: string; state: string }): string {
		const params = new URLSearchParams({
			app_id: this.app.clientId,
			state: input.state,
			redirect_uri: this.redirectUri,
		})
		return `https://business-api.tiktok.com/portal/auth?${params.toString()}`
	}
}
```

### Step T2.7 — Run test to verify it passes

Run: `bun test packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/AuthorizeUrlBuilder.test.ts`
Expected: PASS — ~12 tests pass

### Step T2.8 — Type-check + lint

Run: `cd packages/api/typescript && bun x tsc --noEmit && cd - && bun lint`
Expected: 0 errors

### Step T2.9 — Commit

```bash
git add packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/ \
        packages/api/typescript/src/integration/services/shopify/ShopifyAuthorizeUrlBuilder.ts \
        packages/api/typescript/src/integration/services/shopify/ShopifyDescription.ts \
        packages/api/typescript/src/integration/services/meta/MetaAuthorizeUrlBuilder.ts \
        packages/api/typescript/src/integration/services/meta/MetaDescription.ts \
        packages/api/typescript/src/integration/services/google-ads/GoogleAdsAuthorizeUrlBuilder.ts \
        packages/api/typescript/src/integration/services/google-ads/GoogleAdsDescription.ts \
        packages/api/typescript/src/integration/services/nuvemshop/NuvemShopAuthorizeUrlBuilder.ts \
        packages/api/typescript/src/integration/services/nuvemshop/NuvemShopDescription.ts \
        packages/api/typescript/src/integration/services/tiktok/TiktokAuthorizeUrlBuilder.ts \
        packages/api/typescript/src/integration/services/tiktok/TiktokDescription.ts \
        packages/api/typescript/core/src/utils/Config.ts
git commit -m "feat(integration): per-platform OAuth authorize URL builders + factory (Task T2)"
```

---

## Task T3: Owner POSTs to authorize and gets back a usable URL

**Files to write:**
- Create: `packages/api/typescript/src/integration/usecases/AuthorizeIntegration.ts`
- Create: `packages/api/typescript/src/integration/usecases/AuthorizeIntegration.test.ts`
- Create: `packages/api/typescript/src/integration/controllers/AuthorizeIntegrationController.ts`
- Modify: `packages/api/typescript/src/integration/controllers/index.ts` — export the new controller
- Modify: `packages/api/typescript/src/integration/registry.ts` — bind `OAuthStateTokenService` (singleton across envs) + `AuthorizeUrlBuilderFactory` + 5 builders (mock for mock/integration, real for real)

**Files to read:**
- `packages/api/typescript/src/integration/usecases/ConnectIntegration.ts` — Handler shape + input/output schema convention
- `packages/api/typescript/src/integration/controllers/ConnectIntegrationController.ts` — controller shape with the same middleware triad

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /schema, /test
**Depends on:** T2

### Step T3.1 — Write the failing use-case test

```typescript
// packages/api/typescript/src/integration/usecases/AuthorizeIntegration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { BaseError } from '@template/core-typescript'
import { MarketingPlatform, SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { AuthorizeIntegration } from './AuthorizeIntegration'
import { OAuthStateTokenService } from '../services/OAuthStateTokenService'

const STORE_ID = '019e4d24-6524-7041-9e1c-8108180cddae'
const USER_ID = '019e4d24-7100-7041-9e1c-8108180cddbb'

describe('AuthorizeIntegration', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let usecase: AuthorizeIntegration
	let stateService: OAuthStateTokenService

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		usecase = testBed.resolve(AuthorizeIntegration)
		stateService = testBed.resolve(OAuthStateTokenService)
	})
	beforeEach(async () => { await testBed.reset() })
	afterAll(async () => { await testBed.destroy() })

	it('returns {authorizeUrl, state, expiresAt} for Shopify with identifier round-tripped through state', async () => {
		const result = await usecase.execute({
			userId: USER_ID,
			storeId: STORE_ID,
			type: StoreIntegrationType.SALES_CHANNEL,
			platform: SalesPlatform.SHOPIFY,
			identifier: 'acme.myshopify.com',
		})

		expect(typeof result.authorizeUrl).toBe('string')
		expect(result.state.split('.').length).toBe(2)
		expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))

		// state verifies and carries the identifier
		const verified = stateService.verify(result.state, { expectedPlatform: SalesPlatform.SHOPIFY })
		expect(verified.userId).toBe(USER_ID)
		expect(verified.storeId).toBe(STORE_ID)
		expect(verified.identifier).toBe('acme.myshopify.com')

		// URL is the mock builder shape (mock env)
		expect(result.authorizeUrl).toContain('mock-auth.invalid')
	})

	it('returns shape with no identifier for Google Ads (discovered post-token)', async () => {
		const result = await usecase.execute({
			userId: USER_ID,
			storeId: STORE_ID,
			type: StoreIntegrationType.MARKETING_PLATFORM,
			platform: MarketingPlatform.GOOGLE_ADS,
		})
		const verified = stateService.verify(result.state, { expectedPlatform: MarketingPlatform.GOOGLE_ADS })
		expect(verified.identifier).toBeUndefined()
	})

	it('throws PLATFORM_NOT_SUPPORTED for a (type, platform) without an authorize builder', async () => {
		let caught: unknown = null
		try {
			await usecase.execute({
				userId: USER_ID,
				storeId: STORE_ID,
				type: StoreIntegrationType.CHECKOUT,
				platform: 'YAMPI' as never,
			})
		} catch (e) {
			caught = e
		}
		expect((caught as BaseError<any>).name).toBe('PLATFORM_NOT_SUPPORTED')
	})

	it('expiresAt reflects a ~300s TTL', async () => {
		const before = Math.floor(Date.now() / 1000)
		const result = await usecase.execute({
			userId: USER_ID,
			storeId: STORE_ID,
			type: StoreIntegrationType.MARKETING_PLATFORM,
			platform: MarketingPlatform.META,
		})
		expect(result.expiresAt - before).toBeGreaterThanOrEqual(299)
		expect(result.expiresAt - before).toBeLessThanOrEqual(301)
	})
})
```

### Step T3.2 — Run test to verify it fails

Run: `bun test packages/api/typescript/src/integration/usecases/AuthorizeIntegration.test.ts`
Expected: FAIL with `Cannot find module './AuthorizeIntegration'`

### Step T3.3 — Write the use case

```typescript
// packages/api/typescript/src/integration/usecases/AuthorizeIntegration.ts
import Z from 'zod'
import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import { CheckoutPlatform, InfoproductPlatform, MarketingPlatform, PaymentGatewayPlatform, SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { OAuthStateTokenService } from '../services/OAuthStateTokenService'
import { AuthorizeUrlBuilderFactory } from '../services/AuthorizeUrlBuilder'

const OAUTH_STATE_TTL_SEC = 300

/** Authorize input — caller picks (type, platform) and provides identifier only when the platform needs it pre-token (Shopify). */
export const AuthorizeIntegrationInputSchema = z
	.object({
		userId: z.uuid(),
		storeId: z.uuid(),
		identifier: z.string().min(1).optional(),
	})
	.and(
		z.discriminatedUnion('type', [
			z.object({ type: z.literal(StoreIntegrationType.SALES_CHANNEL), platform: z.enum(SalesPlatform) }),
			z.object({ type: z.literal(StoreIntegrationType.CHECKOUT), platform: z.enum(CheckoutPlatform) }),
			z.object({ type: z.literal(StoreIntegrationType.PAYMENT_GATEWAY), platform: z.enum(PaymentGatewayPlatform) }),
			z.object({ type: z.literal(StoreIntegrationType.MARKETING_PLATFORM), platform: z.enum(MarketingPlatform) }),
			z.object({ type: z.literal(StoreIntegrationType.INFOPRODUCT), platform: z.enum(InfoproductPlatform) }),
		]),
	)
export type AuthorizeIntegrationInput = Z.infer<typeof AuthorizeIntegrationInputSchema>

export const AuthorizeIntegrationOutputSchema = z.object({
	authorizeUrl: z.string().min(1),
	state: z.string().min(1),
	expiresAt: z.number(), // unix seconds
})

/**
 * Mints the OAuth state envelope and the per-platform authorize URL the
 * frontend redirects the browser to. The use case is a thin composition
 * over `OAuthStateTokenService` + `AuthorizeUrlBuilderFactory` — no DB
 * writes, no transactions, no events. The factory throws PLATFORM_NOT_SUPPORTED
 * when the (type, platform) pair has no registered builder (i.e. non-OAuth
 * platforms, or platforms still pending an impl).
 */
@injectable()
export class AuthorizeIntegration extends Handler<typeof AuthorizeIntegrationInputSchema, typeof AuthorizeIntegrationOutputSchema> {
	readonly name = 'authorize_integration' as const
	readonly inputSchema = AuthorizeIntegrationInputSchema
	readonly outputSchema = AuthorizeIntegrationOutputSchema

	constructor(
		private readonly stateService: OAuthStateTokenService,
		private readonly builders: AuthorizeUrlBuilderFactory,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		// .get() throws PLATFORM_NOT_SUPPORTED fail-fast if no builder is registered.
		const builder = this.builders.get({ type: input.type, platform: input.platform })

		const state = this.stateService.generate({
			userId: input.userId,
			storeId: input.storeId,
			type: input.type,
			platform: input.platform,
			ttlSec: OAUTH_STATE_TTL_SEC,
			...(input.identifier !== undefined && { identifier: input.identifier }),
		})

		const authorizeUrl = builder.build({
			state,
			...(input.identifier !== undefined && { identifier: input.identifier }),
		})

		return {
			authorizeUrl,
			state,
			expiresAt: Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SEC,
		}
	}
}
```

### Step T3.4 — Wire the new bindings in the integration registry

Modify `packages/api/typescript/src/integration/registry.ts`:

1. Add imports at the top with the other service imports:

```typescript
import { OAuthStateTokenService } from './services/OAuthStateTokenService'
import { AuthorizeUrlBuilderFactory, MockAuthorizeUrlBuilder } from './services/AuthorizeUrlBuilder'
import { ShopifyAuthorizeUrlBuilder } from './services/shopify/ShopifyAuthorizeUrlBuilder'
import { MetaAuthorizeUrlBuilder } from './services/meta/MetaAuthorizeUrlBuilder'
import { GoogleAdsAuthorizeUrlBuilder } from './services/google-ads/GoogleAdsAuthorizeUrlBuilder'
import { NuvemShopAuthorizeUrlBuilder } from './services/nuvemshop/NuvemShopAuthorizeUrlBuilder'
import { TiktokAuthorizeUrlBuilder } from './services/tiktok/TiktokAuthorizeUrlBuilder'
```

2. **No new factory functions for the authorize builders** — each builder's constructor defaults to `Config.env` (see T2.6), so production wiring is just `useFactory: () => new ShopifyAuthorizeUrlBuilder()`. No `realXAuthorize` helpers needed.

3. Replace the existing `realShopifyOAuth` / `realNuvemShopOAuth` / `realMetaOAuth` / `realGoogleAdsOAuth` / `realTiktokOAuth` factories to source from `Config.env` (renamed per spec). Use `AuthorizeUrlBuilder.deriveRedirectUri` for Meta + Google Ads so the existing exchanger constructors receive a derived `redirectUri` instead of an env var:

```diff
- const realShopifyOAuth = () =>
- 	new ShopifyOAuthCodeExchanger({ clientId: process.env.SHOPIFY_CLIENT_ID ?? '', clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? '' })
+ const realShopifyOAuth = () =>
+ 	new ShopifyOAuthCodeExchanger({ clientId: Config.env.SHOPIFY_APP_CLIENT_ID, clientSecret: Config.env.SHOPIFY_APP_CLIENT_SECRET })

- const realNuvemShopOAuth = () =>
- 	new NuvemShopOAuthCodeExchanger({
- 		appId: process.env.NUVEMSHOP_APP_ID ?? '',
- 		clientId: process.env.NUVEMSHOP_CLIENT_ID ?? '',
- 		clientSecret: process.env.NUVEMSHOP_CLIENT_SECRET ?? '',
- 	})
+ const realNuvemShopOAuth = () =>
+ 	new NuvemShopOAuthCodeExchanger({
+ 		appId: Config.env.NUVEMSHOP_APP_ID,
+ 		clientId: Config.env.NUVEMSHOP_APP_CLIENT_ID,
+ 		clientSecret: Config.env.NUVEMSHOP_APP_CLIENT_SECRET,
+ 	})

- const realMetaOAuth = () =>
- 	new MetaOAuthCodeExchanger({
- 		appId: process.env.META_APP_ID ?? '',
- 		appSecret: process.env.META_APP_SECRET ?? '',
- 		redirectUri: process.env.META_REDIRECT_URI ?? '',
- 	})
+ const realMetaOAuth = () =>
+ 	new MetaOAuthCodeExchanger({
+ 		appId: Config.env.META_APP_CLIENT_ID,
+ 		appSecret: Config.env.META_APP_CLIENT_SECRET,
+ 		redirectUri: AuthorizeUrlBuilder.deriveRedirectUri({ type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.META }),
+ 	})

- const realGoogleAdsOAuth = () =>
- 	new GoogleAdsOAuthCodeExchanger({
- 		clientId: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
- 		clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
- 		redirectUri: process.env.GOOGLE_ADS_REDIRECT_URI ?? '',
- 	})
+ const realGoogleAdsOAuth = () =>
+ 	new GoogleAdsOAuthCodeExchanger({
+ 		clientId: Config.env.GOOGLE_ADS_CLIENT_ID,
+ 		clientSecret: Config.env.GOOGLE_ADS_CLIENT_SECRET,
+ 		redirectUri: AuthorizeUrlBuilder.deriveRedirectUri({ type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.GOOGLE_ADS }),
+ 	})

- const realTiktokOAuth = () =>
- 	new TiktokOAuthCodeExchanger({ appId: process.env.TIKTOK_APP_ID ?? '', secret: process.env.TIKTOK_APP_SECRET ?? '' })
+ const realTiktokOAuth = () =>
+ 	new TiktokOAuthCodeExchanger({ appId: Config.env.TIKTOK_APP_CLIENT_ID, secret: Config.env.TIKTOK_APP_CLIENT_SECRET })
```

Use `AuthorizeUrlBuilder.deriveRedirectUri(...)` (static method on the abstract base — see T2.4) for the two exchangers that take a `redirectUri` constructor arg.

4. Define shared mock authorize builders (one per platform — same shape as `MOCK_OAUTH_*`):

```typescript
const MOCK_AUTHORIZE_SHOPIFY = new MockAuthorizeUrlBuilder({ type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.SHOPIFY })
const MOCK_AUTHORIZE_NUVEMSHOP = new MockAuthorizeUrlBuilder({ type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.NUVEM_SHOP })
const MOCK_AUTHORIZE_META = new MockAuthorizeUrlBuilder({ type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.META })
const MOCK_AUTHORIZE_GOOGLE = new MockAuthorizeUrlBuilder({ type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.GOOGLE_ADS })
const MOCK_AUTHORIZE_TIKTOK = new MockAuthorizeUrlBuilder({ type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.TIKTOK })
```

5. Extend `MOCK_CONNECT_SERVICES` (each line appended at the end of the array):

```typescript
{ token: ShopifyAuthorizeUrlBuilder, instance: MOCK_AUTHORIZE_SHOPIFY },
{ token: NuvemShopAuthorizeUrlBuilder, instance: MOCK_AUTHORIZE_NUVEMSHOP },
{ token: MetaAuthorizeUrlBuilder, instance: MOCK_AUTHORIZE_META },
{ token: GoogleAdsAuthorizeUrlBuilder, instance: MOCK_AUTHORIZE_GOOGLE },
{ token: TiktokAuthorizeUrlBuilder, instance: MOCK_AUTHORIZE_TIKTOK },
{ token: AuthorizeUrlBuilderFactory, instance: AuthorizeUrlBuilderFactory },
{ token: OAuthStateTokenService, instance: OAuthStateTokenService },
```

6. In the `real` array, append after the existing OAuth `useFactory` entries. Each authorize builder constructs with zero args — the constructor's default `app` reads `Config.env`:

```typescript
{ token: ShopifyAuthorizeUrlBuilder, useFactory: () => new ShopifyAuthorizeUrlBuilder() },
{ token: MetaAuthorizeUrlBuilder, useFactory: () => new MetaAuthorizeUrlBuilder() },
{ token: GoogleAdsAuthorizeUrlBuilder, useFactory: () => new GoogleAdsAuthorizeUrlBuilder() },
{ token: NuvemShopAuthorizeUrlBuilder, useFactory: () => new NuvemShopAuthorizeUrlBuilder() },
{ token: TiktokAuthorizeUrlBuilder, useFactory: () => new TiktokAuthorizeUrlBuilder() },
{ token: AuthorizeUrlBuilderFactory, instance: AuthorizeUrlBuilderFactory },
{ token: OAuthStateTokenService, instance: OAuthStateTokenService },
```

### Step T3.5 — Run use-case test to verify it passes

Run: `bun test packages/api/typescript/src/integration/usecases/AuthorizeIntegration.test.ts`
Expected: PASS — 4 tests pass

### Step T3.6 — Write the controller

```typescript
// packages/api/typescript/src/integration/controllers/AuthorizeIntegrationController.ts
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import {
	CheckoutPlatform,
	InfoproductPlatform,
	MarketingPlatform,
	PaymentGatewayPlatform,
	Role,
	SalesPlatform,
	StoreIntegrationType,
} from '@template/contracts-typescript/wire/enums'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@auth/middlewares/RequireStoreMember'
import { RequireStoreRole } from '@tenancy/middlewares/RequireStoreRole'
import { AuthorizeIntegration, AuthorizeIntegrationOutputSchema } from '../usecases/AuthorizeIntegration'

/**
 * Authorize body — (type, platform) discriminated union plus optional
 * pre-handshake identifier (Shopify: shopDomain). The use case enforces that
 * the (type, platform) pair has a registered AuthorizeUrlBuilder.
 */
export const AuthorizeIntegrationBodySchema = z
	.discriminatedUnion('type', [
		z.object({ type: z.literal(StoreIntegrationType.SALES_CHANNEL), platform: z.enum(SalesPlatform) }),
		z.object({ type: z.literal(StoreIntegrationType.CHECKOUT), platform: z.enum(CheckoutPlatform) }),
		z.object({ type: z.literal(StoreIntegrationType.PAYMENT_GATEWAY), platform: z.enum(PaymentGatewayPlatform) }),
		z.object({ type: z.literal(StoreIntegrationType.MARKETING_PLATFORM), platform: z.enum(MarketingPlatform) }),
		z.object({ type: z.literal(StoreIntegrationType.INFOPRODUCT), platform: z.enum(InfoproductPlatform) }),
	])
	.and(z.object({ identifier: z.string().min(1).optional() }))

export const AuthorizeIntegrationControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
			membership: z.object({ storeId: z.uuid() }),
		}),
		body: AuthorizeIntegrationBodySchema,
	})
	.example([
		{
			ctx: {
				user: { id: '019e4d24-7100-7041-9e1c-8108180cddbb' },
				membership: { storeId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			},
			body: {
				type: StoreIntegrationType.SALES_CHANNEL,
				platform: SalesPlatform.SHOPIFY,
				identifier: 'acme.myshopify.com',
			},
		},
	])

export const AuthorizeIntegrationControllerOutputSchema = AuthorizeIntegrationOutputSchema.example([
	{
		authorizeUrl: 'https://acme.myshopify.com/admin/oauth/authorize?client_id=...&state=...',
		state: 'eyJ1c2VySWQiOiI...envelope...',
		expiresAt: 1748000000,
	},
])

/**
 * POST /integrations/oauth/authorize. Returns the provider authorize URL the
 * frontend redirects the user's browser to.
 */
@injectable()
export class AuthorizeIntegrationController extends Controller<
	typeof AuthorizeIntegrationControllerInputSchema,
	typeof AuthorizeIntegrationControllerOutputSchema
> {
	readonly path = '/integrations/oauth/authorize'
	readonly method = 'post' as const
	readonly description = 'Mint an OAuth authorize URL + state envelope for the chosen platform'
	readonly inputSchema = AuthorizeIntegrationControllerInputSchema
	readonly outputSchema = AuthorizeIntegrationControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember, RequireStoreRole([Role.OWNER, Role.ADMIN])]

	constructor(private authorize: AuthorizeIntegration) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.authorize.execute({
			...request.body,
			storeId: request.ctx.membership.storeId,
			userId: request.ctx.user.id,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
```

### Step T3.7 — Register the new controller

Modify `packages/api/typescript/src/integration/controllers/index.ts`:
- Add export: `export { AuthorizeIntegrationController } from './AuthorizeIntegrationController'`

### Step T3.8 — Type-check + lint

Run: `cd packages/api/typescript && bun x tsc --noEmit && cd - && bun lint`
Expected: 0 errors

### Step T3.9 — Commit

```bash
git add packages/api/typescript/src/integration/usecases/AuthorizeIntegration.ts \
        packages/api/typescript/src/integration/usecases/AuthorizeIntegration.test.ts \
        packages/api/typescript/src/integration/controllers/AuthorizeIntegrationController.ts \
        packages/api/typescript/src/integration/controllers/index.ts \
        packages/api/typescript/src/integration/registry.ts
git commit -m "feat(integration): AuthorizeIntegration use case + POST /integrations/oauth/authorize (Task T3)"
```

---

## Task T4: Provider hits callback; we persist the StoreIntegration and 302 the browser back

**Files to write:**
- Create: `packages/api/typescript/src/integration/controllers/IntegrationOAuthCallbackController.ts`
- Create: `packages/api/typescript/src/integration/controllers/IntegrationOAuthCallbackController.test.ts`
- Modify: `packages/api/typescript/src/integration/controllers/index.ts` — export the new controller

**Files to read:**
- `packages/api/typescript/src/integration/usecases/ConnectIntegration.ts` — the in-process use case the callback invokes
- `packages/api/typescript/src/tenancy/controllers/AcceptInvitation.ts` — token-authenticated controller (no AuthAccountMiddleware)
- `packages/api/typescript/core/src/types/Controller.ts` — buildResponse signature; `data: undefined` + `headers.Location` + `status: MOVED_TEMPORARILY` yields a clean 302

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /test
**Depends on:** T3

### Step T4.1 — Write the failing test

```typescript
// packages/api/typescript/src/integration/controllers/IntegrationOAuthCallbackController.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import type Z from 'zod'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Config, DomainEventRepository, HttpStatusCode } from '@template/core-typescript'
import { MarketingPlatform, SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import { IntegrationOAuthCallbackController, IntegrationOAuthCallbackInputSchema } from './IntegrationOAuthCallbackController'
import { OAuthStateTokenService } from '../services/OAuthStateTokenService'
import { StoreIntegrationRepository } from '../repositories/StoreIntegrationRepository'
import {
	IntegrationActivatedEvent,
	IntegrationConnectionInitiatedEvent,
	IntegrationHandshakeSucceededEvent,
} from '../events'

const STORE_ID = '019e4d24-6524-7041-9e1c-8108180cddae'
const USER_ID = '019e4d24-7100-7041-9e1c-8108180cddbb'

type CallbackInput = Z.output<typeof IntegrationOAuthCallbackInputSchema>

describe('IntegrationOAuthCallbackController', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let controller: IntegrationOAuthCallbackController
	let stateService: OAuthStateTokenService
	let storeIntegrationRepo: StoreIntegrationRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		controller = testBed.resolve(IntegrationOAuthCallbackController)
		stateService = testBed.resolve(OAuthStateTokenService)
		storeIntegrationRepo = testBed.resolve(StoreIntegrationRepository)
	})
	beforeEach(async () => { await testBed.reset() })
	afterAll(async () => { await testBed.destroy() })

	function mintShopifyState(identifier = 'acme.myshopify.com'): string {
		return stateService.generate({
			userId: USER_ID,
			storeId: STORE_ID,
			type: StoreIntegrationType.SALES_CHANNEL,
			platform: SalesPlatform.SHOPIFY,
			identifier,
			ttlSec: 300,
		})
	}

	function callbackRequest(input: CallbackInput): CallbackInput {
		return input
	}

	it('happy path Shopify: invokes ConnectIntegration and 302s to APP_URL with status=ok', async () => {
		const state = mintShopifyState('acme.myshopify.com')
		const response = await controller.handle(callbackRequest({
			params: { platform: 'shopify' },
			query: { code: 'auth_code_abc', state },
		}))

		expect(response.status).toBe(HttpStatusCode.MOVED_TEMPORARILY)
		expect(response.data).toBeUndefined()
		const loc = new URL(response.headers!.Location!)
		expect(loc.origin + loc.pathname).toBe(`${Config.env.APP_URL}/app/integrations`)
		expect(loc.searchParams.get('status')).toBe('ok')
		expect(loc.searchParams.get('platform')).toBe(SalesPlatform.SHOPIFY)
		expect(loc.searchParams.get('storeIntegrationId')).toMatch(/^[0-9a-f-]{36}$/)

		// row exists, events emitted
		const persisted = await storeIntegrationRepo.findByStoreIdAndPlatform(STORE_ID, {
			type: StoreIntegrationType.SALES_CHANNEL,
			platform: SalesPlatform.SHOPIFY,
		})
		expect(persisted).toBeDefined()
		expect(persisted!.active).toBe(true)

		const eventRepo = testBed.resolve(DomainEventRepository)
		expect(await eventRepo.findByType(IntegrationConnectionInitiatedEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(IntegrationHandshakeSucceededEvent)).toHaveLength(1)
		expect(await eventRepo.findByType(IntegrationActivatedEvent)).toHaveLength(1)
	})

	it('happy path Google Ads (no identifier in state): passes empty credentials to ConnectIntegration', async () => {
		const state = stateService.generate({
			userId: USER_ID,
			storeId: STORE_ID,
			type: StoreIntegrationType.MARKETING_PLATFORM,
			platform: MarketingPlatform.GOOGLE_ADS,
			ttlSec: 300,
		})
		const response = await controller.handle(callbackRequest({
			params: { platform: 'google_ads' },
			query: { code: 'g_auth_code', state },
		}))

		expect(response.status).toBe(HttpStatusCode.MOVED_TEMPORARILY)
		const loc = new URL(response.headers!.Location!)
		expect(loc.searchParams.get('status')).toBe('ok')
		expect(loc.searchParams.get('platform')).toBe(MarketingPlatform.GOOGLE_ADS)
	})

	it('user denied: ?error=access_denied without code → 302 with code=OAUTH_USER_DENIED, no row created', async () => {
		const state = mintShopifyState()
		const response = await controller.handle(callbackRequest({
			params: { platform: 'shopify' },
			query: { error: 'access_denied', state },
		}))

		expect(response.status).toBe(HttpStatusCode.MOVED_TEMPORARILY)
		const loc = new URL(response.headers!.Location!)
		expect(loc.searchParams.get('status')).toBe('error')
		expect(loc.searchParams.get('code')).toBe('OAUTH_USER_DENIED')
		expect(loc.searchParams.get('platform')).toBe(SalesPlatform.SHOPIFY)
		expect(
			await storeIntegrationRepo.findByStoreIdAndPlatform(STORE_ID, {
				type: StoreIntegrationType.SALES_CHANNEL,
				platform: SalesPlatform.SHOPIFY,
			}),
		).toBeUndefined()
	})

	it('tampered state → 302 with code=OAUTH_STATE_INVALID', async () => {
		const state = mintShopifyState()
		const [b64, sig] = state.split('.') as [string, string]
		const tampered = `${b64}.${sig.slice(0, -1)}${sig.slice(-1) === 'a' ? 'b' : 'a'}`
		const response = await controller.handle(callbackRequest({
			params: { platform: 'shopify' },
			query: { code: 'whatever', state: tampered },
		}))
		const loc = new URL(response.headers!.Location!)
		expect(loc.searchParams.get('code')).toBe('OAUTH_STATE_INVALID')
	})

	it('expired state → 302 with code=OAUTH_STATE_EXPIRED', async () => {
		const expired = stateService.generate({
			userId: USER_ID,
			storeId: STORE_ID,
			type: StoreIntegrationType.SALES_CHANNEL,
			platform: SalesPlatform.SHOPIFY,
			identifier: 'acme.myshopify.com',
			ttlSec: -1,
		})
		const response = await controller.handle(callbackRequest({
			params: { platform: 'shopify' },
			query: { code: 'whatever', state: expired },
		}))
		const loc = new URL(response.headers!.Location!)
		expect(loc.searchParams.get('code')).toBe('OAUTH_STATE_EXPIRED')
	})

	it('platform mismatch: Shopify state at meta callback → 302 with code=OAUTH_STATE_PLATFORM_MISMATCH', async () => {
		const state = mintShopifyState()
		const response = await controller.handle(callbackRequest({
			params: { platform: 'meta' },
			query: { code: 'whatever', state },
		}))
		const loc = new URL(response.headers!.Location!)
		expect(loc.searchParams.get('code')).toBe('OAUTH_STATE_PLATFORM_MISMATCH')
	})

	it('missing code and no error: → 302 with code=OAUTH_CODE_INVALID', async () => {
		const state = mintShopifyState()
		const response = await controller.handle(callbackRequest({
			params: { platform: 'shopify' },
			query: { state },
		}))
		const loc = new URL(response.headers!.Location!)
		expect(loc.searchParams.get('code')).toBe('OAUTH_CODE_INVALID')
	})

	it('unknown platform segment → 302 with code=PLATFORM_NOT_SUPPORTED (never JSON 4xx)', async () => {
		const response = await controller.handle(callbackRequest({
			params: { platform: 'not_a_platform' },
			query: { code: 'x', state: 'y.z' },
		}))
		expect(response.status).toBe(HttpStatusCode.MOVED_TEMPORARILY)
		const loc = new URL(response.headers!.Location!)
		expect(loc.searchParams.get('status')).toBe('error')
		expect(loc.searchParams.get('code')).toBe('PLATFORM_NOT_SUPPORTED')
		expect(loc.searchParams.get('platform')).toBe('not_a_platform')
	})
})
```

### Step T4.2 — Run test to verify it fails

Run: `bun test packages/api/typescript/src/integration/controllers/IntegrationOAuthCallbackController.test.ts`
Expected: FAIL with `Cannot find module './IntegrationOAuthCallbackController'`

### Step T4.3 — Write the controller

```typescript
// packages/api/typescript/src/integration/controllers/IntegrationOAuthCallbackController.ts
import Z from 'zod'
import { injectable } from 'tsyringe-neo'
import { BaseError, Config, Controller, HttpStatusCode, tryCatchAsync, z } from '@template/core-typescript'
import { ConnectionMode } from '@template/contracts-typescript/wire/enums'
import { ConnectIntegration, ConnectIntegrationInputSchema } from '../usecases/ConnectIntegration'
import { OAuthStateTokenService } from '../services/OAuthStateTokenService'
import { PATH_SEGMENT_TO_PLATFORM, type PlatformPathSegment } from '../services/AuthorizeUrlBuilder'

/** Provider-side identifier → credentials field per platform. Shopify is the only entry — others discover the identifier post-token. */
const IDENTIFIER_CREDENTIAL_KEY: Partial<Record<PlatformPathSegment, string>> = {
	shopify: 'shopDomain',
}

export const IntegrationOAuthCallbackInputSchema = z.object({
	// `platform` stays permissive at the schema layer — an unknown segment from a
	// misregistered provider redirect must surface as a 302 redirect (per spec
	// Decision 12: "never a JSON 4xx from the callback — the browser is mid-redirect").
	// A `z.enum(...)` here would throw VALIDATION_ERROR at framework-level validation
	// and the browser would land on a JSON error page. The handler dispatches via
	// PATH_SEGMENT_TO_PLATFORM and 302s with code=PLATFORM_NOT_SUPPORTED for unknowns.
	params: z.object({ platform: z.string().min(1) }),
	query: z.object({
		code: z.string().optional(),
		state: z.string().optional(),
		error: z.string().optional(),
	}),
})

export const IntegrationOAuthCallbackOutputSchema = z.void().example([undefined])

/**
 * GET /integrations/oauth/callback/:platform. Public — the signed state IS the
 * auth (same pattern as AcceptInvitationController). Verifies state, calls
 * ConnectIntegration in-process via DI, and 302s the browser back to the SPA
 * with ?status=ok|error and supporting params. Any BaseError thrown by state
 * verify or ConnectIntegration translates to a 302 error redirect — never a
 * JSON 4xx (the browser is mid-redirect; a 4xx body would surface as a broken
 * page).
 */
@injectable()
export class IntegrationOAuthCallbackController extends Controller<
	typeof IntegrationOAuthCallbackInputSchema,
	typeof IntegrationOAuthCallbackOutputSchema
> {
	readonly path = '/integrations/oauth/callback/:platform'
	readonly method = 'get' as const
	readonly description = 'OAuth callback — provider redirects here after consent; we 302 the browser back to the app'
	readonly inputSchema = IntegrationOAuthCallbackInputSchema
	readonly outputSchema = IntegrationOAuthCallbackOutputSchema

	// No AuthAccountMiddleware — state token is the auth (analog: AcceptInvitationController).
	override middlewares = []

	constructor(
		private readonly stateService: OAuthStateTokenService,
		private readonly connect: ConnectIntegration,
	) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		// Wire-level segment — may not be a registered path. Look up first; 302
		// with PLATFORM_NOT_SUPPORTED if unknown (never JSON 4xx — spec § 12).
		const rawSegment = request.params.platform
		const platformPair = PATH_SEGMENT_TO_PLATFORM[rawSegment as PlatformPathSegment]
		if (platformPair === undefined) {
			return this.errorRedirect(rawSegment, 'PLATFORM_NOT_SUPPORTED')
		}
		const platformLabel = platformPair.platform

		// User clicked Deny at the provider (RFC 6749 §4.1.2.1).
		if (request.query.error === 'access_denied') {
			return this.errorRedirect(platformLabel, 'OAUTH_USER_DENIED')
		}

		// No code AND no recognized error — malformed callback.
		if (request.query.code === undefined || request.query.code.length === 0) {
			return this.errorRedirect(platformLabel, 'OAUTH_CODE_INVALID')
		}
		if (request.query.state === undefined || request.query.state.length === 0) {
			return this.errorRedirect(platformLabel, 'OAUTH_STATE_INVALID')
		}

		const verified = await tryCatchAsync(async () =>
			this.stateService.verify(request.query.state!, { expectedPlatform: platformPair.platform }),
		)
		if (!verified.success) {
			const name = verified.error instanceof BaseError ? verified.error.name : 'OAUTH_STATE_INVALID'
			return this.errorRedirect(platformLabel, name)
		}

		const credentialKey = IDENTIFIER_CREDENTIAL_KEY[rawSegment as PlatformPathSegment]
		const credentials: Record<string, string> =
			credentialKey !== undefined && verified.data.identifier !== undefined
				? { [credentialKey]: verified.data.identifier }
				: {}

		const connectInput: Z.input<typeof ConnectIntegrationInputSchema> = {
			connectionMode: ConnectionMode.OAUTH,
			type: platformPair.type,
			platform: platformPair.platform,
			credentials,
			oauthCode: request.query.code,
			storeId: verified.data.storeId,
			userId: verified.data.userId,
		}

		const execResult = await tryCatchAsync(() => this.connect.execute(connectInput))
		if (!execResult.success) {
			const name = execResult.error instanceof BaseError ? execResult.error.name : 'OAUTH_CODE_EXCHANGE_FAILED'
			return this.errorRedirect(platformLabel, name)
		}

		const url = new URL(`${Config.env.APP_URL}/app/integrations`)
		url.searchParams.set('status', 'ok')
		url.searchParams.set('storeIntegrationId', execResult.data.storeIntegrationId)
		url.searchParams.set('platform', platformLabel)
		return {
			status: HttpStatusCode.MOVED_TEMPORARILY,
			data: undefined,
			headers: { Location: url.toString() },
		}
	}

	private errorRedirect(platform: string, code: string): this['output'] {
		const url = new URL(`${Config.env.APP_URL}/app/integrations`)
		url.searchParams.set('status', 'error')
		url.searchParams.set('code', code)
		url.searchParams.set('platform', platform)
		return {
			status: HttpStatusCode.MOVED_TEMPORARILY,
			data: undefined,
			headers: { Location: url.toString() },
		}
	}
}
```

### Step T4.4 — Register the callback controller

Modify `packages/api/typescript/src/integration/controllers/index.ts`:
- Add export: `export { IntegrationOAuthCallbackController } from './IntegrationOAuthCallbackController'`

### Step T4.5 — Run test to verify it passes

Run: `bun test packages/api/typescript/src/integration/controllers/IntegrationOAuthCallbackController.test.ts`
Expected: PASS — 8 tests pass

### Step T4.6 — Type-check + lint

Run: `cd packages/api/typescript && bun x tsc --noEmit && cd - && bun lint`
Expected: 0 errors

### Step T4.7 — Commit

```bash
git add packages/api/typescript/src/integration/controllers/IntegrationOAuthCallbackController.ts \
        packages/api/typescript/src/integration/controllers/IntegrationOAuthCallbackController.test.ts \
        packages/api/typescript/src/integration/controllers/index.ts
git commit -m "feat(integration): GET /integrations/oauth/callback/:platform — verify state, connect in-process, 302 back to SPA (Task T4)"
```

---

## Task T5: POST /integrations rejects OAuth bodies at the schema layer

**Files to write:**
- Modify: `packages/api/typescript/src/integration/services/index.ts` — extract OAuth leaves into a new export, keep `PlatformConnectBodySchema` unchanged (use case still needs it), add `PlatformConnectNonOAuthBodySchema`
- Modify: `packages/api/typescript/src/integration/usecases/ConnectIntegration.ts` — re-export `ConnectIntegrationBodySchema` from the narrowed schema (the controller's body); `ConnectIntegrationInputSchema` (the use case input) keeps the full union so the callback can still pass OAuth in-process
- Test: `packages/api/typescript/src/integration/usecases/ConnectIntegration.test.ts` — extend with an explicit "OAuth body via controller path is rejected" assertion using the narrowed schema

**Files to read:**
- `packages/api/typescript/src/integration/services/index.ts` — current `PlatformConnectBodySchema` shape

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema, /controller, /test
**Depends on:** T4

### Step T5.1 — Extract the OAuth leaves into separate schemas

Modify `packages/api/typescript/src/integration/services/index.ts`:

Replace the `PlatformConnectBodySchema` definition with:

```diff
-export const PlatformConnectBodySchema = z.union([
-	// SALES — OAuth
-	oauthLeaf(ShopifyOAuthDescriptionSchema),
-	oauthLeaf(NuvemShopOAuthDescriptionSchema),
-	// SALES — Credentials
+const OAUTH_LEAVES = [
+	oauthLeaf(ShopifyOAuthDescriptionSchema),
+	oauthLeaf(NuvemShopOAuthDescriptionSchema),
+	oauthLeaf(MetaOAuthDescriptionSchema),
+	oauthLeaf(GoogleAdsOAuthDescriptionSchema),
+	oauthLeaf(TiktokOAuthDescriptionSchema),
+] as const
+
+const NON_OAUTH_LEAVES = [
+	// SALES — Credentials
 	credentialsLeaf(ShopifyCredentialsDescriptionSchema),
 	// GATEWAY — Credentials
 	credentialsLeaf(ShopifyPaymentsCredentialsDescriptionSchema),
@@ ...
-	// MARKETING — OAuth
-	oauthLeaf(MetaOAuthDescriptionSchema),
-	oauthLeaf(GoogleAdsOAuthDescriptionSchema),
-	oauthLeaf(TiktokOAuthDescriptionSchema),
 	// MARKETING — Manual
 	manualLeaf(MetaManualDescriptionSchema),
 	manualLeaf(GoogleAdsManualDescriptionSchema),
 	manualLeaf(TiktokManualDescriptionSchema),
 	manualLeaf(TaboolaManualDescriptionSchema),
 	// INFOPRODUCT — Credentials (coming soon)
 	credentialsLeaf(KiwifyCredentialsDescriptionSchema),
 	credentialsLeaf(HotmartCredentialsDescriptionSchema),
-])
+] as const
+
+/** Full union — accepted by the ConnectIntegration use case (the callback controller passes OAuth bodies in-process). */
+export const PlatformConnectBodySchema = z.union([...OAUTH_LEAVES, ...NON_OAUTH_LEAVES])
+
+/** Narrowed union (OAUTH leaves removed) — accepted by the public POST /integrations controller. OAuth is unreachable via HTTP. */
+export const PlatformConnectNonOAuthBodySchema = z.union(NON_OAUTH_LEAVES)
 export type PlatformConnectBody = Z.infer<typeof PlatformConnectBodySchema>
+export type PlatformConnectNonOAuthBody = Z.infer<typeof PlatformConnectNonOAuthBodySchema>
```

### Step T5.2 — Point the controller body schema at the narrowed union

Modify `packages/api/typescript/src/integration/usecases/ConnectIntegration.ts`:

```diff
-import { PlatformConnectBodySchema, PlatformSchema } from '@integration/services'
+import { PlatformConnectBodySchema, PlatformConnectNonOAuthBodySchema, PlatformSchema } from '@integration/services'
@@
-/**
- * Connect body — what the client sends + the SDK exposes: the registry-derived
- * union (one leaf per connectionMode × type × platform, built in
- * `@integration/services` from the platform Descriptions). Re-published here so
- * the controller sources the contract from the use case. (It can't `.omit()` the
- * server fields off the input — the input is a discriminated union and `.omit()`
- * is ZodObject-only — so the body is the union *without* them, and the input
- * layers them on below.)
- */
-export const ConnectIntegrationBodySchema = PlatformConnectBodySchema
+/**
+ * Connect body — the SDK-exposed schema for POST /integrations. Narrowed to
+ * non-OAuth modes (MANUAL / CREDENTIALS) so the OAuth leaf is physically
+ * unreachable through HTTP: OAuth must go through the authorize → provider
+ * → callback round-trip, which calls the use case in-process via DI.
+ * (Spec Decision 10.)
+ */
+export const ConnectIntegrationBodySchema = PlatformConnectNonOAuthBodySchema
@@
-export const ConnectIntegrationInputSchema = ConnectIntegrationBodySchema.and(z.object({ storeId: z.uuid(), userId: z.uuid() }))
+// Use-case input keeps the FULL union (incl. OAuth leaves) so the callback
+// controller can pass OAuth bodies in-process via DI.
+export const ConnectIntegrationInputSchema = PlatformConnectBodySchema.and(z.object({ storeId: z.uuid(), userId: z.uuid() }))
```

### Step T5.3 — Add a schema-rejection assertion to the existing ConnectIntegration test

Modify `packages/api/typescript/src/integration/usecases/ConnectIntegration.test.ts`:

1. Extend the existing top-of-file import:

```diff
-import { ConnectIntegration, type ConnectIntegrationInput } from './ConnectIntegration'
+import { ConnectIntegration, ConnectIntegrationBodySchema, type ConnectIntegrationInput } from './ConnectIntegration'
```

2. Append a new `describe` block at the end of the file:

```typescript
describe('ConnectIntegrationBodySchema (controller surface, post-narrowing)', () => {
	it('rejects an OAuth body — the leaf is no longer in the schema', () => {
		const result = ConnectIntegrationBodySchema.safeParse({
			connectionMode: ConnectionMode.OAUTH,
			type: StoreIntegrationType.SALES_CHANNEL,
			platform: SalesPlatform.SHOPIFY,
			credentials: { shopDomain: 'acme.myshopify.com' },
			oauthCode: 'whatever',
		})
		expect(result.success).toBe(false)
	})

	it('accepts a CREDENTIALS body for a credential-supported platform', () => {
		const result = ConnectIntegrationBodySchema.safeParse({
			connectionMode: ConnectionMode.CREDENTIALS,
			type: StoreIntegrationType.SALES_CHANNEL,
			platform: SalesPlatform.SHOPIFY,
			credentials: { shopDomain: 'acme.myshopify.com', clientId: 'k', clientSecret: 'v' },
		})
		expect(result.success).toBe(true)
	})
})
```

### Step T5.4 — Run tests to verify both new assertions pass and nothing else broke

Run: `bun test packages/api/typescript/src/integration/`
Expected: PASS — full integration BC suite (existing + 2 new assertions). The pre-existing happy-path ConnectIntegration test (OAuth body via the use case) continues to pass because the use case schema is the full union.

### Step T5.5 — Type-check + lint

Run: `cd packages/api/typescript && bun x tsc --noEmit && cd - && bun lint`
Expected: 0 errors

### Step T5.6 — Commit

```bash
git add packages/api/typescript/src/integration/services/index.ts \
        packages/api/typescript/src/integration/usecases/ConnectIntegration.ts \
        packages/api/typescript/src/integration/usecases/ConnectIntegration.test.ts
git commit -m "refactor(integration): narrow POST /integrations body to non-OAuth modes (Task T5)"
```

---

## Task T6: Contract Lock — SDK regen

**Files to write:**
- Regen: `packages/api/typescript/src/api/openapi.json` (path may differ — `bun emit-openapi` writes wherever it's configured)
- Regen: `packages/client/typescript/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T5

### Step T6.1 — Regenerate OpenAPI + SDK

Run: `bun emit-openapi && bun sdk`
Expected: completes without error; openapi + dist files updated.

### Step T6.2 — Verify regen produced expected artifacts

Run: `git diff --stat packages/client/typescript/dist/ packages/api/typescript/src/api/openapi.json 2>/dev/null || git diff --stat packages/client/typescript/dist/ packages/api/typescript/openapi.json`
Expected: openapi.json changed; `packages/client/typescript/dist/` files changed. New operations exist for `POST /integrations/oauth/authorize` and `GET /integrations/oauth/callback/{platform}`. The `POST /integrations` operation body schema no longer admits `connectionMode: OAUTH` leaves.

### Step T6.3 — Type-check after regen

Run: `bun tsc`
Expected: 0 errors across all workspaces.

### Step T6.4 — Commit

```bash
git add packages/api/typescript/src/api/openapi.json packages/client/typescript/dist/ 2>/dev/null || git add packages/api/typescript/openapi.json packages/client/typescript/dist/
git commit -m "chore(sdk): regenerate openapi+sdk for OAuth authorize+callback + narrowed Connect body (Task T6)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — all backend tests pass (integration BC suite + cross-cutting)
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `packages/api/typescript/src/integration/usecases/AuthorizeIntegration.test.ts:"returns {authorizeUrl, state, expiresAt} for Shopify…"` + `"throws PLATFORM_NOT_SUPPORTED for a (type, platform) without an authorize builder"`
  - AC-2 → covered by middleware composition at controller load-time (same triad as `ConnectIntegrationController`); the controller assertion is implicit — middleware-level UNAUTHORIZED tests already exist for the analog endpoint and are part of the cross-cutting middleware test suite. (No new test required — the middleware behavior is verified once, not per-controller.)
  - AC-3 → `OAuthStateTokenService.test.ts:"throws OAUTH_STATE_INVALID when the signature is tampered"` + `"throws OAUTH_STATE_INVALID for a malformed envelope"`
  - AC-4 → `OAuthStateTokenService.test.ts:"throws OAUTH_STATE_EXPIRED when exp is in the past"`
  - AC-5 → `OAuthStateTokenService.test.ts:"throws OAUTH_STATE_PLATFORM_MISMATCH when the callback platform differs"`
  - AC-6 → `IntegrationOAuthCallbackController.test.ts:"happy path Shopify: invokes ConnectIntegration and 302s to APP_URL with status=ok"`
  - AC-7 → `IntegrationOAuthCallbackController.test.ts:"happy path Google Ads (no identifier in state)"`
  - AC-8 → `IntegrationOAuthCallbackController.test.ts:"user denied: ?error=access_denied without code"`
  - AC-9 → `IntegrationOAuthCallbackController.test.ts:"tampered state"`, `"expired state"`, `"platform mismatch"`, `"missing code and no error"`, `"unknown platform segment → 302 with code=PLATFORM_NOT_SUPPORTED"` (covers OAUTH_STATE_INVALID / OAUTH_STATE_EXPIRED / OAUTH_STATE_PLATFORM_MISMATCH / OAUTH_CODE_INVALID / PLATFORM_NOT_SUPPORTED → 302 mappings). INTEGRATION_HANDSHAKE_FAILED / INTEGRATION_INSUFFICIENT_SCOPES / OAUTH_CODE_EXCHANGE_FAILED are covered by the same `tryCatchAsync` branch — the existing `ConnectIntegration.test.ts` proves those errors are thrown by the use case; the callback's `tryCatchAsync` proves the 302 translation.
  - AC-10 → `ConnectIntegration.test.ts:"ConnectIntegrationBodySchema (controller surface, post-narrowing) — rejects an OAuth body"`
  - AC-11 → `AuthorizeUrlBuilder.test.ts` — one describe per platform asserts each provider-mandated param.
  - AC-12 → `AuthorizeUrlBuilder.test.ts` — each builder asserts `redirect_uri === ${Config.env.API_URL}/integrations/oauth/callback/${segment}` (NuvemShop excluded — its URL does not carry `redirect_uri` per spec note in T2).
  - AC-13 → `IntegrationOAuthCallbackController.test.ts:"happy path Shopify"` asserts the same `IntegrationConnectionInitiated / HandshakeSucceeded / Activated` triplet + `StoreIntegration` row that `ConnectIntegration.test.ts` asserts for the legacy in-process call.

## Notes

**Env vars (new — must be set in deployment configs).** Add to `.env.example` and any deployed env:

```
SHOPIFY_APP_CLIENT_ID=
SHOPIFY_APP_CLIENT_SECRET=
META_APP_CLIENT_ID=
META_APP_CLIENT_SECRET=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
NUVEMSHOP_APP_ID=
NUVEMSHOP_APP_CLIENT_ID=
NUVEMSHOP_APP_CLIENT_SECRET=
TIKTOK_APP_CLIENT_ID=
TIKTOK_APP_CLIENT_SECRET=
```

These supersede the legacy names (`SHOPIFY_CLIENT_ID`, `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `GOOGLE_ADS_REDIRECT_URI`, `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `NUVEMSHOP_CLIENT_ID`, `NUVEMSHOP_CLIENT_SECRET`). Update deployment configs before T6 lands — the registry now reads exclusively from the new names.

**Provider dashboard registration (operational, not code).** Each provider must register `${API_URL}/integrations/oauth/callback/${segment}` as an authorized redirect URI before that platform can be tested end-to-end:

- Shopify Partners → `${API_URL}/integrations/oauth/callback/shopify`
- Meta for Developers → `${API_URL}/integrations/oauth/callback/meta`
- Google Cloud Console (OAuth client) → `${API_URL}/integrations/oauth/callback/google_ads`
- NuvemShop Partners → `${API_URL}/integrations/oauth/callback/nuvem_shop`
- Tiktok for Business → `${API_URL}/integrations/oauth/callback/tiktok`

**SDK exposure.** The callback `GET /integrations/oauth/callback/:platform` will appear in the generated SDK as a callable operation. It's harmless — the FE never calls it directly (the browser navigates to it from the provider redirect) — but it's worth noting in the PR description so reviewers don't ask "why does the SDK expose a server-internal callback".

**No frontend artifacts.** Per the spec's "Out of scope" section, no frontend routes / components ship in this plan. The plan completes the backend contract; a separate spec ships the `/app/integrations` UI that consumes it.
