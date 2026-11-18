/**
 * When a routed steer should reach the issue's session (fase 2, item 4 — "steer imediato").
 *  - `NEXT_STEP` (default) — the session gets it as soon as the queue can hand it over: today, when the
 *    running turn ends (no runner takes input into a live turn yet — see the spec's "Seguimento").
 *  - `NOW` — the message starts with `agora` / `now` after its target: the running turn is cut and the
 *    steer's turn resumes the session.
 */
export enum SteerUrgency {
	NEXT_STEP = 'NEXT_STEP',
	NOW = 'NOW',
}
