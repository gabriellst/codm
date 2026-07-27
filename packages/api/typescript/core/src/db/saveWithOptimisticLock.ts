import { eq } from 'drizzle-orm'
import type { SQLiteInsertValue, SQLiteTable, SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core'
import type { DrizzleTransaction } from '../services/UnitOfWork/DrizzleUnitOfWork'
import type { BaseInfrastructureErrors } from '../errors/codes'
import { BaseError } from '../types/BaseError'

/** Union of THE GIVEN table's column objects — rejects a column from another table at compile time. */
type ColumnsOf<T extends SQLiteTable> = T['_']['columns'][keyof T['_']['columns']]

interface SaveWithOptimisticLockOptions<T extends SQLiteTable> {
	/**
	 * The WRITE handle — i.e. the `tx` a `uow.transaction(...)` callback receives. Never the
	 * injected `DrizzleClient`, which is the read connection.
	 */
	db: DrizzleTransaction
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
export async function saveWithOptimisticLock<T extends SQLiteTable>({
	db,
	table,
	data,
	conflictTarget,
	set,
	versionColumn,
	previousVersion,
}: SaveWithOptimisticLockOptions<T>): Promise<void> {
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
