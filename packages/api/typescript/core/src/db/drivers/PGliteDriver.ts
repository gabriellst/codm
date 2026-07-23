import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
// Embed pglite's WASM runtime + FS bundle as files so `bun build --compile` (the Tauri daemon
// sidecar) inlines them into the single binary at /$bunfs. Imported via the `core/node_modules`
// symlink (a relative path, since pglite's package `exports` does NOT expose `./dist/*`). Resolves
// to the real on-disk asset in interpreter mode and to a /$bunfs path inside the compiled binary —
// see `compiledPgliteAssets` for why only the compiled path uses them.
import pgliteWasmPath from '../../../node_modules/@electric-sql/pglite/dist/pglite.wasm' with { type: 'file' }
import pgliteFsBundlePath from '../../../node_modules/@electric-sql/pglite/dist/pglite.data' with { type: 'file' }
import { UnitOfWork, UnitOfWorkFactory } from '../../services/UnitOfWork/UnitOfWork'
import type { DrizzleTransaction } from '../../services/UnitOfWork/DrizzleUnitOfWork'
import type { DrizzleClient } from '../client'
import { DrizzleDatabaseDriver, type MigrationJournal } from './DrizzleDatabaseDriver'
import { readMigrationJournal, readMigrationSql, truncateAllTables } from './utils'
import { acquireDataDirLock } from './DataDirLock'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

/**
 * PGlite is single-connection: running a query via `this.db` inside a `db.transaction()`
 * callback deadlocks. This UoW bypasses the real transaction and passes the db client
 * directly so that all operations share the same connection without locking.
 */
class PGliteUnitOfWork extends UnitOfWork<DrizzleTransaction> {
	constructor(private db: DrizzleClient) {
		super()
	}

	async transaction<Return>(fn: (tx: DrizzleTransaction) => Promise<Return>): Promise<Return> {
		return fn(this.db as DrizzleTransaction)
	}
}

class PGliteUnitOfWorkFactory extends UnitOfWorkFactory {
	constructor(private db: DrizzleClient) {
		super()
	}

	create(): UnitOfWork<DrizzleTransaction> {
		return new PGliteUnitOfWork(this.db)
	}
}

export interface PGliteDriverOptions {
	// biome-ignore lint/suspicious/noExplicitAny: schema record is app-defined
	schema: Record<string, any>
	/** Absolute path to the migrations directory (Drizzle output). */
	migrationsDir: string
	/**
	 * When set, PGlite is FILE-BACKED at this absolute path — the real daemon's embedded, persistent
	 * store (founder decision 3). Absent → in-memory (`memory://`), the ephemeral test/integration
	 * store reset per suite. The two modes also pick different migration strategies (see
	 * `runMigrations`): file-backed uses the idempotent drizzle migrator, in-memory execs all once.
	 */
	dataDir?: string
}

/**
 * PGlite asset options for a compiled single-file binary — or `undefined` in interpreter mode.
 *
 * `bun build --compile` (the Tauri `codedm-daemon` sidecar) produces a self-contained binary that
 * has NO node_modules at runtime, so pglite cannot lazily read `pglite.wasm` / `pglite.data` next to
 * its module — construction dies with `ENOENT: open '/$bunfs/root/pglite.data'`. The fix (proven by
 * the D2 spike, .specs/codedm/2026-07-23-fork-d2-spike.md) is to embed the two dist assets as files
 * and hand pglite pre-built handles. Adapted to the installed pglite 0.3.16, whose constructor
 * options are `wasmModule` (a `WebAssembly.Module`) + `fsBundle` (a `Blob`) — there is no separate
 * `initdb` asset here (0.5.4's `initdbWasmModule` does not exist in 0.3.16).
 *
 * GATED to the compiled binary: the imported paths start with `/$bunfs/` ONLY inside a compiled
 * binary; under bun dev / `bun:test` / the e2e webServer they resolve to the real on-disk asset and
 * this returns `undefined`, so PGlite is constructed EXACTLY as before — zero behavior change on the
 * interpreter path every test layer runs on. `new WebAssembly.Module(bytes)` compiles synchronously,
 * keeping the driver constructor synchronous (no async boot step).
 */
function compiledPgliteAssets(): { wasmModule: WebAssembly.Module; fsBundle: Blob } | undefined {
	if (!pgliteWasmPath.startsWith('/$bunfs/')) return undefined
	return {
		wasmModule: new WebAssembly.Module(readFileSync(pgliteWasmPath)),
		fsBundle: new Blob([readFileSync(pgliteFsBundlePath)]),
	}
}

export class PGliteDriver extends DrizzleDatabaseDriver {
	readonly db: DrizzleClient
	readonly unitOfWorkFactory: UnitOfWorkFactory
	private readonly pg: PGlite
	// Raw drizzle/pglite handle (statically typed) — the migrator needs the concrete PgliteDatabase,
	// not the app-facing DrizzleClient cast. `this.db` is the same object; kept separately to avoid
	// an `as any` at the migrate call site.
	private readonly migratorDb: ReturnType<typeof drizzle>
	private readonly migrationsDir: string
	private readonly dataDir?: string

	constructor(options: PGliteDriverOptions) {
		super()
		this.migrationsDir = options.migrationsDir
		this.dataDir = options.dataDir
		// A plain path selects PGlite's node filesystem backend (persistent); no arg is in-memory.
		// File-backed only: acquire a single-instance lock BEFORE opening. `new PGlite(dataDir)` takes
		// no OS advisory lock, so two daemons on one data dir would silently diverge — this fails the
		// second one loudly with DataDirLockedError. In-memory (tests) skip it.
		if (options.dataDir) acquireDataDirLock(options.dataDir)
		// `embedded` is undefined in interpreter mode → construct PGlite exactly as before. It is the
		// embedded {wasmModule,fsBundle} only inside a compiled binary (see compiledPgliteAssets).
		const embedded = compiledPgliteAssets()
		this.pg = embedded
			? options.dataDir
				? new PGlite(options.dataDir, embedded)
				: new PGlite(embedded)
			: options.dataDir
				? new PGlite(options.dataDir)
				: new PGlite()
		const db = drizzle({ client: this.pg, schema: options.schema })
		this.migratorDb = db
		this.db = db as unknown as DrizzleClient
		this.unitOfWorkFactory = new PGliteUnitOfWorkFactory(this.db)
	}

	async create(): Promise<DrizzleDatabaseDriver> {
		return this
	}

	async reset(): Promise<void> {
		await truncateAllTables(this.db)
	}

	async runMigrations(): Promise<void> {
		// File-backed (real daemon boot): idempotent + ordered. The drizzle migrator tracks applied
		// migrations in `drizzle.__drizzle_migrations` and runs ONLY the pending ones, so re-running on
		// every boot over a populated data dir is a no-op. PGlite is single-connection; the pglite-
		// specific migrator drives it correctly (no pool assumptions).
		if (this.dataDir) {
			await migrate(this.migratorDb, { migrationsFolder: this.migrationsDir })
			return
		}

		// In-memory (tests): the DB is fresh every process, so exec each migration once — no tracking
		// table needed. `pg.exec` runs the whole multi-statement file (statement-breakpoint markers are
		// plain SQL comments).
		const journal = await this.readMigrations()

		for (const entry of journal.entries) {
			await this.pg.exec(await readMigrationSql(this.migrationsDir, entry.tag))
		}
	}

	async readMigrations(): Promise<MigrationJournal> {
		return readMigrationJournal(this.migrationsDir)
	}

	async close(): Promise<void> {
		// no-op: singleton lifecycle is process-scoped, not per-suite
	}
}
