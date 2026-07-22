import { injectable } from 'tsyringe-neo'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { DrizzleClient, Id } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { events, usageRollup } from '@template/contracts/db'

import { UsageRollup, type UsageSnapshot } from './UsageRollup'
import { QuotaKey } from '@template/contracts-typescript/wire/enums'

// Wire name of the metered-usage event the live enforcement counter folds. Billing intentionally
// does not import across contexts to avoid a cross-context dependency, so this string is a
// PRODUCT-PLUG PLACEHOLDER kept in sync by hand until a shared event-name registry exists — a
// downstream product replaces it with the real event that increments its metered QuotaKey (medscall
// shipped `agent.chat.agent_message_sent` here).
const METERED_USAGE_EVENT_NAME = 'example.metered.usage_recorded'

/**
 * The real (DB-backed) usage rollup. Counts the `events` fold over the given period window — the
 * SAME `METERED_USAGE_EVENT_NAME` shape the live enforcement count uses, but with an explicit
 * window — and UPSERTs one snapshot row per owner+meter+period into `billing_usage_rollups`.
 * Named `Drizzle*` to match the sibling binding idiom (bound in the integration + real profiles).
 */
@injectable()
export class DrizzleUsageRollup extends UsageRollup {
	constructor(private db: DrizzleClient) {
		super()
	}

	private client(tx?: Transaction): DrizzleClient {
		return (tx as DrizzleClient | undefined) ?? this.db
	}

	async snapshotUsage(ownerId: string, meter: QuotaKey, periodStart: Date, periodEnd: Date, tx?: Transaction): Promise<number> {
		const dbClient = this.client(tx)

		// Same fold as enforcement's live count, but bounded by the caller's explicit period rather
		// than the current calendar month.
		const rows = await dbClient
			.select({ count: sql<number>`count(*)::int` })
			.from(events)
			.where(
				and(
					eq(events.name, METERED_USAGE_EVENT_NAME),
					eq(events.ownerId, ownerId),
					gte(events.occurredAt, periodStart),
					lt(events.occurredAt, periodEnd),
				),
			)
		const quantity = rows[0]?.count ?? 0

		// Idempotent per (owner, meter, period_start): the UNIQUE constraint makes a re-run's insert
		// conflict, and we swallow it — the FIRST snapshot for a period wins and is never overwritten.
		const inserted = await dbClient
			.insert(usageRollup)
			.values({
				id: new Id().value,
				ownerId,
				meter,
				periodStart,
				periodEnd,
				quantity,
			})
			.onConflictDoNothing({ target: [usageRollup.ownerId, usageRollup.meter, usageRollup.periodStart] })
			.returning({ quantity: usageRollup.quantity })

		if (inserted[0]) return inserted[0].quantity

		// A snapshot already existed — return the PERSISTED quantity (the first snapshot's), so callers
		// always see the durable value of record rather than a freshly recomputed (possibly larger) count.
		const existing = await dbClient
			.select({ quantity: usageRollup.quantity })
			.from(usageRollup)
			.where(and(eq(usageRollup.ownerId, ownerId), eq(usageRollup.meter, meter), eq(usageRollup.periodStart, periodStart)))

		return existing[0]?.quantity ?? quantity
	}

	async snapshotUsageMany(snapshots: UsageSnapshot[], meter: QuotaKey, tx?: Transaction): Promise<void> {
		if (snapshots.length === 0) return
		const dbClient = this.client(tx)
		// One bulk insert; the UNIQUE(owner, meter, period_start) constraint keeps first-wins per row
		// (onConflictDoNothing only skips the conflicting rows, not the whole statement).
		await dbClient
			.insert(usageRollup)
			.values(
				snapshots.map(s => ({
					id: new Id().value,
					ownerId: s.ownerId,
					meter,
					periodStart: s.periodStart,
					periodEnd: s.periodEnd,
					quantity: s.quantity,
				})),
			)
			.onConflictDoNothing({ target: [usageRollup.ownerId, usageRollup.meter, usageRollup.periodStart] })
	}
}
