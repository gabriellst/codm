// events/ExternalChargeDisputedEvent.ts — "the acquirer/bank opened a dispute (chargeback) against
// this charge" (provenance), primitives only. Distinct from a merchant-initiated REFUND: this fact
// records a CHARGEBACK credit note against the invoice, which the InvoiceStatusDeriver sums to
// revoke access by DERIVATION (no dunning bridge, no status flip).
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ExternalChargeDisputedEventSchema = z.domainEvent({
	externalId: z.string().min(1), // provider event id (evt_… / hook_…) — webhook dedup key
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	amountCents: z.number().int().nonnegative(), // the DISPUTED amount
	gatewayTxId: z.string().min(1),
	// The real gateway-native dispute id (Stripe `dp_…`) when the mapper can supply one. Only Stripe's
	// `charge.dispute.*` payload carries a distinct Dispute object id — PagarMe/MercadoPago/Asaas have
	// no such id, so the handler falls back to a synthetic `evt:{externalId}` ref when absent.
	gatewayDisputeRef: z.string().min(1).optional(),
})

export type ExternalChargeDisputedEventPayload = Z.infer<typeof ExternalChargeDisputedEventSchema>['payload']

export class ExternalChargeDisputedEvent extends BaseDomainEvent<typeof ExternalChargeDisputedEventSchema> {
	static override readonly name = 'billing.payment.external_charge_disputed' as const
	static readonly schema = ExternalChargeDisputedEventSchema
}
