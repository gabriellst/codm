import { TuiActionType, TuiMarker } from '../../../../enums'
import { stripAnsi } from '../ansi'
import { ACTION_REGISTRY, THINKING_SPINNER_RE, TURN_END_MARKER_RE } from './actionRegistry'

export interface TuiActionEvent {
	type: TuiActionType
	value: string
	detectedAt: Date
}

export type SignalState = 'waiting-for-response' | 'responding'

export interface TuiActionParserOpts {
	/**
	 * Channel 1 — observability. Fired once per matched action line, after any signal-channel
	 * emission for the same line.
	 */
	onAction: (event: TuiActionEvent) => void
	/**
	 * Channel 2 — reliability signals. Fired BEFORE `onAction` for the same line
	 * (RESPONSE_START on a `⏺ Bash(...)` line lands before the BASH action), so a downstream
	 * consumer sees "turn started" before "first action of the turn".
	 */
	onMarker: (marker: TuiMarker) => void
	/**
	 * Parser-internal warn-tier diagnostic: a `[Pasted text #N]` line was observed (claude's TUI
	 * rendered the bracketed-paste placeholder). Not a marker, not an event — pure
	 * operator-debugging noise.
	 */
	onPasteWarn?: (message: string) => void
	/** Clock injection for deterministic `detectedAt` in tests. */
	clock?: () => Date
}

const PASTE_RE = /^\[Pasted text #\d+\]/u

/**
 * Single TUI line classifier. Owns:
 *
 *   - the partial-line buffer that accumulates across `feed()` calls
 *   - the signal-channel state machine (`waiting-for-response` ↔ `responding`)
 *
 * For each complete line: trim, drop-if-spinner, classify signal channel first, classify action
 * channel second, emit. One regex pass per line — O(line) for each chunk regardless of registry
 * size.
 *
 * The parser is stateful for the reliability channel (two states) but stateless for the action
 * channel — each line is classified independently against the registry.
 */
export class TuiActionParser {
	private buf = ''
	private state: SignalState = 'waiting-for-response'
	private readonly onAction: TuiActionParserOpts['onAction']
	private readonly onMarker: TuiActionParserOpts['onMarker']
	private readonly onPasteWarn: TuiActionParserOpts['onPasteWarn']
	private readonly clock: () => Date

	constructor(opts: TuiActionParserOpts) {
		this.onAction = opts.onAction
		this.onMarker = opts.onMarker
		this.onPasteWarn = opts.onPasteWarn
		this.clock = opts.clock ?? (() => new Date())
	}

	feed(chunk: string): void {
		// Strip ANSI from the chunk before line splitting so escape sequences don't appear inside
		// reassembled lines.
		this.buf += stripAnsi(chunk)
		// Split on '\n'. The last element is the (possibly-partial) line we keep for the next
		// feed() call.
		const parts = this.buf.split('\n')
		this.buf = parts.pop() ?? ''
		for (const raw of parts) {
			const line = raw.trim()
			if (line.length === 0) continue
			if (THINKING_SPINNER_RE.test(line)) continue
			// Channel 2 FIRST — signal channel state machine.
			this.classifySignal(line)
			// Channel 1 SECOND — action classification.
			this.classifyAction(line)
		}
	}

	/**
	 * Reset the reliability-signal state machine at the start of every new turn (called by
	 * runTurn before writing the bracketed paste). Without this reset, the previous turn's
	 * RESPONDING state would carry over and the first ❯ of the new turn (the user-message echo)
	 * would mis-fire NEXT_PROMPT.
	 */
	armForSubmit(): void {
		this.state = 'waiting-for-response'
	}

	private classifySignal(line: string): void {
		if (this.state === 'waiting-for-response') {
			if (PASTE_RE.test(line)) {
				this.onPasteWarn?.(`claude rendered paste placeholder: ${line}`)
				return
			}
			if (line.startsWith('⏺')) {
				this.state = 'responding'
				this.onMarker(TuiMarker.RESPONSE_START)
				return
			}
			// First ❯ (user-message echo) IGNORED.
			return
		}
		// state === 'responding'
		if (line.startsWith('❯')) {
			this.state = 'waiting-for-response'
			this.onMarker(TuiMarker.NEXT_PROMPT)
			return
		}
		if (TURN_END_MARKER_RE.test(line)) {
			this.onMarker(TuiMarker.TURN_END_MARKER)
			return
		}
	}

	private classifyAction(line: string): void {
		for (const def of ACTION_REGISTRY) {
			const m = def.pattern.exec(line)
			if (m) {
				this.onAction({
					type: def.type,
					value: m[def.captureGroup] ?? line,
					detectedAt: this.clock(),
				})
				return
			}
		}
		if (line.startsWith('⏺ ')) {
			this.onAction({
				type: TuiActionType.UNKNOWN,
				value: line,
				detectedAt: this.clock(),
			})
		}
	}
}
