import type { Transaction } from '@codm/core-typescript'
import type { MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'

/** What a producer states happened. The dispatcher decides what runs. */
export interface EnqueueMailboxItem {
	ownerId: string
	targetKind: MailboxTargetKind
	targetId: string
	kind: MailboxItemKind
	payload: unknown
	/**
	 * Idempotency key of the FACT behind the item — an entry id, an issue's run, a steer's own id.
	 *
	 * The producer's transaction plus the unique index on this column IS the exactly-once story: a
	 * redelivered event re-inserts, conflicts, and queues nothing. Without it a redelivery becomes a
	 * second turn, and a second turn becomes a second message in someone's real conversation.
	 */
	dedupKey: string
}

/** A leased item, ready to run. */
export interface ClaimedMailboxItem {
	id: string
	ownerId: string
	targetKind: MailboxTargetKind
	targetId: string
	kind: MailboxItemKind
	payload: unknown
	attempts: number
}

/**
 * The durable per-target turn queue (orchestrator pivot §7.4).
 *
 * Producers only ENQUEUE, always inside the transaction of the fact that motivates the item. They
 * never check whether a turn is running: that check-then-act, spread across two independent outbox
 * poll loops, was a blocking finding of the design review — both producers could observe an idle
 * target and both fire.
 *
 * The dispatcher is the single consumer. `claimNext` takes a LEASE per TARGET, so one turn per
 * target is in flight while different targets run in parallel.
 */
export abstract class MailboxRepository {
	/** @returns true when this item was newly queued; false when its `dedupKey` was already present. */
	abstract enqueue(item: EnqueueMailboxItem, tx?: Transaction): Promise<boolean>

	/**
	 * Lease the oldest runnable item whose TARGET has no item already leased.
	 *
	 * One atomic write claims it — SQLite admits a single writer, which is what makes "no two turns
	 * for one target" true without a row-locking construct. `leaseMs` is the crash budget: a worker
	 * that dies mid-turn has its item become claimable again, which is the boot-recovery the design
	 * review found missing (an in-memory guard forgets everything a restart, and a subagent result
	 * that arrived just before a crash would never be told to anyone).
	 */
	abstract claimNext(claimedBy: string, leaseMs: number, tx?: Transaction): Promise<ClaimedMailboxItem | undefined>

	/**
	 * Push this item's lease forward while ITS TURN IS STILL RUNNING — the heartbeat that keeps
	 * `leaseMs` a CRASH budget instead of a turn-duration budget.
	 *
	 * Without it the two meanings collapse, and the collapse is not theoretical: an issue turn is a
	 * coding agent that routinely runs longer than the lease. Its item then became claimable while the
	 * run was healthy and still going, and the dispatcher started a SECOND turn for the same target
	 * while the first was still healthy and running. Measured 2026-08-04: two issues died that way
	 * within three minutes of a daemon restart.
	 *
	 * Only the CURRENT holder may renew (`claimedBy` is part of the predicate), so a worker whose lease
	 * already expired and was taken by someone else cannot steal it back mid-turn.
	 *
	 * ### It renews a lease, it does not certify a turn
	 * Measured 2026-08-27: two issues sat `WORKING` for over half an hour with their items leased and
	 * the lease pushed forward every three minutes, while NO provider process existed on the machine.
	 * The heartbeat was doing exactly what it is told to do — the turn's promise had simply never
	 * settled, so nothing ever cleared the interval. Renewal is therefore evidence that a TIMER is
	 * alive and nothing more; whether the WORK is alive is the caller's to bound (see the dispatcher's
	 * renewal ceiling) and the runner's to detect (a dead child now ends its own turn).
	 */
	abstract renewLease(id: string, claimedBy: string, leaseMs: number, tx?: Transaction): Promise<void>

	/** Mark a turn done. The item never runs again. */
	abstract complete(id: string, tx?: Transaction): Promise<void>

	/**
	 * Record a failed turn: attempts++, lease released. Past `maxAttempts` the item is POISONED
	 * (`dead_at`) rather than retried forever — a turn that keeps dying must stop being scheduled, or
	 * it starves every later item for the same target.
	 */
	abstract fail(id: string, error: string, maxAttempts: number, tx?: Transaction): Promise<void>

	/**
	 * Release every lease held by a daemon boot that is PROVABLY gone — the boot sweep, made honest.
	 *
	 * ### What it fixes
	 * `claimNext` already returns an item whose lease EXPIRED, so a crash was supposed to cost at most
	 * one lease of latency. It cost the full lease every time: the claim on the row named a worker id
	 * minted in the dead process's memory, and nothing in the new process could tell that id apart
	 * from a second daemon still working. So the recovery was "wait ten minutes", on a queue whose
	 * whole point is that a human is waiting on the other end of it.
	 *
	 * With the boot stamped on the row (`claimed_boot` / `claimed_pid`) the question has an answer the
	 * OS gives — see `isClaimOrphaned`, which only ever says yes to a claim it can PROVE is dead. A
	 * live pid, our own boot, or a row written before those columns existed all keep their lease and
	 * fall back to expiry, so a second daemon running against the same file is never robbed.
	 *
	 * Attempts are NOT spent here: releasing makes the item claimable, and the claim that follows
	 * increments as usual. A crash-inducing item is therefore still bounded by the same poison
	 * counter — it does not get infinite free retries by virtue of killing its worker.
	 *
	 * @returns how many leases were released.
	 */
	abstract releaseOrphanedClaims(tx?: Transaction): Promise<number>

	/** Whether any runnable (unconsumed, unleased, unpoisoned) item exists for a target. */
	abstract hasPending(targetKind: MailboxTargetKind, targetId: string, tx?: Transaction): Promise<boolean>
}
