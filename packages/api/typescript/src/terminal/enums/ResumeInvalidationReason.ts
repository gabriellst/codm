/**
 * Why a persisted `AgentSession` could NOT be resumed (GOAL-agent-abstraction §4.10).
 *
 * The four guards are the ones the driving study measured
 * (`.specs/codedm/2026-07-26-agent-driving-stream-json.md:34-36`), and they exist because a resume
 * that silently degrades is worse than no resume at all: `--resume <id>` hands the CLI a conversation
 * it will happily continue under DIFFERENT premises than the ones the row was written under, and
 * nothing in the stream says so. Each member names one premise that stopped holding:
 *
 * - `MODEL_CHANGED` — the run asks for a different `AgentModelId` than the session was created with.
 *   The CLI pins the model into the session it resumes, so the requested model would be ignored.
 * - `CWD_CHANGED` — the workspace path moved (re-attach, workspace edit). File paths in the resumed
 *   conversation would point outside the tree the agent can now touch.
 * - `MISSING_CURSOR` — the row carries no `lastMessageId`. The previous turn never reached the point
 *   of recording where the conversation stood, so there is no way to prove the CLI session and the
 *   issue transcript are at the same place.
 * - `CONVERSATION_ADVANCED` — the issue's transcript moved past the session's cursor. Messages
 *   reached the conversation that this CLI session never saw (a turn dropped defensively by
 *   `RunTerminalSessionOnClassification`, or one that crashed before committing), so resuming would
 *   answer the newest message with a context that silently skipped the ones in between.
 *
 * Context-private, and NOT a contracts enum: the reason never crosses a service boundary. It is a
 * field on ONE structured log line (`RunIssueTurn.logResumeInvalidated`) — which is the whole of
 * AC-4.4's "no silent session reset". The goal explicitly allows the structured log INSTEAD of an
 * `AGENT_RESUME_INVALIDATED` error code (§5.1), and the log is the cheaper, truthful option here:
 * an invalidated resume is not an error at all — the turn runs perfectly well, it just runs fresh.
 *
 * SCREAMING_SNAKE values rather than the goal's prose spelling (`model_changed`, …) to match every
 * other enum in this context (`AgentName`, `FactSource`); the goal names the CONCEPTS, not the wire
 * literals, and nothing outside this process reads these strings.
 */
export enum ResumeInvalidationReason {
	MODEL_CHANGED = 'MODEL_CHANGED',
	CWD_CHANGED = 'CWD_CHANGED',
	MISSING_CURSOR = 'MISSING_CURSOR',
	CONVERSATION_ADVANCED = 'CONVERSATION_ADVANCED',
}
