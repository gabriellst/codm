import { injectable } from 'tsyringe-neo'
import { and, asc, eq, isNull, lt, notExists, or, sql } from 'drizzle-orm'
import { DrizzleClient } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import type { MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository, type ClaimedMailboxItem, type EnqueueMailboxItem } from './MailboxRepository'

/** Runnable = not consumed, not poisoned. */
const runnable = () => and(isNull(agentMailbox.consumedAt), isNull(agentMailbox.deadAt))

/** Unleased = never claimed, or the lease has expired (the crash budget). */
const unleased = (now: Date) => or(isNull(agentMailbox.leaseUntil), lt(agentMailbox.leaseUntil, now))

@injectable()
export class DrizzleMailboxRepository extends MailboxRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async enqueue(item: EnqueueMailboxItem, tx?: DrizzleClient): Promise<boolean> {
		const dbc = tx ?? this.db
		const inserted = await dbc
			.insert(agentMailbox)
			.values({
				id: crypto.randomUUID(),
				ownerId: item.ownerId,
				targetKind: item.targetKind,
				targetId: item.targetId,
				kind: item.kind,
				payload: item.payload,
				dedupKey: item.dedupKey,
			})
			.onConflictDoNothing({ target: agentMailbox.dedupKey })
			.returning({ id: agentMailbox.id })
		return inserted.length > 0
	}

	/**
	 * Claim in TWO statements inside one write transaction, and the shape is deliberate.
	 *
	 * The select finds the oldest runnable item whose TARGET has nothing leased — expressed as a
	 * correlated NOT EXISTS, because "one turn per target" is a property of the target, not of the
	 * row. The update then claims that exact id while re-asserting it is still unleased, so two
	 * pollers racing cannot both win: SQLite serializes writers, and the loser's UPDATE matches
	 * nothing and returns empty rather than throwing.
	 */
	async claimNext(claimedBy: string, leaseMs: number, tx?: DrizzleClient): Promise<ClaimedMailboxItem | undefined> {
		const dbc = tx ?? this.db
		const now = new Date()

		const busy = dbc
			.select({ one: sql`1` })
			.from(sql`${agentMailbox} AS busy`)
			.where(
				sql`busy.target_kind = ${agentMailbox.targetKind} AND busy.target_id = ${agentMailbox.targetId}
				    AND busy.consumed_at IS NULL AND busy.dead_at IS NULL
				    AND busy.lease_until IS NOT NULL AND busy.lease_until >= ${now.getTime()}`,
			)

		const [candidate] = await dbc
			.select({ id: agentMailbox.id })
			.from(agentMailbox)
			.where(and(runnable(), unleased(now), notExists(busy)))
			.orderBy(asc(agentMailbox.createdAt))
			.limit(1)
		if (!candidate) return undefined

		const claimed = await dbc
			.update(agentMailbox)
			.set({ claimedBy, leaseUntil: new Date(now.getTime() + leaseMs), attempts: sql`${agentMailbox.attempts} + 1` })
			.where(and(eq(agentMailbox.id, candidate.id), runnable(), unleased(now)))
			.returning({
				id: agentMailbox.id,
				ownerId: agentMailbox.ownerId,
				targetKind: agentMailbox.targetKind,
				targetId: agentMailbox.targetId,
				kind: agentMailbox.kind,
				payload: agentMailbox.payload,
				attempts: agentMailbox.attempts,
			})
		const row = claimed[0]
		if (!row) return undefined
		return { ...row, targetKind: row.targetKind as MailboxTargetKind, kind: row.kind as MailboxItemKind }
	}

	async complete(id: string, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		await dbc.update(agentMailbox).set({ consumedAt: new Date(), claimedBy: null, leaseUntil: null }).where(eq(agentMailbox.id, id))
	}

	async fail(id: string, error: string, maxAttempts: number, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		// `attempts` was already incremented at claim, so the comparison here reads the real count of
		// runs, not of scheduling opportunities.
		await dbc
			.update(agentMailbox)
			.set({
				lastError: error,
				claimedBy: null,
				leaseUntil: null,
				deadAt: sql`CASE WHEN ${agentMailbox.attempts} >= ${maxAttempts} THEN ${Date.now()} ELSE NULL END`,
			})
			.where(eq(agentMailbox.id, id))
	}

	async hasPending(targetKind: MailboxTargetKind, targetId: string, tx?: DrizzleClient): Promise<boolean> {
		const dbc = tx ?? this.db
		const rows = await dbc
			.select({ id: agentMailbox.id })
			.from(agentMailbox)
			.where(and(eq(agentMailbox.targetKind, targetKind), eq(agentMailbox.targetId, targetId), runnable()))
			.limit(1)
		return rows.length > 0
	}
}
