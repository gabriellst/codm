import { injectable } from 'tsyringe-neo'
import type { MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository, type ClaimedMailboxItem, type EnqueueMailboxItem } from './MailboxRepository'

interface Row extends EnqueueMailboxItem {
	id: string
	attempts: number
	leaseUntil?: number
	consumed: boolean
	dead: boolean
	seq: number
}

/** In-memory twin, same semantics: dedup by key, one lease per target, expiry, poison. */
@injectable()
export class MockMailboxRepository extends MailboxRepository {
	private rows: Row[] = []
	private seq = 0

	async enqueue(item: EnqueueMailboxItem): Promise<boolean> {
		if (this.rows.some(r => r.dedupKey === item.dedupKey)) return false
		this.seq += 1
		this.rows.push({ ...item, id: crypto.randomUUID(), attempts: 0, consumed: false, dead: false, seq: this.seq })
		return true
	}

	async claimNext(claimedBy: string, leaseMs: number): Promise<ClaimedMailboxItem | undefined> {
		const now = Date.now()
		const runnable = (r: Row) => !r.consumed && !r.dead
		const leased = (r: Row) => r.leaseUntil !== undefined && r.leaseUntil >= now
		const busy = new Set(this.rows.filter(r => runnable(r) && leased(r)).map(r => `${r.targetKind}:${r.targetId}`))
		const row = this.rows
			.filter(r => runnable(r) && !leased(r) && !busy.has(`${r.targetKind}:${r.targetId}`))
			.sort((a, b) => a.seq - b.seq)[0]
		if (!row) return undefined
		row.attempts += 1
		row.leaseUntil = now + leaseMs
		void claimedBy
		return {
			id: row.id,
			ownerId: row.ownerId,
			targetKind: row.targetKind,
			targetId: row.targetId,
			kind: row.kind,
			payload: row.payload,
			attempts: row.attempts,
		}
	}

	async renewLease(id: string, _claimedBy: string, leaseMs: number): Promise<void> {
		const row = this.rows.find(r => r.id === id)
		if (!row || row.consumed || row.dead) return
		row.leaseUntil = Date.now() + leaseMs
	}

	async defer(id: string, delayMs: number): Promise<void> {
		const row = this.rows.find(r => r.id === id)
		if (!row || row.consumed || row.dead) return
		row.leaseUntil = Date.now() + delayMs
		row.attempts = Math.max(row.attempts - 1, 0)
	}

	async complete(id: string): Promise<void> {
		const row = this.rows.find(r => r.id === id)
		if (row) {
			row.consumed = true
			row.leaseUntil = undefined
		}
	}

	async fail(id: string, _error: string, maxAttempts: number): Promise<void> {
		const row = this.rows.find(r => r.id === id)
		if (!row) return
		row.leaseUntil = undefined
		if (row.attempts >= maxAttempts) row.dead = true
	}

	async hasPending(targetKind: MailboxTargetKind, targetId: string): Promise<boolean> {
		return this.rows.some(r => !r.consumed && !r.dead && r.targetKind === targetKind && r.targetId === targetId)
	}
}
