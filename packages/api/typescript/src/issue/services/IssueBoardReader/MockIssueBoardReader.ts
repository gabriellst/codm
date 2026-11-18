import { injectable } from 'tsyringe-neo'
import { IssueBoardReader, type IssueBoardRow } from './IssueBoardReader'

/** No tables in `mock`: the board a test hands it (`rows`), else an empty one. */
@injectable()
export class MockIssueBoardReader extends IssueBoardReader {
	rows: IssueBoardRow[] = []

	async boardOf(_threadId: string, _completedSince: Date): Promise<IssueBoardRow[]> {
		return this.rows
	}
}
