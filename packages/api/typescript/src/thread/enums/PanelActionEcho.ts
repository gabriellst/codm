/**
 * What the group is told a person did from the cloud panel (fase 2, item 6b) — the verb of the one-line
 * echo ("Ana pausou APP-12 pelo painel"). One per panel action kind, and the answer to a stop split by
 * what it means to the room (approved / denied / answered). Never carries the steer's words.
 */
export enum PanelActionEcho {
	PAUSED = 'PAUSED',
	RESUMED = 'RESUMED',
	STEERED = 'STEERED',
	APPROVED = 'APPROVED',
	DENIED = 'DENIED',
	ANSWERED = 'ANSWERED',
}
