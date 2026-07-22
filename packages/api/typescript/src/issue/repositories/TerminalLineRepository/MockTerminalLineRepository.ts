import { injectable } from 'tsyringe-neo'
import { TerminalLineRepository, type TerminalLineRow } from './TerminalLineRepository'

@injectable()
export class MockTerminalLineRepository extends TerminalLineRepository {
	private byIssue = new Map<string, TerminalLineRow[]>()

	async append(issueId: string, _ownerId: string, line: string): Promise<TerminalLineRow> {
		const rows = this.byIssue.get(issueId) ?? []
		const row: TerminalLineRow = { seq: rows.length + 1, line, at: new Date() }
		rows.push(row)
		this.byIssue.set(issueId, rows)
		return row
	}

	async listByIssue(issueId: string): Promise<TerminalLineRow[]> {
		return this.byIssue.get(issueId) ?? []
	}
}
