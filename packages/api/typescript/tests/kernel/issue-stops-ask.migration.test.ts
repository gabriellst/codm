import { afterAll, describe, expect, it } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as schema from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'
import { LibSqlDriver, removeTempDirWhenFree } from '@codm/core-typescript'

/**
 * Migration 0036 (fase 3, "emagrecer o grupo") REBUILDS two tables — `issue_stops` (CHECKs over the new
 * StopKind / StopResolution members + the ask columns) and `thread_panel_actions` (CHECK over the new
 * PanelActionKind.ANSWER_ASK) — and adds columns to `thread_threads` / `thread_transcript_entries`.
 *
 * Applied by the REAL boot migrator (`LibSqlDriver.runMigrations`) over the committed bytes, in two steps:
 * every migration before 0036, then rows seeded the way an existing install has them, then 0036 alone.
 * Every row that existed survives with kind/resolution intact (the reconciler's old HUMAN_REQUESTED stops
 * are history and are NOT rewritten to STALLED), the new columns start NULL, existing groups get the
 * decided default mode, and the rebuilt CHECKs admit the new members. drizzle-kit's generated INSERT
 * copied the new columns out of the OLD table — the hand fix in 0036 is what the first case pins.
 *
 * Seeds and reads go through `bun:sqlite` on the same file — a third implementation, owned by neither
 * applier (the `concurrent-boot` suite's reasoning).
 */
const files = readdirSync(migrationsDir)
	.filter(name => name.endsWith('.sql'))
	.sort()
const TARGET = files.find(name => name.startsWith('0036_'))

const dirs: string[] = []
afterAll(() => {
	for (const dir of dirs) removeTempDirWhenFree(dir)
})

const T0 = 1_763_000_000_000
const OWNER = '00000000-0000-4000-8000-000000000001'
const THREAD = '00000000-0000-4000-8000-0000000000a1'

/** Applies every committed migration up to (excluding) 0036, lets `seed` write, then applies 0036. */
async function migrateAcross0036(seed: (db: Database) => void): Promise<Database> {
	if (!TARGET) throw new Error('migration 0036 is not committed')
	const dir = mkdtempSync(join(tmpdir(), 'codm-0036-'))
	dirs.push(dir)
	const staged = join(dir, 'migrations')
	mkdirSync(staged)
	const dbPath = join(dir, 'codm.db')
	for (const file of files.filter(name => name < TARGET)) copyFileSync(join(migrationsDir, file), join(staged, file))
	await new LibSqlDriver({ schema, migrationsDir: staged, dbPath }).runMigrations()

	const writer = new Database(dbPath)
	seed(writer)
	writer.close()

	copyFileSync(join(migrationsDir, TARGET), join(staged, TARGET))
	await new LibSqlDriver({ schema, migrationsDir: staged, dbPath }).runMigrations()
	return new Database(dbPath)
}

