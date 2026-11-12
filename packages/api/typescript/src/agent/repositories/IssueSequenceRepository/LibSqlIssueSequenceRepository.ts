import { injectable } from 'tsyringe-neo'
import { sql } from 'drizzle-orm'
import { LibSqlDatabaseDriver, LibSqlTransaction } from '@codm/core-typescript'
import { agentIssueSequences } from '@codm/contracts/db'
import { IssueSequenceRepository } from './IssueSequenceRepository'

@injectable()
export class LibSqlIssueSequenceRepository extends IssueSequenceRepository {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async next(workspaceId: string, tx?: LibSqlTransaction): Promise<number> {
		// One statement: insert the first number, or bump the last one — and read back what was handed out.
		// Joins the caller's transaction; alone, it takes the driver's write path (never the read handle).
		const draw = (dbc: LibSqlTransaction) =>
			dbc
				.insert(agentIssueSequences)
				.values({ workspaceId, lastSeq: 1 })
				.onConflictDoUpdate({ target: agentIssueSequences.workspaceId, set: { lastSeq: sql`${agentIssueSequences.lastSeq} + 1` } })
				.returning({ seq: agentIssueSequences.lastSeq })
		const [row] = await (tx ? draw(tx) : this.driver.transaction(draw))
		if (!row) throw new Error(`issue sequence for workspace ${workspaceId} returned no row`)
		return row.seq
	}
}
