import { sql } from 'drizzle-orm'
import type { LibSqlTransaction } from '../LibSqlDatabaseDriver'

/**
 * Wipe every application table, preserving the schema and the migration ledger.
 *
 * SQLite has neither the bulk-empty statement Postgres offers nor schema namespaces, so the
 * pg-era PL/pgSQL sweep is gone: we enumerate `sqlite_master` and `DELETE FROM` each table. Two
 * exclusions, both load-bearing:
 *
 * - `sqlite_%` — SQLite's own internal tables (`sqlite_sequence`, `sqlite_stat*`); they are not
 *   writable by DELETE in the general case. `sqlite_sequence` IS emptied explicitly below, and
 *   only when it exists (it is created lazily, by the first AUTOINCREMENT table).
 * - `_sqlite_migrations` — the shared ledger. `runMigrations()` runs ONCE PER PROCESS (TestBed
 *   memoizes the driver and migrates a single time), so a reset that dropped the ledger rows
 *   would leave every later suite running against a schema nobody re-created — the tables would
 *   still be there, the ledger would claim they are not, and a second boot would try to
 *   re-execute `CREATE TABLE` and die.
 *
 * Runs INSIDE a caller-provided write transaction — it is a write, and the ownership rule has no
 * carve-out for the test harness.
 */
export async function resetAllTables(tx: LibSqlTransaction): Promise<void> {
	const tables = await tx.all<{ name: string }>(sql`
		SELECT name FROM sqlite_master
		 WHERE type = 'table'
		   AND name NOT LIKE 'sqlite_%'
		   AND name <> '_sqlite_migrations'
	`)

	for (const { name } of tables) {
		await tx.run(sql.raw(`DELETE FROM "${name}"`))
	}

	const [sequence] = await tx.all<{ name: string }>(sql`
		SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'
	`)
	if (sequence) await tx.run(sql`DELETE FROM sqlite_sequence`)
}
