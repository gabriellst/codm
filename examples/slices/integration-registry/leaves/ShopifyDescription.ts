// CONTEXT-ORIGIN: template@feat/template-polyglot (2026-07-01) — Tier-3 exemplar, not live code
// ORIGIN-FILE: packages/api/typescript/src/integration/services/shopify/ShopifyDescription.ts

import { z } from '@template/core-typescript/schema'
import { ConnectionMode, SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'

/** Shopify — OAUTH mode: merchant uses Shopify's platform app; only shopDomain is needed to initiate. */
export const ShopifyOAuthDescriptionSchema = z.object({
	connectionMode: z.literal(ConnectionMode.OAUTH),
	type: z.literal(StoreIntegrationType.SALES_CHANNEL),
	platform: z.literal(SalesPlatform.SHOPIFY),
	active: z.literal(true),
	scopes: z.tuple([z.literal('read_products'), z.literal('read_orders'), z.literal('read_customers')]),
	inputTokens: z.object({ shopDomain: z.string().min(1) }),
	outputTokens: z.object({
		shopDomain: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/, 'invalid shop domain'),
		accessToken: z.string().min(1),
		scope: z.string().optional(),
	}),
})

/** Shopify — CREDENTIALS mode: merchant's own custom app credentials. */
export const ShopifyCredentialsDescriptionSchema = z.object({
	connectionMode: z.literal(ConnectionMode.CREDENTIALS),
	type: z.literal(StoreIntegrationType.SALES_CHANNEL),
	platform: z.literal(SalesPlatform.SHOPIFY),
	active: z.literal(true),
	scopes: z.tuple([]),
	inputTokens: z.object({
		shopDomain: z.string().min(1),
		clientId: z.string().min(1),
		clientSecret: z.string().min(1),
	}),
	outputTokens: z.object({
		shopDomain: z.string().min(1),
		accessToken: z.string().min(1),
	}),
})

/** Shopify handshake (shop.json) response — `shop.myshopify_domain` becomes the externalId. */
export const ShopifyHandshakeResponseSchema = z.object({ shop: z.object({ myshopify_domain: z.string() }) })

/** Runtime scope list derived from the descriptor — single source for handshake + authorize URL. */
export const ShopifyOAuthScopes = ShopifyOAuthDescriptionSchema.shape.scopes.def.items.map(item => item.value) as readonly string[]
