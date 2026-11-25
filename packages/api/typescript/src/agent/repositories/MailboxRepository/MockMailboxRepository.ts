import { injectable } from 'tsyringe-neo'
import { DAEMON_BOOT, isClaimOrphaned } from '@codm/core-typescript'
import { MailboxClaimClass, MailboxDeferCause, MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import {
	MailboxRepository,
	type ClaimedMailboxBundle,
	type ClaimedMailboxItem,
	type DeferredMailboxItem,
	type EnqueueMailboxItem,
	type HoldSettlement,
	type MailboxFailOutcome,
	type MailboxFailure,
} from './MailboxRepository'
import { DEFER_RELEASE } from '../../objects/DeferRelease'
import { IssueAttributesRepository } from '../IssueAttributesRepository'
import { ISSUE_ATTRIBUTE_DEFAULTS } from '../../entities/IssueAttributes'
import { claimRankOf } from '../../utils/ClaimRank'
import { coalescedPrefix, MAX_COALESCED } from '../../utils/SteerCoalescing'

interface Row extends EnqueueMailboxItem {
	id: string
	attempts: number
	leaseUntil?: number
	/** Who holds the lease — `null` for a row nobody claimed, and for a pause (`defer` drops the holder). */
	claimedBy: string | null
	/** WHICH RUN of the daemon holds the lease — the twin of `claimed_boot` / `claimed_pid`. */
	claimedBoot: string | null
	claimedPid: number | null
	consumed: boolean
	dead: boolean
	seq: number
	/** The twin of `first_claimed_at` — set by the first claim, never cleared. */
	firstClaimedAt?: number
	/** The twin of `defer_cause` — set by `defer`, cleared by every write that clears or replaces the lease. */
	deferCause: MailboxDeferCause | null
}

/** In-memory twin, same semantics: dedup by key, one lease per target, expiry, poison. */
@injectable()
export class MockMailboxRepository extends MailboxRepository {
	private rows: Row[] = []
	private seq = 0

	async enqueue(item: EnqueueMailboxItem): Promise<boolean> {
		if (this.rows.some(r => r.dedupKey === item.dedupKey)) return false
		this.seq += 1
		this.rows.push({
			...item,
			id: crypto.randomUUID(),
			attempts: 0,
			claimedBy: item.hold?.holder ?? null,
			claimedBoot: item.hold ? DAEMON_BOOT.id : null,
			claimedPid: item.hold ? DAEMON_BOOT.pid : null,
			leaseUntil: item.hold?.until.getTime(),
			deferCause: null,
			consumed: false,
			dead: false,
			seq: this.seq,
		})
		// Same rule as the SQL twin: a new item ends the target's RETRY wait, handing back the attempt it stood for.
		const now = Date.now()
		for (const deferred of this.deferredRows(now)) {
			if (deferred.targetKind !== item.targetKind || deferred.targetId !== item.targetId || !DEFER_RELEASE[deferred.deferCause].onNewItem)
				continue
			const row: Row = deferred
			row.leaseUntil = undefined
			row.deferCause = null
			row.attempts = Math.max(row.attempts - 1, 0)
		}
		return true
	}

	constructor(private readonly attributes: IssueAttributesRepository) {
		super()
	}

	async claimNext(claimedBy: string, leaseMs: number, lanes?: readonly MailboxTargetKind[]): Promise<ClaimedMailboxItem | undefined> {
		return (await this.claim(claimedBy, leaseMs, lanes, false))?.head
	}

	async claimBundle(claimedBy: string, leaseMs: number, lanes?: readonly MailboxTargetKind[]): Promise<ClaimedMailboxBundle | undefined> {
		return this.claim(claimedBy, leaseMs, lanes, true)
	}

	private async claim(
		claimedBy: string,
		leaseMs: number,
		lanes: readonly MailboxTargetKind[] | undefined,
		coalesce: boolean,
	): Promise<ClaimedMailboxBundle | undefined> {
		const now = Date.now()
		const runnable = (r: Row) => !r.consumed && !r.dead
		const leased = (r: Row) => r.leaseUntil !== undefined && r.leaseUntil >= now
		// Same rule as the SQL twin: a lane's position is its rank, and a kind outside `lanes` is not claimable.
		const lane = (r: Row) => (lanes ? lanes.indexOf(r.targetKind) : 0)
		const targetOf = (r: Row) => `${r.targetKind}:${r.targetId}`
		const busy = new Set(this.rows.filter(r => runnable(r) && leased(r)).map(targetOf))
		const ready = this.rows.filter(r => runnable(r) && !leased(r) && !busy.has(targetOf(r)) && lane(r) >= 0)
		// The target's rank: the best of its ready items, the task's priority read NOW (fase 4, S4).
		const targetRank = new Map<string, number>()
		for (const r of ready) {
			const attributes = r.targetKind === MailboxTargetKind.ISSUE ? await this.attributes.findByIssueId(r.targetId) : undefined
			const rank = claimRankOf(
				r.claimClass,
				attributes?.priorityReason ?? ISSUE_ATTRIBUTE_DEFAULTS.priorityReason,
				attributes?.priority ?? ISSUE_ATTRIBUTE_DEFAULTS.priority,
			)
			targetRank.set(targetOf(r), Math.min(rank, targetRank.get(targetOf(r)) ?? rank))
		}
		// Each target's OLDEST runnable item is its only candidate — `seq` is arrival.
		const oldest = new Map<string, Row>()
		for (const r of [...ready].sort((a, b) => a.seq - b.seq)) if (!oldest.has(targetOf(r))) oldest.set(targetOf(r), r)
		const row = [...oldest.values()].sort(
			(a, b) => lane(a) - lane(b) || (targetRank.get(targetOf(a)) ?? 0) - (targetRank.get(targetOf(b)) ?? 0) || a.seq - b.seq,
		)[0]
		if (!row) return undefined
		// The steers that ride with it (fase 4, item 6b) — same rule as the SQL twin: the target's next runnable items in
		// arrival order, the contiguous prefix `coalescedPrefix` admits.
		const next = coalesce
			? this.rows
					.filter(r => runnable(r) && targetOf(r) === targetOf(row) && r.seq > row.seq)
					.sort((a, b) => a.seq - b.seq)
					.slice(0, MAX_COALESCED - 1)
			: []
		const [head, ...followers] = [row, ...next.slice(0, coalescedPrefix(row, next))].map(member => {
			member.attempts += 1
			const firstClaim = member.firstClaimedAt === undefined
			member.firstClaimedAt ??= now
			member.leaseUntil = now + leaseMs
			member.deferCause = null
			member.claimedBy = claimedBy
			member.claimedBoot = DAEMON_BOOT.id
			member.claimedPid = DAEMON_BOOT.pid
			return {
				id: member.id,
				ownerId: member.ownerId,
				targetKind: member.targetKind,
				targetId: member.targetId,
				kind: member.kind,
				payload: member.payload,
				posture: member.posture,
				claimClass: member.claimClass,
				attempts: member.attempts,
				firstClaim,
			}
		})
		return head ? { head, followers } : undefined
	}

	async renewLease(ids: readonly string[], claimedBy: string, leaseMs: number): Promise<void> {
		for (const row of this.rows.filter(r => ids.includes(r.id) && r.claimedBy === claimedBy && !r.consumed && !r.dead)) {
			row.leaseUntil = Date.now() + leaseMs
		}
	}

	async releaseOrphanedClaims(): Promise<number> {
		const orphaned = this.rows.filter(
			r => !r.consumed && !r.dead && r.leaseUntil !== undefined && isClaimOrphaned({ bootId: r.claimedBoot, pid: r.claimedPid }),
		)
		for (const row of orphaned) this.release(row)
		return orphaned.length
	}

	async settleHold(dedupKey: string, holder: string, settlement: HoldSettlement): Promise<boolean> {
		const row = this.rows.find(r => r.dedupKey === dedupKey && r.claimedBy === holder && !r.consumed && !r.dead)
		if (!row) return false
		this.release(row)
		if (settlement.consume) row.consumed = true
		else if (settlement.merge) row.payload = { ...(row.payload as Record<string, unknown>), ...settlement.merge }
		return true
	}

	async isHeld(dedupKey: string, holder: string): Promise<boolean> {
		return this.rows.some(r => r.dedupKey === dedupKey && r.claimedBy === holder && !r.consumed && !r.dead)
	}

	async complete(ids: readonly string[]): Promise<void> {
		for (const row of this.rows.filter(r => ids.includes(r.id))) {
			row.consumed = true
			this.release(row)
		}
	}

	async fail(head: string, followers: readonly string[], _failure: MailboxFailure, waits: readonly number[]): Promise<MailboxFailOutcome> {
		const now = Date.now()
		const row = this.rows.find(r => r.id === head)
		const attempts = row?.attempts ?? 0
		const wait = waits[Math.max(attempts, 1) - 1]
		let outcome: MailboxFailOutcome
		if (wait === undefined) {
			if (row) {
				this.release(row)
				row.dead = true
			}
			outcome = { dead: true, attempts, since: row?.firstClaimedAt === undefined ? null : new Date(row.firstClaimedAt) }
		} else {
			if (row) {
				this.release(row)
				// A wait of 0 is "again now" (no lease, no cause); the attempt stays charged either way.
				if (wait > 0) {
					row.leaseUntil = now + wait
					row.deferCause = MailboxDeferCause.RETRY
				}
			}
			outcome = { dead: false, attempts, retryAt: new Date(now + wait) }
		}
		// Only the head pays: the steers that rode with it get their attempt back.
		for (const follower of this.rows.filter(r => followers.includes(r.id) && !r.consumed && !r.dead)) {
			this.release(follower)
			follower.attempts = Math.max(follower.attempts - 1, 0)
		}
		return outcome
	}

	async defer(ids: readonly string[], until: Date, cause: MailboxDeferCause): Promise<void> {
		for (const row of this.rows.filter(r => ids.includes(r.id) && !r.consumed && !r.dead)) {
			this.release(row)
			row.leaseUntil = until.getTime()
			row.deferCause = cause
			row.attempts = Math.max(row.attempts - 1, 0)
		}
	}

	async giveBack(ids: readonly string[]): Promise<void> {
		for (const row of this.rows.filter(r => ids.includes(r.id) && !r.consumed && !r.dead)) {
			this.release(row)
			row.attempts = Math.max(row.attempts - 1, 0)
		}
	}

	private release(row: Row): void {
		row.leaseUntil = undefined
		row.claimedBy = null
		row.claimedBoot = null
		row.claimedPid = null
		row.deferCause = null
	}

	/** Same predicate as the SQL twin's `deferredAt`: runnable, no holder, lease in the future. */
	private isDeferred(row: Row, now: number): boolean {
		return !row.consumed && !row.dead && row.claimedBy === null && row.leaseUntil !== undefined && row.leaseUntil >= now
	}

	/** The rows a defer parked — the cause is part of the predicate, as in the SQL twin. */
	private deferredRows(now: number): (Row & { deferCause: MailboxDeferCause })[] {
		return this.rows.filter((r): r is Row & { deferCause: MailboxDeferCause } => this.isDeferred(r, now) && r.deferCause !== null)
	}

	async deferred(): Promise<DeferredMailboxItem[]> {
		const now = Date.now()
		return this.deferredRows(now).map(r => ({
			id: r.id,
			targetKind: r.targetKind,
			targetId: r.targetId,
			payload: r.payload,
			cause: r.deferCause,
		}))
	}

	async releaseDeferred(ids: readonly string[]): Promise<number> {
		const now = Date.now()
		const released = this.rows.filter(r => ids.includes(r.id) && this.isDeferred(r, now))
		for (const row of released) {
			row.leaseUntil = undefined
			row.deferCause = null
		}
		return released.length
	}

	async pendingTargets(targetKind: MailboxTargetKind): Promise<string[]> {
		return [...new Set(this.rows.filter(r => !r.consumed && !r.dead && r.targetKind === targetKind).map(r => r.targetId))]
	}

	async runningItem(targetKind: MailboxTargetKind, targetId: string): Promise<{ id: string } | undefined> {
		const now = Date.now()
		const row = this.rows.find(
			r =>
				!r.consumed &&
				!r.dead &&
				r.claimedBy !== null &&
				r.firstClaimedAt !== undefined &&
				(r.leaseUntil ?? 0) >= now &&
				r.targetKind === targetKind &&
				r.targetId === targetId,
		)
		return row ? { id: row.id } : undefined
	}

	async hasPending(targetKind: MailboxTargetKind, targetId: string): Promise<boolean> {
		return this.rows.some(r => !r.consumed && !r.dead && r.targetKind === targetKind && r.targetId === targetId)
	}

	async hasUnreadSteer(issueId: string): Promise<boolean> {
		return this.rows.some(
			r =>
				!r.consumed &&
				!r.dead &&
				r.claimedBy === null &&
				r.targetKind === MailboxTargetKind.ISSUE &&
				r.targetId === issueId &&
				r.kind === MailboxItemKind.STEER &&
				r.claimClass !== MailboxClaimClass.REMINDER,
		)
	}
}
