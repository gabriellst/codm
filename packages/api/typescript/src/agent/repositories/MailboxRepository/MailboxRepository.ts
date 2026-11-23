import type { Transaction } from '@codm/core-typescript'
import type {
	MailboxClaimClass,
	MailboxDeferCause,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
} from '@codm/contracts-typescript/wire/enums'

/** What a producer states happened. The dispatcher decides what runs. */
export interface EnqueueMailboxItem {
	ownerId: string
	targetKind: MailboxTargetKind
	targetId: string
	kind: MailboxItemKind
	payload: unknown
	/**
	 * The posture the scheduled turn runs under — REQUIRED, so no producer can forget to say who
	 * triggered the work (participant-permission-posture, Decision 4). Derived by the producer from the
	 * trigger: a sender's `canElevate`, the `operator`'s for a console whisper, the run token's claim for
	 * work queued from inside a turn, AUTO for a loop tick or an `ISSUE_RESULT`.
	 */
	posture: PermissionPosture
	/**
	 * WHAT THIS ITEM IS (fase 4, S0c) — REQUIRED, declared by the producer, the only one who knows: the kind cannot
	 * tell a decision's answer (`DECISION_ANSWER`), an "agora" (`INTERRUPT`) or the declaration reminder (`REMINDER`)
	 * from an ordinary steer. The claim order (S4) and steer coalescing (S5) read this column — never a payload key
	 * nor a dedup-key prefix (`resume:`), which would be convention, not contract (Non-Negotiable 5). Gated by
	 * `tests/architecture/mailbox-claim-class.test.ts`.
	 */
	claimClass: MailboxClaimClass
	/**
	 * Idempotency key of the FACT behind the item — an entry id, an issue's run, a steer's own id.
	 *
	 * The producer's transaction plus the unique index on this column IS the exactly-once story: a
	 * redelivered event re-inserts, conflicts, and queues nothing. Without it a redelivery becomes a
	 * second turn, and a second turn becomes a second message in someone's real conversation.
	 */
	dedupKey: string
	/**
	 * Enqueue the item ALREADY LEASED to `holder` until `until` — the parallel triage's hold (fase 2,
	 * triagem paralela). The item exists (durable, in the producer's transaction) but no turn may claim it
	 * while a stateless triage decides whether it needs one; `settleHold` ends the hold.
	 *
	 * A lease WITH a holder, stamped with this daemon's boot like a claim, and never an ownerless one:
	 * an ownerless future lease is a usage-limit pause, and `releaseDeferred` frees those the moment the
	 * provider answers — it would hand the item to the orchestrator in the middle of the triage. A held
	 * item survives everything a claimed one does: the hold lapsing (`until`) or the daemon dying
	 * (`releaseOrphanedClaims`) makes it claimable again, and the message takes the orchestrator's path.
	 */
	hold?: { holder: string; until: Date }
}

/**
 * How a hold ends (`settleHold`): the triage took the message somewhere else, so the item is CONSUMED
 * with no turn; or the orchestrator still answers it, so the item is RELEASED — claimable now — with
 * `merge` patched into its payload (JSON merge-patch: the triage's verdict rides the turn as a hint, and
 * every key the producer wrote stays as it was).
 */
export type HoldSettlement = { consume: true } | { consume: false; merge?: Record<string, unknown> }

/** A leased item, ready to run. */
export interface ClaimedMailboxItem {
	id: string
	ownerId: string
	targetKind: MailboxTargetKind
	targetId: string
	kind: MailboxItemKind
	payload: unknown
	/**
	 * The posture the turn this item schedules runs under — the `posture` column, whose `DEFAULT 'AUTO'`
	 * is what an item enqueued before the column existed reads as.
	 */
	posture: PermissionPosture
	/** What the item is, as its producer declared it (fase 4, S0c) — `WORK` for an item enqueued before the column. */
	claimClass: MailboxClaimClass
	attempts: number
	/**
	 * THIS claim is the item's first hand-off — the one that stamped `first_claimed_at` ("entregue").
	 *
	 * Not `attempts === 1`: `defer` refunds the attempt (a pause, a provider limit), so a later claim can
	 * read 1 again. What makes a delivery the first is the stamp, decided in the claim's own write.
	 */
	firstClaim: boolean
}

/**
 * ONE TURN'S WORTH OF A TARGET'S QUEUE (fase 4, item 6b — recados juntos): the item the claim picked (`head`, the
 * target's oldest ready item, in the S4 order) and the steers that RIDE with it — the contiguous prefix behind it that
 * `coalescedPrefix` admits (same posture, same loop origin, class `STEER`, up to `MAX_COALESCED`), in arrival order.
 *
 * Every member is a row of its own and stays one: each is leased, charged an attempt and stamped `first_claimed_at` by
 * the same write, carries its own `firstClaim` (its own ☑️), and is consumed by its own row (its own ✅, its own line on
 * the timeline). What they share is the TURN — and so every write that settles the turn settles all of them at once
 * (`complete`, `defer`, `renewLease` take the set; `fail` takes the head apart).
 */
