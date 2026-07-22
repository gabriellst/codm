import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { ChargeRepository } from '../../repositories/ChargeRepository'
import { InvoiceStatusDeriver, type DerivableInvoice, type DerivedInvoiceStatus } from './InvoiceStatusDeriver'

@injectable()
export class MockInvoiceStatusDeriver extends InvoiceStatusDeriver {
	constructor(private chargeRepository: ChargeRepository) {
		super()
	}

	async derive(invoice: DerivableInvoice, now: Date, tx?: Transaction): Promise<DerivedInvoiceStatus> {
		const succeeded = await this.chargeRepository.findSucceededByInvoiceId(invoice.invoiceId, tx)
		// The mock profile has no credit-note store — creditedCents is always 0 (refund states are
		// exercised by the pure predicate + the Drizzle integration path).
		return this.assemble(invoice, succeeded?.createdAt ?? null, 0, now)
	}

	async deriveMany(invoices: DerivableInvoice[], now: Date, tx?: Transaction): Promise<Map<string, DerivedInvoiceStatus>> {
		const entries = await Promise.all(invoices.map(async invoice => [invoice.invoiceId, await this.derive(invoice, now, tx)] as const))
		return new Map(entries)
	}
}
