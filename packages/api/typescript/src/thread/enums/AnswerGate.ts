/**
 * WHO may answer a stop (fase 3, item 3; owner decision 18/11) — `ANSWER_GATE`.
 *  - `WITH_EFFECT` — the answer authorizes something (publish, an irreversible action, client data) or a
 *    permission (`PERMISSION_DENIED`): only someone who may release (`Thread.postureOf` = BYPASS).
 *  - `NO_EFFECT` — a decision without effect, or a question: anyone who may act (`Thread.mayAct`).
 * Context-local: never persisted, never on the wire.
 */
export enum AnswerGate {
	WITH_EFFECT = 'WITH_EFFECT',
	NO_EFFECT = 'NO_EFFECT',
}
