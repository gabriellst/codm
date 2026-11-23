/**
 * WHERE A FRESH SESSION'S HANDOFF NOTES CAME FROM (fase 4, item 6a) — recorded on `agent.session.handed_off`.
 *  - `SESSION` — the previous session wrote them (`WriteHandoffNotes`) once its context passed the ask threshold.
 *  - `DERIVED` — it did not (it jumped past the budget in one turn, or ignored the ask): the notes were derived
 *    from the durable state — goal, decisions, open stops, artifacts, recent progress, branch.
 */
export enum HandoffNotesSource {
	SESSION = 'SESSION',
	DERIVED = 'DERIVED',
}
