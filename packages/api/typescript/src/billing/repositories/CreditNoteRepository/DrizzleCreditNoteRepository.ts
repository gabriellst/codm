import { injectable } from 'tsyringe-neo'
import { eq, and, ne, asc, sql } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { creditNote } from '@template/contracts/db'
import { CreditNoteRepository } from './CreditNoteRepository'
import { CreditNote } from '../../entities'
import { CreditNoteReason, CreditNoteStatus } from '@template/contracts-typescript/wire/enums'

@injectable()
export class DrizzleCreditNoteRepository extends CreditNoteRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	private client(tx?: Transaction): DrizzleClient {
		return (tx as DrizzleClient | undefined) ?? this.db
	}

	async insert(entity: CreditNote, transaction?: Transaction): Promise<void> {
		const result = await tryCatchAsync(async () => {
			await this.client(transaction).insert(creditNote).values(this.toPersistence(entity))
		})
		if (!result.success) throw result.error
	}

	async findByInvoiceAndGatewayRef(invoiceId: string, gatewayRef: string, transaction?: Transaction): Promise<CreditNote | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(creditNote)
				.where(and(eq(creditNote.invoiceId, invoiceId), eq(creditNote.gatewayRef, gatewayRef)))
				.limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByInvoiceAndReason(invoiceId: string, reason: CreditNoteReason, transaction?: Transaction): Promise<CreditNote | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			// The oldest ACTIVE (non-reversed) note for this reason — a dispute-won re-delivery then finds
			// none. ORDER BY createdAt makes the pick DETERMINISTIC (was an unordered limit(1), so with two
			// active CHARGEBACK notes it reversed an arbitrary one). NOTE: two simultaneous partial disputes
			// on ONE invoice still can't be matched precisely here — the won event carries no reference to the
			// specific dispute — so it reverses the oldest; precise matching needs a dispute id on the event.
			const rows = await dbClient
				.select()
				.from(creditNote)
				.where(and(eq(creditNote.invoiceId, invoiceId), eq(creditNote.reason, reason), ne(creditNote.status, CreditNoteStatus.REVERSED)))
				.orderBy(asc(creditNote.createdAt))
				.limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async findActiveByGatewayRef(engineInvoiceId: string, gatewayRef: string, transaction?: Transaction): Promise<CreditNote | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			// A dispute's ref maps to AT MOST one active note PER INVOICE (CreditNoteService.issue is
			// idempotent per (invoiceId, gatewayRef)) — no ordering needed, unlike findByInvoiceAndReason's
			// ambiguous case. Scoped by invoiceId: gatewayRef is NOT globally unique across platforms, so
			// an unscoped match could hit a different invoice's note.
			const rows = await dbClient
				.select()
				.from(creditNote)
				.where(
					and(
						eq(creditNote.invoiceId, engineInvoiceId),
						eq(creditNote.gatewayRef, gatewayRef),
						ne(creditNote.status, CreditNoteStatus.REVERSED),
					),
				)
				.limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async listGatewayRefsByInvoiceIdAndReason(invoiceId: string, reason: CreditNoteReason, transaction?: Transaction): Promise<string[]> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			// ANY status, including REVERSED — a dispute the ledger already saw (even one later reversed
			// by a won outcome) must still read as "known".
			const rows = await dbClient
				.select({ ref: creditNote.gatewayRef })
				.from(creditNote)
				.where(and(eq(creditNote.invoiceId, invoiceId), eq(creditNote.reason, reason)))
			return rows.map(r => r.ref).filter((ref): ref is string => ref !== null)
		})
		if (!result.success) throw result.error
		return result.data
	}

	async reverse(entity: CreditNote, transaction?: Transaction): Promise<void> {
		// The one allowed CN mutation — a status-only update to REVERSED (value fields untouched).
		const result = await tryCatchAsync(async () => {
			await this.client(transaction).update(creditNote).set({ status: entity.status }).where(eq(creditNote.id, entity.id.value))
		})
		if (!result.success) throw result.error
	}

	async sumByInvoiceId(invoiceId: string, transaction?: Transaction): Promise<number> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			// REVERSED notes (dispute-won chargebacks) no longer credit the invoice — exclude them.
			const rows = await dbClient
				.select({ total: sql<number>`coalesce(sum(${creditNote.amountCents}), 0)::int` })
				.from(creditNote)
				.where(and(eq(creditNote.invoiceId, invoiceId), ne(creditNote.status, CreditNoteStatus.REVERSED)))
			return rows[0]?.total ?? 0
		})
		if (!result.success) throw result.error
		return result.data
	}

	async sumByInvoiceIdAndReason(invoiceId: string, reason: CreditNoteReason, transaction?: Transaction): Promise<number> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			// Same exclusion as sumByInvoiceId (REVERSED notes no longer credit the invoice) + a reason filter.
			const rows = await dbClient
				.select({ total: sql<number>`coalesce(sum(${creditNote.amountCents}), 0)::int` })
				.from(creditNote)
				.where(and(eq(creditNote.invoiceId, invoiceId), eq(creditNote.reason, reason), ne(creditNote.status, CreditNoteStatus.REVERSED)))
			return rows[0]?.total ?? 0
		})
		if (!result.success) throw result.error
		return result.data
	}

	async existsByInvoiceIdAndReason(invoiceId: string, reason: CreditNoteReason, transaction?: Transaction): Promise<boolean> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			// NO status exclusion (unlike sumByInvoiceIdAndReason/findByInvoiceAndReason) — a REVERSED
			// note still counts as "the ledger saw this dispute".
			const rows = await dbClient
				.select({ id: creditNote.id })
				.from(creditNote)
				.where(and(eq(creditNote.invoiceId, invoiceId), eq(creditNote.reason, reason)))
				.limit(1)
			return rows.length > 0
		})
		if (!result.success) throw result.error
		return result.data
	}

	private toDomain(row: typeof creditNote.$inferSelect): CreditNote {
		return new CreditNote({
			id: row.id,
			ownerId: row.ownerId,
			invoiceId: row.invoiceId,
			number: row.number,
			amountCents: row.amountCents,
			currency: row.currency as CurrencyCode,
			// Literal-union mirror → enum cast (see DrizzleChargeRepository.toDomain).
			reason: row.reason as unknown as CreditNoteReason,
			status: row.status as unknown as CreditNoteStatus,
			gatewayRef: row.gatewayRef,
			finalizedAt: row.finalizedAt,
			createdAt: row.createdAt,
			version: row.version,
		})
	}

	private toPersistence(entity: CreditNote): typeof creditNote.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId.value,
			number: entity.number,
			invoiceId: entity.invoiceId.value,
			amountCents: entity.amountCents,
			currency: entity.currency,
			reason: entity.reason,
			status: entity.status,
			gatewayRef: entity.gatewayRef,
			createdAt: entity.createdAt,
			finalizedAt: entity.finalizedAt,
			version: entity.version,
		}
	}
}
