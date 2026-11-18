/**
 * How a reply typed in the group ANSWERS a stop of a given kind (fase 3, item 3) — `ANSWERED_IN_GROUP_AS`.
 *  - `ASK` — the stop carries an ask (a decision or a question): the reply is read as one of its options
 *    or as free text (`parseAskAnswer`) and resolves it with `ANSWER`.
 *  - `YES_NO` — the stop asks a permission with no ask of its own (`PERMISSION_DENIED`): only a bare yes /
 *    no answers it, translated to `APPROVE` / `DENY` (`YES_NO_RESOLUTION`).
 * Context-local: never persisted, never on the wire.
 */
export enum ReplyAnswerWay {
	ASK = 'ASK',
	YES_NO = 'YES_NO',
}
