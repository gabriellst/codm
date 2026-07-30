#!/usr/bin/env bun
/**
 * migrate — apply the shared-SQLite migrations against `$CODEDM_DATA_DIR`, then exit.
 *
 * WHY THIS IS NOT A SECOND APPLIER. The rule this repo enforces is ONE LEDGER, not "no script":
 * a third applier carrying its own bookkeeping (`drizzle-kit migrate`/`push`, which write
 * `__drizzle_migrations`) would re-apply DDL the boot migrators already applied, and the divergence
 * raises no error — only wrong reads. This script sidesteps that by calling
 * `migrateEmbeddedDatabase()`, the EXACT function `src/boot/migrate-embedded.ts` calls at daemon
 * boot: same driver singleton, same `packages/contracts/db/schema/migrations/*.sql`, same
 * `_sqlite_migrations` ledger. Running it is indistinguishable from booting the daemon and killing
 * it after the migration step — which is precisely the convenience it buys.
 *
 * SCOPE. It creates the DRIZZLE tables only. The `whatsmeow_*` tables belong to the Go gateway and
 * are created by whatsmeow itself on first connect, so a freshly migrated dir has fewer tables than
 * a store that has run the gateway. That is expected, not a partial migration.
 *
 * Usage: `bun migrate:dev` (root) · `bun scripts/migrate.ts` (here)
 */
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { Config, resolveDataDir } from '@codm/core-typescript'
import { migrateEmbeddedDatabase } from '@shared/registry'

const dataDir = resolveDataDir(Config.env.CODEDM_DATA_DIR)
const dbPath = join(dataDir, 'codedm.db')

// Read the ledger through a SEPARATE read-only handle rather than the applier's driver: the point
// is to report what the applier did, and reusing its connection would report what we asked for.
function ledger(): string[] {
	try {
		const db = new Database(dbPath, { readonly: true })
		try {
			return db
				.query<{ name: string }, []>('select name from _sqlite_migrations order by name')
				.all()
				.map(row => row.name)
		} finally {
			db.close()
		}
	} catch {
		// No file, or no ledger table yet — a cold data dir.
		return []
	}
}

const before = ledger()
await migrateEmbeddedDatabase()
const after = ledger()

const applied = after.filter(name => !before.includes(name))
console.log(`data dir  ${dataDir}`)
if (applied.length === 0) {
	console.log(`up to date — ${after.length} migration(s) already in _sqlite_migrations, applied 0`)
} else {
	console.log(`applied ${applied.length} of ${after.length}:`)
	for (const name of applied) console.log(`  + ${name}`)
}
process.exit(0)
