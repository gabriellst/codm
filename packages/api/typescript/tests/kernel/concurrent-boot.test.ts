// CONCURRENT BOOT — the executable proof of decision (b)(4)'s TOCTOU correction.
//
// THE BUG THIS PINS. Both appliers (TS `LibsqlDriver.runMigrations`, Go `SqliteStore.applyMigrations`)
// run at boot, in whatever order the two processes happen to start, over ONE ledger in ONE file. The
// committed Go loop used to read the ledger OUTSIDE its write transaction, so two cold boots could
// both answer "not applied", serialize on `BEGIN IMMEDIATE`, and the LOSER would re-execute the file.
// That is fatal, not a no-op: migration 0000 is 25 `CREATE TABLE` with zero `IF NOT EXISTS`, and 0001
// is `ALTER TABLE shared_outbox ADD ...`. The correction is a RE-READ of the ledger as the first
// statement inside the write transaction (`applyOneMigration` here, `applyOne` in Go).
//
// A SEQUENTIAL TEST CANNOT SEE IT. "Go migrates, then TS opens" exercises the lock-free fast path on
// the second boot and never opens the window. Both appliers have to observe an EMPTY ledger before
// either takes the write lock — which is what the barrier in `scripts/apply-migrations-once.ts`
// arranges: every child pays its whole start-up cost, announces itself, and only then spins.
//
// WHY REAL PROCESSES, AND NOT TWO DRIVERS IN THIS ONE — MEASURED, not stylistic. `busy_timeout` on
// the local libsql client is a BLOCKING native wait: it parks the JS thread outright. Probe, two
// clients on one file, `busy_timeout = 3000`, a 50ms `setInterval` running across the wait:
//
//     WAITED_MS=3262   TIMER_TICKS_DURING_WAIT=0   ERROR=LibsqlError: SQLITE_BUSY
//
// Zero ticks — the event loop is frozen for the whole budget. So a second in-process driver does not
// "wait its turn": it freezes the loop that the HOLDER needs in order to reach its own COMMIT, and
// both end in SQLITE_BUSY after the full timeout (measured at 4 drivers: 96,418ms of wait, then
// SQLITE_BUSY ×3). That is not a defect this test should pin — it is the deadlock that
// `shared/index.ts` and `TestBed` already forbid by memoizing exactly ONE driver per process. The
// concurrency this phase actually ships is BETWEEN PROCESSES, where each waiter blocks only its own
// thread, so that is the only shape worth asserting.
//
// The cross-LANGUAGE shape (this applier racing the Go applier) lives in the Go twin,
// `core/db/sqlite/store_test.go` TestConcurrentBoot, which spawns the same helper script.
import { afterAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Drizzle tables created by migration 0000 — `grep -c 'CREATE TABLE' 0000_*.sql` ⇒ 25. */
const DRIZZLE_TABLE_COUNT = 25
/** Ledger rows after a full apply: one per `.sql` file (0000, 0001) — never 4, which is the bug. */
const MIGRATION_FILE_COUNT = 2
/** Racers per round. Three, so a bug that needs more than a pair to surface still has room. */
const RACERS = 3
/** Cold data dirs. The race is probabilistic, so it is repeated — the plan's T28 asks for 20. */
const ROUNDS = 20

const APPLIER_SCRIPT = join(import.meta.dir, '..', '..', 'scripts', 'apply-migrations-once.ts')

const tempDirs: string[] = []
function coldDataDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'codedm-concurrent-boot-'))
	tempDirs.push(dir)
	return dir
}

afterAll(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

/**
 * Read the file with the `sqlite3` CLI — a THIRD implementation, owned by neither applier.
 *
 * Deliberate: asking one of the racing drivers what happened lets the thing under test answer for
 * itself. (It is also the only reader available here: `@libsql/client` is a dependency of the
 * nested `core` package and does not resolve from this directory — measured; T25 hit the same shape
 * when staging the sidecar.)
 */
function query(dataDir: string, sql: string): string[] {
	const result = Bun.spawnSync({ cmd: ['sqlite3', join(dataDir, 'codedm.db'), sql] })
	if (result.exitCode !== 0) throw new Error(`sqlite3 failed: ${result.stderr.toString()}`)
	return result.stdout.toString().trim().split('\n').filter(Boolean)
}

/**
 * The post-conditions of a cold boot, whoever won the race — read, not asserted, so the whole
 * round compares as ONE value inside the `it` (and a failure prints every count at once).
 *
 * `foreignLedgers`: the drizzle migrator is forbidden on this file. Its bookkeeping table would be
 * a SECOND ledger the Go side cannot see, and it would re-apply everything from zero.
 */
function observe(dataDir: string) {
	return {
		ledgerRows: query(dataDir, 'SELECT name FROM _sqlite_migrations ORDER BY name').length,
		tables: query(
			dataDir,
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_sqlite_migrations' ORDER BY name",
		).length,
		foreignLedgers: query(dataDir, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'"),
	}
}

describe('concurrent boot over one shared ledger', () => {
	it(`applies each migration exactly once when ${RACERS} real PROCESSES race off a barrier (${ROUNDS} cold dirs)`, async () => {
		for (let round = 0; round < ROUNDS; round++) {
			const dataDir = coldDataDir()
			const startFile = join(dataDir, 'start')
			const readyFiles = Array.from({ length: RACERS }, (_, index) => join(dataDir, `ready-${index}`))

			const children = readyFiles.map(readyFile =>
				Bun.spawn({
					cmd: ['bun', APPLIER_SCRIPT, '--data-dir', dataDir, '--ready', readyFile, '--start', startFile],
					stdout: 'pipe',
					stderr: 'pipe',
				}),
			)

			// Release them only once EVERY child has finished booting and is spinning on the barrier.
			// Without this the first child would win by half a second and the rest would observe a
			// fully-applied ledger — a green round that raced nothing.
			const deadline = Date.now() + 60_000
			while (!readyFiles.every(file => existsSync(file))) {
				if (Date.now() > deadline) throw new Error(`round ${round}: children never reached the barrier`)
				await Bun.sleep(5)
			}
			writeFileSync(startFile, 'go')

			for (const child of children) {
				const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
				expect({ round, code, stderr }).toEqual({ round, code: 0, stderr: '' })
			}

			expect({ round, ...observe(dataDir) }).toEqual({
				round,
				ledgerRows: MIGRATION_FILE_COUNT,
				tables: DRIZZLE_TABLE_COUNT,
				foreignLedgers: [],
			})
		}
	}, 180_000)
})
