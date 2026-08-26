import { eq } from 'drizzle-orm'
import type { SQLiteInsertValue, SQLiteTable, SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core'
import type { LibSqlTransaction } from './LibSqlDatabaseDriver'
import type { BaseInfrastructureErrors } from '../../errors/codes'
import { BaseError } from '../../types/BaseError'

/**
 * O upsert guardado por versão da família **libsql**, gêmeo de `../pg/saveWithOptimisticLock.ts`.
 *
 * Vivia no caminho neutro `db/saveWithOptimisticLock.ts` enquanto era o único — mas sempre foi
 * sqlite-core puro (`SQLiteTable`, `SQLiteInsertValue`, `LibSqlTransaction`), o que fazia o caminho
 * neutro prometer uma generalidade que o arquivo não tinha. É a mesma forma do defeito que a spec
 * famílias-por-dialeto nomeou — *"não existe lugar estrutural para uma segunda família: infra e
 * schema são pg hardcoded em paths neutros"* — só que com o dialeto invertido.
 *
 * Não há versão neutra e não deve haver: `SQLiteTable | PgTable` não compila em uso (a prova TS2349
 * da D1), e o "um dos dois" não existe no tipo do client — existe no port abstrato acima dele.
 * O NOME carrega a família porque os dois barris caem no mesmo `db/index.ts`, e o `tsc` recusa a
 * ambiguidade (TS2308) — o mesmo padrão de `./client.ts`, cujo arquivo é neutro e cujo export é
 * `LibSqlDrizzleClient`. O arquivo diz ONDE, o símbolo diz QUAL.
 */

/** Union of THE GIVEN table's column objects — rejects a column from another table at compile time. */
type ColumnsOf<T extends SQLiteTable> = T['_']['columns'][keyof T['_']['columns']]

interface LibSqlSaveWithOptimisticLockOptions<T extends SQLiteTable> {
	/**
	 * The WRITE handle — i.e. the `tx` a `uow.transaction(...)` callback receives. Never
	 * `LibSqlDatabaseDriver.db`, which is the read connection.
	 */
	db: LibSqlTransaction
	table: T
	/** Full row to insert — checked against the table's own insert shape. */
	data: SQLiteInsertValue<T>
	conflictTarget: ColumnsOf<T> | ColumnsOf<T>[]
	/**
	 * Columns to overwrite on conflict (`excluded.*` refs) — keyed and value-checked against the
	 * table's own columns, so a typo'd key or a column of another table is a type error.
	 */
	set: SQLiteUpdateSetSource<T>
	versionColumn: ColumnsOf<T>
	previousVersion: number
}

/**
 * Version-guarded insert-or-update: INSERT the row, and on conflict UPDATE it ONLY while its
 * version still equals `previousVersion` (`setWhere`). A concurrent writer bumped the version →
 * the update matches zero rows → OPTIMISTIC_LOCK_CONFLICT (mapped to HTTP 409) instead of a silent
 * lost-update. Callers bump the entity's version BEFORE building `data` (see the repository
 * `save()` idiom) so the stored row moves to `previousVersion + 1` on success.
 */
export async function libSqlSaveWithOptimisticLock<T extends SQLiteTable>({
	db,
	table,
	data,
	conflictTarget,
	set,
	versionColumn,
	previousVersion,
}: LibSqlSaveWithOptimisticLockOptions<T>): Promise<void> {
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
