// CONTEXT-ORIGIN: template@feat/template-polyglot (2026-07-01) — Tier-3 exemplar, not live code
// ORIGIN-FILE: packages/api/typescript/src/integration/services/index.ts

import Z from 'zod'
import { z } from '@template/core-typescript/schema'
import {
	CheckoutPlatform,
	ConnectionMode,
	InfoproductPlatform,
	MarketingPlatform,
	PaymentGateway,
	SalesPlatform,
	StoreIntegrationType,
} from '@template/contracts-typescript/wire/enums'

// ─── Per-(platform × mode) Description leaves ────────────────────────────────

import { ShopifyOAuthDescriptionSchema, ShopifyCredentialsDescriptionSchema } from './shopify/ShopifyDescription'
import { WooCommerceOAuthDescriptionSchema } from './woocommerce/WooCommerceDescription'
import {
	ShopifyPaymentsCredentialsDescriptionSchema,
	ShopifyPaymentsManualDescriptionSchema,
} from './shopify-payments/ShopifyPaymentsDescription'
import { MercadoPagoManualDescriptionSchema } from './mercado-pago/MercadoPagoDescription'
import { AppmaxManualDescriptionSchema } from './appmax/AppmaxDescription'
import { StripeManualDescriptionSchema } from './stripe/StripeDescription'
import { PaypalManualDescriptionSchema } from './paypal/PaypalDescription'
import { YeverGatewayManualDescriptionSchema } from './yever/YeverGatewayDescription'
import { TictoCredentialsDescriptionSchema, TictoManualDescriptionSchema } from './ticto/TictoDescription'
import { KirvanoManualDescriptionSchema } from './kirvano/KirvanoDescription'
import { AdooreiManualDescriptionSchema } from './adoorei/AdooreiDescription'
import { YeverCheckoutManualDescriptionSchema } from './yever/YeverCheckoutDescription'
import { ZedyManualDescriptionSchema } from './zedy/ZedyDescription'
import { MetaOAuthDescriptionSchema, MetaManualDescriptionSchema } from './meta/MetaDescription'
import { GoogleAdsOAuthDescriptionSchema, GoogleAdsManualDescriptionSchema } from './google-ads/GoogleAdsDescription'
import { TiktokOAuthDescriptionSchema, TiktokManualDescriptionSchema } from './tiktok/TiktokDescription'
import { TaboolaManualDescriptionSchema } from './taboola/TaboolaDescription'
import { EduzzCredentialsDescriptionSchema } from './eduzz/EduzzDescription'
import { HotmartCredentialsDescriptionSchema } from './hotmart/HotmartDescription'

// ─── Registry — connectionMode → type → platform (all literals unique per branch) ───

export const PlatformRegistrySchema = z.discriminatedUnion('connectionMode', [
	// OAUTH leaves
	z.discriminatedUnion('type', [
		z.discriminatedUnion('platform', [ShopifyOAuthDescriptionSchema, WooCommerceOAuthDescriptionSchema]),
		z.discriminatedUnion('platform', [MetaOAuthDescriptionSchema, GoogleAdsOAuthDescriptionSchema, TiktokOAuthDescriptionSchema]),
	]),
	// CREDENTIALS leaves
	z.discriminatedUnion('type', [
		z.discriminatedUnion('platform', [ShopifyCredentialsDescriptionSchema]),
		z.discriminatedUnion('platform', [ShopifyPaymentsCredentialsDescriptionSchema]),
		z.discriminatedUnion('platform', [TictoCredentialsDescriptionSchema]),
		z.discriminatedUnion('platform', [EduzzCredentialsDescriptionSchema, HotmartCredentialsDescriptionSchema]),
	]),
	// MANUAL leaves
	z.discriminatedUnion('type', [
		z.discriminatedUnion('platform', [
			ShopifyPaymentsManualDescriptionSchema,
			MercadoPagoManualDescriptionSchema,
			AppmaxManualDescriptionSchema,
			StripeManualDescriptionSchema,
			PaypalManualDescriptionSchema,
			YeverGatewayManualDescriptionSchema,
		]),
		z.discriminatedUnion('platform', [
			TictoManualDescriptionSchema,
			KirvanoManualDescriptionSchema,
			AdooreiManualDescriptionSchema,
			YeverCheckoutManualDescriptionSchema,
			ZedyManualDescriptionSchema,
		]),
		z.discriminatedUnion('platform', [
			MetaManualDescriptionSchema,
			GoogleAdsManualDescriptionSchema,
			TiktokManualDescriptionSchema,
			TaboolaManualDescriptionSchema,
		]),
	]),
])

export type PlatformDescription = Z.infer<typeof PlatformRegistrySchema>

// ─── Runtime (type, platform) coordinate — used by factories + entity ─────────

