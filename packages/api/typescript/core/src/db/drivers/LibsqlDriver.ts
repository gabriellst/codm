import { mkdtempSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { UnitOfWorkFactory } from '../../services/UnitOfWork/UnitOfWork'
import { DrizzleUnitOfWorkFactory, type DrizzleTransaction } from '../../services/UnitOfWork/DrizzleUnitOfWork'
import type { DrizzleClient } from '../client'
import { DrizzleDatabaseDriver, type MigrationStatus } from './DrizzleDatabaseDriver'
import { resetAllTables } from './utils'

/** Regime write-wait budget, in ms — parity with the Go gateway's regime DSN (`store.go`). */
const REGIME_BUSY_TIMEOUT_MS = 5000
/** Migration write-wait budget, in ms — parity with the Go migration DSN (`store.go`). */
const MIGRATION_BUSY_TIMEOUT_MS = 30000
/** A migration that waited longer than the REGIME timeout is worth a line in the log. */
const MIGRATION_SLOW_WAIT_MS = REGIME_BUSY_TIMEOUT_MS

/**
 * VERBATIM the DDL the Go applier runs (`core/db/sqlite/store.go`). The two strings being
 * byte-identical is what makes "one ledger, two writers" true — `CREATE TABLE IF NOT EXISTS`
 * makes whoever loses the race a no-op instead of an error, so whoever wins DEFINES the shape.
 */
const LEDGER_DDL = 'CREATE TABLE IF NOT EXISTS _sqlite_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)'

/**
 * Open a client and pragma it, in this exact order — the order is load-bearing, not style:
 *
 *  1. `busy_timeout` FIRST, because turning WAL on can itself contend when the Go gateway is
 *     holding the file, and the libsql default here is 0 (measured) — it would fail on the spot
 *     instead of waiting.
 *  2. `journal_mode` — the only one of the three that is a property of the FILE rather than of
 *     the connection, but still asserted: in the test harness it is the TS side that CREATES the
 *     file and the libsql default is `delete`, i.e. no WAL, i.e. no multi-process safety at all.
 *  3. `foreign_keys` OFF, matching `core/db/sqlite/store.go` — the squashed migration creates 25
 *     tables in arbitrary order and the Go domain pool keeps them off for exactly that reason.
 *     The libsql default is ON (measured), so leaving it alone would silently diverge from Go.
 *
 * Pragmas are PER CONNECTION and there is no inheritance, so every client opened here is
 * pragma'd individually — including both regime clients.
 *
 * Synchronous on purpose. The local libsql driver is a blocking native call behind an async
 * signature: `client.execute()` runs the statement before it returns its promise, so all three
 * are in force the moment this function returns even though nothing awaited them. The promises
 * are still handed back so a pragma FAILURE surfaces on the first write instead of turning into
 * an unhandled rejection.
 *
 * `busyTimeoutMs` exists for exactly one caller: the short-lived migration handle, which needs
 * 30s while the two regime handles stay at 5s (again: per connection, so "raise it just for the
 * migration" is only expressible as another connection).
 */
function openClient(url: string, busyTimeoutMs: number = REGIME_BUSY_TIMEOUT_MS): { client: Client; ready: Promise<unknown> } {
	const client = createClient({ url })
	const ready = Promise.all([
		client.execute(`PRAGMA busy_timeout = ${busyTimeoutMs}`),
		client.execute('PRAGMA journal_mode = WAL'),
		client.execute('PRAGMA foreign_keys = OFF'),
	])
	return { client, ready }
}

/**
 * FIFO async mutex. One open write transaction per process.
 *
 * The reason is NOT nested BEGINs (there are none) and NOT dirty reads (the dedicated read client
 * handles that). It is that two overlapping `BEGIN IMMEDIATE` statements race for the single
 * SQLite write lock and the loser takes SQLITE_BUSY; serializing them makes the order
 * deterministic and observable instead. Reads never pass through here.
 */
class TxGate {
	#tail: Promise<unknown> = Promise.resolve()

	run<Return>(fn: () => Promise<Return>): Promise<Return> {
		const result = this.#tail.then(fn, fn)
		this.#tail = result.then(
			() => {},
			() => {},
		)
		return result
	}
}

