import { injectable } from 'tsyringe-neo'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import type { IssueTimelineItem } from '@shared/schemas'
import { assembleIssueTimeline } from '../../utils/issueTimeline'
import { IssueTimelineReader } from './IssueTimelineReader'

/** The one assembly, over the store — so the supervisor reads exactly what the console and the panel render. */
@injectable()
export class LibSqlIssueTimelineReader extends IssueTimelineReader {
	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	async timelineOf(issueId: string, title: string): Promise<IssueTimelineItem[]> {
		return assembleIssueTimeline(this.driver, issueId, title)
	}
}
