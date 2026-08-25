import { AgentStopReason } from '@codm/contracts-typescript/wire/enums'
import { describeToolActivity } from '@codm/contracts/cues'
import type { AgentFrame, AgentTurnUsage } from '../../types/AgentFrame'

/**
 * The terminal `result` record, kept OUT of the `AgentFrame` union on purpose.
 *
 * The frame taxonomy is what the UI sees; this is what the codec needs to build the single
 * `AgentRunResult` — the run's final text, whether the CLI itself called the run an error, and the
 * session id. Putting `text`/`isError` on the `result` frame would push run-conclusion policy into
 * the wire vocabulary, which is the confusion §4.3 is written to prevent.
 */
export interface TerminalResultRecord {
	stopReason: AgentStopReason
	usage: AgentTurnUsage
	text: string
	isError: boolean
	sessionId: string | null
	/**
	 * The CLI's own diagnosis of what broke at the API layer (`api_error_status` on the wire) —
	 * TRANSPORT evidence, never the assistant's own words. `null` on every clean turn in all four
	 * real captures (`phase2-smoke/raw/*.jsonl`); the shape it takes on an actual auth failure is
	 * UNFALSIFIED, not measured — same caveat as `stopReason === TOOL_USE` above.
	 */
	apiErrorStatus: string | number | null
}

export interface DecodedLine {
	frames: AgentFrame[]
	/** Set only for the wire's `type: 'result'` record — the structural end-of-turn candidate. */
	terminal?: TerminalResultRecord
}

const EMPTY: DecodedLine = { frames: [] }

/** `stop_reason` is a CLOSED set (§4.2) — an unnamed value degrades to UNKNOWN with a warn, never a crash. */
const STOP_REASONS: Readonly<Record<string, AgentStopReason>> = {
	end_turn: AgentStopReason.END_TURN,
	max_tokens: AgentStopReason.MAX_TOKENS,
	stop_sequence: AgentStopReason.STOP_SEQUENCE,
	tool_use: AgentStopReason.TOOL_USE,
	pause_turn: AgentStopReason.PAUSE_TURN,
	refusal: AgentStopReason.REFUSAL,
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}

/** `api_error_status` is either a code (string/number) or absent/`null` — never coerced from other shapes. */
function apiErrorStatus(value: unknown): string | number | null {
	return typeof value === 'string' || typeof value === 'number' ? value : null
}