/** Process-scoped temp database path, minted once — see the `close()` note on lifecycle. */
let processTempDbPath: string | undefined
function processScopedTempDbPath(): string {
	if (!processTempDbPath) {
		processTempDbPath = join(mkdtempSync(join(tmpdir(), 'codedm-sqlite-')), 'codedm-test.db')
	}
	return processTempDbPath
}

export interface LibsqlDriverOptions {
	// biome-ignore lint/suspicious/noExplicitAny: schema record is app-defined
	schema: Record<string, any>
	/** Absolute path to the migrations directory (drizzle-kit output for the sqlite dialect). */
	migrationsDir: string
	/**
	 * Absolute path to the database FILE — for the real daemon, `<CODEDM_DATA_DIR>/codedm.db`, the
	 * very same file the Go gateway opens. Absent ⇒ a process-scoped temporary file on disk.
	 * Never an in-memory database: memory is per-connection, so it would exercise neither WAL nor
	 * the second writer, which are the two properties this driver exists to get right.
	 */
	dbPath?: string
}

/**
 * The SQLite substrate of the daemon: two long-lived connections over one shared WAL file.
 *
 * TWO CLIENTS, MANUAL BEGIN. The driver never asks the libsql client (nor the drizzle session
 * that wraps it, `drizzle-orm/libsql/session.cjs:86`) to open a transaction for us. That path
 * hands its native connection to the transaction object and never reclaims it, and it is
 * measured, not theorised — `.plans/artifacts/2026-07-26-tx-concurrency-gate.md`, on the shipped
 * `@libsql/client@0.17.4`:
 *
 *     FD_BASELINE=4                          FD_AFTER_500_TX_API=1002    (fd leak, linear, no plateau)
 *     FD_AFTER_500_MANUAL=4                  (this driver's mechanism: flat)
 *     PRAGMA_AFTER_TX_API_BUSY_TIMEOUT=0     PRAGMA_AFTER_TX_API_FOREIGN_KEYS=1
 *
 * ~2 leaked file descriptors per call and a silent revert of every per-connection pragma to the
 * raw libsql defaults, with no error and no failing type. So: WE emit `BEGIN IMMEDIATE` /
 * `COMMIT` / `ROLLBACK` on a dedicated write connection, behind {@link TxGate}. Because that
 * connection is never rotated, the pragmas stick for its whole life (re-measured after 200
 * transactions: busy_timeout 5000, foreign_keys 0) and descriptors stay flat.
 *
 * THE READ/WRITE SPLIT IS LOAD-BEARING, and it is created BY that correction. With the write
 * connection stable, a read issued on it during an open transaction sees uncommitted state
 * (measured: DIRTY_READ_ON_WRITE_CLIENT=yes) and that value leaks into another request. Hence a
 * SECOND, dedicated read connection, which is what the abstract `db` member exposes and what the
 * composition root binds to the `DrizzleClient` token — every HTTP/BFF read lands there
 * (measured: DIRTY_READ_ON_READ_CLIENT=no, and it does see committed writes with 0ms lag, from
 * this process and from the Go gateway alike).
 *
 * NOT PROVIDED, deliberately: rollback-to-savepoint and nested transactions. Driving BEGIN by
 * hand bypasses drizzle's transaction bookkeeping, so a `tx.rollback()` would not work — throw
 * instead. There are zero call sites of it in the repo today; this note is what keeps that true.
 */
export class LibsqlDriver extends DrizzleDatabaseDriver {
	readonly db: DrizzleClient
	readonly unitOfWorkFactory: UnitOfWorkFactory

	readonly #url: string
	readonly #migrationsDir: string
	readonly #writeClient: Client
	readonly #readClient: Client
	/** The write-side drizzle handle. NEVER exposed — it only reaches callers as the `tx` argument. */
	readonly #write: DrizzleTransaction
	readonly #gate = new TxGate()
	readonly #pragmasReady: Promise<unknown>

