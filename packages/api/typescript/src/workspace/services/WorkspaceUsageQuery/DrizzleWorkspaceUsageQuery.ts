import { injectable } from 'tsyringe-neo'
import { and, eq, sql } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codedm/core-typescript'
import { issues, threads } from '@codedm/contracts/db'
import { IssueStatus } from '@codedm/contracts-typescript/wire/enums'

import { WorkspaceUsageQuery } from './WorkspaceUsageQuery'

/**
 * Reads the issue + thread tables directly (BFF-style, no cross-context write-model import): an
 * issue is "on" a workspace via its thread's `workspaceId`. WORKING + not archived counts as in-use.
 */
@injectable()
export class DrizzleWorkspaceUsageQuery extends WorkspaceUsageQuery {
	constructor(private db: DrizzleClient) {
		super()
	}

	async hasWorkingIssues(workspaceId: string): Promise<boolean> {
		const result = await tryCatchAsync(async () => {
			const rows = await this.db
				.select({ one: sql`1` })
				.from(issues)
				.innerJoin(threads, eq(issues.threadId, threads.id))
				.where(and(eq(threads.workspaceId, workspaceId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false)))
				.limit(1)
			return rows.length > 0
		})
		// Fail closed on read error would block legitimate removals; the WORKING guard is advisory —
		// a missing issue table (pre-BC5) legitimately means "no working issues".
		return result.success ? result.data : false
	}
}
