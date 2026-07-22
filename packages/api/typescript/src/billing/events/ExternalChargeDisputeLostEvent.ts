// events/ExternalChargeDisputeLostEvent.ts — "the dispute closed in the cardholder's favor"
// (provenance). NO money effect: the CHARGEBACK credit note is already active and stays — this fact
// only closes the PROCESS (Dispute → LOST). Emitted today only by Stripe (charge.dispute.closed,
// status lost — previously dropped on purpose; the entity gave the fact a consumer).
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ExternalChargeDisputeLostEventSchema = z.domainEvent({
	externalId: z.string().min(1),
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	amountCents: z.number().int().nonnegative(),
	gatewayTxId: z.string().min(1),
	gatewayDisputeRef: z.string().min(1).optional(),
})

export type ExternalChargeDisputeLostEventPayload = Z.infer<typeof ExternalChargeDisputeLostEventSchema>['payload']

export class ExternalChargeDisputeLostEvent extends BaseDomainEvent<typeof ExternalChargeDisputeLostEventSchema> {
	static override readonly name = 'billing.payment.external_charge_dispute_lost' as const
	static readonly schema = ExternalChargeDisputeLostEventSchema
}
