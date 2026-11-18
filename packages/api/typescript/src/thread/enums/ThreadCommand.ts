/**
 * A COMMAND ABOUT THE WHOLE CONVERSATION (fase 3, item 4) — answered by a rule, with no model turn. Not an
 * `IssueControlCommand`: those act on ONE issue and need a target; this one has none. Context-private.
 */
export enum ThreadCommand {
	/** "relatorio" — the board of the group: what waits for a decision, what stopped, what runs, what finished. */
	REPORT = 'REPORT',
}

/**
 * HOW a command's words must appear for the message to BE the command — declared per command, never assumed.
 * `WHOLE_MESSAGE`: the message, without mentions and trailing punctuation, is exactly one of the words — so
 * "relatório do que fizeram ontem" is a sentence about a report, not the command.
 */
export enum CommandMatch {
	WHOLE_MESSAGE = 'WHOLE_MESSAGE',
}

/** The sections of the board bulletin, in the order the message lists them (fase 3, item 4). */
export enum BulletinSection {
	/** Open decisions and questions — with their codes and who decides. */
	WAITING = 'WAITING',
	/** Paused, waiting for the provider (with when), or stopped saying nothing. */
	STOPPED = 'STOPPED',
	/** Running or queued. */
	DOING = 'DOING',
	/** Completed in the last 24 h. */
	DONE = 'DONE',
}
