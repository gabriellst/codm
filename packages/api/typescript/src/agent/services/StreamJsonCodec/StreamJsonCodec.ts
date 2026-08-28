import type { AgentFrame } from '../../types/AgentFrame'
import { FrameDecoder, type DecodedLine, type TerminalResultRecord } from './FrameDecoder'
import { LineBuffer } from './LineBuffer'

/**
 * The wire-grammar half, as a PORT.
 *
 * One method, because that is the whole seam: a line's already-parsed value in, frames out. Both
 * decoders in this folder satisfy it structurally without declaring that they do — the interface
 * describes them, it does not constrain them into a hierarchy.
 */
export interface WireFrameDecoder {
	decode(raw: unknown): DecodedLine
}

export interface StreamJsonCodecOptions {
	/** Diagnostics sink. Injected, never `console` — `tests/architecture/console-discipline.test.ts` is the rail. */
	onWarn?: (message: string) => void
	/**
	 * The grammar this stream speaks. Defaults to claude's, which is what every existing caller means.
	 *
	 * A PARAMETER, and this is the line that keeps a second CLI from becoming a branch. The three
	 * responsibilities this class composes — chunk boundaries, `JSON.parse`, never-throw — are
	 * identical for codex; only the grammar differs, and a grammar is a collaborator. Reaching for
	 * `if (provider === …)` inside `decodeLine` instead would put provider identity in the one place
	 * §4.3 keeps free of it, and would grow a branch per CLI forever.
	 */
	decoder?: WireFrameDecoder
}

/**
 * The CODEC: bytes off a pipe → `AgentFrame`s, plus the single terminal record.
 *
 * It is the composition of the two halves that each do one thing — `LineBuffer` (chunk boundaries)
 * and `FrameDecoder` (wire grammar) — and it owns the one step that belongs to neither: `JSON.parse`,
 * and the decision of what to do when it fails.
 *
 * ### Three ways a line can fail to be a frame, and all three are NON-FATAL
 * This is the property the whole class exists to guarantee, because every one of them is observed or
 * structurally reachable and any of them aborting the drain would strand the run:
 *
 *  1. **Truncated JSON** — the pipe closed (or the watchdog killed the child) mid-object. `LineBuffer`
 *     surfaces the partial tail rather than dropping it, and it dies HERE, as one warn.
 *  2. **A non-JSON line** — anything a CLI writes to stdout that is not a frame. Measured context: the
 *     real captures inline ~4KB of a user's `SessionStart` hook stdout, so "stdout is exclusively our
 *     JSONL" is not an assumption that survives contact with a real machine.
 *  3. **A well-formed frame of an UNKNOWN type** (§4.3 rule 9) — dropped silently, not even warned,
 *     because it is not an anomaly: the corpus carries ten unnamed types
 *     (`system/{hook_started,hook_response,status,thinking_tokens,task_*}`, `rate_limit_event`,
 *     `stream_event`), and `hook_started`/`hook_response`/`rate_limit_event` appear in ALL FOUR
 *     captures. They are ambient noise that changes with the machine, the user's `~/.claude` and the
 *     CLI build. Treating an unknown frame as an error would kill real runs on the first machine with
 *     a hook configured. That drop is the `FrameDecoder`'s `default` branch; this class only has to
 *     not undo it.
 *
 * PURE — no spawn, no I/O, no clock, no timers (AC-2.5). The runner owns the process and feeds this
 * class chunks; this class never reads anything itself. That is what makes every rule above assertable
 * over canned bytes.
 */
export class StreamJsonCodec {
	private readonly lines = new LineBuffer()
	private readonly decoder: WireFrameDecoder

	constructor(private readonly options: StreamJsonCodecOptions = {}) {
		this.decoder = options.decoder ?? new FrameDecoder(options.onWarn)
	}

	/** Feed one chunk. Returns everything the COMPLETE lines in it decoded to. */
	push(chunk: string | Uint8Array): DecodedLine[] {
		return this.lines.push(chunk).map(line => this.decodeLine(line))
	}

	/**
	 * End of stream: decode whatever was left without a trailing newline.
	 *
	 * A well-formed final line with no `\n` is a real frame and is decoded as one; a truncated one
	 * warns and yields nothing. Both are the same code path, which is why neither needs a special case.
	 */
	flush(): DecodedLine[] {
		return this.lines.flush().map(line => this.decodeLine(line))
	}

	private decodeLine(line: string): DecodedLine {
		const trimmed = line.trim()
		if (trimmed.length === 0) return { frames: [] }
		let parsed: unknown
		try {
			parsed = JSON.parse(trimmed)
		} catch {
			// Deliberately NOT rethrown and NOT an `error` frame: a consumer that sees `error` treats the
			// RUN as broken, and one unparseable line among hundreds is not that.
			this.options.onWarn?.(`skipped unparseable stdout line (${trimmed.length} chars)`)
			return { frames: [] }
		}
		return this.decoder.decode(parsed)
	}
}

export type { AgentFrame, DecodedLine, TerminalResultRecord }
