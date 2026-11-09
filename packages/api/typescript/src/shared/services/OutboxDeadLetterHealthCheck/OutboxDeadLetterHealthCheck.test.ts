import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'
import * as schema from '@codm/contracts/db'
import { outbox } from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'
import { LibSqlDriver, removeTempDirWhenFree } from '@codm/core-typescript'
import { OutboxDeadLetterHealthCheck, deadLetterCountQuery } from './OutboxDeadLetterHealthCheck'

/**
 * The shell's supervision calls `/health` every 5s and the daemon's libsql driver is synchronous, so
 * whatever this check costs, the whole event loop pays it on every probe. As a full scan of the
 * outbox (~278k tombstones on 2026-11-09) it kept the daemon deaf for ~31% of a night. Pin the PLAN
 * of the exact query the check runs, not just the index's existence: a rewrite that stops matching
 * the partial index's predicate would bring the scan back with nothing failing.
 *
 * A DRIVER OF ITS OWN, over its own temp file — not the TestBed's shared one. `EXPLAIN QUERY PLAN`
 * through the libsql client leaves its statement un-finalized, which pins a read snapshot on that
 * connection; on the shared driver every later suite in the process then failed its writes with
 * SQLITE_BUSY_SNAPSHOT. Here the pinned snapshot dies with this file.
 */
describe('OutboxDeadLetterHealthCheck — the 5s probe never scans the outbox', () => {
	let dir: string
	let driver: LibSqlDriver

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'outbox-dead-letter-check-'))
		driver = new LibSqlDriver({ schema, migrationsDir, dbPath: join(dir, 'test.db') })
		await driver.runMigrations()
	})
	beforeEach(async () => {
		await driver.reset()
	})
	afterAll(() => {
		removeTempDirWhenFree(dir)
	})

	it('reports how many letters are dead, and only those', async () => {
		const row = (id: string, deadAt: Date | null) => ({ id, name: 'test.event', payload: {}, source: 'test', deadAt })
		await driver.db.insert(outbox).values([row('alive-1', null), row('alive-2', null), row('dead-1', new Date())])

		const report = await new OutboxDeadLetterHealthCheck(driver.db).check()

		expect(report).toEqual({ status: 'up', gate: false, detail: '1' })
	})

	// Last on purpose: see the docblock — the EXPLAIN pins a read snapshot on this file's driver.
	it('counts through the partial outbox_dead_at_idx index', async () => {
		const query = deadLetterCountQuery(driver.db).toSQL()
		expect(query.params).toEqual([])

		const plan = await driver.db.all<{ detail: string }>(sql.raw(`EXPLAIN QUERY PLAN ${query.sql}`))
		const details = plan.map(row => row.detail).join(' | ')

		expect(details).toContain('outbox_dead_at_idx')
		expect(details).not.toMatch(/SCAN shared_outbox(?! USING)/)
	})
})
