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

	/** Mark a turn done. The item never runs again. */
	abstract complete(id: string, tx?: Transaction): Promise<void>

	/**
	 * Record a failed turn: attempts++, lease released. Past `maxAttempts` the item is POISONED
	 * (`dead_at`) rather than retried forever — a turn that keeps dying must stop being scheduled, or
	 * it starves every later item for the same target.
	 */
	abstract fail(id: string, error: string, maxAttempts: number, tx?: Transaction): Promise<void>

	/** Whether any runnable (unconsumed, unleased, unpoisoned) item exists for a target. */
	abstract hasPending(targetKind: MailboxTargetKind, targetId: string, tx?: Transaction): Promise<boolean>
}
