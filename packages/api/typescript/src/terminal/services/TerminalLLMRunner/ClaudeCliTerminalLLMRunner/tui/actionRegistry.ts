import { TuiActionType } from '../../../../enums'

/**
 * Per-action visual styling used by the dev-console log line. The parser itself doesn't care
 * about color — only the runner's `onTuiAction` reads `glyph` / `color` when rendering through
 * `RunnerLogger`.
 */
export type ActionColor = 'cyan' | 'yellow' | 'green' | 'magenta' | 'blue' | 'red' | 'gray' | 'dim'

export interface ActionDefinition {
	type: TuiActionType
	glyph: string
	color: ActionColor
	/**
	 * Matched against an ANSI-stripped, trimmed line. Anchored (`^…$`) so a spurious substring
	 * match in noisy prose can't fire a false action. `\s*` (not a literal space) between the
	 * glyph and the tool name — the D2 spike showed claude paints spacing via cursor motion, so
	 * ANSI-stripped lines can lose their spaces.
	 */
	pattern: RegExp
	/**
	 * Which capture group is the bracketed value. `0` means "use the whole matched substring"
	 * (used by `TODO_WRITE` which doesn't take a single stable arg).
	 */
	captureGroup: number
}

export const ACTION_REGISTRY: readonly ActionDefinition[] = [
	{ type: TuiActionType.BASH, glyph: 'Ⓑ', color: 'cyan', pattern: /^⏺\s*Bash\((.+)\)$/u, captureGroup: 1 },
	{ type: TuiActionType.EDIT, glyph: 'Ⓔ', color: 'yellow', pattern: /^⏺\s*Edit\((.+)\)$/u, captureGroup: 1 },
	{ type: TuiActionType.UPDATE, glyph: 'Ⓤ', color: 'yellow', pattern: /^⏺\s*Update\((.+)\)$/u, captureGroup: 1 },
	{ type: TuiActionType.WRITE, glyph: 'Ⓦ', color: 'green', pattern: /^⏺\s*Write\((.+)\)$/u, captureGroup: 1 },
	{ type: TuiActionType.READ, glyph: 'Ⓡ', color: 'blue', pattern: /^⏺\s*Read\((.+)\)$/u, captureGroup: 1 },
	{ type: TuiActionType.GREP, glyph: 'Ⓖ', color: 'magenta', pattern: /^⏺\s*Grep\((.+)\)$/u, captureGroup: 1 },
	{ type: TuiActionType.GLOB, glyph: 'Ⓖ', color: 'magenta', pattern: /^⏺\s*Glob\((.+)\)$/u, captureGroup: 1 },
	{ type: TuiActionType.TASK, glyph: 'Ⓣ', color: 'cyan', pattern: /^⏺\s*Task\((.+)\)$/u, captureGroup: 1 },
	{ type: TuiActionType.TODO_WRITE, glyph: 'Ⓛ', color: 'gray', pattern: /^⏺\s*TodoWrite\(/u, captureGroup: 0 },
]

/**
 * Suppression set — claude cycles through these spinner glyphs ~10×/sec during inference.
 * Emitting them is hostile to consumers; the parser drops any line that matches exact-line.
 * Match `^[…]+$` (a run of pure spinner chars), NOT "contains" — `✻ Sautéed for 3s` starts with
 * `✻` but is the TURN_END_MARKER, which the signal-channel state machine handles separately.
 */
export const THINKING_SPINNER_RE = /^[·✻✽✢✳✶]+$/u

/**
 * Signal-channel TURN_END_MARKER pattern. Not part of `ACTION_REGISTRY` — the parser tests this
 * directly inside its state machine. `\s*` tolerance per the D2 spacing gotcha.
 *
 * Matches all three observed verb formats:
 *   "Sautéed for 3s"     — `\p{L}+` catches accented stems
 *   "Crunched for 17s"   — multi-digit seconds
 *   "Cooked for 1m 33s"  — optional `(\d+m \d+)` chunk before `s`
 */
export const TURN_END_MARKER_RE = /^✻\s*\p{L}+\s*for\s*\d+(?:m\s*\d+)?s$/u
