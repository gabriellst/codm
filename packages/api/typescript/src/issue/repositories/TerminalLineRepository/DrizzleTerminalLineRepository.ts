import { injectable } from 'tsyringe-neo'
import { asc, eq, sql } from 'drizzle-orm'
import { DrizzleClient } from '@template/core-typescript'
import { terminalLines } from '@template/contracts/db'
import { TerminalLineRepository, type TerminalLineRow } from './TerminalLineRepository'

@injectable()
export class DrizzleTerminalLineRepository extends TerminalLineRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async append(issueId: string, ownerId: string, line: string, tx?: DrizzleClient): Promise<TerminalLineRow> {
		const dbc = tx ?? this.db
		// Next monotonic seq per issue (COALESCE(max)+1). Racy under concurrency, but a single issue
		// has one active session (single-active invariant), so appends are serialized in practice.
		const seqRows = await dbc
			.select({ next: sql<number>`coalesce(max(${terminalLines.seq}), 0) + 1` })
			.from(terminalLines)
			.where(eq(terminalLines.issueId, issueId))
		const next = seqRows[0]?.next ?? 1
		const at = new Date()
		await dbc.insert(terminalLines).values({ ownerId, issueId, seq: next, line, at })
		return { seq: next, line, at }
	}

	async listByIssue(issueId: string, tx?: DrizzleClient): Promise<TerminalLineRow[]> {
		const dbc = tx ?? this.db
		const rows = await dbc
			.select({ seq: terminalLines.seq, line: terminalLines.line, at: terminalLines.at })
			.from(terminalLines)
			.where(eq(terminalLines.issueId, issueId))
			.orderBy(asc(terminalLines.seq))
		return rows.map(r => ({ seq: r.seq, line: r.line, at: r.at }))
	}
}
