// DomainEventRepository.listByNameSince — the sweep read of the append-only event log, against a
// real SQLite file. Fixtures are backdated directly on the persisted `occurred_at` column
// (BaseEvent stamps `time` internally with no constructor override) for deterministic,
// sub-millisecond-safe placement relative to `since`.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { BaseDomainEvent, DomainEventRepository, DrizzleClient } from '@codedm/core-typescript'
import { events } from '@codedm/contracts/db'
import { TestBed, testId } from '@test/support'

// Two distinct event names — used to prove listByNameSince filters by `name`, not just by window.
// The runtime event name is the constructor name (BaseEvent sets `name = this.constructor.name`).
class TestListEvent extends BaseDomainEvent {}
class OtherListEvent extends BaseDomainEvent {}

// The event id is a content hash of the serialized event (name + payload + time). Fixtures that
// share a payload can collide on id within the same millisecond, so each gets a unique payload.
const makeTest = (entityId: string) => new TestListEvent({ entityId, ownerId: 'tenant-abc', payload: { itemId: entityId } as never })
const makeOther = (entityId: string) => new OtherListEvent({ entityId, ownerId: 'tenant-abc', payload: { itemId: entityId } as never })

describe('DomainEventRepository.listByNameSince (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: DomainEventRepository
	let db: DrizzleClient

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		repo = testBed.resolve(DomainEventRepository)
		db = testBed.resolve(DrizzleClient)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('returns only events with the given name at/after `since`, excluding earlier events and other names', async () => {
		const beforeWindow = makeTest(testId('event', 'before-window'))
		const inWindow = makeTest(testId('event', 'in-window'))
		const otherName = makeOther(testId('event', 'other-name'))

		await repo.save(beforeWindow)
		await repo.save(inWindow)
		await repo.save(otherName)

		const since = new Date('2026-01-01T00:00:00.000Z')
		await db
			.update(events)
			.set({ occurredAt: new Date('2025-12-31T23:59:59.999Z') })
			.where(eq(events.id, beforeWindow.id))
		await db
			.update(events)
			.set({ occurredAt: new Date('2026-01-02T00:00:00.000Z') })
			.where(eq(events.id, inWindow.id))
		await db
			.update(events)
			.set({ occurredAt: new Date('2026-01-02T00:00:00.000Z') })
			.where(eq(events.id, otherName.id))

		const result = await repo.listByNameSince('TestListEvent', since)

		expect(result.map(e => e.id)).toEqual([inWindow.id])
	})

	it('includes events exactly at `since` and orders multiple matches oldest-first', async () => {
		const olderInWindow = makeTest(testId('event', 'older-in-window'))
		const newerInWindow = makeTest(testId('event', 'newer-in-window'))

		await repo.save(olderInWindow)
		await repo.save(newerInWindow)

		const since = new Date('2026-01-01T00:00:00.000Z')
		await db.update(events).set({ occurredAt: since }).where(eq(events.id, olderInWindow.id))
		await db
			.update(events)
			.set({ occurredAt: new Date('2026-01-01T00:00:01.000Z') })
			.where(eq(events.id, newerInWindow.id))

		const result = await repo.listByNameSince('TestListEvent', since)

		expect(result.map(e => e.id)).toEqual([olderInWindow.id, newerInWindow.id])
	})
})
