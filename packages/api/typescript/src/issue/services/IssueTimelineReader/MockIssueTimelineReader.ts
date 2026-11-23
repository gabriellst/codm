import { injectable } from 'tsyringe-neo'
import type { IssueTimelineItem } from '@shared/schemas'
import { IssueTimelineReader } from './IssueTimelineReader'

/** No tables in `mock`: the timeline a test hands it (`items`), else an empty one. */
@injectable()
export class MockIssueTimelineReader extends IssueTimelineReader {
	items: IssueTimelineItem[] = []

	async timelineOf(_issueId: string, _title: string): Promise<IssueTimelineItem[]> {
		return this.items
	}
}
