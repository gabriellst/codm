import { BaseDomainEvent, z } from '@template/core-typescript'
import { RefundSource } from '../enums/RefundSource'

// events/InvoiceRefundedEvent.ts — the refund EXPECTATION: emitted by RefundInvoice (operator)
// and RequestRefund (policy) in the post-gateway phase, when cancelCharge was ACCEPTED but the
// confirmation (webhook → credit note) doesn't exist yet. It is the marker RefundReconcileJob
// sweeps (listByNameSince) to poll the gateway when the webhook is lost. The poll fields are
// optional in the SCHEMA (old events in the log don't carry them) but mandatory on every
// post-gateway emission — an emission without gatewayTxId is invisible to reconciliation
// (audit-only).
export const InvoiceRefundedEventSchema = z.domainEvent({
	ownerId: z.string().min(1),
	invoiceId: z.string().min(1),
	amountCents: z.number().int().positive().optional(),
	/** The gateway tx (or_/ch_/pi_…) the refund was requested against — the poll key. */
	gatewayTxId: z.string().min(1).optional(),
	/** Cumulative expected Σ of this request (full → the charge's amount; partial → the requested value). */
	expectedAmountCents: z.number().int().positive().optional(),
	source: z.enum(RefundSource).optional(),
})

export class InvoiceRefundedEvent extends BaseDomainEvent<typeof InvoiceRefundedEventSchema> {
	static override readonly name = 'billing.invoice.refunded' as const
	static readonly schema = InvoiceRefundedEventSchema
}
