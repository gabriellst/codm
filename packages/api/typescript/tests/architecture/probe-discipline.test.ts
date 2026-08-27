import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

/**
 * Probe-discipline guard — the mechanical half of the "tests never resolve LibSqlDatabaseDriver
 * directly" convention documented in `tests/architecture/README.md` ("Reading Persisted State").
 *
 * Asserts on persisted events/outbox rows and cross-table invariant snapshots go through
 * `testBed.probe()` (`PersistenceProbe`, `tests/support/PersistenceProbe.ts`) instead of every test
 * file resolving `LibSqlDatabaseDriver` and importing raw schema tables itself — that's
 * infrastructure coupling: a schema rename becomes a grep-and-replace across dozens of test files
 * instead of a one-file change to the probe.
 *
 * Scope: every `src/**\/*.test.ts` and `tests/**\/*.test.ts` in the `api/typescript` package (the
 * `core/` sub-package, which owns the Drizzle*Repository tests, is out of scope by construction).
 *
 * How it checks: for every in-scope test file, flag any `resolve(LibSqlDatabaseDriver).db` occurrence
 * whose file isn't in EXEMPTIONS. Exemptions are named files/directories with a `why` — never a
 * weakened regex.
 */

const API_ROOT = join(import.meta.dir, '..', '..')

