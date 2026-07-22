// events/ExternalInvoiceIssuedEvent.ts — "the engine issued/finalized an invoice" (provenance), primitives only.
import type Z from 'zod'
import { BaseDomainEvent, z } from '@template/core-typescript'
import { PlanName } from '@template/contracts-typescript/wire/enums'

export const ExternalInvoiceIssuedEventSchema = z.domainEvent({
	externalId: z.string().min(1), // settlement webhook event id — webhook dedup key
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	amountCents: z.number().int().nonnegative(),
	number: z.string().nullable(),
	dueDate: z.string().nullable(),
	// Billing-period window this invoice covers (ISO strings), so OUR ledger row can persist
	// non-null periods and "paid-through = max paid invoice periodEnd" becomes derivable. Nullable
	// + default null: some engine-sourced invoices don't carry these, and old construction sites compile.
	periodStart: z.string().nullable().default(null),
	periodEnd: z.string().nullable().default(null),
	// Metered-usage overage for the CLOSED period. At renewal close the native BillingClock prices
	// usage beyond the owner's effective allowance and carries the total here so the charge saga adds
	// a second OVERAGE invoice line and charges base + overage. Default 0 + nonnegative: the FIRST
	// invoice, mid-period proration, and non-renewal invoices carry no overage, and old construction
	// sites compile unchanged.
	overageCents: z.number().int().nonnegative().default(0),
	overageQty: z.number().int().nonnegative().default(0),
	attemptNo: z.number().int().default(0),
	// Optimistic-upgrade proration markers: the plan pair of the flip this invoice charges for.
	// The charge saga forwards them onto the failure event so a declined proration reverts the
	// flip (guarded: only while the subscription still sits on `upgradedToPlan`). Absent on every
	// other invoice. Event-carried flow state — never persisted on the ledger row.
	upgradedFromPlan: z.enum(PlanName).optional(),
	upgradedToPlan: z.enum(PlanName).optional(),
})

export type ExternalInvoiceIssuedEventPayload = Z.infer<typeof ExternalInvoiceIssuedEventSchema>['payload']

export class ExternalInvoiceIssuedEvent extends BaseDomainEvent<typeof ExternalInvoiceIssuedEventSchema> {
	static override readonly name = 'billing.invoice.external_issued' as const
	static readonly schema = ExternalInvoiceIssuedEventSchema
}
