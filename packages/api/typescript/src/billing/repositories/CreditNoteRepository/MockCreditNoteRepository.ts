import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { CreditNoteRepository } from './CreditNoteRepository'
import { CreditNote } from '../../entities'
import { CreditNoteReason, CreditNoteStatus } from '@template/contracts-typescript/wire/enums'

@injectable()
export class MockCreditNoteRepository extends CreditNoteRepository {
	private creditNotes = new Map<string, CreditNote>()

	async insert(entity: CreditNote, _transaction?: Transaction): Promise<void> {
		// Append-only: never overwrite a previously inserted id.
		if (!this.creditNotes.has(entity.id.value)) this.creditNotes.set(entity.id.value, entity)
	}

	async findByInvoiceAndGatewayRef(invoiceId: string, gatewayRef: string, _transaction?: Transaction): Promise<CreditNote | undefined> {
		return Array.from(this.creditNotes.values()).find(cn => cn.invoiceId.value === invoiceId && cn.gatewayRef === gatewayRef)
	}

	async findByInvoiceAndReason(invoiceId: string, reason: CreditNoteReason, _transaction?: Transaction): Promise<CreditNote | undefined> {
		// The ACTIVE (non-reversed) note for this reason.
		return Array.from(this.creditNotes.values()).find(
			cn => cn.invoiceId.value === invoiceId && cn.reason === reason && cn.status !== CreditNoteStatus.REVERSED,
		)
	}

	async findActiveByGatewayRef(engineInvoiceId: string, gatewayRef: string, _transaction?: Transaction): Promise<CreditNote | undefined> {
		return Array.from(this.creditNotes.values()).find(
			cn => cn.invoiceId.value === engineInvoiceId && cn.gatewayRef === gatewayRef && cn.status !== CreditNoteStatus.REVERSED,
		)
	}

	async listGatewayRefsByInvoiceIdAndReason(invoiceId: string, reason: CreditNoteReason, _transaction?: Transaction): Promise<string[]> {
		// ANY status, including REVERSED — parity with Drizzle.
		return Array.from(this.creditNotes.values())
			.filter(cn => cn.invoiceId.value === invoiceId && cn.reason === reason && cn.gatewayRef !== null)
			.map(cn => cn.gatewayRef as string)
	}

	async reverse(entity: CreditNote, _transaction?: Transaction): Promise<void> {
		// The stored entity IS the same reference (mock), but persist explicitly for parity with Drizzle.
		this.creditNotes.set(entity.id.value, entity)
	}

	async sumByInvoiceId(invoiceId: string, _transaction?: Transaction): Promise<number> {
		// REVERSED notes no longer credit the invoice — exclude them (parity with Drizzle).
		return Array.from(this.creditNotes.values())
			.filter(cn => cn.invoiceId.value === invoiceId && cn.status !== CreditNoteStatus.REVERSED)
			.reduce((sum, cn) => sum + cn.amountCents, 0)
	}

	async sumByInvoiceIdAndReason(invoiceId: string, reason: CreditNoteReason, _transaction?: Transaction): Promise<number> {
		// Same exclusion as sumByInvoiceId (REVERSED notes no longer credit the invoice) + a reason filter.
		return Array.from(this.creditNotes.values())
			.filter(cn => cn.invoiceId.value === invoiceId && cn.reason === reason && cn.status !== CreditNoteStatus.REVERSED)
			.reduce((sum, cn) => sum + cn.amountCents, 0)
	}

	async existsByInvoiceIdAndReason(invoiceId: string, reason: CreditNoteReason, _transaction?: Transaction): Promise<boolean> {
		// NO status exclusion (unlike sumByInvoiceIdAndReason/findByInvoiceAndReason) — a REVERSED note
		// still counts as "the ledger saw this dispute".
		return Array.from(this.creditNotes.values()).some(cn => cn.invoiceId.value === invoiceId && cn.reason === reason)
	}

	clear(): void {
		this.creditNotes.clear()
	}
}