export const PlatformSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal(StoreIntegrationType.SALES_CHANNEL), platform: z.enum(SalesPlatform) }),
	z.object({ type: z.literal(StoreIntegrationType.CHECKOUT), platform: z.enum(CheckoutPlatform) }),
	z.object({ type: z.literal(StoreIntegrationType.PAYMENT_GATEWAY), platform: z.enum(PaymentGateway) }),
	z.object({ type: z.literal(StoreIntegrationType.MARKETING_PLATFORM), platform: z.enum(MarketingPlatform) }),
	z.object({ type: z.literal(StoreIntegrationType.INFOPRODUCT), platform: z.enum(InfoproductPlatform) }),
])
export type PlatformProps = Z.infer<typeof PlatformSchema>

// ─── Connect body — one leaf per (connectionMode, type, platform) ────────────
// Derived from the registry leaves: each leaf carries `credentials` (= its
// inputTokens); OAUTH leaves add `oauthCode`. The server-injected storeId +
// userId are layered on by the ConnectIntegration use case
// (`ConnectIntegrationInputSchema`) — they come from the path param + session,
// never the connect form, so they don't belong in this platform aggregator.

function oauthLeaf<T extends Z.ZodType, P extends Z.ZodType, I extends Z.ZodType>(leaf: {
	shape: { type: T; platform: P; inputTokens: I }
}) {
	return z.object({
		connectionMode: z.literal(ConnectionMode.OAUTH),
		type: leaf.shape.type,
		platform: leaf.shape.platform,
		credentials: leaf.shape.inputTokens,
		oauthCode: z.string().min(1),
	})
}

function credentialsLeaf<T extends Z.ZodType, P extends Z.ZodType, I extends Z.ZodType>(leaf: {
	shape: { type: T; platform: P; inputTokens: I }
}) {
	return z.object({
		connectionMode: z.literal(ConnectionMode.CREDENTIALS),
		type: leaf.shape.type,
		platform: leaf.shape.platform,
		credentials: leaf.shape.inputTokens,
	})
}

function manualLeaf<T extends Z.ZodType, P extends Z.ZodType, I extends Z.ZodType>(leaf: {
	shape: { type: T; platform: P; inputTokens: I }
}) {
	return z.object({
		connectionMode: z.literal(ConnectionMode.MANUAL),
		type: leaf.shape.type,
		platform: leaf.shape.platform,
		credentials: leaf.shape.inputTokens,
	})
}

const OAUTH_LEAVES = [
	// SALES — OAuth
	oauthLeaf(ShopifyOAuthDescriptionSchema),
	oauthLeaf(WooCommerceOAuthDescriptionSchema),
	// MARKETING — OAuth
	oauthLeaf(MetaOAuthDescriptionSchema),
	oauthLeaf(GoogleAdsOAuthDescriptionSchema),
	oauthLeaf(TiktokOAuthDescriptionSchema),
] as const

const NON_OAUTH_LEAVES = [
	// SALES — Credentials
	credentialsLeaf(ShopifyCredentialsDescriptionSchema),
	// GATEWAY — Credentials
	credentialsLeaf(ShopifyPaymentsCredentialsDescriptionSchema),
	// GATEWAY — Manual
	manualLeaf(ShopifyPaymentsManualDescriptionSchema),
	manualLeaf(MercadoPagoManualDescriptionSchema),
	manualLeaf(AppmaxManualDescriptionSchema),
	manualLeaf(StripeManualDescriptionSchema),
	manualLeaf(PaypalManualDescriptionSchema),
	manualLeaf(YeverGatewayManualDescriptionSchema),
	// CHECKOUT — Credentials
	credentialsLeaf(TictoCredentialsDescriptionSchema),
	// CHECKOUT — Manual
	manualLeaf(TictoManualDescriptionSchema),
	manualLeaf(KirvanoManualDescriptionSchema),
	manualLeaf(AdooreiManualDescriptionSchema),
	manualLeaf(YeverCheckoutManualDescriptionSchema),
	manualLeaf(ZedyManualDescriptionSchema),
	// MARKETING — Manual
	manualLeaf(MetaManualDescriptionSchema),
	manualLeaf(GoogleAdsManualDescriptionSchema),
	manualLeaf(TiktokManualDescriptionSchema),
	manualLeaf(TaboolaManualDescriptionSchema),
	// INFOPRODUCT — Credentials (coming soon)
	credentialsLeaf(EduzzCredentialsDescriptionSchema),
	credentialsLeaf(HotmartCredentialsDescriptionSchema),
] as const

/** Full union — accepted by the ConnectIntegration use case (the callback controller passes OAuth bodies in-process). */
export const PlatformConnectBodySchema = z.union([...OAUTH_LEAVES, ...NON_OAUTH_LEAVES])

/** Narrowed union (OAUTH leaves removed) — accepted by the public POST /integrations controller. OAuth is unreachable via HTTP. */
export const PlatformConnectNonOAuthBodySchema = z.union(NON_OAUTH_LEAVES)
export type PlatformConnectBody = Z.infer<typeof PlatformConnectBodySchema>
export type PlatformConnectNonOAuthBody = Z.infer<typeof PlatformConnectNonOAuthBodySchema>