export interface ClaimedMailboxBundle {
	head: ClaimedMailboxItem
	followers: readonly ClaimedMailboxItem[]
}

/**
 * An item waiting out a `defer` — what the dispatcher needs to decide WHOSE pause it is.
 *
 * The provider is not here, and that is the model, not an omission: which CLI an item runs on is a
 * property of its thread NOW (the dispatcher resolves it at run time, from `targetKind` + `payload`),
 * so the release resolves it the same way instead of trusting a copy taken when the item was refused.
 */
export interface DeferredMailboxItem {
	id: string
	targetKind: MailboxTargetKind
	targetId: string
	payload: unknown
	/** WHY it waits (fase 5, S1) — the releaser asks this (`DEFER_RELEASE`), never a join on `paused`. */
	cause: MailboxDeferCause
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
	 *
	 * `lanes` narrows the claim to the target kinds that still have a free slot, IN PRIORITY ORDER: the
	 * item claimed is the oldest of the FIRST lane that has one, not the oldest overall. Without it a
	 * conversation queued behind coding-agent turns waited for them — measured 2026-10-30, operator
	 * messages sat at 👀 for minutes while four issue turns held every slot. Absent ⇒ every kind,
	 * oldest first (the shape every caller outside the dispatcher wants).
	 *
	 * INSIDE a lane, targets go by RANK (fase 4, S4 — `CLAIM_RANK`): a decision's answer, then a client's bug, then the
	 * task's declared priority, read from `agent_issue_attributes` at claim time; equal ranks by arrival (`created_at`,
	 * then `id`, uuid v7 — the owner's decision of 19/11). A target ranks by the best of its ready items but always hands
	 * its OLDEST one, so a priority never jumps an older item of its own task — and a target with anything leased (a
	 * turn, a hold, a pause) is skipped whole, so nothing jumps a paused task's item either.
	 */
	abstract claimNext(
		claimedBy: string,
		leaseMs: number,
		lanes?: readonly MailboxTargetKind[],
		tx?: Transaction,
	): Promise<ClaimedMailboxItem | undefined>

	/**
	 * `claimNext`, and the steers that ride with its item (fase 4, item 6b) — the head is exactly the item `claimNext`
	 * would hand, and the followers are leased by the SAME write: one transaction, so a crash never leaves half a group
	 * claimed. The dispatcher's claim; `claimNext` stays the one-item shape every other caller wants.
	 */
	abstract claimBundle(
		claimedBy: string,
		leaseMs: number,
		lanes?: readonly MailboxTargetKind[],
		tx?: Transaction,
	): Promise<ClaimedMailboxBundle | undefined>

	/**
	 * Give a CLAIMED item back WITHOUT spending the attempt its claim charged, and keep it unclaimable
	 * until `until` — the instant a retry can first succeed.
	 *
	 * This is not `fail`: a turn refused because the provider account hit its usage limit did not fail,
	 * it never ran. Charging it poisoned every item the three quick retries reached inside a limit
	 * window (measured 2026-10-30, 13:21 and 17:13: items dead with "You've hit your 5-hour limit"),
	 * and retrying before `until` only asks the same question again.
	 *
	 * `lease_until = until` with no holder is what makes it wait: `claimNext` refuses an unexpired lease,
	 * and the per-target exclusion keeps the rest of that target's queue behind it, in order.
	 *
	 * ### The pause is a HYPOTHESIS about the account, not a fact about the item
	 * The limit belongs to the provider ACCOUNT, and the account can change under the pause. Measured
	 * 2026-11-05: the operator logged the CLI into a fresh account, other issues ran normally on it, and
	 * four items stayed parked until 10/11 14:00 — the weekly reset of the OLD account — until somebody
	 * cleared `lease_until` by hand in SQLite. So the pause is tested, twice: the dispatcher caps `until`
	 * (`CODM_AGENT_LIMIT_RECHECK_MS`), and a turn the same provider accepts afterwards ends it at once
	 * (`deferred` + `releaseDeferred`).
	 *
	 * ### The CAUSE is declared, not inferred (fase 5, S1)
	 * Three writers park an item this way: the provider's limit (`PROVIDER_LIMIT`), a paused issue (`HOLD`) and a
	 * retry waiting out its schedule (`RETRY`). The shape cannot tell them apart, so `cause` is REQUIRED and lands in
	 * `defer_cause`; every write that clears or replaces the lease clears it, so `null` ⇔ not deferred, also after a
	 * lease lapses and the item is claimed. Releasers decide by it (`DEFER_RELEASE`). Gated by
	 * `tests/architecture/mailbox-defer-cause.test.ts`.
	 */
	abstract defer(ids: readonly string[], until: Date, cause: MailboxDeferCause, tx?: Transaction): Promise<void>

