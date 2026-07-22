import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { DrizzleClient } from '@template/core-typescript'
import { stops } from '@template/contracts/db'
import type { StopKind, StopResolution } from '@template/contracts-typescript/wire/enums'
import { StopRepository, type RaiseStopInput, type StopRow } from './StopRepository'

@injectable()
export class DrizzleStopRepository extends StopRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async raise(input: RaiseStopInput, tx?: DrizzleClient): Promise<StopRow> {
		const dbc = tx ?? this.db
		const rows = await dbc
			.insert(stops)
			.values({
				id: input.stopId,
				ownerId: input.ownerId,
				issueId: input.issueId,
				threadId: input.threadId,
				kind: input.kind,
				title: input.title,
				detail: input.detail,
			})
			.returning()
		return this.toRow(rows[0]!)
	}

	async findById(stopId: string, tx?: DrizzleClient): Promise<StopRow | undefined> {
		const dbc = tx ?? this.db
		const rows = await dbc.select().from(stops).where(eq(stops.id, stopId)).limit(1)
		return rows[0] ? this.toRow(rows[0]) : undefined
	}

	async openByIssue(issueId: string, tx?: DrizzleClient): Promise<StopRow[]> {
		const dbc = tx ?? this.db
		const rows = await dbc.select().from(stops).where(and(eq(stops.issueId, issueId), isNull(stops.resolvedAt)))
		return rows.map(r => this.toRow(r))
	}

	async openByThread(threadId: string, tx?: DrizzleClient): Promise<StopRow[]> {
		const dbc = tx ?? this.db
		const rows = await dbc.select().from(stops).where(and(eq(stops.threadId, threadId), isNull(stops.resolvedAt)))
		return rows.map(r => this.toRow(r))
	}

	async resolve(stopId: string, resolution: StopResolution, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		await dbc.update(stops).set({ resolution, resolvedAt: new Date() }).where(eq(stops.id, stopId))
	}

	private toRow(row: typeof stops.$inferSelect): StopRow {
		return {
			stopId: row.id,
			ownerId: row.ownerId,
			issueId: row.issueId,
			threadId: row.threadId,
			kind: row.kind as StopKind,
			title: row.title,
			detail: row.detail,
			raisedAt: row.raisedAt,
			resolution: (row.resolution ?? undefined) as StopResolution | undefined,
			resolvedAt: row.resolvedAt ?? undefined,
		}
	}
}