	constructor(options: LibsqlDriverOptions) {
		super()
		this.#migrationsDir = options.migrationsDir
		this.#url = `file:${options.dbPath ?? processScopedTempDbPath()}`

		// NO LOCK HERE. Single-owner-of-the-FILE is exactly what this phase deletes: the Go gateway
		// opens the same file on purpose. The single-instance-per-ROLE lock lives in src/boot.ts.
		const write = openClient(this.#url)
		const read = openClient(this.#url)
		this.#writeClient = write.client
		this.#readClient = read.client
		this.#pragmasReady = Promise.all([write.ready, read.ready])
		// Keep the rejection observable via `await this.#pragmasReady` (in transaction()) without
		// also tripping the unhandled-rejection warning before the first write happens.
		void this.#pragmasReady.catch(() => {})

		this.#write = drizzle({ client: this.#writeClient, schema: options.schema }) as unknown as DrizzleTransaction
		this.db = drizzle({ client: this.#readClient, schema: options.schema }) as unknown as DrizzleClient
		this.unitOfWorkFactory = new DrizzleUnitOfWorkFactory(this)
	}

	/**
	 * The one and only write path.
	 *
	 * OWNERSHIP RULE, inside the callback: every statement uses the `tx` parameter; none uses
	 * `this.db`. `this.db` is the READ connection and sits OUTSIDE the `BEGIN IMMEDIATE` — a write
	 * through it opens an implicit transaction outside the gate, and, more quietly, a READ through
	 * it observes pre-transaction state with no error at all. That second shape is the one a claim
	 * loop commits by accident (`SELECT ids → UPDATE lease → SELECT rows` with one SELECT on the
	 * wrong handle re-hands the same row to two cycles). `tests/architecture/tx-discipline.test.ts`
	 * enforces this; this docblock is the rule it enforces.
	 */
	transaction<Return>(fn: (tx: DrizzleTransaction) => Promise<Return>): Promise<Return> {
		return this.#gate.run(async () => {
			await this.#pragmasReady
			await this.#writeClient.execute('BEGIN IMMEDIATE')
			try {
				const out = await fn(this.#write)
				await this.#writeClient.execute('COMMIT')
				return out
			} catch (error) {
				try {
					await this.#writeClient.execute('ROLLBACK')
				} catch {
					// The transaction is already gone (or the connection is); the original error wins.
				}
				throw error
			}
		})
	}

	async create(): Promise<DrizzleDatabaseDriver> {
		return this
	}

	async reset(): Promise<void> {
		await this.transaction(tx => resetAllTables(tx))
	}

	/**
	 * Apply every migration file not yet recorded in the shared ledger, in lexical filename order,
	 * each in its own transaction. Idempotent and symmetric with the Go applier: both processes run
	 * it at boot in whatever order they happen to start, the first applies, the second applies zero.
	 *
	 * The drizzle migrator is FORBIDDEN here — it keeps a bookkeeping table of its own, which would
	 * be a second ledger on a file that already has one (and the Go side would never see it).
	 *
	 * A DEDICATED short-lived handle does the whole pass. Pragmas are per connection, so raising
	 * the write-wait budget "just for migrations" is only expressible as another connection; the
	 * two regime clients are never re-pragma'd, and this one is closed before any application query
	 * runs.
	 */
	async runMigrations(): Promise<void> {
		// 30000ms for this handle, against the regime 5000ms — parity with the Go migration DSN.
		const migration = openClient(this.#url, MIGRATION_BUSY_TIMEOUT_MS)
		try {
			await migration.ready
			await migration.client.execute(LEDGER_DDL)

			for (const name of await this.#migrationFiles()) {
				// Lock-free fast path — cheap, and NOT authoritative. The authoritative check is the
				// re-read inside the write transaction below; do not "simplify" it into the only one.
				const seen = await migration.client.execute({
					sql: 'SELECT 1 FROM _sqlite_migrations WHERE name = ?',
					args: [name],
				})
				if (seen.rows.length > 0) continue

				const startedAt = Date.now()
				await applyOneMigration(migration.client, this.#migrationsDir, name)
				const waited = Date.now() - startedAt
				if (waited > MIGRATION_SLOW_WAIT_MS) {
					console.warn(`sqlite driver: migration ${name} waited ${waited}ms on another writer (past the regime busy_timeout)`)
				}
			}
		} finally {
			migration.client.close()
		}
	}

	/** Ledger state: what is recorded as applied, and what is on disk but not recorded yet. */
	async readMigrations(): Promise<MigrationStatus> {
		const onDisk = await this.#migrationFiles()

		const ledgerExists = await this.#readClient.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_sqlite_migrations'")
		if (ledgerExists.rows.length === 0) return { applied: [], pending: onDisk }

		const ledger = await this.#readClient.execute('SELECT name FROM _sqlite_migrations ORDER BY name')
		const applied = ledger.rows.map(row => String(row.name))
		const appliedSet = new Set(applied)
		return { applied, pending: onDisk.filter(name => !appliedSet.has(name)) }
	}

	/**
	 * Deliberately NOT destructive, and deliberately NOT closing the clients.
	 *
	 * `bun test` runs every suite in ONE process with shared module state, `TestBed` memoizes the
	 * driver in a static and migrates once for the whole process, and EVERY suite registers a
	 * teardown that calls this. If it actually closed the connections (or removed the temp dir),
	 * the first suite's `afterAll` would destroy the database the other 26 still need. The client
	 * lifecycle is PROCESS-scoped, not suite-scoped; isolation between suites comes from `reset()`.
	 *
	 * If real shutdown is ever wanted, the shape is a refcount that closes at zero, with the temp
	 * dir removal moved to `process.on('exit')` — never here.
	 */
	close(): Promise<void> {
		// no-op: process-scoped lifecycle (see docblock)
		return Promise.resolve()
	}

	async #migrationFiles(): Promise<string[]> {
		// Derived by readdir → filter .sql → sort, exactly like the Go side — NOT from drizzle-kit's
		// `meta/_journal.json`, which is build-time bookkeeping and stays out of the runtime.
		const entries = await readdir(this.#migrationsDir)
		return entries.filter(name => name.endsWith('.sql')).sort()
	}
}

/**
 * One migration file's statements plus its ledger row, all-or-nothing.
 *
 * The FIRST thing inside the transaction is a RE-READ of the ledger. `BEGIN IMMEDIATE` takes the
 * write lock up front, so from that point the answer cannot change: the other process is either
 * already recorded (we skip) or blocked behind us (it will skip). Without this, two boots that
 * both passed the lock-free pre-check would BOTH execute the file — and migration 0000 is 25
 * `CREATE TABLE` with no `IF NOT EXISTS`, 0001 is `ALTER TABLE ... ADD`, so re-execution is fatal,
 * not a no-op.
 */
async function applyOneMigration(client: Client, migrationsDir: string, name: string): Promise<void> {
	await client.execute('BEGIN IMMEDIATE')
	try {
		const seen = await client.execute({
			sql: 'SELECT 1 FROM _sqlite_migrations WHERE name = ?',
			args: [name],
		})
		if (seen.rows.length === 0) {
			const raw = await readFile(join(migrationsDir, name), 'utf-8')
			for (const chunk of raw.split('--> statement-breakpoint')) {
				const statement = chunk.trim()
				if (statement.length > 0) await client.execute(statement)
			}
			await client.execute({
				sql: 'INSERT INTO _sqlite_migrations (name, applied_at) VALUES (?, ?)',
				args: [name, Date.now()],
			})
		}
		await client.execute('COMMIT')
	} catch (error) {
		try {
			await client.execute('ROLLBACK')
		} catch {
			// already rolled back / connection gone — the original error is the useful one
		}
		throw error
	}
}
