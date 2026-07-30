/**
 * Regenerate `packages/api/go/core/db/sqlite/schema.sql` — the file sqlc reads to learn the shape of
 * every table.
 *
 * ### Why this exists
 * Drizzle owns the migrations; Go pulls the shape from this transcription. Keeping the two in step
 * was a MANUAL step in a four-part recipe, and a manual step in a recipe is a step that falls behind:
 * on 28-jul the file was three migrations stale and nothing noticed, because sqlc happily generates
 * against whatever it is given and Go compiles fine against a model missing a column it never reads.
 *
 * So the transcription is DERIVED: apply every committed migration with the product's own migrator,
 * then dump what SQLite actually built. Not a hand-edit, not a guess — the same statements the user's
 * database ran.
 *
 * Identifiers are re-quoted from backticks to double quotes: drizzle emits backticks, and sqlc's
 * parser rejects them ("relation ... does not exist"), which is the kind of failure that reads as a
 * missing table rather than a quoting dialect.
 *
 *   cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts            # rewrite the file
 *   cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check    # exit 1 if it would change (drift gate)
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Database } from 'bun:sqlite'
import { migrationsDir } from '@codm/contracts/db/migrations'
import * as schema from '@codm/contracts/db'
import { LibsqlDriver } from '@codm/core-typescript'

// Lives inside the api-ts workspace, not scripts/, because bun resolves the @codm/* workspace
// specifiers relative to the importing file — from the repo root they do not resolve at all.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const TARGET = join(ROOT, 'packages/api/go/core/db/sqlite/schema.sql')

const dir = mkdtempSync(join(tmpdir(), 'codedm-schema-dump-'))
try {
	const dbPath = join(dir, 'codedm.db')
	const driver = new LibsqlDriver({ schema, migrationsDir, dbPath })
	await driver.runMigrations()
	await driver.close()

	const db = new Database(dbPath, { readonly: true })
	// Tables first, then indexes — both alphabetical, so the file is stable across runs and a diff
	// only ever shows a real schema change.
	const rows = db
		.query<{ sql: string }, []>(
			`SELECT sql FROM sqlite_master
			 WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name <> '_sqlite_migrations'
			 ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`,
		)
		.all()
	db.close()

	const dumped = `${rows.map(r => `${r.sql.replaceAll('`', '"')};`).join('\n')}\n`

	if (process.argv.includes('--check')) {
		const current = readFileSync(TARGET, 'utf8')
		if (current !== dumped) {
			console.error(
				'✗ schema.sql is stale — run `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts` and re-run `sqlc generate`',
			)
			process.exit(1)
		}
		console.log('✔ schema.sql matches the migrations')
	} else {
		writeFileSync(TARGET, dumped)
		console.log(`✔ wrote ${rows.length} objects → packages/api/go/core/db/sqlite/schema.sql`)
	}
} finally {
	rmSync(dir, { recursive: true, force: true })
}
