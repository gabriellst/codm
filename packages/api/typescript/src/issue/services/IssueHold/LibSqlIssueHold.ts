import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver, LibSqlTransaction } from '@codm/core-typescript'
import { issues, threads } from '@codm/contracts/db'
import { IssueHold } from './IssueHold'

@injectable()
export class LibSqlIssueHold extends IssueHold {
	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	/** One read: the issue's own flag and its thread's, joined. An unknown issue is not held. */
	async isHeld(issueId: string, tx?: LibSqlTransaction): Promise<boolean> {
		const rows = await (tx ?? this.driver.db)
			.select({ issuePaused: issues.paused, threadPaused: threads.paused })
			.from(issues)
			.leftJoin(threads, eq(threads.id, issues.threadId))
			.where(eq(issues.id, issueId))
			.limit(1)
		const row = rows[0]
		return row !== undefined && (row.issuePaused || row.threadPaused === true)
	}
}
