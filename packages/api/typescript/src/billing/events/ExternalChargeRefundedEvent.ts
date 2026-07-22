// events/ExternalChargeRefundedEvent.ts — "the gateway reported a refund/chargeback" (provenance), primitives only.
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ExternalChargeRefundedEventSchema = z.domainEvent({
	externalId: z.string().min(1), // provider event id (hook_…) — webhook dedup key
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	amountCents: z.number().int().nonnegative(),
	gatewayTxId: z.string().min(1),
	// The vendor's canonical refund id (Stripe re_…, the gateway's refund transaction id) — the
	// credit-note dedup key shared by the webhook AND reconciliation (the synthetic event), so two
	// DIFFERENT externalIds pointing at the SAME gateway refund collide into one credit note.
	// Optional: older log entries and mappers that can't populate it yet fall back to externalId.
	gatewayRefundId: z.string().min(1).optional(),
})

export type ExternalChargeRefundedEventPayload = Z.infer<typeof ExternalChargeRefundedEventSchema>['payload']

export class ExternalChargeRefundedEvent extends BaseDomainEvent<typeof ExternalChargeRefundedEventSchema> {
	static override readonly name = 'billing.payment.external_charge_refunded' as const
	static readonly schema = ExternalChargeRefundedEventSchema
}
