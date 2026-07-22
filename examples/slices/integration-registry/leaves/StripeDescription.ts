// CONTEXT-ORIGIN: template@feat/template-polyglot (2026-07-01) — Tier-3 exemplar, not live code
// ORIGIN-FILE: packages/api/typescript/src/integration/services/stripe/StripeDescription.ts

import { z } from '@codedm/core-typescript/schema'
import { ConnectionMode, PaymentGateway, StoreIntegrationType } from '@codedm/contracts-typescript/wire/enums'

/** Stripe — MANUAL mode: no API; field-mapping only. */
export const StripeManualDescriptionSchema = z.object({
	connectionMode: z.literal(ConnectionMode.MANUAL),
	type: z.literal(StoreIntegrationType.PAYMENT_GATEWAY),
	platform: z.literal(PaymentGateway.STRIPE),
	active: z.literal(true),
	scopes: z.tuple([]),
	inputTokens: z.object({}),
	outputTokens: z.object({}),
})