const STOP_COLUMNS = '`id`,`owner_id`,`issue_id`,`thread_id`,`kind`,`title`,`detail`,`raised_at`,`resolution`,`resolved_at`'
const insertStop = (db: Database, args: SQLQueryBindings[]) =>
	db.prepare(`INSERT INTO \`issue_stops\` (${STOP_COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(...args)
const insertAsk = (db: Database, id: string, issueId: string, kind: string, resolution: string | null, seq: number | null) =>
	db
		.prepare(`INSERT INTO \`issue_stops\` (${STOP_COLUMNS},\`seq\`) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
		.run(id, OWNER, issueId, THREAD, kind, '', '', T0, resolution, null, seq)

const existingInstall = (db: Database): void => {
	insertStop(db, ['s-open', OWNER, 'i-1', THREAD, 'HUMAN_REQUESTED', 'Stalled', 'no declaration after the reminder', T0, null, null])
	insertStop(db, ['s-done', OWNER, 'i-1', THREAD, 'APPROVAL_NEEDED', 'Approve?', '', T0 + 1, 'APPROVE', T0 + 2])
	insertStop(db, ['s-thread', OWNER, null, THREAD, 'PERMISSION_DENIED', 'Blocked', '', T0 + 3, 'DENY', T0 + 4])
	db.prepare(
		'INSERT INTO `thread_panel_actions` (`id`,`owner_id`,`thread_id`,`kind`,`outcome`,`outcome_code`,`executed_at`,`reported_at`) VALUES (?,?,?,?,?,?,?,?)',
	).run('a-1', OWNER, THREAD, 'ANSWER_STOP', 'DONE', null, T0, null)
}

const stops = (db: Database) => db.query('SELECT * FROM `issue_stops` ORDER BY `raised_at`').all() as Record<string, unknown>[]

describe('migration 0036 — issue_stops / thread_panel_actions rebuild', () => {
	it('every existing stop survives with its kind and resolution intact; the ask columns start NULL', async () => {
		let before: Record<string, unknown>[] = []
		const db = await migrateAcross0036(seedDb => {
			existingInstall(seedDb)
			before = stops(seedDb)
		})

		const after = stops(db)
		expect(after).toHaveLength(3)
		for (const [i, row] of after.entries()) {
			for (const [column, value] of Object.entries(before[i]!)) expect(row[column]).toEqual(value)
			for (const column of ['ask', 'answer', 'answered_by', 'seq', 'due_at', 'ask_entry_id']) expect(row[column]).toBeNull()
		}
		// History is not rewritten: the reconciler's old stop stays HUMAN_REQUESTED.
		expect(after[0]!.kind).toBe('HUMAN_REQUESTED')
		db.close()
	})

	it('the rebuilt CHECKs admit the new kinds and resolutions, and still refuse unknown ones', async () => {
		const db = await migrateAcross0036(() => {})
		insertAsk(db, 'd1', 'i-2', 'DECISION_REQUESTED', 'ANSWER', 1)
		insertAsk(db, 'q2', 'i-2', 'QUESTION_ASKED', 'DEFAULT_APPLIED', 2)
		insertAsk(db, 'st', 'i-2', 'STALLED', null, null)
		expect(() => insertAsk(db, 'x', 'i-2', 'NOT_A_KIND', null, null)).toThrow()
		expect(() => insertAsk(db, 'y', 'i-2', 'STALLED', 'NOT_A_RESOLUTION', null)).toThrow()
		db.close()
	})

	it('the ask number is unique per issue; stops without one never collide', async () => {
		const db = await migrateAcross0036(() => {})
		insertAsk(db, 'a', 'i-3', 'DECISION_REQUESTED', null, 1)
		insertAsk(db, 'b', 'i-4', 'DECISION_REQUESTED', null, 1)
		insertAsk(db, 'c', 'i-3', 'SERVER_ERROR', null, null)
		insertAsk(db, 'd', 'i-3', 'SERVER_ERROR', null, null)
		expect(() => insertAsk(db, 'e', 'i-3', 'QUESTION_ASKED', null, 1)).toThrow()
		db.close()
	})

	it('panel actions survive and the ledger accepts ANSWER_ASK', async () => {
		const db = await migrateAcross0036(existingInstall)
		expect(db.query('SELECT `kind`,`outcome` FROM `thread_panel_actions`').all()).toEqual([{ kind: 'ANSWER_STOP', outcome: 'DONE' }])
		db.prepare('INSERT INTO `thread_panel_actions` (`id`,`owner_id`,`thread_id`,`kind`,`outcome`,`executed_at`) VALUES (?,?,?,?,?,?)').run(
			'a-2',
			OWNER,
			THREAD,
			'ANSWER_ASK',
			'DONE',
			T0,
		)
		db.close()
	})

	it('existing groups get the decided default mode; the new transcript columns are nullable', async () => {
		const db = await migrateAcross0036(() => {})
		const columns = (table: string) =>
			db.query(`PRAGMA table_info(\`${table}\`)`).all() as { name: string; notnull: number; dflt_value: string | null }[]
		expect(columns('thread_threads').find(c => c.name === 'output_mode')).toMatchObject({ notnull: 1, dflt_value: "'DECISIONS_AND_LIVE'" })
		const entry = columns('thread_transcript_entries')
		for (const name of ['level', 'routing', 'stop_id', 'digest_entry_id', 'addressee_id']) {
			expect(entry.find(c => c.name === name)).toMatchObject({ notnull: 0 })
		}
		db.close()
	})
})
