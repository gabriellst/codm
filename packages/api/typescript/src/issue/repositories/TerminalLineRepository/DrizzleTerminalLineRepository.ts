import { injectable } from 'tsyringe-neo'
import { asc, eq, sql } from 'drizzle-orm'
import { DrizzleDatabaseDriver, Id, DrizzleTransaction } from '@codm/core-typescript'
import { terminalLines } from '@codm/contracts/db'
import { TerminalLineRepository, type TerminalLineRow } from './TerminalLineRepository'

@injectable()
export class DrizzleTerminalLineRepository extends TerminalLineRepository {
	constructor(private driver: DrizzleDatabaseDriver) {
		super()
	}

	async append(issueId: string, ownerId: string, line: string, tx?: DrizzleTransaction): Promise<TerminalLineRow> {
		const dbc = tx ?? this.driver.db
		// Next monotonic seq per issue (COALESCE(max)+1). Racy under concurrency, but a single issue
		// has one active session (single-active invariant), so appends are serialized in practice.
		const seqRows = await dbc
			.select({ next: sql<number>`coalesce(max(${terminalLines.seq}), 0) + 1` })
			.from(terminalLines)
			.where(eq(terminalLines.issueId, issueId))
		const next = seqRows[0]?.next ?? 1
		const at = new Date()
		const id = Id.value()
		await dbc.insert(terminalLines).values({ id, ownerId, issueId, seq: next, line, at })
		return { id, seq: next, line, at }
	}

	async listByIssue(issueId: string, tx?: DrizzleTransaction): Promise<TerminalLineRow[]> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select({ id: terminalLines.id, seq: terminalLines.seq, line: terminalLines.line, at: terminalLines.at })
			.from(terminalLines)
			.where(eq(terminalLines.issueId, issueId))
			.orderBy(asc(terminalLines.seq))
		return rows.map(r => ({ id: r.id, seq: r.seq, line: r.line, at: r.at }))
	}
}
