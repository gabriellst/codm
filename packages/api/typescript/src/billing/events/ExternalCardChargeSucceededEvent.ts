// events/ExternalCardChargeSucceededEvent.ts — "the gateway settled a card charge" (provenance), primitives only.
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'
import { PaymentInstrumentSchema } from '../objects/PaymentInstrument'
import { BillingPlatform } from '@template/contracts-typescript/wire/enums'

export const ExternalCardChargeSucceededEventSchema = z.domainEvent({
	externalId: z.string().min(1), // provider event id (hook_…) — webhook dedup key
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	amountCents: z.number().int().nonnegative(),
	gatewayTxId: z.string().min(1),
	instrument: PaymentInstrumentSchema.optional(), // the vaultable card — absent when the gateway returned no card data
	// Which gateway captured the money. Forwarded by checkout-originated settles so CHECKOUT-ONLY
	// providers (no vaulted card to read the platform from) still record a correct charge fact.
	platform: z.enum(BillingPlatform).optional(),
})

export type ExternalCardChargeSucceededEventPayload = Z.infer<typeof ExternalCardChargeSucceededEventSchema>['payload']

export class ExternalCardChargeSucceededEvent extends BaseDomainEvent<typeof ExternalCardChargeSucceededEventSchema> {
	static override readonly name = 'billing.payment.external_card_charge_succeeded' as const
	static readonly schema = ExternalCardChargeSucceededEventSchema
}
