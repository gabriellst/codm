import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { BaseDomainEvent, DomainEventRepository, z } from '@codedm/core-typescript'
import { TestBed } from './TestBed'
import { testId } from './ids'

// Test event — self-contained, no FK dependencies. This file tests the probe reading what the
// DomainEventRepository dual-wrote (events + outbox), not the repository itself.
const TestEventSchema = z.domainEvent({
	itemId: z.string(),
})

class ProbeTestEvent extends BaseDomainEvent<typeof TestEventSchema> {
	static override readonly name = 'probe.test.created' as const
	static readonly schema = TestEventSchema
}

function makeEvent(overrides?: { entityId?: string; ownerId?: string; itemId?: string }): ProbeTestEvent {
	return new ProbeTestEvent({
		entityId: overrides?.entityId ?? testId('probe', 'entity-1'),
		ownerId: overrides?.ownerId ?? 'probe-tenant',
		payload: { itemId: overrides?.itemId ?? 'item-1' },
	})
}

describe('PersistenceProbe', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let domainEventRepository: DomainEventRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		domainEventRepository = testBed.resolve(DomainEventRepository)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('throws in mock mode — no real DrizzleClient to read from', async () => {
		const mockContainer = container.createChildContainer()
		const mockBed = await TestBed.create('mock', { testContainer: mockContainer })
		expect(() => mockBed.probe()).toThrow(/integration mode/)
	})

	it('persistedEvents/outboxRows read what DomainEventRepository.save() dual-wrote', async () => {
		const event = makeEvent()
		await domainEventRepository.save(event)

		const eventRows = await testBed.probe().persistedEvents({ name: ProbeTestEvent.name })
		const outboxRows = await testBed.probe().outboxRows({ name: ProbeTestEvent.name })

		expect(eventRows).toHaveLength(1)
		expect(eventRows[0]!.id).toBe(event.id)
		expect(outboxRows).toHaveLength(1)
		expect(outboxRows[0]!.id).toBe(event.id)
	})

	it('persistedEvents filters by entityId (uuid column) and ownerId', async () => {
		const target = testId('probe', 'target')
		// Distinct payloads: BaseEvent.id hashes {name, payload, time} (entityId is stamped after
		// super()), so two same-payload events created within the same ISO-millisecond collide on
		// events_pkey — a real flake under full-suite CPU contention.
		await domainEventRepository.save(makeEvent({ entityId: target, itemId: 'item-target' }))
		await domainEventRepository.save(makeEvent({ entityId: testId('probe', 'other'), itemId: 'item-other' }))

		const rows = await testBed.probe().persistedEvents({ name: ProbeTestEvent.name, entityId: target })
		expect(rows).toHaveLength(1)
		expect(rows[0]!.entityId).toBe(target)
	})

	it('count() matches the row counts for the registered ProbeTable entries it can reach unfiltered', async () => {
		await domainEventRepository.save(makeEvent({ entityId: testId('probe', 'e1'), itemId: 'item-e1' }))
		await domainEventRepository.save(makeEvent({ entityId: testId('probe', 'e2'), itemId: 'item-e2' }))

		const probe = testBed.probe()
		expect(await probe.count('events', { name: ProbeTestEvent.name })).toBe(2)
		expect(await probe.count('outbox', { name: ProbeTestEvent.name })).toBe(2)
	})

	describe('snapshot() — typed cross-table count', () => {
		it('returns a count per requested table, keyed exactly by the tuple passed in (runtime)', async () => {
			// DISTINCT events, following the convention the `count()` test above already uses — and not an
			// incidental style choice. `BaseEvent.id` is CONTENT-ADDRESSED (`Id.fromSeed(this.serialize())`,
			// `core/src/types/BaseEvent.ts:22`), and the only varying input across two bare `makeEvent()`
			// calls is `time`, at millisecond resolution. Two byte-identical events saved within the same
			// millisecond therefore hash to the SAME id and the second insert dies on
			// `UNIQUE constraint failed: shared_events.id` — a race this suite lost intermittently
			// (reproduced roughly 1 run in 3, in isolation as well as inside the full suite).
			//
			// The assertions below are UNCHANGED: this fixes the FIXTURE, not the expectation. Saving one
			// event twice and demanding two rows contradicts content-addressed ids, which exist precisely
			// so that a redelivered event is idempotent instead of duplicated.
			await domainEventRepository.save(makeEvent({ entityId: testId('probe', 'snap-1'), itemId: 'item-snap-1' }))

			const before = await testBed.probe().snapshot(['events', 'outbox', 'users'] as const)
			await domainEventRepository.save(makeEvent({ entityId: testId('probe', 'snap-2'), itemId: 'item-snap-2' }))
			const after = await testBed.probe().snapshot(['events', 'outbox', 'users'] as const)

			expect(after.events).toBe(before.events + 1)
			expect(after.outbox).toBe(before.outbox + 1)
			// Proof of a negative — nothing in this test writes authentication users.
			expect(after.users).toBe(before.users)
		})

		it('spans MORE THAN ONE schema module — proof the registry is no longer a curated single-module list', async () => {
			const snap = await testBed.probe().snapshot(['events', 'users'] as const)

			// Compile-time proof: this assignment only type-checks if `snap` is exactly
			// `{ 'events': number; 'users': number }` — a wider
			// `Record<string, number>` or a `Record` missing/adding a key would fail `tsc` here.
			const typed: { events: number; users: number } = snap
			expect(typed.events).toBeGreaterThanOrEqual(0)
			expect(typed.users).toBeGreaterThanOrEqual(0)
		})

		it('is TYPED — the return shape is derived from the literal tuple, not a loose Record (compile-time)', async () => {
			const snap = await testBed.probe().snapshot(['events', 'outbox'] as const)

			const typed: { events: number; outbox: number } = snap
			expect(typed.events).toBeGreaterThanOrEqual(0)
			expect(typed.outbox).toBeGreaterThanOrEqual(0)

			// @ts-expect-error — 'users' was never requested, so it must not exist on the type.
			const _missingKey = snap.users
		})
	})
})
