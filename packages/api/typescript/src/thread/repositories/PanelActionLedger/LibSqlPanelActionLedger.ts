import { injectable } from 'tsyringe-neo'
import { and, asc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import { LibSqlDatabaseDriver, LibSqlTransaction } from '@codm/core-typescript'
import { panelActionLedger } from '@codm/contracts/db'
import { PanelActionLedger, type PanelActionLedgerRow } from './PanelActionLedger'

type StoredRow = typeof panelActionLedger.$inferSelect

function toRow(row: StoredRow): PanelActionLedgerRow {
	return {
		actionId: row.id,
		ownerId: row.ownerId,
		threadId: row.threadId,
		kind: row.kind,
		outcome: row.outcome,
		code: row.outcomeCode ?? undefined,
		executedAt: row.executedAt,
	}
}

@injectable()
export class LibSqlPanelActionLedger extends PanelActionLedger {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async record(row: PanelActionLedgerRow, tx?: LibSqlTransaction): Promise<boolean> {
		// The latch: RETURNING yields the row only when no conflict occurred — atomic at the DB.
		const inserted = await (tx ?? this.driver.db)
			.insert(panelActionLedger)
			.values({
				id: row.actionId,
				ownerId: row.ownerId,
				threadId: row.threadId,
				kind: row.kind,
				outcome: row.outcome,
				outcomeCode: row.code ?? null,
				executedAt: row.executedAt,
			})
			.onConflictDoNothing({ target: panelActionLedger.id })
			.returning({ id: panelActionLedger.id })
		return inserted.length > 0
	}

	async find(actionId: string, tx?: LibSqlTransaction): Promise<PanelActionLedgerRow | undefined> {
		const [row] = await (tx ?? this.driver.db).select().from(panelActionLedger).where(eq(panelActionLedger.id, actionId)).limit(1)
		return row ? toRow(row) : undefined
	}

	async unreported(limit: number, tx?: LibSqlTransaction): Promise<PanelActionLedgerRow[]> {
		const rows = await (tx ?? this.driver.db)
			.select()
			.from(panelActionLedger)
			.where(isNull(panelActionLedger.reportedAt))
			.orderBy(asc(panelActionLedger.executedAt))
			.limit(limit)
		return rows.map(toRow)
	}

	async markReported(actionIds: readonly string[], at: Date, tx?: LibSqlTransaction): Promise<void> {
		if (actionIds.length === 0) return
		await (tx ?? this.driver.db)
			.update(panelActionLedger)
			.set({ reportedAt: at })
			.where(inArray(panelActionLedger.id, [...actionIds]))
	}

	async purge(before: Date, tx?: LibSqlTransaction): Promise<void> {
		await (tx ?? this.driver.db)
			.delete(panelActionLedger)
			.where(and(isNotNull(panelActionLedger.reportedAt), lt(panelActionLedger.executedAt, before)))
	}
}
