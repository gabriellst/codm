/**
 * THE SINGLE CONSUMER of `agent_mailbox` (orchestrator pivot §7.4) — the `select {}` of the
 * concurrency model in §3.
 *
 * Producers only ever INSERT, always in the transaction of the fact that motivates the item. Nothing
 * else starts a turn. That is not tidiness: the design review killed an earlier version where a
 * producer checked "is a turn running?" and started one if not, because that check-then-act sat across
 * two independent outbox poll loops and both could observe an idle target and both fire.
 *
 * Four properties are load-bearing, and three of them are things the v1 spec was missing:
 *
 *  1. **Lease per TARGET.** One turn in flight per `(targetKind, targetId)`, N targets in parallel.
 *     The lease lives in the row, so it survives a restart — an in-memory guard forgets everything on
 *     a crash, and a subagent result that arrived just before one would never be told to anyone.
 *  2. **Sweep on boot.** Items left leased by a process that died become claimable again. Without it
 *     a crash mid-turn strands that target forever, silently.
 *  3. **Re-poll the SAME target at end of turn.** The wakeup the v1 lacked. Without it, a second
 *     message that arrived while the first was being answered waits for the next tick — which, with
 *     adaptive backoff, can be tens of seconds of a human staring at a chat that has gone quiet.
 *  4. **Poison after N attempts.** A turn that keeps dying must stop being scheduled, or it starves
 *     every later item for the same target — the queue is ordered per target, so one bad item blocks
 *     the conversation behind it.
 */
export abstract class MailboxDispatcher {
	/** Begin polling. Runs the boot sweep first. Idempotent. */
	abstract start(): void

	/** Stop polling and let an in-flight turn finish. Idempotent. */
	abstract stop(): Promise<void>

	/**
	 * Run one poll pass to completion — every currently-claimable item, including the re-polls their
	 * turns trigger.
	 *
	 * Exists for TESTS and for the boot sweep, not as a second scheduling path: `start()` calls exactly
	 * this on a timer. A test that had to race a timer to observe a turn would be a test that fails on
	 * a slow machine, which is how "the dispatcher works" ends up asserted by a sleep.
	 */
	abstract drain(): Promise<number>
}
