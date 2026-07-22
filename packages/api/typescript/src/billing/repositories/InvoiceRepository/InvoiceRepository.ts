import type { Transaction } from '@template/core-typescript'

import { Invoice } from '../../entities'
import { BillingPlatform } from '@template/contracts-typescript/wire/enums'

/**
 * Ledger-derived open-invoice candidate for a platform — the read side of the window-reconciliation
 * sweep (`WindowReconcileJob`, W2b). Structurally identical to `GatewayEventSource`'s
 * `OpenInvoiceCandidate` (services layer) — declared here rather than imported because repositories
 * don't depend on services (one-way: services/jobs → repositories). The two interfaces are
 * structurally compatible, so a candidate list returned here flows straight into
 * `GatewayEventSource.collectMissedEvents({ openInvoices })` with no cast.
 */
export interface OpenInvoiceCandidate {
	ownerId: string
	engineInvoiceId: string
	/** The gatewayTxId of the invoice's newest non-terminal (PENDING) charge on this platform, when
	 *  one exists — what an id-based probe source dials. The probe still tries by
	 *  engineInvoiceId/reference even when this is absent. */
	gatewayTxId?: string
}

/**
 * Read + append-only write surface for the invoice ledger (`billing_invoices`).
 * Keyed by invoiceId. The store is WRITE-ONCE: `insert` is the only write; there is no
 * update/upsert — a settled/refunded status is DERIVED from facts (SUCCEEDED charges +
 * credit notes) via InvoiceStatusDeriver, never mutated in place.
 */
export abstract class InvoiceRepository {
	abstract findByOwnerId(ownerId: string, tx?: Transaction): Promise<Invoice[]>
	abstract findByInvoiceId(invoiceId: string, tx?: Transaction): Promise<Invoice | null>
	/** The invoice's invoiceId IS the engine invoice id — same lookup as findByInvoiceId, under a clearer name. */
	abstract findByEngineInvoiceId(engineInvoiceId: string, tx?: Transaction): Promise<Invoice | null>
	/**
	 * Write-once insert of an issued ledger row. On a PK conflict (duplicate engineInvoiceId)
	 * it is a no-op — the existing row wins. Used by InvoiceService.issue.
	 */
	abstract insert(invoice: Invoice, tx?: Transaction): Promise<void>
	/**
	 * Append-once supersede fact: stamps `voided_at` on a never-voided row (already-voided is a
	 * no-op). Callers must only void never-collected drafts — a SUCCEEDED charge always wins in
	 * the derivation regardless, so a mistaken void can't hide real money.
	 */
	abstract void(invoiceId: string, tx?: Transaction): Promise<void>
	/**
	 * LEDGER-DERIVED open invoices attributable to `platform` — the probe-source candidate list for
	 * `WindowReconcileJob`. NEVER reads a stored status column: an invoice qualifies when (a) it has
	 * ≥1 charge attempt recorded on `platform` (attribution — a never-attempted invoice has nothing to
	 * probe), (b) it has NO SUCCEEDED charge on ANY platform (genuinely unpaid), (c) it is not voided,
	 * (d) it is not fully covered by Σ non-REVERSED credit notes, and (e) its `createdAt` falls in the
	 * age band `newerThan <= createdAt <= olderThan` (old enough that a webhook had time to arrive,
	 * not so old the sweep should stop looking). Derived via joins over invoice ⋈ charge ⋈ credit note
	 * — the same fact set `InvoiceStatusDeriver` reads, never the invoice's stored status.
	 */
	abstract listOpenForReconciliation(
		params: { platform: BillingPlatform; olderThan: Date; newerThan: Date },
		tx?: Transaction,
	): Promise<OpenInvoiceCandidate[]>
	/**
	 * LEDGER-DERIVED invoices with ≥1 SUCCEEDED charge created within the scan band — the
	 * enumeration source for `RefundReconcileJob` (drift detect-and-alert, W2b). Groups by
	 * invoice, returning the distinct `gatewayTxId`s of its SUCCEEDED charges (the shape `detect()`
	 * consumes: one poll per distinct tx). NEVER reads a stored invoice-status column (there is
	 * none — `InvoiceStatusDeriver` derives it from facts) — qualification is purely
	 * SUCCEEDED-charge existence, so the detector is blind to WHO initiated a refund. `platform`,
	 * when given, restricts to charges attributed to that gateway; omitted, spans every platform.
	 */
	abstract listWithSucceededChargeSince(
		params: { platform?: BillingPlatform; since: Date },
		tx?: Transaction,
	): Promise<{ ownerId: string; invoiceId: string; gatewayTxIds: string[] }[]>
}
