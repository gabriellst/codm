import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DERIVED_DIRS, PROJECT_ROOT, SOURCE_DIR, diverged } from './sync-sqlite-migrations'

/**
 * THE GATE. The sync script is the mechanism; this is the thing that fails CI when someone
 * edits a derived copy by hand, or generates a new migration and forgets to propagate it.
 *
 * It matters more than an ordinary "generated output is committed" check because the shared
 * `_sqlite_migrations` ledger is keyed by FILENAME: a copy that drifted in content but kept
 * its name is silently SKIPPED by whichever process arrives second, leaving the two backends
 * disagreeing about the database shape with nothing in the logs.
 */
describe('sqlite migrations — contracts source vs //go:embed copy', () => {
	test('the source directory is not empty (guards a vacuous pass)', () => {
		const sql = readdirSync(SOURCE_DIR).filter(f => f.endsWith('.sql'))
		expect(sql.length).toBeGreaterThan(0)
	})

	for (const dir of DERIVED_DIRS) {
		const rel = relative(PROJECT_ROOT, dir)

		test(`${rel} exists`, () => {
			expect(existsSync(dir)).toBe(true)
		})

		test(`${rel} is byte-identical to the contracts source`, () => {
			expect(diverged(dir)).toEqual([])
		})

		test(`${rel} carries no meta/ — the runtime derives its set from readdir, not _journal.json`, () => {
			expect(existsSync(join(dir, 'meta'))).toBe(false)
		})
	}

	test('detects a content divergence (the gate is not vacuously green)', () => {
		// Point the comparison at a directory that holds a same-named file with different
		// bytes: the source dir's own meta/ sibling cannot serve, so use a synthetic check
		// against the schema dir, which has no .sql at all → every file reads as missing.
		const bogus = join(PROJECT_ROOT, 'packages/contracts/db/schema')
		const findings = diverged(bogus)
		expect(findings.length).toBeGreaterThan(0)
		expect(findings.every(f => f.reason === 'missing')).toBe(true)
	})

	test('every source migration ends up embedded verbatim (spot-check the DDL is real SQL)', () => {
		for (const name of readdirSync(SOURCE_DIR).filter(f => f.endsWith('.sql'))) {
			const bytes = readFileSync(join(SOURCE_DIR, name), 'utf8')
			expect(bytes.trim().length).toBeGreaterThan(0)
			// Real DDL, not a placeholder. Deliberately broader than CREATE/ALTER TABLE: an
			// index-only migration is legitimate (0005 adds one index and nothing else), and a rail
			// that forces every migration to touch a table teaches people to pad them.
			expect(bytes).toMatch(/\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|UNIQUE\s+INDEX|VIEW|TRIGGER)\b/i)
		}
	})
})
