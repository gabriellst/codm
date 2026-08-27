import { injectable } from 'tsyringe-neo'
import type { StalledIssueRef } from './StalledIssueReader'
import { StalledIssueReader } from './StalledIssueReader'

/** Sem tabela de issues no modo `mock` — nada está parado, e a varredura é um no-op. */
@injectable()
export class MockStalledIssueReader extends StalledIssueReader {
	async stalledIssues(): Promise<StalledIssueRef[]> {
		return []
	}
}
