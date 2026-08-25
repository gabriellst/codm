import { injectable } from 'tsyringe-neo'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { LibSqlDatabaseDriver, tryCatchAsync } from '@codm/core-typescript'
import { issues, threads } from '@codm/contracts/db'
import { IssueStatus } from '@codm/contracts-typescript/wire/enums'

import { WorkspaceUsageQuery } from './WorkspaceUsageQuery'

/**
 * Reads the issue + thread tables directly (BFF-style, no cross-context write-model import): an
 * issue is "on" a workspace via its thread's `workspaceId`. WORKING + not archived counts as in-use.
 */
@injectable()
export class LibSqlWorkspaceUsageQuery extends WorkspaceUsageQuery {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async hasWorkingIssues(workspaceId: string): Promise<boolean> {
		const result = await tryCatchAsync(async () => {
			const rows = await this.driver.db
				.select({ one: sql`1` })
				.from(issues)
				// Apagadas do not hold a workspace hostage (thread-deletion spec, decision 5). Reaching this
				// with a deleted thread takes a race the product cannot currently lose — decision 2 refuses
				// the delete while an issue is WORKING, and decision 3 stops a deleted thread from acquiring
				// new work — so the predicate is a floor, not a fix. It is here because "which reads can see
				// a deleted thread" has to be answerable per query rather than per argument.
				.innerJoin(threads, and(eq(issues.threadId, threads.id), isNull(threads.deletedAt)))
				.where(and(eq(threads.workspaceId, workspaceId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false)))
				.limit(1)
			return rows.length > 0
		})
		// Fail closed on read error would block legitimate removals; the WORKING guard is advisory —
		// a missing issue table (pre-BC5) legitimately means "no working issues".
		return result.success ? result.data : false
	}
}
