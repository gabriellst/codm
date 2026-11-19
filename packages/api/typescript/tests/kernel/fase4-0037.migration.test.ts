import { afterAll, describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as schema from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'
import { LibSqlDriver, removeTempDirWhenFree } from '@codm/core-typescript'
import { MailboxItemKind } from '@codm/contracts-typescript/wire/enums'
import { CLAIM_CLASS_OF_KIND } from '../../src/agent/utils/ClaimClassOfKind'

/**
 * Migration 0037 (fase 4, "vazão") is generated schema PLUS two hand-written statements drizzle-kit cannot
 * emit: the `UPDATE` that classifies every existing queue item from its kind, and the `INSERT … SELECT` that
 * gives every existing issue its attributes row. Both are pinned here, applied by the REAL boot migrator
 * (`LibSqlDriver.runMigrations`) over the committed bytes: every migration before 0037, rows seeded the way an
 * existing install has them, then 0037 alone.
 *
 * Seeds and reads go through `bun:sqlite` on the same file — a third implementation, owned by neither applier.
 */
const files = readdirSync(migrationsDir)
	.filter(name => name.endsWith('.sql'))
	.sort()
const TARGET = files.find(name => name.startsWith('0037_'))

const dirs: string[] = []
afterAll(() => {
	for (const dir of dirs) removeTempDirWhenFree(dir)
})

const T0 = 1_763_000_000_000
const OWNER = '00000000-0000-4000-8000-000000000001'
const THREAD = '00000000-0000-4000-8000-0000000000a1'

async function migrateAcross0037(seed: (db: Database) => void): Promise<Database> {
	if (!TARGET) throw new Error('migration 0037 is not committed')
	const dir = mkdtempSync(join(tmpdir(), 'codm-0037-'))
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

const insertItem = (db: Database, id: string, kind: MailboxItemKind) =>
	db
		.prepare(
			'INSERT INTO `agent_mailbox` (`id`,`owner_id`,`target_kind`,`target_id`,`kind`,`payload`,`dedup_key`,`created_at`) VALUES (?,?,?,?,?,?,?,?)',
		)
		.run(
			id,
			OWNER,
			kind === MailboxItemKind.WORK || kind === MailboxItemKind.STEER ? 'ISSUE' : 'THREAD',
			't-1',
			kind,
			'{}',
			`dedup-${id}`,
			T0,
		)

const insertIssue = (db: Database, id: string, status: string, completedAt: number | null) =>
	db
		.prepare(
			'INSERT INTO `issue_issues` (`id`,`owner_id`,`thread_id`,`key`,`title`,`status`,`provider`,`completed_at`,`created_at`,`updated_at`) VALUES (?,?,?,?,?,?,?,?,?,?)',
		)
		.run(id, OWNER, THREAD, `K-${id}`, 'a task', status, 'CLAUDE_CODE', completedAt, T0, T0)

describe('migration 0037 — claim class and issue attributes', () => {
	it('every existing queue item gets the class CLAIM_CLASS_OF_KIND gives its kind — none is left on the default', async () => {
		const kinds = Object.values(MailboxItemKind)
		const db = await migrateAcross0037(seed => {
			for (const kind of kinds) insertItem(seed, `m-${kind}`, kind)
		})
		const rows = db.query('SELECT `kind`, `claim_class` FROM `agent_mailbox`').all() as {
			kind: MailboxItemKind
			claim_class: string | null
		}[]
		expect(rows).toHaveLength(kinds.length)
		for (const row of rows) expect(row.claim_class).toBe(CLAIM_CLASS_OF_KIND[row.kind])
		db.close()
	})

	it('a writer that omits the column gets the constant default WORK — never NULL', async () => {
		const db = await migrateAcross0037(() => {})
		insertItem(db, 'late', MailboxItemKind.STEER)
		expect(db.query("SELECT `claim_class` FROM `agent_mailbox` WHERE `id` = 'late'").get()).toEqual({ claim_class: 'WORK' })
		db.close()
	})

	it('every existing issue gets one attributes row with the defaults; closed_at only for the completed ones', async () => {
		const db = await migrateAcross0037(seed => {
			insertIssue(seed, 'i-open', 'WORKING', null)
			insertIssue(seed, 'i-done', 'COMPLETED', T0 + 5)
		})
		const rows = db
			.query(
				'SELECT `issue_id`,`owner_id`,`thread_id`,`priority`,`priority_reason`,`work_kind`,`model`,`worktree_path`,`closed_at`,`created_at` FROM `agent_issue_attributes` ORDER BY `issue_id`',
			)
			.all()
		const common = {
			owner_id: OWNER,
			thread_id: THREAD,
			priority: 'NORMAL',
			priority_reason: 'DEFAULT',
			work_kind: 'CHANGE',
			model: null,
			worktree_path: null,
			created_at: T0,
		}
		expect(rows).toEqual([
			{ issue_id: 'i-done', ...common, closed_at: T0 + 5 },
			{ issue_id: 'i-open', ...common, closed_at: null },
		])
		db.close()
	})

	it('the new tables enforce their CHECKs; the new columns on existing tables are nullable', async () => {
		const db = await migrateAcross0037(() => {})
		const insertAttributes = (priority: string) =>
			db
				.prepare(
					'INSERT INTO `agent_issue_attributes` (`issue_id`,`owner_id`,`thread_id`,`priority`,`priority_reason`,`work_kind`,`created_at`) VALUES (?,?,?,?,?,?,?)',
				)
				.run(`a-${priority}`, OWNER, THREAD, priority, 'DECLARED', 'DIAGNOSIS', T0)
		insertAttributes('HIGH')
		expect(() => insertAttributes('URGENT')).toThrow()
		const insertBatch = (status: string, seq: number) =>
			db
				.prepare(
					'INSERT INTO `thread_batches` (`id`,`owner_id`,`thread_id`,`code`,`seq`,`source_entry_id`,`item_count`,`status`,`created_at`,`updated_at`) VALUES (?,?,?,?,?,?,?,?,?,?)',
				)
				.run(`b-${seq}`, OWNER, THREAD, `L-${seq}`, seq, 'e-1', 3, status, T0, T0)
		insertBatch('INCOMPLETE', 1)
		expect(() => insertBatch('DONE', 2)).toThrow()
		expect(() => insertBatch('RECORDED', 1)).toThrow()

		const columns = (table: string) => db.query(`PRAGMA table_info(\`${table}\`)`).all() as { name: string; notnull: number }[]
		const nullable = (table: string, names: string[]) => {
			for (const name of names) expect(columns(table).find(c => c.name === name)).toMatchObject({ notnull: 0 })
		}
		nullable('issue_issues', ['priority', 'priority_reason', 'work_kind', 'model'])
		nullable('agent_agent_sessions', ['handoff_notes', 'handoff_at'])
		nullable('workspace_workspaces', ['publish_command'])
		nullable('issue_terminal_lines', ['timeline_item_id'])
		db.close()
	})
})