/** Non-negative integer or 0 — a missing bucket is arithmetically zero, never "unknown" (§4.3 rule 8). */
function count(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function readUsage(raw: unknown): AgentTurnUsage {
	const usage = isRecord(raw) ? raw : {}
	return {
		inputTokens: count(usage.input_tokens),
		outputTokens: count(usage.output_tokens),
		cacheCreationInputTokens: count(usage.cache_creation_input_tokens),
		cacheReadInputTokens: count(usage.cache_read_input_tokens),
	}
}

/**
 * Render a `tool_result` block's content to a flat summary string.
 *
 * BOTH shapes occur in the real corpus and both must be accepted: `raw/s2-tool.jsonl` carries
 * `content` as a plain string, `raw/s3-subagent.jsonl` carries it as an array of `{type,text}` blocks
 * (the sub-agent's rolled-up answer). Anything else is JSON-stringified rather than dropped — a
 * summary that reads oddly beats a lifecycle fact that silently loses its payload.
 */
function renderToolResult(content: unknown): string {
	if (typeof content === 'string') return content
	if (Array.isArray(content)) {
		return content.map(block => (isRecord(block) ? (str(block.text) ?? JSON.stringify(block)) : String(block))).join('\n')
	}
	return content === undefined ? '' : JSON.stringify(content)
}

/**
 * One parsed JSONL value → zero or more `AgentFrame`s (GOAL-agent-abstraction §4.3).
 *
 * STATEFUL by exactly one field, and only because the wire forces it: `stream_event` delta frames
 * carry no message id — the id is announced once, earlier, by `message_start`. Keeping that id here
 * is what lets `text_delta` be `{ messageId, delta }` as the taxonomy declares.
 *
 * THE FAN-OUT IS THE WORK (divergence D3). `tool_use` / `tool_result` / `text` / `thinking` are entries
 * of `message.content[]`, so one wire frame becomes N `AgentFrame`s. This is not a field rename, and
 * it is why the "~150 LOC" estimate in §7 explicitly cedes to the taxonomy.
 *
 * WELL-FORMED BUT UNKNOWN → `{ frames: [] }`, silently (§4.3 rule 9). This is not defensive
 * politeness: the real corpus contains ten frame types this union does not name
 * (`system/{hook_started,hook_response,status,thinking_tokens,task_*}`, `rate_limit_event`,
 * `stream_event`), and `hook_started`/`hook_response`/`rate_limit_event` appear in ALL FOUR captures
 * because the user's own `SessionStart` hooks fire. It is ambient noise CODM does not control — it
 * changes with the machine, the user's `~/.claude`, and the CLI build. A codec that treats an unknown
 * frame as an error dies on the first real machine that has a hook configured.
 *
 * PURE — no I/O, no spawn, no clock (AC-2.5).
 */
export class FrameDecoder {
	private currentMessageId: string | null = null

	constructor(private readonly onWarn?: (message: string) => void) {}

	decode(raw: unknown): DecodedLine {
		if (!isRecord(raw)) return EMPTY
		switch (raw.type) {
			case 'system':
				return raw.subtype === 'init'
					? { frames: [{ kind: 'system_init', sessionId: str(raw.session_id) ?? '', model: str(raw.model) ?? '' }] }
					: EMPTY
			case 'assistant':
				return { frames: this.decodeAssistant(raw) }
			case 'user':
				return { frames: this.decodeUser(raw) }
			case 'stream_event':
				return { frames: this.decodeStreamEvent(raw) }
			case 'result':
				return this.decodeResult(raw)
			default:
				return EMPTY
		}
	}

	private decodeAssistant(raw: Record<string, unknown>): AgentFrame[] {
		const message = isRecord(raw.message) ? raw.message : {}
		const messageId = str(message.id) ?? ''
		const parentToolUseId = str(raw.parent_tool_use_id) ?? null
		const frames: AgentFrame[] = []
		for (const block of Array.isArray(message.content) ? message.content : []) {
			if (!isRecord(block)) continue
			if (block.type === 'text') frames.push({ kind: 'assistant_text', messageId, text: str(block.text) ?? '', parentToolUseId })
			else if (block.type === 'thinking') frames.push({ kind: 'thinking_delta', delta: str(block.thinking) ?? '' })
			else if (block.type === 'tool_use') {
				const tool = str(block.name) ?? ''
				// SANITIZED at the source (see the `target` field's docblock on `AgentFrame`) — the only place
				// in the codebase that turns raw tool `input` into a string safe to show the contact.
				frames.push({
					kind: 'tool_use',
					toolUseId: str(block.id) ?? '',
					tool,
					input: block.input,
					target: describeToolActivity(tool, block.input).target,
					parentToolUseId,
				})
			}
		}
		return frames
	}

	private decodeUser(raw: Record<string, unknown>): AgentFrame[] {
		const message = isRecord(raw.message) ? raw.message : {}
		const parentToolUseId = str(raw.parent_tool_use_id) ?? null
		const frames: AgentFrame[] = []
		for (const block of Array.isArray(message.content) ? message.content : []) {
			if (!isRecord(block) || block.type !== 'tool_result') continue
			frames.push({
				kind: 'tool_result',
				toolUseId: str(block.tool_use_id) ?? '',
				// ABSENT on success in the real corpus — never `false`. So `ok` is `is_error !== true`,
				// not `!is_error`, and certainly not `is_error === false`.
				ok: block.is_error !== true,
				summary: renderToolResult(block.content),
				parentToolUseId,
			})
		}
		return frames
	}

	private decodeStreamEvent(raw: Record<string, unknown>): AgentFrame[] {
		const event = isRecord(raw.event) ? raw.event : {}
		if (event.type === 'message_start') {
			const message = isRecord(event.message) ? event.message : {}
			this.currentMessageId = str(message.id) ?? null
			return []
		}
		if (event.type === 'content_block_delta') {
			const delta = isRecord(event.delta) ? event.delta : {}
			if (delta.type === 'text_delta') return [{ kind: 'text_delta', messageId: this.currentMessageId ?? '', delta: str(delta.text) ?? '' }]
		}
		return []
	}

	private decodeResult(raw: Record<string, unknown>): DecodedLine {
		const rawStop = str(raw.stop_reason)
		const stopReason = (rawStop && STOP_REASONS[rawStop]) || AgentStopReason.UNKNOWN
		if (stopReason === AgentStopReason.UNKNOWN) {
			this.onWarn?.(`unnamed stop_reason ${JSON.stringify(rawStop)} — degraded to UNKNOWN`)
		}
		const usage = readUsage(raw.usage)
		const isError = raw.is_error === true || (raw.subtype !== undefined && raw.subtype !== 'success')
		const frames: AgentFrame[] = []
		// The error frame comes FIRST so an observer sees the diagnosis before the turn closes.
		if (isError) frames.push({ kind: 'error', detail: str(raw.result) ?? str(raw.subtype) ?? 'provider reported an error result' })
		frames.push({ kind: 'result', stopReason, usage })
		return {
			frames,
			terminal: {
				stopReason,
				usage,
				text: str(raw.result) ?? '',
				isError,
				sessionId: str(raw.session_id) ?? null,
				apiErrorStatus: apiErrorStatus(raw.api_error_status),
			},
		}
	}
}
