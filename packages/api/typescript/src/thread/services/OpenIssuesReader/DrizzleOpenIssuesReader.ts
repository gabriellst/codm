import { injectable } from 'tsyringe-neo'
import { and, eq, ne } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { issues, transcriptEntries } from '@template/contracts/db'
import { IssueStatus } from '@template/contracts-typescript/wire/enums'
import type { OpenIssueRef } from '@terminal/services/IssueClassifier'
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
