import { injectable } from 'tsyringe-neo'
import { and, eq, gte, or } from 'drizzle-orm'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { issues } from '@codm/contracts/db'
import type { IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { lifeStateByIssue } from '../../utils/issueLifeState'
import { QuotaStatusReader } from '@agent/services/QuotaStatusReader'
import { providerWaitByIssue } from '../../utils/providerWaitByIssue'
import { IssueBoardReader, type IssueBoardRow } from './IssueBoardReader'

@injectable()
export class LibSqlIssueBoardReader extends IssueBoardReader {
	constructor(
		private readonly driver: LibSqlDatabaseDriver,
		private readonly quota: QuotaStatusReader,
	) {
		super()
	}

	/** Three reads beside the issues' own, whatever their number — the same ones the panel board makes. */
	async boardOf(threadId: string, completedSince: Date): Promise<IssueBoardRow[]> {
		const rows = await this.driver.db
			.select({
				issueId: issues.id,
				key: issues.key,
				title: issues.title,
				status: issues.status,
				completedAt: issues.completedAt,
			})
			.from(issues)
			.where(and(eq(issues.threadId, threadId), or(eq(issues.archived, false), gte(issues.completedAt, completedSince))))
		const ids = rows.map(row => row.issueId)
		const [life, waiting] = await Promise.all([
			lifeStateByIssue(
				this.driver,
				rows.map(row => ({ issueId: row.issueId, status: row.status as IssueStatus })),
				this.quota.holdsIssueLane(),
			),
			providerWaitByIssue(this.driver, ids),
		])
		return rows.flatMap(row => {
			const lifeState = life.get(row.issueId)
			if (!lifeState) return []
			return [
				{
					issueId: row.issueId,
					key: row.key,
					title: row.title,
					status: row.status as IssueStatus,
					lifeState,
					completedAt: row.completedAt ?? undefined,
					waitingForProviderUntil: waiting.get(row.issueId),
				},
			]
		})
	}
}
