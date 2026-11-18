import { injectable } from 'tsyringe-neo'
import { and, eq, gte, isNull, lt, or } from 'drizzle-orm'
import { PgDatabaseDriver, PgTransaction } from '@codm/core-typescript'
import { panelActions } from '@codm/contracts/db/pg'
import { PanelActionBodySchema, type PanelActionOutcome } from '@shared/schemas'
import { PanelActionStore, type PanelActionRow } from './PanelActionStore'

type StoredRow = typeof panelActions.$inferSelect

/** The jsonb payload was validated on the way in; a row that no longer parses is skipped, never handed out. */
function toRow(row: StoredRow): PanelActionRow | undefined {
	const payload = PanelActionBodySchema.safeParse(row.payload)
	return payload.success ? { ...row, payload: payload.data } : undefined
}

@injectable()
export class PgPanelActionStore extends PanelActionStore {
	constructor(private driver: PgDatabaseDriver) {
		super()
	}

	async insert(row: PanelActionRow, tx?: PgTransaction): Promise<void> {
		await (tx ?? this.driver.db).insert(panelActions).values(row)
	}

	async requestTimes(sessionHash: string, since: Date, tx?: PgTransaction): Promise<Date[]> {
		const rows = await (tx ?? this.driver.db)
			.select({ requestedAt: panelActions.requestedAt })
			.from(panelActions)
			.where(and(eq(panelActions.sessionHash, sessionHash), gte(panelActions.requestedAt, since)))
		return rows.map(row => row.requestedAt)
	}

	async find(id: string, tx?: PgTransaction): Promise<PanelActionRow | undefined> {
		const [row] = await (tx ?? this.driver.db).select().from(panelActions).where(eq(panelActions.id, id)).limit(1)
		return row ? toRow(row) : undefined
	}

	async handOut(ownerId: string, now: Date, askedSince: Date, redeliverBefore: Date, tx?: PgTransaction): Promise<PanelActionRow[]> {
		const rows = await (tx ?? this.driver.db)
			.update(panelActions)
			.set({ deliveredAt: now })
			.where(
				and(
					eq(panelActions.ownerId, ownerId),
					isNull(panelActions.outcome),
					gte(panelActions.requestedAt, askedSince),
					or(isNull(panelActions.deliveredAt), lt(panelActions.deliveredAt, redeliverBefore)),
				),
			)
			.returning()
		// RETURNING has no ORDER BY: oldest first is restored here, so the daemon executes in the order people asked.
		return rows
			.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())
			.map(toRow)
			.filter(row => row !== undefined)
	}

	async recordOutcome(ownerId: string, outcome: PanelActionOutcome, at: Date, tx?: PgTransaction): Promise<boolean> {
		const rows = await (tx ?? this.driver.db)
			.update(panelActions)
			.set({ outcome: outcome.status, outcomeCode: outcome.code ?? null, outcomeAt: at })
			.where(and(eq(panelActions.id, outcome.actionId), eq(panelActions.ownerId, ownerId), isNull(panelActions.outcome)))
			.returning({ id: panelActions.id })
		return rows.length > 0
	}

	async revokeGroup(threadId: string, tx?: PgTransaction): Promise<void> {
		await (tx ?? this.driver.db).delete(panelActions).where(eq(panelActions.threadId, threadId))
	}

	async purge(ownerId: string, before: Date, tx?: PgTransaction): Promise<void> {
		await (tx ?? this.driver.db).delete(panelActions).where(and(eq(panelActions.ownerId, ownerId), lt(panelActions.requestedAt, before)))
	}
}
