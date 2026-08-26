import { injectable } from 'tsyringe-neo'
import type { OpenIssueRef, SteerableIssueRef } from './OpenIssuesReader'
import { OpenIssuesReader } from './OpenIssuesReader'

@injectable()
export class MockOpenIssuesReader extends OpenIssuesReader {
	async openIssues(_threadId: string): Promise<OpenIssueRef[]> {
		return []
	}

	async issueIdForEntry(_entryId: string): Promise<string | undefined> {
		return undefined
	}

	/** No issue table at all in `mock`, so nothing is working — this half never blocks a delete. */
	async hasWorkingIssue(_threadId: string): Promise<boolean> {
		return false
	}

	/** Mesma razão: sem tabela de issues em `mock`, nada é steerável. */
	async steerableIssue(_threadId: string, _issueId: string): Promise<SteerableIssueRef | undefined> {
		return undefined
	}
}
