import { injectable } from 'tsyringe-neo'
import { DeclaredWaitReader } from './DeclaredWaitReader'

/** The `mock` environment's answer: no issue declared a wait, unless a test says one did. */
@injectable()
export class MockDeclaredWaitReader extends DeclaredWaitReader {
	private readonly declared = new Set<string>()

	declare(issueId: string): void {
		this.declared.add(issueId)
	}

	async waiting(issueIds: readonly string[]): Promise<Set<string>> {
		return new Set(issueIds.filter(issueId => this.declared.has(issueId)))
	}
}
