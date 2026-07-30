import { injectable } from 'tsyringe-neo'
import { and, eq, ne } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codm/core-typescript'
import { issues, transcriptEntries } from '@codm/contracts/db'
import { IssueStatus } from '@codm/contracts-typescript/wire/enums'
import type { OpenIssueRef } from './OpenIssuesReader'
import { OpenIssuesReader } from './OpenIssuesReader'

@injectable()
export class DrizzleOpenIssuesReader extends OpenIssuesReader {
	constructor(private db: DrizzleClient) {
		super()
	}

	async openIssues(threadId: string): Promise<OpenIssueRef[]> {
		const result = await tryCatchAsync(async () =>
			this.db
				.select({ issueId: issues.id, key: issues.key, title: issues.title })
				.from(issues)
				.where(and(eq(issues.threadId, threadId), eq(issues.archived, false), ne(issues.status, IssueStatus.COMPLETED))),
		)
		return result.success ? result.data : []
	}

	/**
	 * NO `tryCatchAsync`, unlike its two siblings — and the asymmetry is the point.
	 *
	 * `openIssues` and `issueIdForEntry` feed a CLASSIFIER: degrading to "no candidates" on a read error
	 * costs a context match and the message still lands. This one feeds a GUARD on a destructive action,
	 * where the same posture reads "I could not check, so go ahead and delete it" — a read failure would
	 * silently authorise the exact thing decision 2 exists to refuse. A guard that cannot read must fail
	 * CLOSED, and the honest way to fail closed is to let the error out.
	 */
	async hasWorkingIssue(threadId: string): Promise<boolean> {
		const rows = await this.db
			.select({ id: issues.id })
			.from(issues)
			.where(and(eq(issues.threadId, threadId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false)))
			.limit(1)
		return rows.length > 0
	}

	async issueIdForEntry(entryId: string): Promise<string | undefined> {
		const result = await tryCatchAsync(async () => {
			const rows = await this.db
				.select({ issueId: transcriptEntries.issueId })
				.from(transcriptEntries)
				.where(eq(transcriptEntries.id, entryId))
				.limit(1)
			return rows[0]?.issueId ?? undefined
		})
		return result.success ? (result.data ?? undefined) : undefined
	}
}
