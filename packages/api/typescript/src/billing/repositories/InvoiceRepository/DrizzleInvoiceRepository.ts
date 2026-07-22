import { injectable } from 'tsyringe-neo'
import { and, eq, ne, gte, lte, desc, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { invoice, charge, creditNote } from '@template/contracts/db'

import { Invoice } from '../../entities'
import { InvoiceRepository, type OpenInvoiceCandidate } from './InvoiceRepository'
import { BillingPlatform, ChargeStatus, CreditNoteStatus, PlanName } from '@template/contracts-typescript/wire/enums'

@injectable()
export class DrizzleInvoiceRepository extends InvoiceRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	private client(tx?: Transaction): DrizzleClient {
		return (tx as DrizzleClient | undefined) ?? this.db
	}

	async findByOwnerId(ownerId: string, tx?: Transaction): Promise<Invoice[]> {
		const dbClient = this.client(tx)
		const result = await tryCatchAsync(async () => {
			return dbClient.select().from(invoice).where(eq(invoice.ownerId, ownerId)).orderBy(desc(invoice.createdAt))
		})
		// "Not found" is []; "failed" is throw — swallowing the error made a broken database read as
		// "owner with no invoices" (the access deriver would then silently downgrade a payer to FREE).
		if (!result.success) throw result.error
		return result.data.map(row => this.toDomain(row))
	}

	async findByInvoiceId(invoiceId: string, tx?: Transaction): Promise<Invoice | null> {
		const dbClient = this.client(tx)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(invoice).where(eq(invoice.invoiceId, invoiceId)).limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return null
		return this.toDomain(result.data)
	}

	async findByEngineInvoiceId(engineInvoiceId: string, tx?: Transaction): Promise<Invoice | null> {
		return this.findByInvoiceId(engineInvoiceId, tx)
	}

	async insert(invoiceRecord: Invoice, tx?: Transaction): Promise<void> {
		const dbClient = this.client(tx)
		const row = this.toPersistence(invoiceRecord)
		// Write-once: a duplicate engine-invoice signal must NOT clobber the ledger row it already
		// issued. PK conflict on invoiceId → no-op (the service checks existence before allocating a
		// number, so this is only the concurrent-insert belt-and-suspenders).
		await dbClient.insert(invoice).values(row).onConflictDoNothing({ target: invoice.invoiceId })
	}

	async void(invoiceId: string, tx?: Transaction): Promise<void> {
		const dbClient = this.client(tx)
		// Append-once: only stamps a row never voided before — a replayed supersede can't move the
		// timestamp, and a raced double-void is a no-op.
		await dbClient
			.update(invoice)
			.set({ voidedAt: new Date() })
			.where(and(eq(invoice.invoiceId, invoiceId), isNull(invoice.voidedAt)))
	}

	async listOpenForReconciliation(
		params: { platform: BillingPlatform; olderThan: Date; newerThan: Date },
		tx?: Transaction,
	): Promise<OpenInvoiceCandidate[]> {
		const { platform, olderThan, newerThan } = params
		const dbClient = this.client(tx)
		const result = await tryCatchAsync(async () => {
			// Correlated scalar subqueries — same idiom as DrizzleInvoiceStatusDeriver.creditedCentsFor /
			// DrizzleChargeRepository.listDunningCandidates: fold the cross-table facts into ONE query
			// instead of an N+1 per candidate.

			// Global (any-platform) SUCCEEDED existence — a settled invoice is never a candidate,
			// regardless of which platform's charge attempt attributes it here.
			const succeededCharge = alias(charge, 'succeeded_charge')
			const hasSucceeded = dbClient
				.select({ count: sql<number>`count(*)` })
				.from(succeededCharge)
				.where(and(eq(succeededCharge.invoiceId, invoice.invoiceId), eq(succeededCharge.status, ChargeStatus.SUCCEEDED)))

			// Σ non-REVERSED credit notes — mirrors DrizzleInvoiceStatusDeriver.creditedCentsFor exactly.
			const creditedCents = dbClient
				.select({ total: sql<number>`coalesce(sum(${creditNote.amountCents}), 0)::int` })
				.from(creditNote)
				.where(and(eq(creditNote.invoiceId, invoice.invoiceId), ne(creditNote.status, CreditNoteStatus.REVERSED)))

			// Newest gatewayTxId from a PENDING (non-terminal) charge on THIS platform — what an
			// id-based probe source dials; absent when only FAILED attempts exist (the probe still
			// tries by engineInvoiceId/reference in that case).
			const pendingTx = alias(charge, 'pending_tx')
			const latestPendingGatewayTxId = dbClient
				.select({ gatewayTxId: pendingTx.gatewayTxId })
				.from(pendingTx)
				.where(
					and(eq(pendingTx.invoiceId, invoice.invoiceId), eq(pendingTx.platform, platform), eq(pendingTx.status, ChargeStatus.PENDING)),
				)
				.orderBy(desc(pendingTx.createdAt))
				.limit(1)

			return (
				dbClient
					.select({
						ownerId: invoice.ownerId,
						engineInvoiceId: invoice.invoiceId,
						gatewayTxId: sql<string | null>`(${latestPendingGatewayTxId})`,
					})
					.from(invoice)
					// Attribution join: an invoice only counts as an open candidate for THIS platform when it
					// has ≥1 charge attempt recorded on it — a never-attempted invoice has nothing to probe.
					.innerJoin(charge, and(eq(charge.invoiceId, invoice.invoiceId), eq(charge.platform, platform)))
					.where(
						and(
							isNull(invoice.voidedAt),
							lte(invoice.createdAt, olderThan),
							gte(invoice.createdAt, newerThan),
							sql`(${hasSucceeded}) = 0`,
							sql`(${creditedCents}) < ${invoice.amountCents}`,
						),
					)
					.groupBy(invoice.invoiceId, invoice.ownerId, invoice.amountCents)
			)
		})
		if (!result.success) throw result.error
		return result.data.map(row => ({
			ownerId: row.ownerId,
			engineInvoiceId: row.engineInvoiceId,
			gatewayTxId: row.gatewayTxId ?? undefined,
		}))
	}

	async listWithSucceededChargeSince(
		params: { platform?: BillingPlatform; since: Date },
		tx?: Transaction,
	): Promise<{ ownerId: string; invoiceId: string; gatewayTxIds: string[] }[]> {
		const { platform, since } = params
		const dbClient = this.client(tx)
		const result = await tryCatchAsync(async () => {
			return (
				dbClient
					.select({
						ownerId: invoice.ownerId,
						invoiceId: invoice.invoiceId,
						gatewayTxId: charge.gatewayTxId,
					})
					.from(invoice)
					// Ledger-derived: qualifies via SUCCEEDED charge existence, never a stored invoice-status
					// column (there is none). One row per (invoice, SUCCEEDED charge) — collapsed below.
					.innerJoin(
						charge,
						and(
							eq(charge.invoiceId, invoice.invoiceId),
							eq(charge.status, ChargeStatus.SUCCEEDED),
							gte(charge.createdAt, since),
							platform ? eq(charge.platform, platform) : undefined,
						),
					)
			)
		})
		if (!result.success) throw result.error

		// Distinct tx's grouped per invoice — several SUCCEEDED charges on the same invoice collapse
		// into one entry (the shape RefundReconcileJob.detect() consumes: one poll per distinct tx).
		const byInvoice = new Map<string, { ownerId: string; invoiceId: string; gatewayTxIds: Set<string> }>()
		for (const row of result.data) {
			if (!row.gatewayTxId) continue // a SUCCEEDED charge always has one (markSucceeded sets it) — defensive skip
			const existing = byInvoice.get(row.invoiceId)
			if (existing) {
				existing.gatewayTxIds.add(row.gatewayTxId)
			} else {
				byInvoice.set(row.invoiceId, { ownerId: row.ownerId, invoiceId: row.invoiceId, gatewayTxIds: new Set([row.gatewayTxId]) })
			}
		}
		return [...byInvoice.values()].map(v => ({ ownerId: v.ownerId, invoiceId: v.invoiceId, gatewayTxIds: [...v.gatewayTxIds] }))
	}

	private toDomain(row: typeof invoice.$inferSelect): Invoice {
		return new Invoice({
			id: row.invoiceId,
			ownerId: row.ownerId,
			number: row.number ?? null,
			pdfUrl: row.pdfUrl ?? null,
			amountCents: row.amountCents,
			currency: row.currency as CurrencyCode,
			description: row.description ?? null,
			dueDate: row.dueDate ?? null,
			ourNumber: row.ourNumber,
			planName: (row.planName as PlanName | null) ?? null,
			periodStart: row.periodStart ?? null,
			periodEnd: row.periodEnd ?? null,
			voidedAt: row.voidedAt ?? null,
			// The contracts jsonb column is typed with a structural MIRROR of InvoiceLine (meter as
			// plain string, period as Date|string) — cast at the boundary; InvoiceLineSchema re-coerces
			// + re-validates on entity construction.
			lineItems: row.lineItems as unknown as Invoice['lineItems'],
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		})
	}

	private toPersistence(invoiceRecord: Invoice): typeof invoice.$inferInsert {
		return {
			invoiceId: invoiceRecord.id.value,
			ownerId: invoiceRecord.ownerId.value,
			number: invoiceRecord.number,
			pdfUrl: invoiceRecord.pdfUrl,
			amountCents: invoiceRecord.amountCents,
			currency: invoiceRecord.currency,
			description: invoiceRecord.description,
			dueDate: invoiceRecord.dueDate,
			ourNumber: invoiceRecord.ourNumber,
			planName: invoiceRecord.planName,
			periodStart: invoiceRecord.periodStart,
			periodEnd: invoiceRecord.periodEnd,
			voidedAt: invoiceRecord.voidedAt,
			lineItems: invoiceRecord.lineItems,
			createdAt: invoiceRecord.createdAt,
			updatedAt: invoiceRecord.updatedAt,
		}
	}
}
