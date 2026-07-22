import { injectable } from 'tsyringe-neo'
import { eq, and, asc, desc, sql, isNull, isNotNull, lte, lt } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { DrizzleClient, saveWithOptimisticLock, tryCatchAsync } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { charge, invoice, subscription } from '@template/contracts/db'
import { ChargeRepository, type DunningCandidate } from './ChargeRepository'
import { Charge } from '../../entities'
import { ChargeStatus, DeclineReason, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

@injectable()
export class DrizzleChargeRepository extends ChargeRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	private client(tx?: Transaction): DrizzleClient {
		return (tx as DrizzleClient | undefined) ?? this.db
	}

	async findById(id: string, transaction?: Transaction): Promise<Charge | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(charge).where(eq(charge.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByInvoiceId(invoiceId: string, transaction?: Transaction): Promise<Charge | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(charge).where(eq(charge.invoiceId, invoiceId)).limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async findLatestByInvoiceId(invoiceId: string, transaction?: Transaction): Promise<Charge | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(charge)
				.where(eq(charge.invoiceId, invoiceId))
				.orderBy(desc(charge.createdAt), desc(charge.attemptNo))
				.limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async findSucceededByInvoiceId(invoiceId: string, transaction?: Transaction): Promise<Charge | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(charge)
				.where(and(eq(charge.invoiceId, invoiceId), eq(charge.status, ChargeStatus.SUCCEEDED)))
				.orderBy(asc(charge.createdAt))
				.limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByGatewayTxId(gatewayTxId: string, invoiceId?: string, transaction?: Transaction): Promise<Charge | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			// Scoped by invoiceId when provided (settlement always knows it): a gateway tx-id is unique
			// only within one merchant account, so matching it alone could resolve a charge on a different
			// owner/invoice that shares the id.
			const where = invoiceId
				? and(eq(charge.gatewayTxId, gatewayTxId), eq(charge.invoiceId, invoiceId))
				: eq(charge.gatewayTxId, gatewayTxId)
			const rows = await dbClient.select().from(charge).where(where).limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async listByInvoiceId(invoiceId: string, transaction?: Transaction): Promise<Charge[]> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			return dbClient.select().from(charge).where(eq(charge.invoiceId, invoiceId)).orderBy(asc(charge.createdAt))
		})
		if (!result.success) throw result.error
		return result.data.map(row => this.toDomain(row))
	}

	async listDunningCandidates(now: Date, transaction?: Transaction): Promise<DunningCandidate[]> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			// Correlated scalar subqueries for the latest FAILED charge's declineCode + amountCents —
			// folded into the aggregate so the sweep is a single query (was an N+1 findLatestByInvoiceId
			// per candidate). The candidate's latest charge is FAILED (per the HAVING clause), so
			// ordering the FAILED slice by createdAt/attemptNo desc matches the prior findLatestByInvoiceId
			// result exactly — for both the retry offset's declineCode and the re-charge amount.
			const latestFailedDecline = alias(charge, 'latest_failed_decline')
			const latestFailedDeclineCode = dbClient
				.select({ declineCode: latestFailedDecline.declineCode })
				.from(latestFailedDecline)
				.where(
					and(
						eq(latestFailedDecline.invoiceId, charge.invoiceId),
						eq(latestFailedDecline.status, ChargeStatus.FAILED),
						lte(latestFailedDecline.createdAt, now),
					),
				)
				.orderBy(desc(latestFailedDecline.createdAt), desc(latestFailedDecline.attemptNo))
				.limit(1)

			const latestFailedAmount = alias(charge, 'latest_failed_amount')
			const latestFailedAmountCents = dbClient
				.select({ amountCents: latestFailedAmount.amountCents })
				.from(latestFailedAmount)
				.where(
					and(
						eq(latestFailedAmount.invoiceId, charge.invoiceId),
						eq(latestFailedAmount.status, ChargeStatus.FAILED),
						lte(latestFailedAmount.createdAt, now),
					),
				)
				.orderBy(desc(latestFailedAmount.createdAt), desc(latestFailedAmount.attemptNo))
				.limit(1)

			return dbClient
				.select({
					ownerId: charge.ownerId,
					engineInvoiceId: charge.invoiceId,
					attemptNo: sql<number>`count(*) filter (where ${charge.status} = ${ChargeStatus.FAILED})`.mapWith(Number),
					firstFailedAt: sql<Date>`min(${charge.createdAt}) filter (where ${charge.status} = ${ChargeStatus.FAILED})`,
					amountCents: sql<number>`(${latestFailedAmountCents})`.mapWith(Number),
					declineCode: sql<DeclineReason | null>`(${latestFailedDeclineCode})`,
				})
				.from(charge)
				.innerJoin(invoice, eq(charge.invoiceId, invoice.invoiceId))
				.innerJoin(subscription, eq(charge.ownerId, subscription.ownerId))
				.where(
					and(
						lte(charge.createdAt, now),
						isNull(invoice.voidedAt),
						// PAST_DUE only. A failed renewal reliably flips the sub PAST_DUE
						// (InvoicePaymentFailedHandler.markPastDue on every non-upgrade failure), so a
						// candidate whose sub is ACTIVE is a REACTIVATED sub with a stale unsettled invoice —
						// retrying/canceling it would re-charge or terminate a currently-paying customer.
						eq(subscription.status, SubscriptionStatus.PAST_DUE),
						// Exclude optimistic-UPGRADE proration invoices: dunning deliberately suppresses
						// upgrades (a declined upgrade proration is reverted, never dunned). Such invoices
						// carry a PRORATION line; renewals carry SUBSCRIPTION. Without this, a proration
						// whose revert fell through would be swept up and cancel the owner's (re-changed,
						// ACTIVE) subscription with zero dunning emails ever sent.
						sql`not (${invoice.lineItems} @> '[{"kind":"PRORATION"}]'::jsonb)`,
					),
				)
				.groupBy(charge.ownerId, charge.invoiceId)
				.having(
					// Unpaid signal: ≥1 FAILED AND the LATEST charge is FAILED — either no SUCCEEDED at all,
					// or the latest FAILED is newer than the latest SUCCEEDED. This includes a
					// premature-SUCCEEDED-then-declined renewal (gateway pending → ok:true, later
					// charge.failed → latest FAILED) while excluding a genuinely settled FAILED-then-retry
					// (latest SUCCEEDED).
					sql`count(*) filter (where ${charge.status} = ${ChargeStatus.FAILED}) > 0 and (
						count(*) filter (where ${charge.status} = ${ChargeStatus.SUCCEEDED}) = 0
						or max(${charge.createdAt}) filter (where ${charge.status} = ${ChargeStatus.FAILED})
							> max(${charge.createdAt}) filter (where ${charge.status} = ${ChargeStatus.SUCCEEDED})
					)`,
				)
		})
		if (!result.success) throw result.error

		return result.data.map(row => ({
			ownerId: row.ownerId,
			engineInvoiceId: row.engineInvoiceId,
			attemptNo: row.attemptNo,
			// MIN over a timestamptz column can come back as a string from some drivers (unlike a
			// plain column select) — normalize explicitly rather than trust the `sql<Date>` cast.
			firstFailedAt: new Date(row.firstFailedAt),
			amountCents: row.amountCents,
			declineCode: row.declineCode ?? undefined,
		}))
	}

	async listStalePending(olderThan: Date, transaction?: Transaction): Promise<Charge[]> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			return dbClient
				.select()
				.from(charge)
				.where(and(eq(charge.status, ChargeStatus.PENDING), lt(charge.createdAt, olderThan), isNotNull(charge.gatewayTxId)))
				.orderBy(asc(charge.createdAt))
		})
		if (!result.success) throw result.error
		return result.data.map(row => this.toDomain(row))
	}

	async listStaleUnpollablePending(olderThan: Date, transaction?: Transaction): Promise<Charge[]> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			return dbClient
				.select()
				.from(charge)
				.where(and(eq(charge.status, ChargeStatus.PENDING), lt(charge.createdAt, olderThan), isNull(charge.gatewayTxId)))
				.orderBy(asc(charge.createdAt))
		})
		if (!result.success) throw result.error
		return result.data.map(row => this.toDomain(row))
	}

	async save(entity: Charge, transaction?: Transaction): Promise<Charge> {
		const previousVersion = entity.version
		entity.incrementVersion()

		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)

			await saveWithOptimisticLock({
				db: this.client(transaction),
				table: charge,
				data,
				conflictTarget: charge.id,
				set: {
					ownerId: sql`excluded.owner_id`,
					invoiceId: sql`excluded.invoice_id`,
					platform: sql`excluded.platform`,
					method: sql`excluded.method`,
					amountCents: sql`excluded.amount_cents`,
					attemptNo: sql`excluded.attempt_no`,
					status: sql`excluded.status`,
					gatewayTxId: sql`excluded.gateway_tx_id`,
					declineCode: sql`excluded.decline_code`,
					updatedAt: sql`excluded.updated_at`,
					version: sql`excluded.version`,
				},
				versionColumn: charge.version,
				previousVersion,
			})

			return entity
		})

		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, transaction?: Transaction): Promise<void> {
		const result = await tryCatchAsync(async () => {
			await this.client(transaction).delete(charge).where(eq(charge.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof charge.$inferSelect): Charge {
		// The contracts schema types enum columns via inline literal-union MIRRORS (it cannot import
		// this package's enums without a package cycle) — cast at the boundary; the entity schema
		// re-validates the values on construction.
		return new Charge({
			id: row.id,
			ownerId: row.ownerId,
			invoiceId: row.invoiceId,
			platform: row.platform as unknown as Charge['platform'],
			method: row.method as unknown as Charge['method'],
			amountCents: row.amountCents,
			attemptNo: row.attemptNo,
			status: row.status as unknown as Charge['status'],
			gatewayTxId: row.gatewayTxId ?? undefined,
			declineCode: (row.declineCode ?? undefined) as Charge['declineCode'],
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: Charge): typeof charge.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId.value,
			invoiceId: entity.invoiceId.value,
			platform: entity.platform,
			method: entity.method,
			// billing_charges has a single integer column (no currency column) — the
			// Money VO (BRL) is the in-memory representation; only its cent value is persisted.
			amountCents: entity.amount.amountCents,
			attemptNo: entity.attemptNo,
			status: entity.status,
			gatewayTxId: entity.gatewayTxId ?? null,
			declineCode: entity.declineCode ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
