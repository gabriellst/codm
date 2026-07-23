/**
 * Reliability-signal discriminator emitted by `TuiActionParser` through its
 * `onMarker(TuiMarker)` callback. Internal to runner state management
 * (turn lifecycle) — NOT a domain event, NOT consumed by handlers.
 *
 * - `RESPONSE_START`  — `⏺` appeared after `armForSubmit()`; claude started
 *                       replying. Used by `runTurn` to flip
 *                       `TurnHandle.responseObserved = true` so the
 *                       SUBMIT_VERIFICATION_MS timer sees the submit landed.
 * - `NEXT_PROMPT`     — `❯` cursor reappeared while in RESPONDING state
 *                       (i.e. AFTER a `⏺`). Drives the third independent
 *                       turn-end detector (`completeTurn(..., TUI_NEXT_PROMPT)`).
 * - `TURN_END_MARKER` — `✻ <verb> for <N>s` end-of-turn status line. Drives
 *                       `completeTurn(..., TUI_MARKER)`.
 */
export enum TuiMarker {
	RESPONSE_START = 'RESPONSE_START',
	NEXT_PROMPT = 'NEXT_PROMPT',
	TURN_END_MARKER = 'TURN_END_MARKER',
}
