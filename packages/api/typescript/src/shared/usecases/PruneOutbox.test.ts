// PruneOutbox — the retention sweep over the shared outbox.
//
// The interesting assertion is the NEGATIVE one: a row that never finished must survive being
// arbitrarily old. Once success became a tombstone instead of a delete, "old" stopped meaning
// "done", and a prune written against age alone would silently drop undelivered events.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { resolveJobCadence } from '@codm/core-typescript'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { outbox } from '@codm/contracts/db'
import { PruneOutbox } from './PruneOutbox'

const DAY_MS = 24 * 60 * 60 * 1000

describe('PruneOutbox (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let driver: LibSqlDatabaseDriver
	let prune: PruneOutbox

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'prune-owner' })
		driver = testBed.resolve(LibSqlDatabaseDriver)
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

	// Reads go through the probe — the ONE seam authorized to resolve the driver for reads
	// (tests/architecture/probe-discipline). Writes above use the driver's write seam, which is the
	// sanctioned raw-DB use for a seed.
	const remainingIds = async () => (await testBed.probe().outboxRows()).map(row => row.id).sort((a, b) => a.localeCompare(b))

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

/**
 * THE CADENCE, asserted where the job lives.
 *
 * This came out of `tests/architecture/job-cadence.test.ts` JOB-02 on 2026-08-18. That rail proves
 * the STRUCTURAL rule — a cadence lives on the job, never in the barrel — and it proved it by
 * importing three concrete job classes from three different contexts, which made a portable rail
 * depend on this product having those three jobs. The structural half stayed there and is now
 * derived from the barrels; this half, "MY cadence is exactly this", is product knowledge and
 * belongs with the job it describes.
 *
 * It is not redundant with the rail: the rail can only check that SOME cadence exists. Only this
 * assertion catches the value silently changing — an hour becoming a millisecond keeps every
 * structural check green while hammering the database.
 */
describe('PruneOutbox — cadence', () => {
	it('repeats daily', () => {
		expect(resolveJobCadence({ handler: PruneOutbox })).toEqual({ every: 24 * 60 * 60 * 1000 })
	})
})
