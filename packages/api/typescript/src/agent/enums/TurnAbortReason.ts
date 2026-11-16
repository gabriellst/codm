/**
 * WHY a running issue turn was killed — carried as the `AbortSignal`'s reason, because the two kills
 * end differently and the turn has to tell them apart (fase 2, items 2 and 4).
 *  - `PAUSE` — "pare": the work is held. Nothing persisted, the item goes back deferred (`held`).
 *  - `INTERRUPT` — "agora": a steer wants the session NOW. No ISSUE_RESULT, no stop, but the session
 *    cursor IS kept, so the steer's turn resumes the same CLI session with what was already done.
 */
export enum TurnAbortReason {
	PAUSE = 'PAUSE',
	INTERRUPT = 'INTERRUPT',
}
