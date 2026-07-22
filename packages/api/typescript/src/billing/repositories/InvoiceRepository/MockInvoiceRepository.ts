import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'

import { Invoice } from '../../entities'
import { InvoiceRepository, type OpenInvoiceCandidate } from './InvoiceRepository'
import { BillingPlatform } from '@template/contracts-typescript/wire/enums'

@injectable()
export class MockInvoiceRepository extends InvoiceRepository {
	private rows = new Map<string, Invoice>()

	async findByOwnerId(ownerId: string, _tx?: Transaction): Promise<Invoice[]> {
		return Array.from(this.rows.values()).filter(inv => inv.ownerId.value === ownerId)
	}

	async findByInvoiceId(invoiceId: string, _tx?: Transaction): Promise<Invoice | null> {
		return this.rows.get(invoiceId) ?? null
	}

	async findByEngineInvoiceId(engineInvoiceId: string, tx?: Transaction): Promise<Invoice | null> {
		return this.findByInvoiceId(engineInvoiceId, tx)
	}

	async insert(invoice: Invoice, _tx?: Transaction): Promise<void> {
		// Write-once: a row already at this invoiceId wins (no-op), matching the
		// Drizzle onConflictDoNothing.
		if (this.rows.has(invoice.id.value)) return
		this.rows.set(invoice.id.value, invoice)
	}

	async void(invoiceId: string, _tx?: Transaction): Promise<void> {
		const row = this.rows.get(invoiceId)
		// Append-once, matching the Drizzle WHERE voided_at IS NULL guard.
		if (!row || row.voidedAt) return
		row.voidedAt = new Date()
	}

	// Mock repos are isolated from each other — this store holds ONLY Invoice rows, with no
	// visibility into billing_charges (platform attribution, SUCCEEDED existence) or
	// billing_credit_notes (Σ credited). listOpenForReconciliation needs facts this store
	// structurally cannot see — there is no honest in-memory approximation. Every billing flow/job
	// test that exercises this runs the 'integration' profile against DrizzleInvoiceRepository;
	// this always returns [] so the 'mock' profile stays a safe (empty, never-throwing) default.
	async listOpenForReconciliation(
		_params: { platform: BillingPlatform; olderThan: Date; newerThan: Date },
		_tx?: Transaction,
	): Promise<OpenInvoiceCandidate[]> {
		return []
	}

	// Same rationale as listOpenForReconciliation above — no visibility into billing_charges
	// (SUCCEEDED existence, gatewayTxId, platform attribution). Integration profile exercises the
	// Drizzle impl; this stays a safe (empty, never-throwing) default.
	async listWithSucceededChargeSince(
		_params: { platform?: BillingPlatform; since: Date },
		_tx?: Transaction,
	): Promise<{ ownerId: string; invoiceId: string; gatewayTxIds: string[] }[]> {
		return []
	}

	clear(): void {
		this.rows.clear()
	}
}
