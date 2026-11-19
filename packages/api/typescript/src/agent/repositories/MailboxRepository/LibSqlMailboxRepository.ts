import { injectable } from 'tsyringe-neo'
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, ne, notExists, or, sql } from 'drizzle-orm'
import { DAEMON_BOOT, Id, isClaimOrphaned, LibSqlDatabaseDriver, LibSqlTransaction, z } from '@codm/core-typescript'
import { agentIssueAttributes, agentMailbox } from '@codm/contracts/db'
import { MailboxClaimClass, MailboxItemKind, MailboxTargetKind, type PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import {
	MailboxRepository,
	type ClaimedMailboxBundle,
	type ClaimedMailboxItem,
	type DeferredMailboxItem,
	type EnqueueMailboxItem,
	type HoldSettlement,
} from './MailboxRepository'
import { ISSUE_ATTRIBUTE_DEFAULTS } from '../../entities/IssueAttributes'
import { claimRankSql } from '../../utils/ClaimRank'
import { coalescedPrefix, MAX_COALESCED, type CoalescingCandidate } from '../../utils/SteerCoalescing'

/** Runnable = not consumed, not poisoned. */
const runnable = () => and(isNull(agentMailbox.consumedAt), isNull(agentMailbox.deadAt))

/** Unleased = never claimed, or the lease has expired (the crash budget). */
const unleased = (now: Date) => or(isNull(agentMailbox.leaseUntil), lt(agentMailbox.leaseUntil, now))

/**
 * Deferred = runnable, NO holder, lease not yet expired — the state only `defer` writes (see the port's
 * docblock for the census of every lease writer). Shared by the select and the UPDATE of the release, so
 * the two can never disagree about what a pause is.
 *
 * `>=`, the exact complement of `unleased`'s `<` and the same bound as `claimNext`'s `busy`: at the
 * instant the lease ends, the item is still paused and not yet claimable — never neither.
 */
const deferredAt = (now: Date) => and(runnable(), isNull(agentMailbox.claimedBy), gte(agentMailbox.leaseUntil, now))

/** What the claim reads of a head and of the items behind it — the order keys and what decides who rides along. */
const coalescingColumns = {
	id: agentMailbox.id,
	targetKind: agentMailbox.targetKind,
	targetId: agentMailbox.targetId,
	createdAt: agentMailbox.createdAt,
	firstClaimedAt: agentMailbox.firstClaimedAt,
	claimClass: agentMailbox.claimClass,
	posture: agentMailbox.posture,
	payload: agentMailbox.payload,
}

const asCandidate = (row: { claimClass: string; posture: PermissionPosture; payload: unknown }): CoalescingCandidate => ({
	// No CHECK on the column (fase 4, S0a) — the enum closes it here, as on the way out.
	claimClass: z.enum(MailboxClaimClass).parse(row.claimClass),
	posture: row.posture,
	payload: row.payload,
})

@injectable()
export class LibSqlMailboxRepository extends MailboxRepository {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	/**
	 * THE WRITE PATH WHEN NO CALLER TRANSACTION IS GIVEN — the driver's `BEGIN IMMEDIATE`, never `this.driver.db`.
	 *
	 * `this.driver.db` is the READ connection. Every write here used to fall back to it whenever the
	 * caller passed no `tx`, and the dispatcher never does — so the claim, the heartbeat, `complete` and
	 * `fail` all ran as implicit transactions on the read handle, outside the gate the driver calls "the
	 * one and only write path". A deferred transaction on a handle that is also serving reads upgrades
	 * read→write and, the moment another writer has committed in between, gets `SQLITE_BUSY_SNAPSHOT`
	 * (517) — which `busy_timeout` does NOT retry — or `cannot commit transaction - SQL statements in
	 * progress`. Measured 2026-10-30 on a live install: four issue turns failing at once each wrote
	 * `fail` through that handle, the writes lost to the gateway and the outbox, and the daemon died on
	 * every boot (3 of 3) within 6–28s.
	 *
	 * A caller that already holds a transaction passes it, and the write joins it as before.
	 */
	private write<Return>(tx: LibSqlTransaction | undefined, fn: (dbc: LibSqlTransaction) => Promise<Return>): Promise<Return> {
		return tx ? fn(tx) : this.driver.transaction(fn)
	}

	async enqueue(item: EnqueueMailboxItem, tx?: LibSqlTransaction): Promise<boolean> {
		const inserted = await this.write(tx, dbc =>
			dbc
				.insert(agentMailbox)
				.values({
					// uuid v7, monotonic: the claim's LAST tie-break is `id`, so it must be arrival order too (fase 4, S4).
					id: Id.value(),
					ownerId: item.ownerId,
					targetKind: item.targetKind,
					targetId: item.targetId,
					kind: item.kind,
					payload: item.payload,
					posture: item.posture,
					// What the item is, as its producer declared it (fase 4, S0c).
					claimClass: item.claimClass,
					dedupKey: item.dedupKey,
					// A HOLD is a claim written at birth (`EnqueueMailboxItem.hold`): same three holder columns a
					// claim stamps, so the boot sweep frees it exactly like a claim of a dead daemon. No attempt is
					// charged and `first_claimed_at` stays empty — nothing has been handed to a turn.
					...(item.hold && {
						claimedBy: item.hold.holder,
						claimedBoot: DAEMON_BOOT.id,
						claimedPid: DAEMON_BOOT.pid,
						leaseUntil: item.hold.until,
					}),
				})
				.onConflictDoNothing({ target: agentMailbox.dedupKey })
				.returning({ id: agentMailbox.id }),
		)
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
	async claimNext(
		claimedBy: string,
		leaseMs: number,
		lanes?: readonly MailboxTargetKind[],
		tx?: LibSqlTransaction,
	): Promise<ClaimedMailboxItem | undefined> {
		return (await this.claim(claimedBy, leaseMs, lanes, false, tx))?.head
	}

	async claimBundle(
		claimedBy: string,
		leaseMs: number,
		lanes?: readonly MailboxTargetKind[],
		tx?: LibSqlTransaction,
	): Promise<ClaimedMailboxBundle | undefined> {
		return this.claim(claimedBy, leaseMs, lanes, true, tx)
	}

	private async claim(
		claimedBy: string,
		leaseMs: number,
		lanes: readonly MailboxTargetKind[] | undefined,
		coalesce: boolean,
		tx?: LibSqlTransaction,
	): Promise<ClaimedMailboxBundle | undefined> {
		if (lanes?.length === 0) return undefined
		// THE ORDER (fase 4, S4), key by key: (1) the lane's POSITION — the first lane with a claimable item wins;
		// (2) the target's RANK — the best `CLAIM_RANK` among its ready items, the task's priority read from the agent's
		// own `agent_issue_attributes` AT CLAIM TIME (nothing frozen at enqueue); (3) arrival — `created_at`, then `id`
		// (uuid v7), so two items of the same millisecond never depend on the query plan. One statement, so the choice and
		// the claim below stay in the same write transaction.
		const inLanes = lanes ? inArray(agentMailbox.targetKind, [...lanes]) : undefined
		const laneOrder = lanes
			? [
					sql`CASE ${agentMailbox.targetKind} ${sql.join(
						lanes.map((kind, rank) => sql`WHEN ${kind} THEN ${rank}`),
						sql` `,
					)} END`,
				]
			: []

		const rows = await this.write(tx, async dbc => {
			const now = new Date()

			const busy = dbc
				.select({ one: sql`1` })
				.from(sql`${agentMailbox} AS busy`)
				.where(
					sql`busy.target_kind = ${agentMailbox.targetKind} AND busy.target_id = ${agentMailbox.targetId}
					    AND busy.consumed_at IS NULL AND busy.dead_at IS NULL
					    AND busy.lease_until IS NOT NULL AND busy.lease_until >= ${now.getTime()}`,
				)

			// THE CANDIDATE IS ALWAYS ITS TARGET'S OLDEST RUNNABLE ITEM — `(created_at, id)` as one key, so two items of
			// the same millisecond cannot both qualify. A priority never jumps an older item of its own task: a target
			// is ranked, its items never are.
			const older = dbc
				.select({ one: sql`1` })
				.from(sql`${agentMailbox} AS older`)
				.where(
					sql`older.target_kind = ${agentMailbox.targetKind} AND older.target_id = ${agentMailbox.targetId}
					    AND older.consumed_at IS NULL AND older.dead_at IS NULL
					    AND (older.created_at < ${agentMailbox.createdAt}
					         OR (older.created_at = ${agentMailbox.createdAt} AND older.id < ${agentMailbox.id}))`,
				)

			// The target's rank: the best of its READY items (a target with nothing leased — `busy` — has every runnable
			// item ready). A task with no attributes row, and every THREAD target, reads as the birth defaults.
			const targetRank = sql`(SELECT MIN(${claimRankSql(
				sql`ready.claim_class`,
				sql`COALESCE(attrs.priority_reason, ${ISSUE_ATTRIBUTE_DEFAULTS.priorityReason})`,
				sql`COALESCE(attrs.priority, ${ISSUE_ATTRIBUTE_DEFAULTS.priority})`,
			)})
				FROM ${agentMailbox} AS ready
				LEFT JOIN ${agentIssueAttributes} AS attrs
				  ON ready.target_kind = ${MailboxTargetKind.ISSUE} AND attrs.issue_id = ready.target_id
				WHERE ready.target_kind = ${agentMailbox.targetKind} AND ready.target_id = ${agentMailbox.targetId}
				  AND ready.consumed_at IS NULL AND ready.dead_at IS NULL
				  AND (ready.lease_until IS NULL OR ready.lease_until < ${now.getTime()}))`

			const [candidate] = await dbc
				.select(coalescingColumns)
				.from(agentMailbox)
				.where(and(runnable(), unleased(now), notExists(busy), notExists(older), inLanes))
				.orderBy(...laneOrder, targetRank, asc(agentMailbox.createdAt), asc(agentMailbox.id))
				.limit(1)
			if (!candidate) return []

			// THE STEERS THAT RIDE WITH IT (fase 4, item 6b): the target's next runnable items in arrival order, of which
			// `coalescedPrefix` takes the contiguous prefix that fits. The target has nothing leased (`busy`), so every one
			// of them is ready; the UPDATE below re-asserts it anyway.
			const next = coalesce
				? await dbc
						.select(coalescingColumns)
						.from(agentMailbox)
						.where(
							and(
								eq(agentMailbox.targetKind, candidate.targetKind),
								eq(agentMailbox.targetId, candidate.targetId),
								runnable(),
								sql`(${agentMailbox.createdAt} > ${candidate.createdAt.getTime()}
								     OR (${agentMailbox.createdAt} = ${candidate.createdAt.getTime()} AND ${agentMailbox.id} > ${candidate.id}))`,
							),
						)
						.orderBy(asc(agentMailbox.createdAt), asc(agentMailbox.id))
						.limit(MAX_COALESCED - 1)
				: []
			const members = [candidate, ...next.slice(0, coalescedPrefix(asCandidate(candidate), next.map(asCandidate)))]
			const firstClaimOf = new Map(members.map(member => [member.id, member.firstClaimedAt === null]))

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
					// The FIRST hand-off only ("entregue", fase 0 item 3b): a retry is the same delivery tried again.
					firstClaimedAt: sql`COALESCE(${agentMailbox.firstClaimedAt}, ${now.getTime()})`,
				})
				.where(
					and(
						inArray(
							agentMailbox.id,
							members.map(member => member.id),
						),
						runnable(),
						unleased(now),
					),
				)
				.returning({
					id: agentMailbox.id,
					ownerId: agentMailbox.ownerId,
					targetKind: agentMailbox.targetKind,
					targetId: agentMailbox.targetId,
					kind: agentMailbox.kind,
					payload: agentMailbox.payload,
					posture: agentMailbox.posture,
					claimClass: agentMailbox.claimClass,
					attempts: agentMailbox.attempts,
				})
			// `RETURNING` has no order: the group is put back in arrival order by the select's own. Each member's "first"
			// was read in the SAME write transaction as the stamp, so it cannot be won by two claims.
			const byId = new Map(claimed.map(row => [row.id, row]))
			return members.flatMap(member => {
				const row = byId.get(member.id)
				return row ? [{ ...row, firstClaim: firstClaimOf.get(member.id) ?? false }] : []
			})
		})
		const [head, ...followers] = rows.map(row => ({
			...row,
			targetKind: row.targetKind as MailboxTargetKind,
			kind: row.kind as MailboxItemKind,
			// No CHECK on the column (fase 4, S0a: a new column on an existing table) — the enum closes it here.
			claimClass: z.enum(MailboxClaimClass).parse(row.claimClass),
		}))
		return head ? { head, followers } : undefined
	}

	async renewLease(ids: readonly string[], claimedBy: string, leaseMs: number, tx?: LibSqlTransaction): Promise<void> {
		if (ids.length === 0) return
		// `claimedBy` is in the predicate, not just the id: if this worker's lease already lapsed and
		// another claimed the item, the UPDATE matches nothing rather than yanking the lease back from
		// under the new holder. A heartbeat that could steal would be worse than no heartbeat.
		await this.write(tx, dbc =>
			dbc
				.update(agentMailbox)
				.set({ leaseUntil: new Date(Date.now() + leaseMs) })
				.where(
					and(
						inArray(agentMailbox.id, [...ids]),
						eq(agentMailbox.claimedBy, claimedBy),
						isNull(agentMailbox.consumedAt),
						isNull(agentMailbox.deadAt),
					),
				),
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
		return this.write(tx, async dbc => {
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
		})
	}

	async settleHold(dedupKey: string, holder: string, settlement: HoldSettlement, tx?: LibSqlTransaction): Promise<boolean> {
		const released = { claimedBy: null, claimedBoot: null, claimedPid: null, leaseUntil: null }
		const set = settlement.consume
			? { ...released, consumedAt: new Date() }
			: { ...released, ...(settlement.merge && { payload: sql`json_patch(${agentMailbox.payload}, ${JSON.stringify(settlement.merge)})` }) }
		const rows = await this.write(tx, dbc =>
			dbc
				.update(agentMailbox)
				.set(set)
				.where(and(eq(agentMailbox.dedupKey, dedupKey), eq(agentMailbox.claimedBy, holder), runnable()))
				.returning({ id: agentMailbox.id }),
		)
		return rows.length > 0
	}

	async isHeld(dedupKey: string, holder: string, tx?: LibSqlTransaction): Promise<boolean> {
		const rows = await (tx ?? this.driver.db)
			.select({ id: agentMailbox.id })
			.from(agentMailbox)
			.where(and(eq(agentMailbox.dedupKey, dedupKey), eq(agentMailbox.claimedBy, holder), runnable()))
			.limit(1)
		return rows.length > 0
	}

	async complete(ids: readonly string[], tx?: LibSqlTransaction): Promise<void> {
		if (ids.length === 0) return
		await this.write(tx, dbc =>
			dbc
				.update(agentMailbox)
				.set({ consumedAt: new Date(), claimedBy: null, claimedBoot: null, claimedPid: null, leaseUntil: null })
				.where(inArray(agentMailbox.id, [...ids])),
		)
	}

	async fail(head: string, followers: readonly string[], error: string, maxAttempts: number, tx?: LibSqlTransaction): Promise<void> {
		const released = { claimedBy: null, claimedBoot: null, claimedPid: null, leaseUntil: null }
		await this.write(tx, async dbc => {
			// `attempts` was already incremented at claim, so the comparison here reads the real count of
			// runs, not of scheduling opportunities.
			await dbc
				.update(agentMailbox)
				.set({
					...released,
					lastError: error,
					deadAt: sql`CASE WHEN ${agentMailbox.attempts} >= ${maxAttempts} THEN ${Date.now()} ELSE NULL END`,
				})
				.where(eq(agentMailbox.id, head))
			// The steers that rode with it: released beside it, the attempt their claim charged given back (fase 4, 6b).
			if (followers.length > 0) {
				await dbc
					.update(agentMailbox)
					.set({ ...released, attempts: sql`MAX(${agentMailbox.attempts} - 1, 0)` })
					.where(and(inArray(agentMailbox.id, [...followers]), runnable()))
			}
		})
	}

	async defer(ids: readonly string[], until: Date, tx?: LibSqlTransaction): Promise<void> {
		if (ids.length === 0) return
		// The attempt the claim charged is REFUNDED: a turn the provider refused to start never ran, so
		// it must not move the item toward poison. `MAX(…, 0)` because a row can only be deferred after a
		// claim, but the floor costs nothing and keeps the counter honest if that ever stops being true.
		await this.write(tx, dbc =>
			dbc
				.update(agentMailbox)
				.set({
					claimedBy: null,
					claimedBoot: null,
					claimedPid: null,
					leaseUntil: until,
					attempts: sql`MAX(${agentMailbox.attempts} - 1, 0)`,
				})
				.where(and(inArray(agentMailbox.id, [...ids]), runnable())),
		)
	}

	async deferred(tx?: LibSqlTransaction): Promise<DeferredMailboxItem[]> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select({
				id: agentMailbox.id,
				targetKind: agentMailbox.targetKind,
				targetId: agentMailbox.targetId,
				payload: agentMailbox.payload,
			})
			.from(agentMailbox)
			.where(deferredAt(new Date()))
		return rows.map(row => ({ ...row, targetKind: row.targetKind as MailboxTargetKind }))
	}

	/**
	 * ONE UPDATE for the whole batch, with the predicate re-asserted beside the ids — see the port. An id
	 * that was claimed since `deferred` read it now has a holder and simply does not match.
	 */
	async releaseDeferred(ids: readonly string[], tx?: LibSqlTransaction): Promise<number> {
		if (ids.length === 0) return 0
		const released = await this.write(tx, dbc =>
			dbc
				.update(agentMailbox)
				.set({ leaseUntil: null })
				.where(and(inArray(agentMailbox.id, [...ids]), deferredAt(new Date())))
				.returning({ id: agentMailbox.id }),
		)
		return released.length
	}

	async pendingTargets(targetKind: MailboxTargetKind, tx?: LibSqlTransaction): Promise<string[]> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.selectDistinct({ targetId: agentMailbox.targetId })
			.from(agentMailbox)
			.where(and(eq(agentMailbox.targetKind, targetKind), runnable()))
		return rows.map(row => row.targetId)
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

	async hasUnreadSteer(issueId: string, tx?: LibSqlTransaction): Promise<boolean> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select({ id: agentMailbox.id })
			.from(agentMailbox)
			.where(
				and(
					eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
					eq(agentMailbox.targetId, issueId),
					eq(agentMailbox.kind, MailboxItemKind.STEER),
					runnable(),
					// Held by no turn: the live turn's own item (a STEER it is reading right now) is not "unread".
					isNull(agentMailbox.claimedBy),
					// A PERSON's message: the automatic "declare your outcome" reminder (`ReconcileStalledIssues`)
					// rides the same kind, and must never cancel a push as if the operator had written.
					sql`json_extract(${agentMailbox.payload}, '$.declarationReminder') IS NULL`,
				),
			)
			.limit(1)
		return rows.length > 0
	}
}
