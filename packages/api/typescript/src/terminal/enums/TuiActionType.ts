/**
 * Closed vocabulary of claude TUI action types observable on lines that begin
 * with `⏺ <Tool>(args)`. Each entry maps to one registry pattern in
 * `services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/tui/actionRegistry.ts`.
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