/** Files legitimately allowed to resolve LibSqlDatabaseDriver — each needs a `why`. */
const EXEMPTIONS: { path: string; why: string }[] = [
	{
		path: 'src/agent/repositories/MailboxRepository/MailboxRepository.test.ts',
		why: 'the LEASE COLUMNS are the subject: the boot-sweep cases stamp `claimed_boot`/`claimed_pid` on a claimed row (standing in for a daemon that crashed) and then read them back — a write AND a read of columns the probe deliberately does not expose (it counts rows, it does not read them). Same exception class as tests/kernel/LibSqlCommandQueue.test.ts, whose lease/claim behaviour this table mirrors',
	},
	{
		path: 'tests/kernel/LibSqlCommandQueue.test.ts',
		why: "tests LibSqlCommandQueue's own DB-backed scheduling behavior directly (row-by-id, repeat scheduling, lease/claim) — the DB is the subject, same exception class as Drizzle*Repository.test.ts",
	},
	{
		path: 'src/thread/usecases/DeliverChannelMessage.test.ts',
		why: 'the SCHEDULED-COMMAND row is the subject (B3): it asserts row-by-id `attempts`/`run_at`/`dead_at` on `shared_scheduled_commands` across a failed tick and its backoff — columns the probe deliberately does not expose (it counts rows, it does not read them) — same exception class as tests/kernel/LibSqlCommandQueue.test.ts',
	},
	{
		path: 'src/thread/usecases/SendDirectMessage.test.ts',
		why: "the SCHEDULED-COMMAND row is the subject (B3): it asserts the enqueued row's `id` (= entryId, the dedup handle), `name` and JSON `input` on `shared_scheduled_commands` — the probe counts rows, it does not read their columns; the atomicity case DOES use probe().snapshot()",
	},
	{
		path: 'src/thread/usecases/ChannelCues.test.ts',
		why: "the SCHEDULED-COMMAND row is the subject (streaming spec, decisions 10-12): the `👀` cases assert a cue row's existence-by-id (scheduled, then consumed rather than dead-lettered), and the typing loop's whole property is that a beat armed its SUCCESSOR on the OTHER job id with `run_at` in the future — plus a `run_at` rewind so the next beat comes due without sleeping. The probe counts rows, it does not read or write their columns; same exception class as DeliverChannelMessage.test.ts next door",
	},
	{
		path: 'src/agent/usecases/RunOrchestratorTurn.test.ts',
		why: 'the SCHEDULED-COMMAND row is the subject (streaming spec, AC-10 — the ACTIVATION half): it asserts the turn armed the FIRST typing beat as a row whose `id` is the DERIVED job handle and whose JSON `input` carries the conversation plus the ceiling. A spy on the seam would pass just as happily with the wrong handle, the wrong ceiling or the wrong conversation, each of which is a loop that beats for nobody. The probe counts rows, it does not read their columns; same exception class as ChannelCues.test.ts, which owns the rest of this same loop',
	},
	{
		path: 'src/thread/usecases/RecordOrchestratorReply.test.ts',
		why: "the SCHEDULED-COMMAND row is the subject (B3): it asserts the enqueued row's `name`/`id` and the JSON `input`'s `quotedMessageId`/`replyEntryId` on `shared_scheduled_commands` — the probe counts rows, it does not read their columns; the drop + atomicity cases DO use probe().snapshot()",
	},
	{
		path: 'src/artifact/usecases/SendArtifact.test.ts',
		why: "the SCHEDULED-COMMAND row is the subject (B3, envio de artefatos pelo canal design decision 4): it asserts which command name (`deliver_channel_message` for LINK vs. `deliver_channel_attachment` for media) got enqueued and the JSON `input`'s `kind`/`mediaPath`/`fileName`/`mimeType`/`caption` on `shared_scheduled_commands` — the probe counts rows, it does not read their columns; same exception class as SendDirectMessage.test.ts and RecordOrchestratorReply.test.ts next door",
	},
	{
		path: 'src/thread/handlers/DeliverOrchestratorReply.test.ts',
		why: 'the SCHEDULED-COMMAND row is the subject (B3): the delegation case asserts the enqueued row `name` on `shared_scheduled_commands`, a column the probe does not expose; the envelope-guard case DOES use probe().snapshot()',
	},
	{
		path: 'tests/flows/issue-result.flow.test.ts',
		why: "the SCHEDULED-COMMAND row is the subject, one hop further out than RecordOrchestratorReply.test.ts next door: that file proves the use case puts `quotedMessageId` on `shared_scheduled_commands` when handed a resolvable entry, and this one proves the WHOLE chain hands it one — ISSUE_RESULT queued → dispatcher → RunOrchestratorTurn's mandated anchor → outbox → DeliverOrchestratorReply → the delivery order. The anchor's survival is only visible in the JSON `input` column the probe deliberately does not expose (it counts rows, it does not read them), and a chain whose links are each correct and joined nowhere is this repo's documented failure mode — the dispatcher once shipped registered-but-never-started with every unit test green",
	},
	{
		path: 'src/thread/repositories/ThreadRepository/LibSqlThreadRepository.test.ts',
		why: 'the TWO-TABLE write of the Thread aggregate is the subject (B4): it asserts raw `thread_transcript_entries` columns (`id` = the id `recordEntry` minted, `text`) and the `thread_threads.version` bump surviving-or-not a rollback — columns the probe deliberately does not expose (it counts rows, it does not read them) — same exception class as Drizzle*Repository.test.ts, which this file IS, only living under `src/` rather than `core/`',
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
		why: "this detector's own source contains the literal `resolve(LibSqlDatabaseDriver).db` string (inside its regex and the negative fixture) — matching itself is a false positive, not a violation",
	},
	{
		path: 'tests/architecture/allowlist-liveness.test.ts',
		why: "the liveness rail's negative fixture writes a fake exempted file whose content is the literal `resolve(LibSqlDatabaseDriver).db` — fixture material in a temp dir, not a persisted-business-data read; same self-match class as this detector's own entry",
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

/** Scans `root` for `resolve(LibSqlDatabaseDriver).db` occurrences in in-scope test files, honoring EXEMPTIONS. */
function scanForViolations(root: string): string[] {
	const violations: string[] = []

	for (const dir of [join(root, 'src'), join(root, 'tests')]) {
		if (!existsSync(dir)) continue
		for (const file of listTestFiles(dir)) {
			const rel = relative(root, file).split('\\').join('/')
			if (!isInScope(rel)) continue
			if (EXEMPTIONS.some(e => e.path === rel)) continue

			const content = readFileSync(file, 'utf8')
			if (/resolve\(LibSqlDatabaseDriver\)\.db\b/.test(content)) {
				violations.push(rel)
			}
		}
	}

	return violations
}

describe('probe-discipline (tests never resolve LibSqlDatabaseDriver directly)', () => {
	test('src + tests read persisted state via testBed.probe(), not a raw LibSqlDatabaseDriver resolve', () => {
		const violations = scanForViolations(API_ROOT)

		const report = violations.map(v => `  ${v}`).join('\n')
		expect(
			violations.length,
			`File(s) resolve(LibSqlDatabaseDriver).db directly instead of going through testBed.probe() ` +
				`(see tests/architecture/README.md — "Reading Persisted State"). Migrate the read to ` +
				`PersistenceProbe, or add a named EXEMPTIONS entry with a why if this is a legitimate raw-DB ` +
				`use (schema-drift, repository/transaction test, or a write-only seed):\n${report}`,
		).toBe(0)
	})

	// Negative fixture — proves the scan actually catches an offender, using a real temp directory
	// (not the real repo tree) so this can't accidentally pass just because nothing in the real tree
	// happens to violate the rule right now.
	test('fixture: a non-exempted test file with resolve(LibSqlDatabaseDriver).db is flagged', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'probe-discipline-fixture-'))
		try {
			const offenderDir = join(tmpRoot, 'src', 'sales', 'jobs')
			const cleanDir = join(tmpRoot, 'src', 'sales', 'handlers')
			mkdirSync(offenderDir, { recursive: true })
			mkdirSync(cleanDir, { recursive: true })

			// Offender — a plain unit, not in EXEMPTIONS, reading persisted state via a raw
			// resolve(LibSqlDatabaseDriver).db.
			writeFileSync(
				join(offenderDir, 'SomeJob.test.ts'),
				`const db = testBed.resolve(LibSqlDatabaseDriver).db\nawait db.select().from(events)\n`,
			)

			// Control — same tree, uses the sanctioned probe instead. Must NOT be flagged.
			writeFileSync(join(cleanDir, 'SomeHandler.test.ts'), `await testBed.probe().persistedEvents({ entityId })\n`)

			const violations = scanForViolations(tmpRoot)

			expect(violations).toEqual(['src/sales/jobs/SomeJob.test.ts'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
