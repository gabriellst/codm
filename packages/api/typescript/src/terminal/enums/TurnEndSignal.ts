/**
 * Which of the three independent detectors fired `completeTurn`. The dev-console
 * `turn-done` log line prints `signal.toLowerCase()` (`tui_marker` /
 * `tui_next_prompt` / `jsonl_turn_duration`) so an operator can see which
 * detector did the work.
 */
export enum TurnEndSignal {
	/** ✻ <verb> for <N>s */
	TUI_MARKER = 'TUI_MARKER',
	/** ❯ cursor after ⏺ (third detector) */
	TUI_NEXT_PROMPT = 'TUI_NEXT_PROMPT',
	/** system/turn_duration JSONL record */
	JSONL_TURN_DURATION = 'JSONL_TURN_DURATION',
}
