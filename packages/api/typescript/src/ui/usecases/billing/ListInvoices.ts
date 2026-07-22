import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { InvoiceStatus } from '@billing/enums'
import { InvoiceRepository, SubscriptionRepository } from '@billing/repositories'
import { InvoiceStatusDeriver } from '@billing/services'
import { PaymentMethodType, PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

export const ListInvoicesInputSchema = z.object({
	ownerId: z.string().min(1),
})

export const InvoiceViewSchema = z.object({
	invoiceId: z.string(),
	number: z.string().nullable(),
	pdfUrl: z.string().nullable(),
	amountCents: z.number().int().nonnegative(),
	currency: z.enum(CurrencyCode),
	status: z.enum(InvoiceStatus),
	paidAt: z.date().nullable(),
	overdue: z.boolean(),
	description: z.string().nullable(),
	// Structured plan reference — the app builds the row label from it (localized plan display
	// name); `description` stays as the stored-language fallback for planless invoices.
	planName: z.enum(PlanName).nullable(),
	dueDate: z.date().nullable(),
	// The payment methods the pay-invoice endpoint accepts for this invoice — drives the
	// FE's method tabs.
	payableMethods: z.array(z.enum(PaymentMethodType)),
})

export const ListInvoicesOutputSchema = z.object({
	invoices: z.array(InvoiceViewSchema),
})

/**
 * BFF read: the payment history for an owner, via InvoiceRepository
 * (newest first). OVERDUE invoices are flagged so the FE can offer to pay them (via
 * the PayInvoice command); `payableMethods` says which methods that payment may use.
 */
@injectable()
export class ListInvoices extends Handler<typeof ListInvoicesInputSchema, typeof ListInvoicesOutputSchema> {
	readonly name = 'list_invoices' as const
	readonly inputSchema = ListInvoicesInputSchema
	readonly outputSchema = ListInvoicesOutputSchema

	constructor(
		private invoiceRepository: InvoiceRepository,
		private subscriptionRepository: SubscriptionRepository,
		private invoiceStatusDeriver: InvoiceStatusDeriver,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const invoices = await this.invoiceRepository.findByOwnerId(input.ownerId)

		// Payment-options policy computed off the subscription repository (no raw table select):
		// first/unpaid invoices offer CARD only; a PAST_DUE owner also gets PIX (dunning fallback).
		// Owner-level status → same list for every row.
		const subscription = await this.subscriptionRepository.findByOwnerId(input.ownerId)
		const payableMethods =
			subscription?.status === SubscriptionStatus.PAST_DUE ? [PaymentMethodType.CARD, PaymentMethodType.PIX] : [PaymentMethodType.CARD]

		// status / paidAt / overdue are DERIVED from charge facts + credit notes + due date — the
		// stored status column is no longer read here ("derive, don't flip").
		const now = new Date()
		const derived = await this.invoiceStatusDeriver.deriveMany(
			invoices.map(m => ({ invoiceId: m.id.value, amountCents: m.amountCents, dueDate: m.dueDate ?? null, voidedAt: m.voidedAt ?? null })),
			now,
		)

		// Pre-first-payment (INCOMPLETE): the owner never had a bound subscription — an abandoned
		// checkout must look like nothing happened, so DRAFT invoices are hidden. The predicate is
		// "never collected money" (`paidAt` null — no SUCCEEDED charge ever), NOT the display
		// status: a PAID or refunded invoice moved real money and stays visible regardless.
		const hideUnpaidDrafts = subscription?.status === SubscriptionStatus.INCOMPLETE

		return {
			invoices: invoices.flatMap(invoice => {
				const d = derived.get(invoice.id.value)!
				if (hideUnpaidDrafts && !d.paidAt) return []
				// Superseded drafts (derived VOID = voided AND never collected) are invisible for
				// good — the abandoned subscribe attempts they belonged to never happened, UX-wise.
				if (d.status === InvoiceStatus.VOID) return []
				return {
					invoiceId: invoice.id.value,
					number: invoice.number ?? null,
					pdfUrl: invoice.pdfUrl ?? null,
					amountCents: invoice.amountCents,
					currency: invoice.currency,
					status: d.status,
					paidAt: d.paidAt,
					overdue: d.status === InvoiceStatus.OVERDUE,
					description: invoice.description ?? null,
					planName: invoice.planName ?? null,
					dueDate: invoice.dueDate ?? null,
					payableMethods,
				}
			}),
		}
	}
}
