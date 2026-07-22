import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { BaseDomainEvent, DomainEventRepository, z } from '@template/core-typescript'
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
		await domainEventRepository.save(makeEvent({ entityId: target }))
		await domainEventRepository.save(makeEvent({ entityId: testId('probe', 'other') }))

		const rows = await testBed.probe().persistedEvents({ name: ProbeTestEvent.name, entityId: target })
		expect(rows).toHaveLength(1)
		expect(rows[0]!.entityId).toBe(target)
	})

	it('count() matches the row counts for the registered ProbeTable entries it can reach unfiltered', async () => {
		await domainEventRepository.save(makeEvent({ entityId: testId('probe', 'e1') }))
		await domainEventRepository.save(makeEvent({ entityId: testId('probe', 'e2') }))

		const probe = testBed.probe()
		expect(await probe.count('shared.events', { name: ProbeTestEvent.name })).toBe(2)
		expect(await probe.count('shared.outbox', { name: ProbeTestEvent.name })).toBe(2)
	})

	describe('snapshot() — typed cross-table count', () => {
		it('returns a count per requested table, keyed exactly by the tuple passed in (runtime)', async () => {
			await domainEventRepository.save(makeEvent())

			const before = await testBed.probe().snapshot(['shared.events', 'shared.outbox', 'authentication.users'] as const)
			await domainEventRepository.save(makeEvent())
			const after = await testBed.probe().snapshot(['shared.events', 'shared.outbox', 'authentication.users'] as const)

			expect(after['shared.events']).toBe(before['shared.events'] + 1)
			expect(after['shared.outbox']).toBe(before['shared.outbox'] + 1)
			// Proof of a negative — nothing in this test writes authentication users.
			expect(after['authentication.users']).toBe(before['authentication.users'])
		})

		it('spans MORE THAN ONE schema module — proof the registry is no longer a curated single-module list', async () => {
			const snap = await testBed.probe().snapshot(['shared.events', 'authentication.users'] as const)

			// Compile-time proof: this assignment only type-checks if `snap` is exactly
			// `{ 'shared.events': number; 'authentication.users': number }` — a wider
			// `Record<string, number>` or a `Record` missing/adding a key would fail `tsc` here.
			const typed: { 'shared.events': number; 'authentication.users': number } = snap
			expect(typed['shared.events']).toBeGreaterThanOrEqual(0)
			expect(typed['authentication.users']).toBeGreaterThanOrEqual(0)
		})

		it('is TYPED — the return shape is derived from the literal tuple, not a loose Record (compile-time)', async () => {
			const snap = await testBed.probe().snapshot(['shared.events', 'shared.outbox'] as const)

			const typed: { 'shared.events': number; 'shared.outbox': number } = snap
			expect(typed['shared.events']).toBeGreaterThanOrEqual(0)
			expect(typed['shared.outbox']).toBeGreaterThanOrEqual(0)

			// @ts-expect-error — 'authentication.users' was never requested, so it must not exist on the type.
			const _missingKey = snap['authentication.users']
		})
	})
})
