import type { Transaction } from '@codedm/core-typescript'

export interface TerminalLineRow {
	/** The row's real identity (terminal_lines.id) — returned so callers never mint phantom ids. */
	id: string
	seq: number
	line: string
	at: Date
}

/** The terminal-session transport log (T12 replay). Monotonic `seq` per issue. Appended by steers
 *  (`steer: …`) and — in a later phase — by the terminal engine's persisted output. */
export abstract class TerminalLineRepository {
	abstract append(issueId: string, ownerId: string, line: string, tx?: Transaction): Promise<TerminalLineRow>
	abstract listByIssue(issueId: string, tx?: Transaction): Promise<TerminalLineRow[]>
}
