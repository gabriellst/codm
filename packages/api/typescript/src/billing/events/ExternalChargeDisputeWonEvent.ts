// events/ExternalChargeDisputeWonEvent.ts — "the dispute (chargeback) closed in the merchant's
// favor; the funds are restored" (provenance), primitives only. Its handler REVERSES the CHARGEBACK
// credit note that the earlier ExternalChargeDisputedEvent issued, so the invoice stops being
// credited and backs access again by DERIVATION (no status flip).
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ExternalChargeDisputeWonEventSchema = z.domainEvent({
	externalId: z.string().min(1), // provider event id (evt_… / hook_…) — webhook dedup key
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	amountCents: z.number().int().nonnegative(),
	gatewayTxId: z.string().min(1),
	// The real gateway-native dispute ref (Stripe `dp_…`) when the mapper can supply one — lets the
	// handler locate the EXACT credit note this won closed (multi-dispute invoices), instead of the
	// ambiguous (invoice, reason) fallback used when this is absent.
	gatewayDisputeRef: z.string().min(1).optional(),
})

export type ExternalChargeDisputeWonEventPayload = Z.infer<typeof ExternalChargeDisputeWonEventSchema>['payload']

export class ExternalChargeDisputeWonEvent extends BaseDomainEvent<typeof ExternalChargeDisputeWonEventSchema> {
	static override readonly name = 'billing.payment.external_charge_dispute_won' as const
	static readonly schema = ExternalChargeDisputeWonEventSchema
}
