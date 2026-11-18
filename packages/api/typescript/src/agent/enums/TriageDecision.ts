/**
 * What the parallel triage (fase 2) decided about ONE inbound message the rule layer could not route.
 *
 *  - `STEER` — the message is clearly about ONE open issue: it goes to that issue's session, no
 *    orchestrator turn in between.
 *  - `NEW_TASK` — a new request. The orchestrator still opens it (it owns forking); the verdict rides the
 *    turn as a hint.
 *  - `ORCHESTRATOR` — anything else: a question, a list, several issues at once, ambiguity.
 *  - `NO_ACTION` — chit-chat or thanks that needs no work: recorded, no turn.
 *
 * Context-private: the decision never crosses a service boundary — the thread context reads it through
 * `InboundTriage`'s verdict to choose the path, the same edge the routed steer already uses.
 */
export enum TriageDecision {
	STEER = 'STEER',
	NEW_TASK = 'NEW_TASK',
	ORCHESTRATOR = 'ORCHESTRATOR',
	NO_ACTION = 'NO_ACTION',
}
