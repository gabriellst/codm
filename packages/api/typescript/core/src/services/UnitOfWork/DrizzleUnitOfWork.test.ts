// DrizzleUnitOfWork — the write seam every use case goes through.
//
// Until the SQLite flip this class was, in production, a LIE: the file-backed driver's unit of
// work called the callback with the plain client and emitted no BEGIN, no COMMIT and no rollback.
// These three cases are what make the transaction real, and case 2 in particular is the one an
// adapter with a SYNCHRONOUS session would fail — it would COMMIT before the async body ran.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { sql } from 'drizzle-orm'
import * as schema from '@codm/contracts/db'
import { events } from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'
import { LibsqlDriver } from '../../db/drivers/LibsqlDriver'
import type { UnitOfWork } from './UnitOfWork'
import type { DrizzleTransaction } from './DrizzleUnitOfWork'

describe('DrizzleUnitOfWork', () => {
	let dir: string
	let driver: LibsqlDriver
	let uow: UnitOfWork<DrizzleTransaction>

	const countEvents = async (): Promise<number> => {
		const [row] = await driver.db.all<{ n: number }>(sql`SELECT count(*) AS n FROM shared_events`)
		return Number(row?.n ?? 0)
	}

	const insert = (tx: DrizzleTransaction, name: string) =>
		tx.insert(events).values({ id: crypto.randomUUID(), name, payload: {}, source: 'api' })

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'libsql-uow-test-'))
		driver = new LibsqlDriver({ schema, migrationsDir, dbPath: join(dir, 'codm.db') })
		await driver.runMigrations()
	})

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	beforeEach(async () => {
		await driver.reset()
		uow = driver.unitOfWorkFactory.create() as UnitOfWork<DrizzleTransaction>
	})

	it('rolls the whole transaction back when the callback throws', async () => {
		await expect(
			uow.transaction(async tx => {
				await insert(tx, 'uow.doomed')
				throw new Error('boom')
			}),
		).rejects.toThrow('boom')

		expect(await countEvents()).toBe(0)
	})

	it('waits for an ASYNC callback before committing', async () => {
		await uow.transaction(async tx => {
			await insert(tx, 'uow.first')
			await new Promise(resolve => setTimeout(resolve, 50))
			await insert(tx, 'uow.second')
		})

		// A sync-session adapter would have committed after the first statement and lost the second.
		expect(await countEvents()).toBe(2)
	})

	it('reads-your-writes through `tx`, and NOT through the read handle, mid-transaction', async () => {
		await uow.transaction(async tx => {
			await insert(tx, 'uow.inflight')
			const [inside] = await tx.all<{ n: number }>(sql`SELECT count(*) AS n FROM shared_events`)
			expect(Number(inside?.n)).toBe(1)
			// The injected DrizzleClient is the READ connection — it must still see the old state.
			expect(await countEvents()).toBe(0)
		})

		expect(await countEvents()).toBe(1)
	})
})
