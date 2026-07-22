import { AggregateRoot, BaseError, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'

import { InvoiceLineSchema, type InvoiceLine } from '../objects'
import type { DomainErrors } from '../errors'
import { PlanName } from '@template/contracts-typescript/wire/enums'

// OUR owned invoice record — the `billing_invoices` write-once ledger row as a proper
// domain entity (a sibling ledger fact to Charge/CreditNote). Its status is DERIVED from
// facts (SUCCEEDED charges + credit notes) via InvoiceStatusDeriver — "derive, don't flip" —
// never stored on this record. The PK `billing_invoices.invoice_id` is the engine invoice id
// (e.g. 'native:o1:2026-01') and is used verbatim AS the entity's `id`; `id.value` IS the invoiceId.
export const InvoiceSchema = z.object({
	ownerId: z.instance(Id),
	// The authoritative, gap-free document number allocated at issue time.
	ourNumber: z.string().min(1),
	// The engine-reported external number, kept as metadata for the payment-history listing.
	number: z.string().nullable(),
	pdfUrl: z.string().nullable(),
	amountCents: z.number().int().nonnegative(),
	currency: z.enum(CurrencyCode),
	description: z.string().nullable(),
	dueDate: z.date().nullable(),
	planName: z.enum(PlanName).nullable(),
	periodStart: z.date().nullable(),
	periodEnd: z.date().nullable(),
	// Append-once supersede fact: a never-collected draft voided when its subscribe attempt was
	// re-seeded onto another plan. The deriver reads it as VOID unless money ever moved.
	voidedAt: z.date().nullable(),
	// At least one line; the lines must reconcile to `amountCents` (enforced by `issue`).
	lineItems: z.array(InvoiceLineSchema).min(1),
})

export type InvoiceProps = Z.infer<typeof InvoiceSchema>

export class Invoice extends AggregateRoot<typeof InvoiceSchema> {
	static override schema = InvoiceSchema

	/**
	 * Issue an invoice into the ledger. Enforces that the line items reconcile to the total
	 * (`Σ lineItems.amountCents === amountCents`) — throws `INVOICE_LINES_MISMATCH` otherwise.
	 * The engine invoice id (`invoiceId`) is used verbatim as the entity's `id`.
	 */
	static issue(data: {
		invoiceId: string
		ownerId: string
		ourNumber: string
		amountCents: number
		currency: CurrencyCode
		lineItems: InvoiceLine[]
		dueDate?: Date | null
		planName?: PlanName | null
		number?: string | null
		pdfUrl?: string | null
		description?: string | null
		periodStart?: Date | null
		periodEnd?: Date | null
	}): Invoice {
		const linesTotal = data.lineItems.reduce((sum, line) => sum + line.amountCents, 0)
		if (linesTotal !== data.amountCents) {
			throw new BaseError<DomainErrors>('INVOICE_LINES_MISMATCH')
		}

		return new Invoice({
			id: data.invoiceId,
			ownerId: data.ownerId,
			ourNumber: data.ourNumber,
			number: data.number ?? null,
			pdfUrl: data.pdfUrl ?? null,
			amountCents: data.amountCents,
			currency: data.currency,
			description: data.description ?? null,
			dueDate: data.dueDate ?? null,
			planName: data.planName ?? null,
			periodStart: data.periodStart ?? null,
			periodEnd: data.periodEnd ?? null,
			voidedAt: null,
			lineItems: data.lineItems,
		})
	}
}

// Declaration merging — interface BELOW class
export interface Invoice extends InvoiceProps {}
