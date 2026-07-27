/**
 * Closed vocabulary of claude TUI action types observable on lines that begin
 * with `⏺ <Tool>(args)`. It was the output of a regex parser over the TUI; that parser is gone
 * (Fase 3) because `--output-format stream-json` reports the real tool name directly.
 *
 * STILL LIVE, and only as the key of `TerminalActionFrameSchema` — a WIRE schema. Re-keying that
 * frame onto the real `tool` name (`z.string()`, open set) is Fase 7 (§4.9), because it is a contract
 * change with an SDK + `react tsc` + `e2e tsc` ripple. AC-7.4 is what finally greps this to zero.
 *
 * `UNKNOWN` is the fallback for a line that looks action-shaped (starts with
 * `⏺ `) but doesn't match a known tool name — surfaces new claude tools as
 * soon as they appear so we add a registry entry instead of silently losing
 * the action.
 *
 * `TURN_END` is intentionally NOT here — it lives in `TuiMarker.TURN_END_MARKER`
 * on the reliability-signal channel since it carries no observability value as
 * a "thing claude did", only a state transition.
 *
 * Context-private (not a contracts enum): actions ride the SSE side-channel only
 * (`browser.terminal_action_detected` frames — phase-10 amendment: SSE frame, NO wire event).
 */
export enum TuiActionType {
	BASH = 'BASH',
	EDIT = 'EDIT',
	UPDATE = 'UPDATE',
	WRITE = 'WRITE',
	READ = 'READ',
	GREP = 'GREP',
	GLOB = 'GLOB',
	TASK = 'TASK',
	TODO_WRITE = 'TODO_WRITE',
	UNKNOWN = 'UNKNOWN',
}
