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
		path: 'src/agent/usecases/RunPublishCommand.test.ts',
		why: "MAILBOX PAYLOAD (fase 4, S11): the follow-up recado's JSON payload is the subject — that the failed run's output tail rides `sessionOnly` and never `text` (the field the timeline and the cloud panel render) — and no probe exposes a payload. Every other state is read through the use cases and repositories",
	},
	{
		path: 'src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.publish.test.ts',
		why: 'CLAIM COLUMNS (fase 4, S11): that the publish trigger was consumed with ONE attempt (`consumed_at`, `attempts`, `claim_class` of the row) is the subject — columns the probe deliberately does not expose. Same class as the coalesce suite next door',
	},
	{
		path: 'src/thread/usecases/RecordBatch.test.ts',
		why: "MAILBOX PAYLOAD + WRITE-ONLY SEED (fase 4, S8): the batch rides the orchestrator item's JSON payload, which no probe exposes, and the follow-up sweep needs the batch's turn and the reminder marked consumed (what the dispatcher writes) without running an orchestrator turn. Every batch state is read back through the repository or the use cases",
	},
	{
		path: 'src/ui/usecases/GetIssueTimeline.test.ts',
		why: 'WRITE-ONLY SEED (fase 4, S0a): the timeline reader learns two sources whose writers land in later slices — `thread_batch_items` (S8, RecordBatch) and the `agent.publish.ran` fact (S11) — so the only way to give the reader those rows today is a raw INSERT. Every read goes through the use case under test; nothing is read back from the driver',
	},
	{
		path: 'src/agent/repositories/MailboxRepository/MailboxRepository.test.ts',
		why: 'the LEASE COLUMNS are the subject: the boot-sweep cases stamp `claimed_boot`/`claimed_pid` on a claimed row (standing in for a daemon that crashed) and then read them back — a write AND a read of columns the probe deliberately does not expose (it counts rows, it does not read them). Same exception class as tests/kernel/LibSqlCommandQueue.test.ts, whose lease/claim behaviour this table mirrors',
	},
	{
		path: 'src/agent/repositories/MailboxRepository/LibSqlMailboxRepository.defer.test.ts',
		why: 'the `defer_cause` COLUMN is the subject (fase 5, S1): every write that clears or replaces a lease must clear the cause, so each case stamps a cause on a claimed/held/orphaned row and reads the column back after that one write — a write AND a read of a column the probe deliberately does not expose (it counts rows, it does not read them). Same exception class as MailboxRepository.test.ts next door',
	},
	{
		path: 'src/agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.retry.test.ts',
		why: 'the retry CALENDAR is the subject (fase 5, S2): each step reads the head row’s `lease_until` / `defer_cause` / `attempts` against `RETRY_SCHEDULE`, and the clock is played forward by lapsing `lease_until` — a write AND a read of lease columns the probe deliberately does not expose (it counts rows, it does not read them). Same exception class as LibSqlMailboxRepository.defer.test.ts',
	},
	{
		path: 'tests/flows/fase5-acceptance.test.ts',
		why: 'the CLOCK of the acceptance (fase 5, S7): the retry calendar is read off the head row (`lease_until` / `defer_cause` / `attempts`) and played forward by lapsing `lease_until`, and a stall is aged past the suspicion threshold by moving its `raised_at` — writes AND reads of columns the probe deliberately does not expose. Same exception class as LibSqlMailboxDispatcher.retry.test.ts, whose calendar case this acceptance repeats end to end',
	},
	{
		path: 'src/agent/repositories/MailboxRepository/MailboxRepository.legacyPosture.test.ts',
		why: 'the SCHEMA DEFAULT is the subject (participant-permission-posture, AC-5): a pre-deploy producer wrote `agent_mailbox` rows whose INSERT never named the `posture` column, and the invariant is that such a row is claimed as AUTO. Reproducing that needs a RAW INSERT that omits the column — the repository (which always stamps a posture) and the probe (which counts rows, never writes) both make the legacy shape unreachable. Same exception class as MailboxRepository.test.ts next door',
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
		path: 'src/thread/usecases/FlushSignalDigest.test.ts',
		why: 'the SCHEDULED-COMMAND row is the subject (fase 3, item 2): the per-person digest is proven by WHAT got enqueued — one `deliver_channel_message` whose JSON `input` carries the digest text and the digest entry as `replyEntryId`, a `deliver_issue_preview` keyed on the feedback entry, a `deliver_channel_attachment` with the print, its caption and `replyEntryId` — columns the probe deliberately does not expose (it counts rows); same exception class as SendArtifact.test.ts and RecordOrchestratorReply.test.ts',
	},
	{
		path: 'src/thread/handlers/CloseIssueOnChannel.test.ts',
		why: "the SCHEDULED-COMMAND row is the subject (fase 3, item 5): the closing is proven by WHAT got enqueued — one `deliver_channel_message` whose JSON `input` carries the closing entry as `replyEntryId` and the request's platform id as `quotedMessageId` (the closing answers whoever asked), or a `deliver_issue_preview` keyed on the closing entry when a final artifact was declared — columns the probe deliberately does not expose (it counts rows); same exception class as FlushSignalDigest.test.ts",
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
