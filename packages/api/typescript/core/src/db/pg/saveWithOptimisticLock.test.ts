// pgSaveWithOptimisticLock (família pg) — o upsert guardado por versão, nas genéricas do pg-core.
// Gêmeo de `../libsql/saveWithOptimisticLock.test.ts`, com os MESMOS três casos: o helper existe
// para que a bumpada de um escritor concorrente vire OPTIMISTIC_LOCK_CONFLICT explícito em vez de
// lost update silencioso, e o que estes casos fixam é que o guard ainda CASA ZERO LINHAS numa
// versão velha em vez de sobrescrever.
//
// Duas diferenças em relação ao gêmeo, e as duas são a assimetria documentada das famílias:
//
//   1. A transação vem de `driver.db.transaction(...)` — o `transaction()` nativo do drizzle — e não
//      de um método do nível-meio. A família pg não declara `transaction()` em `PgDatabaseDriver`
//      porque não precisa; a libsql declara por medição (pedir transação ao client dela vaza
//      descritor e reverte pragmas).
//   2. O banco é o TRONCO CLOUD (`@codm/contracts/db/pg`), num Postgres real em processo
//      (PGlite). Não é o mesmo `owners` do tronco sqlite: são dialetos diferentes com tabelas
//      diferentes, que é a razão de os dois troncos existirem (ADR 0005).
import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { owners } from '@codm/contracts/db/pg'
import { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { PGliteDriver } from './drivers/PGliteDriver'
import { pgSaveWithOptimisticLock } from './saveWithOptimisticLock'

describe('pgSaveWithOptimisticLock', () => {
	const driver = new PGliteDriver()

	const OWNER_ID = '11111111-1111-4111-8111-111111111111'

	const save = (version: number, previousVersion: number, name: string) =>
		driver.db.transaction(tx =>
			pgSaveWithOptimisticLock({
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
		await driver.runMigrations()
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
