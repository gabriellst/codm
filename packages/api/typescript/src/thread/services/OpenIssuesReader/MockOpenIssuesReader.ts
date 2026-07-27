import { injectable } from 'tsyringe-neo'
import type { OpenIssueRef } from './OpenIssuesReader'
import { OpenIssuesReader } from './OpenIssuesReader'

/** Test double — no open issues by default (every inbound resolves to NEW_ISSUE). Tests that exercise
 *  reply-quote / context-match override with a stub returning the candidate set they want. */
@injectable()
export class MockOpenIssuesReader extends OpenIssuesReader {
	async openIssues(_threadId: string): Promise<OpenIssueRef[]> {
		return []
	}

	async issueIdForEntry(_entryId: string): Promise<string | undefined> {
		return undefined
	}
}
