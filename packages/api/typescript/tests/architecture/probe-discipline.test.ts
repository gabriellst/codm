import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

/**
 * Probe-discipline guard — the mechanical half of the "tests never resolve DrizzleClient directly"
 * convention documented in `tests/architecture/README.md` ("Reading Persisted State").
 *
 * Asserts on persisted events/outbox rows and cross-table invariant snapshots go through
 * `testBed.probe()` (`PersistenceProbe`, `tests/support/PersistenceProbe.ts`) instead of every test
 * file resolving `DrizzleClient` and importing raw schema tables itself — that's infrastructure
 * coupling: a schema rename becomes a grep-and-replace across dozens of test files instead of a
 * one-file change to the probe.
 *
 * Scope: every `src/**\/*.test.ts` and `tests/**\/*.test.ts` in the `api/typescript` package (the
 * `core/` sub-package, which owns the Drizzle*Repository tests, is out of scope by construction).
 *
 * How it checks: for every in-scope test file, flag any `resolve(DrizzleClient)` occurrence whose
 * file isn't in EXEMPTIONS. Exemptions are named files/directories with a `why` — never a weakened
 * regex.
 */

const API_ROOT = join(import.meta.dir, '..', '..')

/** Files legitimately allowed to resolve DrizzleClient — each needs a `why`. */
const EXEMPTIONS: { path: string; why: string }[] = [
	{
		path: 'tests/kernel/SqliteCommandQueue.test.ts',
		why: "tests SqliteCommandQueue's own DB-backed scheduling behavior directly (row-by-id, repeat scheduling, lease/claim) — the DB is the subject, same exception class as Drizzle*Repository.test.ts",
	},
	{
		path: 'tests/kernel/DomainEventListByNameSince.test.ts',
		why: 'raw db.update(events) write-only seed — backdates `occurred_at` timestamps to age event rows into/out of the sweep window while exercising DomainEventRepository.listByNameSince; no persisted-data read assertion goes through the raw client',
	},
	{
		path: 'tests/kernel/insert-site-audit.test.ts',
		why: 'the DB SCHEMA is the subject: it asserts, per table, that the real write path lands a row with a non-null id and timestamp, which requires reading RAW columns (`SELECT * FROM "<table>"`) that the probe deliberately does not expose — same exception class as Drizzle*Repository.test.ts',
	},
	{
		path: 'tests/architecture/probe-discipline.test.ts',
		why: "this detector's own source contains the literal `resolve(DrizzleClient)` string (inside its regex and the negative fixture) — matching itself is a false positive, not a violation",
	},
	{
		path: 'tests/architecture/allowlist-liveness.test.ts',
		why: "the liveness rail's negative fixture writes a fake exempted file whose content is the literal `resolve(DrizzleClient)` — fixture material in a temp dir, not a persisted-business-data read; same self-match class as this detector's own entry",
	},
]

function isInScope(rel: string): boolean {
	if (rel.startsWith('src/') && rel.endsWith('.test.ts')) return true
	if (rel.startsWith('tests/') && rel.endsWith('.test.ts')) return true
	return false
}

function listTestFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules') continue
			out.push(...listTestFiles(full))
		} else if (entry.name.endsWith('.test.ts')) {
			out.push(full)
		}
	}
	return out
}

/** Scans `root` for `resolve(DrizzleClient)` occurrences in in-scope test files, honoring EXEMPTIONS. */
function scanForViolations(root: string): string[] {
	const violations: string[] = []

	for (const dir of [join(root, 'src'), join(root, 'tests')]) {
		if (!existsSync(dir)) continue
		for (const file of listTestFiles(dir)) {
			const rel = relative(root, file).split('\\').join('/')
			if (!isInScope(rel)) continue
			if (EXEMPTIONS.some(e => e.path === rel)) continue

			const content = readFileSync(file, 'utf8')
			if (/resolve\(DrizzleClient\)/.test(content)) {
				violations.push(rel)
			}
		}
	}

	return violations
}

describe('probe-discipline (tests never resolve DrizzleClient directly)', () => {
	test('src + tests read persisted state via testBed.probe(), not a raw DrizzleClient resolve', () => {
		const violations = scanForViolations(API_ROOT)

		const report = violations.map(v => `  ${v}`).join('\n')
		expect(
			violations.length,
			`File(s) resolve(DrizzleClient) directly instead of going through testBed.probe() ` +
				`(see tests/architecture/README.md — "Reading Persisted State"). Migrate the read to ` +
				`PersistenceProbe, or add a named EXEMPTIONS entry with a why if this is a legitimate raw-DB ` +
				`use (schema-drift, repository/transaction test, or a write-only seed):\n${report}`,
		).toBe(0)
	})

	// Negative fixture — proves the scan actually catches an offender, using a real temp directory
	// (not the real repo tree) so this can't accidentally pass just because nothing in the real tree
	// happens to violate the rule right now.
	test('fixture: a non-exempted test file with resolve(DrizzleClient) is flagged', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'probe-discipline-fixture-'))
		try {
			const offenderDir = join(tmpRoot, 'src', 'sales', 'jobs')
			const cleanDir = join(tmpRoot, 'src', 'sales', 'handlers')
			mkdirSync(offenderDir, { recursive: true })
			mkdirSync(cleanDir, { recursive: true })

			// Offender — a plain unit, not in EXEMPTIONS, reading persisted state via a raw
			// resolve(DrizzleClient).
			writeFileSync(join(offenderDir, 'SomeJob.test.ts'), `const db = testBed.resolve(DrizzleClient)\nawait db.select().from(events)\n`)

			// Control — same tree, uses the sanctioned probe instead. Must NOT be flagged.
			writeFileSync(join(cleanDir, 'SomeHandler.test.ts'), `await testBed.probe().persistedEvents({ entityId })\n`)

			const violations = scanForViolations(tmpRoot)

			expect(violations).toEqual(['src/sales/jobs/SomeJob.test.ts'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
