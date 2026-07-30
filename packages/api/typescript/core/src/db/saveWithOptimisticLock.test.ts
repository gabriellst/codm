// saveWithOptimisticLock — the version-guarded upsert, on the sqlite-core generics.
//
// The point of the helper is that a concurrent writer's bump turns into an explicit
// OPTIMISTIC_LOCK_CONFLICT rather than a silent lost update; `onConflictDoUpdate` + `setWhere` +
// `.returning()` all exist in sqlite-core with the same shape, so what these cases really pin is
// that the guard still MATCHES ZERO ROWS on a stale version instead of overwriting.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import * as schema from '@codm/contracts/db'
import { owners } from '@codm/contracts/db'
import { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { migrationsDir } from '@codm/contracts/db/migrations'
import { LibsqlDriver } from './drivers/LibsqlDriver'
import { saveWithOptimisticLock } from './saveWithOptimisticLock'

describe('saveWithOptimisticLock', () => {
	let dir: string
	let driver: LibsqlDriver

	const OWNER_ID = '11111111-1111-4111-8111-111111111111'

	const save = (version: number, previousVersion: number, name: string) =>
		driver.transaction(tx =>
			saveWithOptimisticLock({
				db: tx,
				table: owners,
				data: {
					id: OWNER_ID,
					name,
					kind: OwnerKind.INDIVIDUAL,
					responsibleUserId: 'user-1',
					version,
				},
				conflictTarget: owners.id,
				set: { name, version },
				versionColumn: owners.version,
				previousVersion,
			}),
		)

	const read = async () => {
		const [row] = await driver.db.select().from(owners).where(eq(owners.id, OWNER_ID))
		return row
	}

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'libsql-oplock-test-'))
		driver = new LibsqlDriver({ schema, migrationsDir, dbPath: join(dir, 'codm.db') })
		await driver.runMigrations()
	})

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	beforeEach(async () => {
		await driver.reset()
	})

	it('inserts a fresh row', async () => {
		await save(1, 0, 'first')
		expect((await read())?.name).toBe('first')
		expect((await read())?.version).toBe(1)
	})

	it('updates when the stored version still matches `previousVersion`', async () => {
		await save(1, 0, 'first')
		await save(2, 1, 'second')

		const row = await read()
		expect(row?.name).toBe('second')
		expect(row?.version).toBe(2)
	})

	it('raises OPTIMISTIC_LOCK_CONFLICT on a stale version, and does NOT overwrite', async () => {
		await save(1, 0, 'first')
		await save(2, 1, 'second')

		// A writer that still believes the row is at version 1.
		await expect(save(2, 1, 'stale')).rejects.toMatchObject({ name: 'OPTIMISTIC_LOCK_CONFLICT' })

		const row = await read()
		expect(row?.name).toBe('second')
		expect(row?.version).toBe(2)
	})
})
