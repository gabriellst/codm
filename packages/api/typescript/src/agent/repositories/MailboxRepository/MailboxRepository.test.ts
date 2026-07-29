import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { MailboxItemKind, MailboxTargetKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { MailboxRepository } from './MailboxRepository'

/**
 * The scheduler's semantics, which are the whole reason this table exists rather than "just trigger
 * a turn". Every assertion here corresponds to a failure an adversarial review of the design found in
 * the version WITHOUT a queue: duplicate turns from redelivery, two producers racing to fire, an item
 * stranded because the guard lived in memory, a poisoned item starving its target forever.
 */
describe('MailboxRepository — one turn per target, durable', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const THREAD_A = '00000000-0000-4000-8000-00000000aaaa'
	const THREAD_B = '00000000-0000-4000-8000-00000000bbbb'

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

	const repo = () => testBed.resolve(MailboxRepository)
	const item = (targetId: string, dedupKey: string, kind = MailboxItemKind.OPERATOR_MESSAGE) => ({
		ownerId: OPERATOR_ID,
		targetKind: MailboxTargetKind.THREAD,
		targetId,
		kind,
		payload: { note: dedupKey },
		dedupKey,
	})

	it('dedups by key — a redelivered fact queues nothing the second time', async () => {
		const r = repo()
		expect(await r.enqueue(item(THREAD_A, 'entry-1'))).toBe(true)
		// The redelivery. Without this, one at-least-once event becomes two turns and two messages in
		// someone's real conversation.
		expect(await r.enqueue(item(THREAD_A, 'entry-1'))).toBe(false)
		expect(await r.claimNext('w1', 60_000)).toBeDefined()
		expect(await r.claimNext('w1', 60_000)).toBeUndefined()
	})

	it('leases ONE item per target while letting other targets run in parallel', async () => {
		const r = repo()
		await r.enqueue(item(THREAD_A, 'a1'))
		await r.enqueue(item(THREAD_A, 'a2'))
		await r.enqueue(item(THREAD_B, 'b1'))

		const first = await r.claimNext('w1', 60_000)
		const second = await r.claimNext('w2', 60_000)
		// Two claims, two DIFFERENT targets — a2 waits behind a1, b1 does not wait at all.
		expect([first?.targetId, second?.targetId].sort()).toEqual([THREAD_A, THREAD_B].sort())
		expect(await r.claimNext('w3', 60_000)).toBeUndefined()
	})

	it('serves one target in insertion order, and only after the previous turn completes', async () => {
		const r = repo()
		await r.enqueue(item(THREAD_A, 'first'))
		await r.enqueue(item(THREAD_A, 'second'))

		const one = await r.claimNext('w1', 60_000)
		expect((one!.payload as { note: string }).note).toBe('first')
		expect(await r.claimNext('w1', 60_000)).toBeUndefined()

		await r.complete(one!.id)
		const two = await r.claimNext('w1', 60_000)
		expect((two!.payload as { note: string }).note).toBe('second')
	})

	it('an EXPIRED lease is reclaimable — a worker that died mid-turn does not strand its item', async () => {
		// The crash budget, and the reason the guard is a row and not a Set in memory: a restart forgets
		// an in-memory claim, and a subagent result that arrived just before a crash would never be
		// told to anyone.
		const r = repo()
		await r.enqueue(item(THREAD_A, 'orphan'))
		const claimed = await r.claimNext('dead-worker', -1)
		expect(claimed).toBeDefined()

		const reclaimed = await r.claimNext('live-worker', 60_000)
		expect(reclaimed?.id).toBe(claimed!.id)
		// Attempts count RUNS, so a retry is visible rather than silent.
		expect(reclaimed?.attempts).toBe(2)
	})

	it('poisons an item that keeps failing, instead of starving its target forever', async () => {
		const r = repo()
		await r.enqueue(item(THREAD_A, 'doomed'))
		await r.enqueue(item(THREAD_A, 'behind-it'))

		const doomed = await r.claimNext('w1', 60_000)
		await r.fail(doomed!.id, 'provider exploded', 1)

		// Dead, so the queue moves on to what was stuck behind it.
		const next = await r.claimNext('w1', 60_000)
		expect((next!.payload as { note: string }).note).toBe('behind-it')
	})

	it('a failure UNDER the cap is retried rather than poisoned', async () => {
		const r = repo()
		await r.enqueue(item(THREAD_A, 'flaky'))
		const first = await r.claimNext('w1', 60_000)
		await r.fail(first!.id, 'transient', 5)

		const retry = await r.claimNext('w1', 60_000)
		expect(retry?.id).toBe(first!.id)
		expect(retry?.attempts).toBe(2)
	})

	it('hasPending sees runnable work and stops seeing it once consumed', async () => {
		const r = repo()
		expect(await r.hasPending(MailboxTargetKind.THREAD, THREAD_A)).toBe(false)
		await r.enqueue(item(THREAD_A, 'p1'))
		expect(await r.hasPending(MailboxTargetKind.THREAD, THREAD_A)).toBe(true)
		const claimed = await r.claimNext('w1', 60_000)
		await r.complete(claimed!.id)
		expect(await r.hasPending(MailboxTargetKind.THREAD, THREAD_A)).toBe(false)
	})
})
