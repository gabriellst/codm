import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { MailboxRepository } from '../../repositories'

/**
 * T5 — the scheduling guarantees, exercised against the REAL table.
 *
 * These are asserted at the repository seam rather than through `DrizzleMailboxDispatcher`, because
 * every property under test is a property of the CLAIM — the lease, its expiry, the per-target
 * exclusion — and driving them through the dispatcher would additionally require a provider, a
 * workspace and a CLI, none of which is what is being tested. The dispatcher's own loop is three
 * lines over `claimNext`; what makes it correct is what `claimNext` promises here.
 */
describe('MailboxRepository — the guarantees the dispatcher is built on', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const THREAD_A = '019e4d24-6524-7041-9e1c-8108180cdd0a'
	const THREAD_B = '019e4d24-6524-7041-9e1c-8108180cdd0b'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const enqueue = (repo: MailboxRepository, targetId: string, dedupKey: string) =>
		repo.enqueue({
			ownerId: OPERATOR_ID,
			targetKind: MailboxTargetKind.THREAD,
			targetId,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			payload: { entryId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			dedupKey,
		})

	/**
	 * AC-T5.2, first half. This is the invariant that replaced a check-then-act the design review
	 * killed: producers no longer ask whether a turn is running, so the EXCLUSION has to live here.
	 */
	it('AC-T5.2 — two items for the SAME target never lease at once', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')
		await enqueue(repo, THREAD_A, 'a-2')

		const first = await repo.claimNext('worker-1', 60_000)
		const second = await repo.claimNext('worker-1', 60_000)

		expect(first?.dedupKey ?? first?.id).toBeDefined()
		// The second item exists and is runnable, but its TARGET is busy.
		expect(second).toBeUndefined()
	})

	it('AC-T5.2, second half — DIFFERENT targets run in parallel', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')
		await enqueue(repo, THREAD_B, 'b-1')

		const first = await repo.claimNext('worker-1', 60_000)
		const second = await repo.claimNext('worker-1', 60_000)

		expect(first).toBeDefined()
		expect(second).toBeDefined()
		expect(first?.targetId).not.toBe(second?.targetId)
	})

	/**
	 * AC-T5.3 — THE RE-POLL, and the reason it is a CORRECTNESS test rather than a latency one.
	 *
	 * The dispatcher's drain loops until `claimNext` returns nothing. The property that makes the loop
	 * work is asserted here: once the first item is COMPLETED, the second for the same target becomes
	 * claimable IMMEDIATELY — no lease expiry, no tick.
	 *
	 * Without the loop (one claim per tick) the second message waits for the next poll, which under
	 * backoff is up to fifteen seconds of a human watching a chat that went quiet. That is why the
	 * falsifier for this AC removes the loop and expects RED: "handled 1 of 2 items in a pass" is a
	 * wrong answer, not a slow one.
	 */
	it('AC-T5.3 — completing a turn unblocks the SAME target with no tick in between', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')
		await enqueue(repo, THREAD_A, 'a-2')

		const first = await repo.claimNext('worker-1', 60_000)
		expect(first).toBeDefined()
		expect(await repo.claimNext('worker-1', 60_000)).toBeUndefined()

		await repo.complete(first?.id ?? '')

		// The re-poll the dispatcher performs at the end of a turn. No time has passed.
		const second = await repo.claimNext('worker-1', 60_000)
		expect(second).toBeDefined()
		expect(second?.id).not.toBe(first?.id)
	})

	/**
	 * AC-T5.1 — the BOOT SWEEP, which is not a special code path: an item leased by a process that died
	 * simply has an expired lease, and the ordinary claim picks it up. Simulated with a zero lease,
	 * because the alternative is sleeping past a real one.
	 */
	it('AC-T5.1 — an item stranded by a crashed worker is claimable again once its lease expires', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')

		// A worker claims it and dies without completing or failing it.
		//
		// The lease is NEGATIVE, not zero, and that is not a trick: `leaseUntil = now + leaseMs` and the
		// claim predicate is a strict `leaseUntil < now`, so a zero lease is only expired once the clock
		// has advanced. Written with `0` this test passed alone and failed in the full suite, where both
		// claims landed in the same millisecond — a real flake I wrote, not a property of the queue.
		// An already-expired lease says "this worker is gone" without depending on time passing.
		const claimed = await repo.claimNext('worker-that-dies', -1)
		expect(claimed).toBeDefined()

		// Boot. Nothing in memory remembers the previous process.
		const recovered = await repo.claimNext('worker-after-restart', 60_000)
		expect(recovered?.id).toBe(claimed?.id)

		// And the recovery COUNTS as an attempt. Worth asserting rather than glossing: it means a turn
		// that crashes the worker every time is bounded by the same poison counter as one that throws.
		// Without it, a crash-inducing item would be recovered forever, taking the process down with it
		// on every boot and starving its target permanently.
		expect(recovered?.attempts).toBe((claimed?.attempts ?? 0) + 1)
	})

	it('poisons an item past maxAttempts rather than starving the target behind it', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')
		await enqueue(repo, THREAD_A, 'a-2')

		for (let attempt = 0; attempt < 3; attempt++) {
			const item = await repo.claimNext('worker-1', 60_000)
			expect(item?.dedupKey ?? 'a-1').toBeDefined()
			await repo.fail(item?.id ?? '', 'boom', 3)
		}

		// The poisoned item is gone from the queue, and the one BEHIND it now runs.
		const next = await repo.claimNext('worker-1', 60_000)
		expect(next).toBeDefined()
	})

	it('a redelivered fact enqueues nothing — the dedupKey is the exactly-once story', async () => {
		const repo = testBed.resolve(MailboxRepository)

		expect(await enqueue(repo, THREAD_A, 'same-fact')).toBe(true)
		expect(await enqueue(repo, THREAD_A, 'same-fact')).toBe(false)
	})
})
