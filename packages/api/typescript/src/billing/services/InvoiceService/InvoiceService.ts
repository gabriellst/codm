import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'

import { PlanRegistry, type InvoiceLine } from '@billing/objects'
import { Invoice } from '@billing/entities'
import { InvoiceRepository } from '@billing/repositories'
import { InvoiceNumberSequencer } from '@billing/services/InvoiceNumberSequencer'
import { PlanName } from '@template/contracts-typescript/wire/enums'

/** Everything needed to issue OUR invoice row into the ledger. */
export interface IssueInvoiceInput {
	/** The engine invoice id — used verbatim as our invoice PK for write-once idempotency. */
	correlationId: string
	ownerId: string
	amountCents: number
	/** Fallback currency, used only when `planName` is missing/unknown (see currency-from-plan below). */
	currency: CurrencyCode
	dueDate: Date | null
	/** The subscription's plan, when resolvable — drives currency and the line label. */
	planName?: PlanName | null
	/** Presentation fallback for the stored invoice row, already translated in the owner's language
	 *  by the caller (via billing/i18n `BILLING_MESSAGES`). The app normally renders from the
	 *  structured line data; this string is what provider/PDF surfaces read when they only see a
	 *  description — so translation happens once, at the caller, never hardcoded here. */
	description: string
	/** Exactly one SUBSCRIPTION line in Phase B (Phase C adds proration/overage lines). */
	lines: InvoiceLine[]
	/** The engine-reported external invoice number, kept for the payment-history listing. */
	number?: string | null
	/** The engine-reported PDF link (WP5-T1), kept if present. */
	pdfUrl?: string | null
	/** The billing-period window this invoice covers — persisted so paid-through is derivable. */
	periodStart?: Date | null
	periodEnd?: Date | null
}

/**
 * Issues OUR own invoice record into the ledger (`billing_invoices`), allocating a gap-free
 * `our_number` and storing the line items + plan + currency-derived-from-plan.
 *
 * WRITE-ONCE + IDEMPOTENT per `correlationId`: the invoice PK is the engineInvoiceId, so a
 * re-issued signal returns the existing row and allocates NO new number. Existence is checked
 * (in the tx) BEFORE the sequencer runs, so a duplicate never burns a sequence number; and
 * because the number is allocated in the SAME tx as the insert, a rare concurrent PK conflict
 * rolls back the allocation with the tx — no gap either way.
 */
@injectable()
export class InvoiceService {
	constructor(
		private invoiceRepository: InvoiceRepository,
		private sequencer: InvoiceNumberSequencer,
	) {}

	async issue(input: IssueInvoiceInput, tx: Transaction): Promise<Invoice> {
		// Write-once: an already-issued invoice for this correlationId wins. Check FIRST so a
		// duplicate signal never advances the sequencer.
		const existing = await this.invoiceRepository.findByInvoiceId(input.correlationId, tx)
		if (existing) return existing

		// Currency comes from the plan; fall back to the passed currency only when the plan is
		// missing/unknown (e.g. no subscription yet).
		const planName = input.planName ?? null
		const currency = planName ? PlanRegistry.get(planName).basePrice.currency : input.currency

		// Allocate the gap-free document number in the SAME tx as the insert (see class doc).
		const ourNumber = await this.sequencer.next('INV', tx)

		const invoice = Invoice.issue({
			invoiceId: input.correlationId,
			ownerId: input.ownerId,
			ourNumber,
			amountCents: input.amountCents,
			currency,
			lineItems: input.lines,
			dueDate: input.dueDate,
			planName,
			number: input.number,
			pdfUrl: input.pdfUrl,
			periodStart: input.periodStart ?? null,
			periodEnd: input.periodEnd ?? null,
			description: input.description,
		})

		await this.invoiceRepository.insert(invoice, tx)
		return invoice
	}
}
