import { eq } from 'drizzle-orm'
import type { PgInsertValue, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core'
import type { PgTransaction } from './PgDatabaseDriver'
import type { BaseInfrastructureErrors } from '../../errors/codes'
import { BaseError } from '../../types/BaseError'

/**
 * O upsert guardado por versão da família **pg**, gêmeo de `../libsql/saveWithOptimisticLock.ts`.
 *
 * A semântica é a MESMA nas duas famílias — `INSERT … ON CONFLICT DO UPDATE … WHERE version = ?`
 * seguido de `RETURNING` —; o que difere são só as genéricas do drizzle: `pg-core` contra
 * `sqlite-core`. Não existe (nem deve existir) uma versão neutra: a D1 de
 * famílias-por-dialeto provou por compilador (TS2349) que `PgTable | SQLiteTable` não sobrevive ao
 * uso — o "um dos dois" mora no port abstrato acima do client, nunca no tipo do client.
 *
 * O NOME carrega a família porque os dois barris caem no mesmo `db/index.ts`, e o `tsc` recusa a
 * ambiguidade (TS2308) — o mesmo padrão de `./client.ts`, cujo arquivo é neutro e cujo export é
 * `PgDrizzleClient`. O arquivo diz ONDE, o símbolo diz QUAL.
 *
 * O handle de escrita vem do NÍVEL-MEIO (`./PgDatabaseDriver`), igual ao gêmeo libsql — nada aqui
 * sobe para `services/` para pegar um tipo de banco.
 */

/** Union of THE GIVEN table's column objects — rejects a column from another table at compile time. */
type ColumnsOf<T extends PgTable> = T['_']['columns'][keyof T['_']['columns']]

interface PgSaveWithOptimisticLockOptions<T extends PgTable> {
	/**
	 * The WRITE handle — i.e. the `tx` a `uow.transaction(...)` callback receives. Never
	 * `PgDatabaseDriver.db`, which is the read connection.
	 */
	db: PgTransaction
	table: T
	/** Full row to insert — checked against the table's own insert shape. */
	data: PgInsertValue<T>
	conflictTarget: ColumnsOf<T> | ColumnsOf<T>[]
	/**
	 * Columns to overwrite on conflict (`excluded.*` refs) — keyed and value-checked against the
	 * table's own columns, so a typo'd key or a column of another table is a type error.
	 */
	set: PgUpdateSetSource<T>
	versionColumn: ColumnsOf<T>
	previousVersion: number
}

/**
 * Version-guarded insert-or-update: INSERT the row, and on conflict UPDATE it ONLY while its
 * version still equals `previousVersion` (`setWhere`). A concurrent writer bumped the version →
 * the update matches zero rows → OPTIMISTIC_LOCK_CONFLICT (mapped to HTTP 409) instead of a silent
 * lost-update. Callers bump the entity's version BEFORE building `data` (see the repository
 * `save()` idiom) so the stored row moves to `previousVersion + 1` on success.
 *
 * `setWhere` é o campo certo, não `targetWhere`: o guard filtra a LINHA QUE JÁ EXISTE na hora do
 * UPDATE, não o índice do conflito. O `targetWhere` do pg-core serve a índice parcial e aqui
 * silenciaria o guard — o insert cairia no conflito e sobrescreveria assim mesmo. (No pg-core o
 * `where` solto é `@deprecated` exatamente porque a ambiguidade entre os dois custava caro.)
 */
export async function pgSaveWithOptimisticLock<T extends PgTable>({
	db,
	table,
	data,
	conflictTarget,
	set,
	versionColumn,
	previousVersion,
}: PgSaveWithOptimisticLockOptions<T>): Promise<void> {
	const saved = await db
		.insert(table)
		.values(data)
		.onConflictDoUpdate({
			target: conflictTarget,
			set,
			setWhere: eq(versionColumn, previousVersion),
		})
		.returning({ version: versionColumn })

	if (saved.length === 0) {
		throw new BaseError<BaseInfrastructureErrors>(
			'OPTIMISTIC_LOCK_CONFLICT',
			`Optimistic lock conflict: entity was modified by another transaction (expected version ${previousVersion})`,
		)
	}
}
