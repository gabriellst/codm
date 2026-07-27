// PruneOutbox — the retention sweep over the shared outbox.
//
// The interesting assertion is the NEGATIVE one: a row that never finished must survive being
// arbitrarily old. Once success became a tombstone instead of a delete, "old" stopped meaning
// "done", and a prune written against age alone would silently drop undelivered events.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { asc } from 'drizzle-orm'
import { TestBed } from '@test/support'
import { DrizzleClient, DrizzleDatabaseDriver } from '@codedm/core-typescript'
import { outbox } from '@codedm/contracts/db'
import { PruneOutbox } from './PruneOutbox'

const DAY_MS = 24 * 60 * 60 * 1000

describe('PruneOutbox (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient
	let driver: DrizzleDatabaseDriver
	let prune: PruneOutbox

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'prune-owner' })
		db = testBed.resolve(DrizzleClient)
		driver = testBed.resolve(DrizzleDatabaseDriver)
	})

	beforeEach(async () => {
		await testBed.reset()
		prune = testBed.resolve(PruneOutbox)
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	/** Writes go through the driver's write seam — `db` is the READ connection. */
	const seed = async (id: string, processedAt: Date | null, source = 'api') => {
		await driver.transaction(tx =>
			tx.insert(outbox).values({
				id,
				name: 'thread.message.appended',
				ownerId: 'prune-owner',
				source,
				payload: { name: 'thread.message.appended', id, time: new Date().toISOString(), payload: {} },
				processedAt,
			}),
		)
	}

	const remainingIds = async () => (await db.select({ id: outbox.id }).from(outbox).orderBy(asc(outbox.id))).map(r => r.id)

	it('deletes tombstones older than the window, keeps newer ones, and NEVER touches an unprocessed row', async () => {
		const now = Date.now()
		await seed('a-8-days-done', new Date(now - 8 * DAY_MS))
		await seed('b-6-days-done', new Date(now - 6 * DAY_MS))
		// 400 days old and still undelivered — pending, leased, or crash-looping. Deleting this is
		// dropping an event, which is why the predicate is `processed_at IS NOT NULL AND ... < cutoff`
		// and not age alone.
		await seed('c-400-days-pending', null)

		const result = await prune.execute({})

		expect(result).toEqual({ deleted: 1 })
		expect(await remainingIds()).toEqual(['b-6-days-done', 'c-400-days-pending'])
	})

	it('prunes terminal rows of EVERY lane — one janitor for a file two processes share', async () => {
		const old = new Date(Date.now() - 8 * DAY_MS)
		await seed('lane-api', old, 'api')
		await seed('lane-gateway', old, 'gateway')
		await seed('lane-integration', old, 'integration')

		expect(await prune.execute({})).toEqual({ deleted: 3 })
		expect(await remainingIds()).toEqual([])
	})

	it('is a no-op on an empty window', async () => {
		await seed('fresh', new Date())
		expect(await prune.execute({})).toEqual({ deleted: 0 })
		expect(await remainingIds()).toEqual(['fresh'])
	})
})