	/**
	 * Give a claim back NOW: no holder, NO lease, the attempt the claim charged refunded — claimable by the very next
	 * `claimNext`, the same drain included. For a turn cut before it ran anything (an "agora" before the session).
	 *
	 * Not `defer(ids, new Date())`: that writes an ownerless lease AT the current millisecond, which `claimNext`
	 * (`lease_until < now`) refuses until the clock ticks and `deferred` reads as a pause meanwhile — whether the
	 * group came back in the same drain depended on the millisecond (the flaky coalesce case, 2026-11-19).
	 */
	abstract giveBack(ids: readonly string[], tx?: Transaction): Promise<void>

	/**
	 * The items waiting out a `defer` right now: runnable, NO holder, lease still in the future — each with its cause.
	 *
	 * The SQL half of the release, and the split mirrors `releaseOrphanedClaims`: SQL picks the
	 * candidates, and the dispatcher decides which of them belong to the provider that just answered —
	 * a question the table cannot answer, because the provider is the thread's, not the row's.
	 */
	abstract deferred(tx?: Transaction): Promise<DeferredMailboxItem[]>

	/**
	 * End the pause of these items NOW — `lease_until = NULL`, claimable on the next poll.
	 *
	 * The predicate (runnable, no holder, lease in the future) is RE-ASSERTED in the same UPDATE, not
	 * just the ids: between `deferred` and here an item whose pause lapsed can have been claimed, and
	 * clearing a lease that has a holder would start a second turn beside a live one — the double turn
	 * this queue exists to prevent. The attempt `defer` refunded is untouched; the cause is cleared with the lease.
	 *
	 * @returns how many pauses were released.
	 */
	abstract releaseDeferred(ids: readonly string[], tx?: Transaction): Promise<number>

	/** The targets of `targetKind` with runnable work waiting — who is owed an answer right now. */
	abstract pendingTargets(targetKind: MailboxTargetKind, tx?: Transaction): Promise<string[]>

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
	abstract renewLease(ids: readonly string[], claimedBy: string, leaseMs: number, tx?: Transaction): Promise<void>

	/** Mark a turn done — every item it carried, in one write. They never run again. */
	abstract complete(ids: readonly string[], tx?: Transaction): Promise<void>

	/**
	 * Record a failed turn: attempts++, lease released. Past `maxAttempts` the item is POISONED
	 * (`dead_at`) rather than retried forever — a turn that keeps dying must stop being scheduled, or
	 * it starves every later item for the same target.
	 *
	 * ONLY THE HEAD PAYS (fase 4, item 6b): the steers that rode with it (`followers`) get the attempt their claim
	 * charged back and are released beside it, never poisoned — a turn that died is the head's failure to run, and a
	 * steer that arrived while it was queued must not die of it. One write for the whole group.
	 */
	abstract fail(head: string, followers: readonly string[], error: string, maxAttempts: number, tx?: Transaction): Promise<void>

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

	/**
	 * End a hold (`EnqueueMailboxItem.hold`) — a COMPARE-AND-SWAP on the holder, addressed by the item's
	 * `dedupKey` (the producer's own fact id, which the triage already has).
	 *
	 * It applies only while the item is unconsumed and STILL leased to `holder`. Once the hold lapsed and a
	 * turn claimed the item, `claimed_by` is that turn's worker and this matches nothing: the triage lost
	 * the race and its verdict must be dropped — the orchestrator is already answering. A lapsed hold that
	 * nobody claimed yet still belongs to the triage, which is the honest answer (nothing has run).
	 *
	 * @returns true when the hold was this caller's and is now settled.
	 */
	abstract settleHold(dedupKey: string, holder: string, settlement: HoldSettlement, tx?: Transaction): Promise<boolean>

	/** Whether `holder` still holds the item behind `dedupKey` — the cheap check before spending a model run. */
	abstract isHeld(dedupKey: string, holder: string, tx?: Transaction): Promise<boolean>

	/** Whether any runnable (unconsumed, unleased, unpoisoned) item exists for a target. */
	abstract hasPending(targetKind: MailboxTargetKind, targetId: string, tx?: Transaction): Promise<boolean>

	/**
	 * Does this issue have guidance its live session has NOT read? — the regret window's question (fase 2,
	 * item 3): a STEER for the issue, unconsumed, not poisoned, and held by NO turn (`claimed_by IS NULL`).
	 *
	 * Not `hasPending`: that one is true for the very item the running turn holds, so the window would
	 * cancel every action. And not "arrived after the window opened": the case the spec measured is a
	 * correction queued minutes BEFORE the action and still undelivered (a steer waits for the turn to end),
	 * which a since-filter would let the push run past. Whatever its age, an unread steer cancels.
	 *
	 * Only a PERSON's steer: the automatic declaration reminder (`declarationReminder` in the payload,
	 * `ReconcileStalledIssues`) is not a message from anyone and does not cancel.
	 */
	abstract hasUnreadSteer(issueId: string, tx?: Transaction): Promise<boolean>
}
