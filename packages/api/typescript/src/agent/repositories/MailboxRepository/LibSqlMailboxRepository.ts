import { injectable } from 'tsyringe-neo'
import { and, asc, eq, inArray, isNotNull, isNull, lt, ne, notExists, or, sql } from 'drizzle-orm'
import { DAEMON_BOOT, isClaimOrphaned, LibSqlDatabaseDriver, LibSqlTransaction } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import type { MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository, type ClaimedMailboxItem, type EnqueueMailboxItem } from './MailboxRepository'

/** Runnable = not consumed, not poisoned. */
const runnable = () => and(isNull(agentMailbox.consumedAt), isNull(agentMailbox.deadAt))

/** Unleased = never claimed, or the lease has expired (the crash budget). */
const unleased = (now: Date) => or(isNull(agentMailbox.leaseUntil), lt(agentMailbox.leaseUntil, now))

@injectable()
export class LibSqlMailboxRepository extends MailboxRepository {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async enqueue(item: EnqueueMailboxItem, tx?: LibSqlTransaction): Promise<boolean> {
		const dbc = tx ?? this.driver.db
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
	async claimNext(claimedBy: string, leaseMs: number, tx?: LibSqlTransaction): Promise<ClaimedMailboxItem | undefined> {
		const dbc = tx ?? this.driver.db
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
			.set({
				claimedBy,
				// WHICH RUN of the daemon is holding it — what makes a stranded claim provably dead
				// instead of merely old. Written here and nowhere else: a claim is the only moment a
				// row acquires a holder, so it is the only moment the holder's identity is a fact.
				claimedBoot: DAEMON_BOOT.id,
				claimedPid: DAEMON_BOOT.pid,
				leaseUntil: new Date(now.getTime() + leaseMs),
				attempts: sql`${agentMailbox.attempts} + 1`,
			})
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

	async renewLease(id: string, claimedBy: string, leaseMs: number, tx?: LibSqlTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		// `claimedBy` is in the predicate, not just the id: if this worker's lease already lapsed and
		// another claimed the item, the UPDATE matches nothing rather than yanking the lease back from
		// under the new holder. A heartbeat that could steal would be worse than no heartbeat.
		await dbc
			.update(agentMailbox)
			.set({ leaseUntil: new Date(Date.now() + leaseMs) })
			.where(
				and(eq(agentMailbox.id, id), eq(agentMailbox.claimedBy, claimedBy), isNull(agentMailbox.consumedAt), isNull(agentMailbox.deadAt)),
			)
	}

	/**
	 * Two statements, and the SPLIT is the point: SQL decides which claims are CANDIDATES (leased,
	 * runnable, stamped by a boot that is not this one) and the OS decides which of those are dead.
	 * `kill(pid, 0)` has no SQL spelling, so a single-statement version could only guess — and the
	 * guess it would have to make ("a different boot means a dead boot") robs a second daemon running
	 * against the same file of the work it is doing right now.
	 *
	 * Candidates are typically zero or one, and only at boot, so the round-trip per candidate that a
	 * `WHERE id IN (...)` avoids is not a cost anybody pays twice.
	 */
	async releaseOrphanedClaims(tx?: LibSqlTransaction): Promise<number> {
		const dbc = tx ?? this.driver.db

		const candidates = await dbc
			.select({ id: agentMailbox.id, bootId: agentMailbox.claimedBoot, pid: agentMailbox.claimedPid })
			.from(agentMailbox)
			.where(
				and(
					runnable(),
					isNotNull(agentMailbox.leaseUntil),
					isNotNull(agentMailbox.claimedBoot),
					ne(agentMailbox.claimedBoot, DAEMON_BOOT.id),
				),
			)

		const orphaned = candidates.filter(isClaimOrphaned).map(row => row.id)
		if (orphaned.length === 0) return 0

		// The predicate is RE-ASSERTED, not just the ids: between the select and here, a poll could have
		// claimed one of these rows for THIS boot (its lease had expired, which is the other way an
		// orphan becomes claimable). Releasing it then would strip a live turn of the lease it is
		// running under — the exact double-turn the queue exists to prevent, produced by the code meant
		// to protect it.
		await dbc
			.update(agentMailbox)
			.set({ claimedBy: null, claimedBoot: null, claimedPid: null, leaseUntil: null })
			.where(and(inArray(agentMailbox.id, orphaned), runnable(), ne(agentMailbox.claimedBoot, DAEMON_BOOT.id)))
		return orphaned.length
	}

	async complete(id: string, tx?: LibSqlTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		await dbc
			.update(agentMailbox)
			.set({ consumedAt: new Date(), claimedBy: null, claimedBoot: null, claimedPid: null, leaseUntil: null })
			.where(eq(agentMailbox.id, id))
	}

	async fail(id: string, error: string, maxAttempts: number, tx?: LibSqlTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		// `attempts` was already incremented at claim, so the comparison here reads the real count of
		// runs, not of scheduling opportunities.
		await dbc
			.update(agentMailbox)
			.set({
				lastError: error,
				claimedBy: null,
				claimedBoot: null,
				claimedPid: null,
				leaseUntil: null,
				deadAt: sql`CASE WHEN ${agentMailbox.attempts} >= ${maxAttempts} THEN ${Date.now()} ELSE NULL END`,
			})
			.where(eq(agentMailbox.id, id))
	}

	async hasPending(targetKind: MailboxTargetKind, targetId: string, tx?: LibSqlTransaction): Promise<boolean> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select({ id: agentMailbox.id })
			.from(agentMailbox)
			.where(and(eq(agentMailbox.targetKind, targetKind), eq(agentMailbox.targetId, targetId), runnable()))
			.limit(1)
		return rows.length > 0
	}
}
