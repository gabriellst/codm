// events/ExternalCheckoutCompletedEvent.ts — "the gateway completed a hosted-checkout session"
// (provenance) — the single fact carrying both consequences: instrument vaulting and (intent=payment)
// invoice settlement.
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

import { PaymentInstrumentSchema } from '../objects/PaymentInstrument'
import { BillingPlatform, CheckoutIntent } from '@template/contracts-typescript/wire/enums'

export const ExternalCheckoutCompletedEventSchema = z.domainEvent({
	externalId: z.string().min(1), // provider event id (evt_…) — webhook dedup key
	ownerId: z.string().min(1),
	sessionRef: z.string().min(1), // gateway session id (cs_…) — vault dedup key
	intent: z.enum(CheckoutIntent),
	platform: z.enum(BillingPlatform),
	// Present only when the gateway VAULTS via the hosted page (capability cardVaulting). CHECKOUT-ONLY
	// providers settle without an instrument — the handler vaults only when present and settles always;
	// renewals degrade to the manual flow (NO_PAYMENT_METHOD → dunning).
	instrument: PaymentInstrumentSchema.optional(), // enriched with captureOrigin/originGatewayTxId by the mapper
	engineInvoiceId: z.string().min(1).optional(), // present only on intent=payment
	amountCents: z.number().int().nonnegative().optional(),
	gatewayTxId: z.string().min(1).optional(), // the checkout PaymentIntent (pi_…)
})

export type ExternalCheckoutCompletedEventPayload = Z.infer<typeof ExternalCheckoutCompletedEventSchema>['payload']

export class ExternalCheckoutCompletedEvent extends BaseDomainEvent<typeof ExternalCheckoutCompletedEventSchema> {
	static override readonly name = 'billing.payment.external_checkout_completed' as const
	static readonly schema = ExternalCheckoutCompletedEventSchema
}
