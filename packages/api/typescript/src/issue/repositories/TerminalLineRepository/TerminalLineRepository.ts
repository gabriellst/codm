import type { Transaction } from '@codm/core-typescript'

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
	/**
	 * Append the captured output of ONE timeline moment (fase 4, item 6c: a publish command's run), every line linked to
	 * it by `timeline_item_id` — the console opens "this run's output" by equality, never by time window or by text.
	 * Local only: these lines never leave the console (the MCP-exposed issue detail skips them).
	 */
	abstract appendOfTimelineItem(
		issueId: string,
		ownerId: string,
		timelineItemId: string,
		lines: readonly string[],
		tx?: Transaction,
	): Promise<void>
	abstract listByIssue(issueId: string, tx?: Transaction): Promise<TerminalLineRow[]>
}
