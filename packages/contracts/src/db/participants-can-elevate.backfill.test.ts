import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The `canElevate` BACKFILL of `thread_threads.participants` (participant-permission-posture spec,
 * Decision 2 / AC-2) — asserted against the COMMITTED migration bytes, the same file both runtimes
 * apply at boot (`LibsqlDriver` and the Go `SqliteStore`), never against a copy of the SQL.
 *
 * The rule: the `operator` sentinel gains `canElevate: true`, every other participant `false`; a
 * participant that ALREADY carries the key is never touched — which is also what makes a second pass
 * a byte-for-byte no-op (idempotency), the property a boot migrator applying on a reopened file needs.
 */
const MIGRATIONS = join(import.meta.dir, 'sqlite', 'migrations')

function backfillStatements(): string[] {
	const file = readdirSync(MIGRATIONS)
		.filter(name => name.endsWith('.sql'))
		.sort()
		.find(name => readFileSync(join(MIGRATIONS, name), 'utf8').includes("'$.canElevate'"))
	if (!file) throw new Error('no committed migration carries the canElevate backfill')
	return readFileSync(join(MIGRATIONS, file), 'utf8')
		.split('--> statement-breakpoint')
		.map(chunk =>
			chunk
				.split('\n')
				.filter(line => !line.trimStart().startsWith('--'))
				.join('\n')
				.trim(),
		)
		.filter(statement => statement.startsWith('UPDATE `thread_threads`'))
}

function freshDb(): Database {
	const db = new Database(':memory:')
	db.run('CREATE TABLE `thread_threads` (`id` text PRIMARY KEY NOT NULL, `participants` text NOT NULL)')
	return db
}

const seed = (db: Database, id: string, participants: unknown[]) =>
	db.run('INSERT INTO `thread_threads` (`id`, `participants`) VALUES (?, ?)', [id, JSON.stringify(participants)])

const apply = (db: Database) => {
	for (const statement of backfillStatements()) db.run(statement)
}

const raw = (db: Database, id: string): string =>
	(db.query('SELECT `participants` FROM `thread_threads` WHERE `id` = ?').get(id) as { participants: string }).participants

const roster = (db: Database, id: string) =>
	JSON.parse(raw(db, id)) as Array<{ participantId: string; canInvoke: boolean; canElevate?: boolean }>

const OPERATOR = { participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true }
const MEMBER = { participantId: '5511900000011@s.whatsapp.net', name: 'Ada', source: 'Channel group member', canInvoke: true }
const OBSERVER = { participantId: '5511900000012@s.whatsapp.net', name: 'Bob', source: 'Channel group member', canInvoke: false }

describe('participants backfill — canElevate (AC-2)', () => {
	it('the migration carries exactly ONE backfill statement', () => {
		expect(backfillStatements()).toHaveLength(1)
	})

	it('the operator gains canElevate=true, every other participant false — order and the other fields intact', () => {
		const db = freshDb()
		seed(db, 't1', [OPERATOR, MEMBER, OBSERVER])

		apply(db)

		const after = roster(db, 't1')
		expect(after.map(p => p.participantId)).toEqual([OPERATOR.participantId, MEMBER.participantId, OBSERVER.participantId])
		expect(after.map(p => p.canElevate)).toEqual([true, false, false])
		// canInvoke is a SEPARATE axis (Decision 2) — the backfill must not derive one from the other.
		expect(after.map(p => p.canInvoke)).toEqual([true, true, false])
	})

	it('a participant that already carries canElevate is never overwritten', () => {
		const db = freshDb()
		seed(db, 't2', [
			{ ...OPERATOR, canElevate: false },
			{ ...MEMBER, canElevate: true },
		])

		apply(db)

		expect(roster(db, 't2').map(p => p.canElevate)).toEqual([false, true])
	})

	it('is idempotent — a second pass changes no byte', () => {
		const db = freshDb()
		seed(db, 't3', [OPERATOR, MEMBER])

		apply(db)
		const once = raw(db, 't3')
		apply(db)

		expect(raw(db, 't3')).toBe(once)
	})

	it('writes JSON booleans, never 0/1 — the TS VO parses `z.boolean()`', () => {
		const db = freshDb()
		seed(db, 't4', [OPERATOR])

		apply(db)

		expect(raw(db, 't4')).toContain('"canElevate":true')
	})
})
