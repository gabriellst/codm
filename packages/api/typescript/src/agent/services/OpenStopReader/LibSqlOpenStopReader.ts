import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { LibSqlDatabaseDriver, type LibSqlTransaction } from '@codm/core-typescript'
import { stops } from '@codm/contracts/db'
import type { StopKind } from '@codm/contracts-typescript/wire/enums'
import { OpenStopReader } from './OpenStopReader'

/** One indexed read (`stops_issue_id_idx`) of the task's unresolved stops, inside the caller's transaction when given. */
@injectable()
export class LibSqlOpenStopReader extends OpenStopReader {
	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	async openStopKinds(issueId: string, tx?: LibSqlTransaction): Promise<StopKind[]> {
		const db = tx ?? this.driver.db
		const rows = await db
			.select({ kind: stops.kind })
			.from(stops)
			.where(and(eq(stops.issueId, issueId), isNull(stops.resolvedAt)))
		return rows.map(row => row.kind)
	}
}
