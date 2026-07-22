// CONTEXT-ORIGIN: template@feat/template-polyglot (2026-07-01) — Tier-3 exemplar, not live code
// ORIGIN-FILE: packages/api/typescript/src/integration/services/AuthorizeUrlBuilder/AuthorizeUrlBuilderFactory.ts

import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import {
	CheckoutPlatform,
	InfoproductPlatform,
	MarketingPlatform,
	PaymentGateway,
	SalesPlatform,
	StoreIntegrationType,
} from '@template/contracts-typescript/wire/enums'
import type { IntegrationApplicationErrors } from '../../errors'
import type { PlatformProps } from '../index'
import { AuthorizeUrlBuilder, PLATFORM_PATH_SEGMENTS, type PlatformPathSegment } from './AuthorizeUrlBuilder'
import { ShopifyAuthorizeUrlBuilder } from '../shopify/ShopifyAuthorizeUrlBuilder'
import { MetaAuthorizeUrlBuilder } from '../meta/MetaAuthorizeUrlBuilder'
import { GoogleAdsAuthorizeUrlBuilder } from '../google-ads/GoogleAdsAuthorizeUrlBuilder'
import { WooCommerceAuthorizeUrlBuilder } from '../woocommerce/WooCommerceAuthorizeUrlBuilder'
import { TiktokAuthorizeUrlBuilder } from '../tiktok/TiktokAuthorizeUrlBuilder'

type PlatformForType<T extends StoreIntegrationType> = T extends StoreIntegrationType.SALES_CHANNEL
	? SalesPlatform
	: T extends StoreIntegrationType.CHECKOUT
		? CheckoutPlatform
		: T extends StoreIntegrationType.PAYMENT_GATEWAY
			? PaymentGateway
			: T extends StoreIntegrationType.MARKETING_PLATFORM
				? MarketingPlatform
				: T extends StoreIntegrationType.INFOPRODUCT
					? InfoproductPlatform
					: never

type BuilderRegistry = { [T in StoreIntegrationType]?: Partial<Record<PlatformForType<T>, AuthorizeUrlBuilder>> }

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
		woo: WooCommerceAuthorizeUrlBuilder,
		tiktok: TiktokAuthorizeUrlBuilder,
	) {
		this.builders = {
			[StoreIntegrationType.SALES_CHANNEL]: {
				[SalesPlatform.SHOPIFY]: shopify,
				[SalesPlatform.WOO_COMMERCE]: woo,
			},
			[StoreIntegrationType.MARKETING_PLATFORM]: {
				[MarketingPlatform.META]: meta,
				[MarketingPlatform.GOOGLE_ADS]: google,
				[MarketingPlatform.TIKTOK]: tiktok,
			},
		}
	}

	get(platform: PlatformProps): AuthorizeUrlBuilder {
		// TS cannot correlate platform.type with platform.platform across the mapped
		// type at the call site — index via string cast (runtime is still correct;
		// the type-level guarantee lives in BuilderRegistry's mapped type).
		const inner = this.builders[platform.type] as Record<string, AuthorizeUrlBuilder> | undefined
		const builder = inner?.[platform.platform as string]
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
	woo_commerce: { type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.WOO_COMMERCE },
	meta: { type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.META },
	google_ads: { type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.GOOGLE_ADS },
	tiktok: { type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.TIKTOK },
}

export { PLATFORM_PATH_SEGMENTS, type PlatformPathSegment }
