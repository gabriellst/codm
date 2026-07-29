// LibsqlDriver — the SQLite substrate, tested against a REAL file on disk (never an in-memory
// database: memory is per-connection and would exercise neither WAL nor the second writer).
//
// Beyond the obvious migration/reset coverage, five of these cases exist to freeze the MECHANISM of
// decision (a). Asking the libsql client (or the drizzle session over it) to open a transaction for
// us breaks nothing a type checker or a functional test can see — it just leaks ~2 file descriptors
// per call and silently reverts the per-connection pragmas. So the tests below assert descriptor
// COUNT and pragma VALUES after N transactions, plus the read/write split in both directions.
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { is, sql } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from '@codedm/contracts/db'
import { migrationsDir } from '@codedm/contracts/db/migrations'
import { events } from '@codedm/contracts/db'
import { LibsqlDriver } from './LibsqlDriver'

/**
 * DERIVED from the schema module, not hardcoded — the assertion is that the applied MIGRATIONS and
 * the declared SCHEMA agree, which is what a literal here quietly stops testing the moment someone
 * bumps it to make the suite green.
 */
const TABLES_IN_SCHEMA = Object.values(schema).filter(v => is(v, SQLiteTable)).length

describe('LibsqlDriver', () => {
	let dir: string
	let dbPath: string
	let driver: LibsqlDriver

	const scalar = async (handle: { all: (q: never) => Promise<unknown[]> }, statement: string): Promise<unknown> => {
		// biome-ignore lint/suspicious/noExplicitAny: raw pragma read, shape is dialect-defined
		const [row] = (await (handle as any).all(sql.raw(statement))) as Record<string, unknown>[]
		return row ? Object.values(row)[0] : undefined
	}

	const insertEvent = async (name: string): Promise<void> => {
		await driver.transaction(async tx => {
			await tx.insert(events).values({
				id: crypto.randomUUID(),
				name,
				payload: {},
				source: 'api',
			})
		})
	}

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'libsql-driver-test-'))
		dbPath = join(dir, 'codedm.db')
		driver = new LibsqlDriver({ schema, migrationsDir, dbPath })
		await driver.runMigrations()
	})

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	beforeEach(async () => {
		await driver.reset()
	})

	it('applies every migration and creates the whole schema', async () => {
		const tables = await scalar(
			driver.db,
			"SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_sqlite_migrations'",
		)
		expect(Number(tables)).toBe(TABLES_IN_SCHEMA)

		const status = await driver.readMigrations()
		expect(status.applied.length).toBeGreaterThan(0)
		expect(status.pending).toEqual([])
	})

	it('is idempotent: a second runMigrations applies zero', async () => {
		await driver.runMigrations()
		const status = await driver.readMigrations()
		expect(status.pending.length).toBe(0)
	})

	it('never creates the drizzle migrator ledger', async () => {
		const drizzleLedger = await scalar(driver.db, "SELECT count(*) FROM sqlite_master WHERE name = '__drizzle_migrations'")
		expect(Number(drizzleLedger)).toBe(0)
	})

	it('applies the pragmas to the READ client', async () => {
		expect(Number(await scalar(driver.db, 'PRAGMA busy_timeout'))).toBe(5000)
		expect(Number(await scalar(driver.db, 'PRAGMA foreign_keys'))).toBe(0)
		expect(String(await scalar(driver.db, 'PRAGMA journal_mode'))).toBe('wal')
	})

	it('applies the pragmas to the WRITE client — the migration handle at 30000 was a THIRD one', async () => {
		// If runMigrations had raised the timeout on a regime connection instead of opening its own
		// short-lived handle, this would read 30000.
		await driver.transaction(async tx => {
			expect(Number(await scalar(tx, 'PRAGMA busy_timeout'))).toBe(5000)
			expect(Number(await scalar(tx, 'PRAGMA foreign_keys'))).toBe(0)
		})
	})

	it('reset wipes the tables and PRESERVES the migration ledger', async () => {
		await insertEvent('thread.reset_probe')
		expect(Number(await scalar(driver.db, 'SELECT count(*) FROM shared_events'))).toBe(1)

		const ledgerBefore = Number(await scalar(driver.db, 'SELECT count(*) FROM _sqlite_migrations'))
		expect(ledgerBefore).toBeGreaterThan(0)

		await driver.reset()

		expect(Number(await scalar(driver.db, 'SELECT count(*) FROM shared_events'))).toBe(0)
		// Load-bearing: runMigrations runs ONCE PER PROCESS, so a reset that dropped the ledger would
		// leave every later suite claiming an unmigrated schema over tables that are still there.
		expect(Number(await scalar(driver.db, 'SELECT count(*) FROM _sqlite_migrations'))).toBe(ledgerBefore)
		expect(Number(await scalar(driver.db, "SELECT count(*) FROM sqlite_master WHERE type = 'table'"))).toBeGreaterThan(TABLES_IN_SCHEMA)
	})

	it('close() is NON-destructive — the driver still answers afterwards', async () => {
		// Every suite's afterAll calls close(); the client lifecycle is process-scoped. If close()
		// actually closed the connection, the first suite would destroy the database for the other 26.
		await driver.close()
		await driver.close()
		expect(Number(await scalar(driver.db, 'SELECT 1'))).toBe(1)
		await insertEvent('thread.after_close')
		expect(Number(await scalar(driver.db, 'SELECT count(*) FROM shared_events'))).toBe(1)
	})

	describe('mechanism (decision (a))', () => {
		it('serializes concurrent write transactions FIFO instead of taking SQLITE_BUSY', async () => {
			const trace: string[] = []
			const results = await Promise.allSettled(
				Array.from({ length: 20 }, (_, i) =>
					driver.transaction(async tx => {
						trace.push(`${i}-start`)
						await tx.insert(events).values({
							id: crypto.randomUUID(),
							name: `gate.${i}`,
							payload: {},
							source: 'api',
						})
						await new Promise(resolve => setTimeout(resolve, 5))
						trace.push(`${i}-end`)
					}),
				),
			)

			expect(results.filter(r => r.status === 'rejected')).toEqual([])
			expect(Number(await scalar(driver.db, 'SELECT count(*) FROM shared_events'))).toBe(20)
			// Strict FIFO: every start is immediately followed by its own end — no interleaving.
			for (let i = 0; i < trace.length; i += 2) {
				expect(trace[i + 1]).toBe((trace[i] as string).replace('-start', '-end'))
			}
		})

		it('keeps file descriptors FLAT across 500 write transactions', async () => {
			const countFds = (): number | undefined => {
				try {
					const out = execSync(`lsof -p ${process.pid} 2>/dev/null || true`, { encoding: 'utf-8' })
					if (out.trim().length === 0) return undefined
					return out.split('\n').filter(line => line.includes(dbPath)).length
				} catch {
					return undefined
				}
			}

			const before = countFds()
			if (before === undefined) {
				// Never silently: an unmeasurable environment must SAY it did not measure.
				console.warn('SKIPPED fd-stability assertion: `lsof` is unavailable on this host')
				return
			}
			// POSITIVE CONTROL — without this, "lsof returned nothing" and "no descriptors leaked"
			// would be the same number and the assertion would pass having measured nothing.
			expect(before).toBeGreaterThan(0)

			for (let i = 0; i < 500; i += 1) await insertEvent(`fd.${i}`)

			// The banned path measured 4 → 1002 over the same 500 transactions, linear, no plateau.
			expect(countFds()).toBe(before)
		}, 120_000)

		it('keeps the pragmas STUCK on both regime clients after 200 write transactions', async () => {
			for (let i = 0; i < 200; i += 1) await insertEvent(`pragma.${i}`)

			expect(Number(await scalar(driver.db, 'PRAGMA busy_timeout'))).toBe(5000)
			expect(Number(await scalar(driver.db, 'PRAGMA foreign_keys'))).toBe(0)
			await driver.transaction(async tx => {
				expect(Number(await scalar(tx, 'PRAGMA busy_timeout'))).toBe(5000)
				expect(Number(await scalar(tx, 'PRAGMA foreign_keys'))).toBe(0)
			})
		}, 60_000)

		it('the READ client does not see uncommitted writes (the split is real)', async () => {
			await insertEvent('dirty.baseline')
			const baseline = Number(await scalar(driver.db, 'SELECT count(*) FROM shared_events'))

			await driver.transaction(async tx => {
				await tx.insert(events).values({
					id: crypto.randomUUID(),
					name: 'dirty.inflight',
					payload: {},
					source: 'api',
				})
				// Inside the open transaction: the write handle sees it, the read handle does not.
				expect(Number(await scalar(tx, 'SELECT count(*) FROM shared_events'))).toBe(baseline + 1)
				expect(Number(await scalar(driver.db, 'SELECT count(*) FROM shared_events'))).toBe(baseline)
			})
		})

		it('the READ client DOES see the write on the very next line after commit', async () => {
			// The mirror of the case above, and the property the product depends on: no sleep, no
			// reopened client, no pragma. If this were `no`, the console would show DISCONNECTED over
			// correct data — the exact symptom this phase exists to kill.
			await insertEvent('visibility.sentinel')
			const rows = await driver.db.select().from(events).where(sql`name = 'visibility.sentinel'`)
			expect(rows.length).toBe(1)
		})
	})
})
