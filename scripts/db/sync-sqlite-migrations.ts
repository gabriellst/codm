#!/usr/bin/env bun
/**
 * sync-sqlite-migrations.ts — ONE source of SQLite migrations, N copies on disk.
 *
 * `packages/contracts/src/db/sqlite/migrations/*.sql` (drizzle-kit output) is the source
 * of truth. Every runtime copy is DERIVED from it and never edited by hand:
 *
 *   contracts/src/db/sqlite/migrations/   ← drizzle-kit writes here (source)
 *     └─> packages/api/go/core/db/sqlite/migrations/   ← what //go:embed compiles in
 *
 * WHY A GATE AND NOT A CONVENTION. Both backends apply migrations against the SAME file, and
 * the shared `_sqlite_migrations` ledger is keyed by FILENAME. So a copy that drifted in
 * CONTENT but kept its name is not a loud failure — it is silently skipped by whichever
 * process arrives second, and the two processes then disagree about the shape of the
 * database with nothing in the logs. Byte equality is the only thing that makes the
 * filename a safe key.
 *
 * `meta/` is deliberately NOT copied. It is drizzle-kit's own bookkeeping and is not part of
 * the runtime: both appliers derive the set to apply from `readdir | filter .sql | sort`,
 * never from `meta/_journal.json`. Its absence on the Go side is correct, so it is the one
 * permitted difference between the two directories.
 *
 * Usage:
 *   bun scripts/db/sync-sqlite-migrations.ts            # copy source → derived copies
 *   bun scripts/db/sync-sqlite-migrations.ts --check    # assert equality, write nothing
 *
 * ROOT_OVERRIDE retargets the tree (eval worktrees), matching scripts/detectors/*.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const PROJECT_ROOT = process.env.ROOT_OVERRIDE ? resolve(process.env.ROOT_OVERRIDE) : resolve(SCRIPT_DIR, '../..')

/** The drizzle-kit output every other copy derives from. */
export const SOURCE_DIR = join(PROJECT_ROOT, 'packages/contracts/src/db/sqlite/migrations')

/** Derived copies. Add a destination here when a new runtime needs its own copy. */
export const DERIVED_DIRS = [join(PROJECT_ROOT, 'packages/api/go/core/db/sqlite/migrations')]

export interface Divergence {
	/** Repo-relative path of the derived file. */
	file: string
	reason: 'missing' | 'content' | 'extraneous'
}

function sqlFiles(dir: string): string[] {
	if (!existsSync(dir)) return []
	return readdirSync(dir, { withFileTypes: true })
		.filter(e => e.isFile() && e.name.endsWith('.sql'))
		.map(e => e.name)
		.sort()
}

/** Compares SOURCE_DIR against one derived dir. Empty result = byte-identical .sql sets. */
export function diverged(derivedDir: string): Divergence[] {
	const out: Divergence[] = []
	const source = sqlFiles(SOURCE_DIR)
	const derived = new Set(sqlFiles(derivedDir))

	for (const name of source) {
		const target = join(derivedDir, name)
		if (!derived.has(name)) {
			out.push({ file: relative(PROJECT_ROOT, target), reason: 'missing' })
			continue
		}
		derived.delete(name)
		if (!readFileSync(join(SOURCE_DIR, name)).equals(readFileSync(target))) {
			out.push({ file: relative(PROJECT_ROOT, target), reason: 'content' })
		}
	}
	// Anything left is a .sql the source does not have — a hand-added migration on the
	// derived side, which is exactly the drift this gate exists to catch.
	for (const name of derived) {
		out.push({ file: relative(PROJECT_ROOT, join(derivedDir, name)), reason: 'extraneous' })
	}
	return out
}

/** Copies every source .sql into the derived dir. Returns the files actually written. */
export function sync(derivedDir: string): string[] {
	mkdirSync(derivedDir, { recursive: true })
	const written: string[] = []
	for (const name of sqlFiles(SOURCE_DIR)) {
		const target = join(derivedDir, name)
		const bytes = readFileSync(join(SOURCE_DIR, name))
		if (existsSync(target) && readFileSync(target).equals(bytes)) continue
		writeFileSync(target, bytes)
		written.push(relative(PROJECT_ROOT, target))
	}
	return written
}

function main(): void {
	const check = process.argv.includes('--check')
	if (sqlFiles(SOURCE_DIR).length === 0) {
		console.error(`✗ no .sql migrations under ${relative(PROJECT_ROOT, SOURCE_DIR)} — refusing to sync an empty source`)
		process.exit(1)
	}

	let failed = false
	for (const dir of DERIVED_DIRS) {
		const rel = relative(PROJECT_ROOT, dir)
		if (check) {
			const bad = diverged(dir)
			if (bad.length === 0) {
				console.log(`✔ ${rel} is byte-identical to the contracts source`)
				continue
			}
			failed = true
			console.error(`✗ ${rel} diverged from the contracts source:`)
			for (const d of bad) console.error(`    ${d.reason.padEnd(10)} ${d.file}`)
			continue
		}
		const written = sync(dir)
		console.log(written.length === 0 ? `✔ ${rel} already up to date` : `✔ ${rel}: wrote ${written.join(', ')}`)
	}

	if (failed) {
		console.error('\nRun `bun run --cwd packages/contracts db:sync-go` and commit the result.')
		process.exit(1)
	}
}

if (import.meta.main) main()
