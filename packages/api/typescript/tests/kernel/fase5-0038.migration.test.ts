import { afterAll, describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as schema from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'
import { LibSqlDriver, removeTempDirWhenFree } from '@codm/core-typescript'
import { BufferSize, ContactKind, StopResolution, ThreadStatus } from '@codm/contracts-typescript/wire/enums'

/**
 * Migration 0038 (fase 5, "autonomia") REBUILDS `issue_stops` — `issue_stops_resolution_check` grows
 * AUTO_RETRY and SQLite cannot alter a CHECK — and carries two hand-written statements drizzle-kit cannot
 * emit: the cause of every item deferred at upgrade time (HOLD when its issue or conversation is paused,
 * PROVIDER_LIMIT otherwise) and the conversion of the old declaration reminders (payload flag) into
 * claim_class REMINDER with the first nudge of their episode. All pinned here, applied by the REAL boot
 * migrator (`LibSqlDriver.runMigrations`) over the committed bytes: every migration before 0038, rows seeded
 * the way an existing install has them, then 0038 alone.
 *
 * Seeds and reads go through `bun:sqlite` on the same file — a third implementation, owned by neither applier.
 */
const files = readdirSync(migrationsDir)
	.filter(name => name.endsWith('.sql'))
	.sort()
const TARGET = files.find(name => name.startsWith('0038_'))

const dirs: string[] = []
afterAll(() => {
	for (const dir of dirs) removeTempDirWhenFree(dir)
})

const T0 = 1_763_000_000_000
const FUTURE = Date.now() + 3_600_000
const PAST = Date.now() - 3_600_000
const OWNER = '00000000-0000-4000-8000-000000000001'
const THREAD_LIVE = '00000000-0000-4000-8000-0000000000a1'
const THREAD_PAUSED = '00000000-0000-4000-8000-0000000000a2'

async function migrateAcross0038(seed: (db: Database) => void): Promise<Database> {
	if (!TARGET) throw new Error('migration 0038 is not committed')
	const dir = mkdtempSync(join(tmpdir(), 'codm-0038-'))
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

const insertThread = (db: Database, id: string, paused: boolean) =>
	db
		.prepare(
			'INSERT INTO `thread_threads` (`id`,`owner_id`,`channel_id`,`contact_external_id`,`contact_display_name`,`contact_kind`,`workspace_id`,`providers`,`participants`,`buffer_size`,`status`,`paused`,`created_at`,`updated_at`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
		)
		.run(
			id,
			OWNER,
			'c-1',
			`ext-${id}`,
			'a conversation',
			Object.values(ContactKind)[0]!,
			'w-1',
			'[]',
			'[]',
			Object.values(BufferSize)[0]!,
			Object.values(ThreadStatus)[0]!,
			paused ? 1 : 0,
			T0,
			T0,
		)

const insertIssue = (db: Database, id: string, threadId: string, paused: boolean) =>
	db
		.prepare(
			'INSERT INTO `issue_issues` (`id`,`owner_id`,`thread_id`,`key`,`title`,`status`,`provider`,`paused`,`created_at`,`updated_at`) VALUES (?,?,?,?,?,?,?,?,?,?)',
		)
		.run(id, OWNER, threadId, `K-${id}`, 'a task', 'WORKING', 'CLAUDE_CODE', paused ? 1 : 0, T0, T0)

interface ItemSeed {
	id: string
	targetKind?: 'ISSUE' | 'THREAD'
	targetId: string
	kind?: string
	claimClass?: string
	payload?: string
	leaseUntil?: number | null
	claimedBy?: string | null
	consumedAt?: number | null
	deadAt?: number | null
}

const insertItem = (db: Database, item: ItemSeed) =>
	db
		.prepare(
			'INSERT INTO `agent_mailbox` (`id`,`owner_id`,`target_kind`,`target_id`,`kind`,`claim_class`,`payload`,`dedup_key`,`lease_until`,`claimed_by`,`consumed_at`,`dead_at`,`created_at`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
		)
		.run(
			item.id,
			OWNER,
			item.targetKind ?? 'ISSUE',
			item.targetId,
			item.kind ?? 'STEER',
			item.claimClass ?? 'STEER',
			item.payload ?? '{}',
			`dedup-${item.id}`,
			item.leaseUntil ?? null,
			item.claimedBy ?? null,
			item.consumedAt ?? null,
			item.deadAt ?? null,
			T0,
		)

const STOP_COLUMNS = [
	'id',
	'owner_id',
	'issue_id',
	'thread_id',
	'kind',
	'title',
	'detail',
	'raised_at',
	'resolution',
	'resolved_at',
	'ask',
	'answer',
	'answered_by',
	'seq',
	'due_at',
	'ask_entry_id',
] as const

type StopRow = Record<(typeof STOP_COLUMNS)[number], string | number | null>

/** A stop row with every column NULL but the NOT NULL ones, overridden by `over`. */
const stopRow = (over: Partial<StopRow>): StopRow => ({
	id: 'stop',
	owner_id: OWNER,
	issue_id: null,
	thread_id: THREAD_LIVE,
	kind: 'STALLED',
	title: 't',
	detail: 'd',
	raised_at: T0,
	resolution: null,
	resolved_at: null,
	ask: null,
	answer: null,
	answered_by: null,
	seq: null,
	due_at: null,
	ask_entry_id: null,
	...over,
})

const insertStop = (db: Database, row: StopRow) =>
	db
		.prepare(
			`INSERT INTO \`issue_stops\` (${STOP_COLUMNS.map(c => `\`${c}\``).join(',')}) VALUES (${STOP_COLUMNS.map(() => '?').join(',')})`,
		)
		.run(...STOP_COLUMNS.map(c => row[c]))

const stops = (db: Database) => db.query('SELECT * FROM `issue_stops` ORDER BY `id`').all() as Record<string, unknown>[]

/** One stop per resolution that existed before 0038, one open ask with every column set, one without an issue. */
function existingStops(db: Database) {
	const resolutions = Object.values(StopResolution).filter(r => r !== StopResolution.AUTO_RETRY)
	for (const [i, resolution] of resolutions.entries()) {
		insertStop(db, {
			id: `s-${String(i).padStart(2, '0')}`,
			owner_id: OWNER,
			issue_id: 'i-1',
			thread_id: THREAD_LIVE,
			kind: 'SERVER_ERROR',
			title: 'a stop',
			detail: `detail ${i}`,
			raised_at: T0 + i,
			resolution,
			resolved_at: T0 + 100 + i,
			ask: null,
			answer: null,
			answered_by: null,
			seq: null,
			due_at: null,
			ask_entry_id: null,
		})
	}
	insertStop(db, {
		id: 's-open-ask',
		owner_id: OWNER,
		issue_id: 'i-1',
		thread_id: THREAD_LIVE,
		kind: 'QUESTION_ASKED',
		title: 'a question',
		detail: 'which one',
		raised_at: T0 + 500,
		resolution: null,
		resolved_at: null,
		ask: '{"question":"which one","options":[]}',
		answer: '{"kind":"TEXT","text":"x"}',
		answered_by: 'operator',
		seq: 1,
		due_at: T0 + 9_000,
		ask_entry_id: 'e-1',
	})
	insertStop(db, {
		id: 's-thread-only',
		owner_id: OWNER,
		issue_id: null,
		thread_id: THREAD_LIVE,
		kind: 'STALLED',
		title: 'stalled',
		detail: 'no issue',
		raised_at: T0 + 600,
		resolution: null,
		resolved_at: null,
		ask: null,
		answer: null,
		answered_by: null,
		seq: null,
		due_at: null,
		ask_entry_id: null,
	})
}

describe('migration 0038 — issue_stops rebuild', () => {
	it('every existing stop survives with every column intact, and no rebuild table is left behind', async () => {
		let before: Record<string, unknown>[] = []
		const db = await migrateAcross0038(seed => {
			existingStops(seed)
			before = stops(seed)
		})
		const after = stops(db)
		expect(before.length).toBe(Object.values(StopResolution).length - 1 + 2)
		expect(after).toEqual(before)
		expect(db.query("SELECT name FROM sqlite_master WHERE name LIKE '__new_%'").all()).toEqual([])
		db.close()
	})

	it('all four indexes are rebuilt, and the ask number is still unique per issue', async () => {
		const db = await migrateAcross0038(existingStops)
		const indexes = (db.query("PRAGMA index_list('issue_stops')").all() as { name: string; unique: number }[])
			.filter(index => !index.name.startsWith('sqlite_autoindex'))
			.map(index => [index.name, index.unique])
			.sort()
		expect(indexes).toEqual([
			['stops_due_at_idx', 0],
			['stops_issue_id_idx', 0],
			['stops_issue_seq_unq', 1],
			['stops_thread_id_idx', 0],
		])
		expect(() => insertStop(db, stopRow({ id: 'dup', issue_id: 'i-1', kind: 'DECISION_REQUESTED', seq: 1 }))).toThrow()
		db.close()
	})

	it('the rebuilt resolution CHECK admits AUTO_RETRY and still refuses unknown values', async () => {
		const db = await migrateAcross0038(() => {})
		insertStop(db, stopRow({ id: 'auto', issue_id: 'i-9', resolution: StopResolution.AUTO_RETRY, resolved_at: T0 + 1 }))
		expect(db.query("SELECT `resolution` FROM `issue_stops` WHERE `id` = 'auto'").get()).toEqual({ resolution: 'AUTO_RETRY' })
		expect(() => insertStop(db, stopRow({ id: 'bad', issue_id: 'i-9', resolution: 'NOT_A_RESOLUTION' }))).toThrow()
		expect(() => insertStop(db, stopRow({ id: 'bad2', issue_id: 'i-9', kind: 'NOT_A_KIND' }))).toThrow()
		db.close()
	})
})

describe('migration 0038 — cause of the items deferred at upgrade time', () => {
	const seed = (db: Database) => {
		insertThread(db, THREAD_LIVE, false)
		insertThread(db, THREAD_PAUSED, true)
		insertIssue(db, 'i-live', THREAD_LIVE, false)
		insertIssue(db, 'i-held', THREAD_LIVE, true)
		insertIssue(db, 'i-in-paused-conversation', THREAD_PAUSED, false)
		// deferred: runnable, no holder, lease in the future
		insertItem(db, { id: 'm-provider', targetId: 'i-live', leaseUntil: FUTURE })
		insertItem(db, { id: 'm-held-issue', targetId: 'i-held', leaseUntil: FUTURE })
		insertItem(db, { id: 'm-held-conversation', targetId: 'i-in-paused-conversation', leaseUntil: FUTURE })
		insertItem(db, {
			id: 'm-thread-lane',
			targetKind: 'THREAD',
			targetId: THREAD_PAUSED,
			kind: 'OPERATOR_MESSAGE',
			claimClass: 'OPERATOR',
			leaseUntil: FUTURE,
		})
		// not deferred
		insertItem(db, { id: 'm-runnable', targetId: 'i-live' })
		insertItem(db, { id: 'm-expired', targetId: 'i-held', leaseUntil: PAST })
		insertItem(db, { id: 'm-claimed', targetId: 'i-live', leaseUntil: FUTURE, claimedBy: 'worker-1' })
		insertItem(db, { id: 'm-consumed', targetId: 'i-live', leaseUntil: FUTURE, consumedAt: T0 })
		insertItem(db, { id: 'm-dead', targetId: 'i-live', leaseUntil: FUTURE, deadAt: T0 })
	}

	it('a paused issue or conversation is HOLD, any other deferral is PROVIDER_LIMIT, the rest stays NULL', async () => {
		const db = await migrateAcross0038(seed)
		const causes = Object.fromEntries(
			(db.query('SELECT `id`,`defer_cause` FROM `agent_mailbox`').all() as { id: string; defer_cause: string | null }[]).map(r => [
				r.id,
				r.defer_cause,
			]),
		)
		expect(causes).toEqual({
			'm-provider': 'PROVIDER_LIMIT',
			'm-held-issue': 'HOLD',
			'm-held-conversation': 'HOLD',
			// `holdItem` only ever holds ISSUE items: a deferred conversation item is the provider's limit.
			'm-thread-lane': 'PROVIDER_LIMIT',
			'm-runnable': null,
			'm-expired': null,
			'm-claimed': null,
			'm-consumed': null,
			'm-dead': null,
		})
		db.close()
	})

	it('the session table gains handoff_requested_at, NULL for every existing session', async () => {
		const db = await migrateAcross0038(() => {})
		const columns = (db.query("PRAGMA table_info('agent_agent_sessions')").all() as { name: string; notnull: number }[]).filter(
			c => c.name === 'handoff_requested_at',
		)
		expect(columns).toEqual([expect.objectContaining({ name: 'handoff_requested_at', notnull: 0 })])
		db.close()
	})
})

describe('migration 0038 — old declaration reminders', () => {
	it('a reminder flagged in its payload becomes REMINDER with the first nudge of its episode; other items are untouched', async () => {
		const db = await migrateAcross0038(seed => {
			insertItem(seed, {
				id: 'r-old',
				targetId: 'i-1',
				payload: JSON.stringify({ text: 'declare', declarationReminder: true }),
				consumedAt: T0,
			})
			insertItem(seed, {
				id: 'r-new-class',
				targetId: 'i-1',
				claimClass: 'REMINDER',
				payload: JSON.stringify({ text: 'declare', declarationReminder: true }),
			})
			insertItem(seed, { id: 's-steer', targetId: 'i-1', payload: JSON.stringify({ text: 'a steer' }) })
			insertItem(seed, { id: 's-false', targetId: 'i-1', payload: JSON.stringify({ text: 'x', declarationReminder: false }) })
		})
		const rows = Object.fromEntries(
			(
				db.query('SELECT `id`,`claim_class`,`payload` FROM `agent_mailbox`').all() as { id: string; claim_class: string; payload: string }[]
			).map(r => [r.id, { claimClass: r.claim_class, payload: JSON.parse(r.payload) }]),
		)
		const converted = { claimClass: 'REMINDER', payload: { text: 'declare', nudge: { ordinal: 1, source: 'RECONCILER' } } }
		expect(rows['r-old']).toEqual(converted)
		expect(rows['r-new-class']).toEqual(converted)
		expect(rows['s-steer']).toEqual({ claimClass: 'STEER', payload: { text: 'a steer' } })
		expect(rows['s-false']).toEqual({ claimClass: 'STEER', payload: { text: 'x', declarationReminder: false } })
		db.close()
	})
})
