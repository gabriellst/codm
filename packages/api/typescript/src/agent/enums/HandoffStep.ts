/**
 * WHAT A TURN'S PROMPT CARRIES ABOUT THE HANDOFF (fase 4, item 6a) — decided by `RunIssueTurn` at the turn boundary.
 *  - `ASK` — the resumed session is past `ISSUE_HANDOFF_ASK_AT`: it writes its handoff notes before ending the turn.
 *  - `SEED` — the old session was past `ISSUE_CONTEXT_BUDGET`: a fresh session starts from the notes and the task's
 *    durable state.
 * Context-private: the prompt builder's discriminant, never on the wire.
 */
export enum HandoffStep {
	ASK = 'ASK',
	SEED = 'SEED',
}
