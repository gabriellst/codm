// events/InvoicePaymentFailedEvent.ts — a true domain event: an invoice charge could not be collected.
import { BaseDomainEvent, z } from '@template/core-typescript'
import { DeclineReason, PlanName } from '@template/contracts-typescript/wire/enums'

export const InvoicePaymentFailedEventSchema = z.domainEvent({
	ownerId: z.string().min(1),
	invoiceId: z.string().min(1),
	// Raw gateway message — diagnostics/operators, never shown to the user.
	reason: z.string(),
	// Structured classification when the provider could map its signal — what user-facing
	// surfaces (dunning email) localize. Absent → generic copy.
	declineCode: z.enum(DeclineReason).optional(),
	// Optimistic-upgrade revert markers (forwarded from the issued event by the charge saga):
	// the flip pair this declined proration charged for. Present → the failure handler reverts
	// FROM←TO (guarded: only while the subscription still sits on `upgradedToPlan`) and voids
	// this proration invoice instead of marking PAST_DUE. Event-carried flow state, never persisted.
	upgradedFromPlan: z.enum(PlanName).optional(),
	upgradedToPlan: z.enum(PlanName).optional(),
})

export class InvoicePaymentFailedEvent extends BaseDomainEvent<typeof InvoicePaymentFailedEventSchema> {
	static override readonly name = 'billing.invoice.payment_failed' as const
	static readonly schema = InvoicePaymentFailedEventSchema
}
