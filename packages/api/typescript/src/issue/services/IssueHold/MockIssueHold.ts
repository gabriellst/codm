import { injectable } from 'tsyringe-neo'
import { IssueHold } from './IssueHold'

/** No tables in `mock`, so nothing is ever held — flow tests run the tools and the queue unhindered. */
@injectable()
export class MockIssueHold extends IssueHold {
	async isHeld(_issueId: string): Promise<boolean> {
		return false
	}
}
