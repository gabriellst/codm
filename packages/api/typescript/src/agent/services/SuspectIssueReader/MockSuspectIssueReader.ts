import { injectable } from 'tsyringe-neo'
import { SuspectIssueReader, type SuspectIssue } from './SuspectIssueReader'

/** No tables in `mock`: the suspects a test hands it (`rows`), oldest first and capped like the real one. */
@injectable()
export class MockSuspectIssueReader extends SuspectIssueReader {
	rows: SuspectIssue[] = []

	async suspects(_now: Date, limit: number): Promise<SuspectIssue[]> {
		return [...this.rows].sort((a, b) => a.since.getTime() - b.since.getTime()).slice(0, limit)
	}
}
