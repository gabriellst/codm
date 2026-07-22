import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { ChargeRepository, type DunningCandidate } from './ChargeRepository'
import { Charge } from '../../entities'
import { ChargeStatus } from '@template/contracts-typescript/wire/enums'

@injectable()
export class MockChargeRepository extends ChargeRepository {
	private charges = new Map<string, Charge>()

	async findById(id: string, _transaction?: Transaction): Promise<Charge | undefined> {
		return this.charges.get(id) ?? undefined
	}

	async findByInvoiceId(invoiceId: string, _transaction?: Transaction): Promise<Charge | undefined> {
		return Array.from(this.charges.values()).find(c => c.invoiceId.value === invoiceId)
	}

	async findLatestByInvoiceId(invoiceId: string, _transaction?: Transaction): Promise<Charge | undefined> {
		return Array.from(this.charges.values())
			.filter(c => c.invoiceId.value === invoiceId)
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.attemptNo - a.attemptNo)[0]
	}

	async findSucceededByInvoiceId(invoiceId: string, _transaction?: Transaction): Promise<Charge | undefined> {
		return Array.from(this.charges.values())
			.filter(c => c.invoiceId.value === invoiceId && c.status === ChargeStatus.SUCCEEDED)
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
	}

	async findByGatewayTxId(gatewayTxId: string, invoiceId?: string, _transaction?: Transaction): Promise<Charge | undefined> {
		return Array.from(this.charges.values()).find(
			c => c.gatewayTxId === gatewayTxId && (invoiceId === undefined || c.invoiceId.value === invoiceId),
		)
	}

	async listByInvoiceId(invoiceId: string, _transaction?: Transaction): Promise<Charge[]> {
		return Array.from(this.charges.values())
			.filter(c => c.invoiceId.value === invoiceId)
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
	}

	// In-memory approximation: filters purely on the Charge ledger (Mock repos are isolated from
	// each other, so it can't join invoice.voidedAt / invoice.lineItems / subscription.status like
	// the Drizzle impl). Consequently neither the upgrade-proration exclusion (Drizzle: drop invoices
	// with a PRORATION line) NOR the PAST_DUE-only subscription filter can be mirrored here — the
	// Charge ledger carries no upgrade marker or subscription status. What IS mirrored (the ledger
	// can see it): the "latest charge is FAILED" unpaid signal, and `latest.{declineCode,amountCents}`
	// = the latest FAILED charge's fields, computed in-memory with no per-candidate refetch.
	async listDunningCandidates(now: Date, _transaction?: Transaction): Promise<DunningCandidate[]> {
		const byInvoice = new Map<string, Charge[]>()
		for (const c of this.charges.values()) {
			if (c.createdAt > now) continue
			const list = byInvoice.get(c.invoiceId.value) ?? []
			list.push(c)
			byInvoice.set(c.invoiceId.value, list)
		}

		const candidates: DunningCandidate[] = []
		for (const charges of byInvoice.values()) {
			const failed = charges.filter(c => c.status === ChargeStatus.FAILED)
			const succeeded = charges.filter(c => c.status === ChargeStatus.SUCCEEDED)
			if (failed.length === 0) continue

			// Order by (createdAt asc, attemptNo asc) so the LAST element is the latest by
			// (createdAt desc, attemptNo desc) — matching the Drizzle latest-FAILED subquery's tie-break
			// exactly, so `latest.{declineCode,amountCents}` never diverge between mock and integration.
			const sortedFailed = [...failed].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.attemptNo - b.attemptNo)
			const latestFailed = sortedFailed[sortedFailed.length - 1]!
			// Unpaid signal: the LATEST charge is FAILED — no SUCCEEDED, or the latest FAILED is
			// strictly newer than the latest SUCCEEDED (mirrors the Drizzle HAVING `>` comparison).
			if (succeeded.length > 0) {
				const latestSucceededAt = Math.max(...succeeded.map(c => c.createdAt.getTime()))
				if (latestSucceededAt >= latestFailed.createdAt.getTime()) continue
			}

			candidates.push({
				ownerId: latestFailed.ownerId.value,
				engineInvoiceId: latestFailed.invoiceId.value,
				attemptNo: failed.length,
				firstFailedAt: sortedFailed[0]!.createdAt,
				amountCents: latestFailed.amountCents,
				declineCode: latestFailed.declineCode,
			})
		}
		return candidates
	}

	async listStalePending(olderThan: Date, _transaction?: Transaction): Promise<Charge[]> {
		return Array.from(this.charges.values())
			.filter(c => c.status === ChargeStatus.PENDING && c.createdAt < olderThan && Boolean(c.gatewayTxId))
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
	}

	async listStaleUnpollablePending(olderThan: Date, _transaction?: Transaction): Promise<Charge[]> {
		return Array.from(this.charges.values())
			.filter(c => c.status === ChargeStatus.PENDING && c.createdAt < olderThan && !c.gatewayTxId)
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
	}

	async save(entity: Charge, _transaction?: Transaction): Promise<Charge> {
		entity.incrementVersion()
		this.charges.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _transaction?: Transaction): Promise<void> {
		this.charges.delete(id)
	}

	clear(): void {
		this.charges.clear()
	}
}
