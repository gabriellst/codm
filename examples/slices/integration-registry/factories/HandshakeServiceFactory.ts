// CONTEXT-ORIGIN: template@feat/template-polyglot (2026-07-01) — Tier-3 exemplar, not live code
// ORIGIN-FILE: packages/api/typescript/src/integration/services/HandshakeService/HandshakeServiceFactory.ts

import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import { MarketingPlatform, SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import type { PlatformProps } from '@integration/services'
import { HandshakeService } from './HandshakeService'
import { ShopifyHandshaker } from '../shopify/ShopifyHandshaker'

/**
 * DI tokens for OAuth platforms that do not yet have a real handshaker impl.
 * These abstract classes are token-only — the registry binds a MockHandshakeService
 * in mock/integration envs so the callback flow can be tested E2E without a
 * real external call. The `real` env leaves them unbound (factory throws
 * PLATFORM_NOT_SUPPORTED, matching SPEC-18).
 */
export abstract class WooCommerceHandshaker extends HandshakeService {}
export abstract class MetaHandshaker extends HandshakeService {}
export abstract class GoogleAdsHandshaker extends HandshakeService {}
export abstract class TiktokHandshaker extends HandshakeService {}

/**
 * Per-(type, platform) resolver for HandshakeService impls. Membership is
 * declared statically as a nested record keyed by the StoreIntegrationType +
 * platform enums — each concrete handshaker is a DI param. Same shape as
 * `BillingWebhookMapperFactory`: no `register()`, no `@injectAll`. Adding a
 * provider = add a constructor param + a table entry.
 *
 * The registry binds each concrete token to a mock (mock/integration) or the
 * real impl (real), so the factory holds the right handshaker per env.
 *
 * Throws PLATFORM_NOT_SUPPORTED for any (type, platform) without an impl —
 * e.g. manual platforms, which have no handshake (SPEC-18).
 */
@injectable()
export class HandshakeServiceFactory {
	private readonly services: Partial<Record<StoreIntegrationType, Partial<Record<string, HandshakeService>>>>

	constructor(
		shopify: ShopifyHandshaker,
		wooCommerce: WooCommerceHandshaker,
		meta: MetaHandshaker,
		googleAds: GoogleAdsHandshaker,
		tiktok: TiktokHandshaker,
	) {
		this.services = {
			[StoreIntegrationType.SALES_CHANNEL]: {
				[SalesPlatform.SHOPIFY]: shopify,
				[SalesPlatform.WOO_COMMERCE]: wooCommerce,
			},
			[StoreIntegrationType.MARKETING_PLATFORM]: {
				[MarketingPlatform.META]: meta,
				[MarketingPlatform.GOOGLE_ADS]: googleAds,
				[MarketingPlatform.TIKTOK]: tiktok,
			},
		}
	}

	get(platform: PlatformProps): HandshakeService {
		const service = this.services[platform.type]?.[platform.platform]
		if (service === undefined) {
			throw new BaseError<IntegrationApplicationErrors>(
				'PLATFORM_NOT_SUPPORTED',
				`no HandshakeService registered for ${platform.type}:${platform.platform}`,
			)
		}
		return service
	}
}
