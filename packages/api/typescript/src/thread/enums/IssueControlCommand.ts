/**
 * What a CONTROL WORD in the conversation asks of an issue (fase 2, item 2 — "pausa como comando").
 * Context-private: the command never crosses the wire, the pause/resume FACTS do (`issue.paused` /
 * `issue.resumed`, attributed with `IssueControlSource.WHATSAPP`).
 */
export enum IssueControlCommand {
	PAUSE = 'PAUSE',
	RESUME = 'RESUME',
}
