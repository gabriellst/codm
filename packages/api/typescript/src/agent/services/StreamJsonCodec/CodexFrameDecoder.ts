import { AgentStopReason } from '@codm/contracts-typescript/wire/enums'
import type { AgentFrame, AgentTurnUsage } from '../../types/AgentFrame'
import type { DecodedLine, TerminalResultRecord } from './FrameDecoder'
import { count, isRecord, str } from './wireValues'

const EMPTY: DecodedLine = { frames: [] }

/**
 * codex's `--json` grammar → the same `AgentFrame` union claude's decoder produces.
 *
 * A SIBLING of `FrameDecoder`, never a subclass and never a branch inside it. The two transports
 * agree on almost nothing: claude nests content BLOCKS inside `assistant`/`user` frames and needs a
 * fan-out over `message.content[]`; codex emits one flat `item.completed` per item and no blocks at
 * all. What they do share is the half that is genuinely shared — `LineBuffer` for chunk boundaries,
 * `JSON.parse` and the never-throw policy in `StreamJsonCodec`, and the `AgentFrame` vocabulary
 * downstream. Everything below is the part that is codex's alone.
 *
 * MEASURED against `.specs/codedm/codex-smoke/raw/*.jsonl` (codex-cli 0.150.0). Six captures, and the
 * complete set of event types they contain is exactly four — `thread.started`, `turn.started`,
 * `item.completed`, `turn.completed` — carrying three item types: `error`, `reasoning`,
 * `agent_message`. Where this decoder handles anything else, it says so and says why.
 *
 * ### The three things that would be wrong if ported from claude by analogy
 *
 * 1. **There is no `stop_reason`, anywhere.** claude states why a turn ended; codex states only THAT
 *    it ended, by emitting `turn.completed`. Success is the ARRIVAL of that event, so `END_TURN` is
 *    a synthesis rather than a reading — the honest one, because a turn that reached
 *    `turn.completed` did end normally.
 * 2. **An `item` of type `error` is NOT a failed turn**, and this is the one a careless port gets
 *    wrong on every machine with a cold model cache. All six captures open with
 *    `item.completed{item.type:'error'}` carrying "Model metadata … not found. Defaulting to fallback
 *    metadata", and every one of them proceeds to `turn.completed` normally. Mapping it to an `error`
 *    frame would mark those runs failed. It warns and yields nothing.
 * 3. **The final answer is not on the terminal event.** claude's `result` frame carries the run's
 *    text; codex's `turn.completed` carries `usage` and nothing else. The answer is the last
 *    `agent_message` item, so this decoder REMEMBERS it — which is why it is a stateful class rather
 *    than a pure function, exactly as `FrameDecoder` is for its own `currentMessageId`.
 */
export class CodexFrameDecoder {
	/** From `thread.started`, which arrives once and FIRST — it is codex's session identity. */
	private threadId: string | null = null
	/** The last `agent_message` text — see point 3 above. */
	private lastAgentMessage = ''

	constructor(private readonly onWarn?: (message: string) => void) {}

	decode(raw: unknown): DecodedLine {
		if (!isRecord(raw)) return EMPTY
		switch (raw.type) {
			case 'thread.started':
				return this.decodeThreadStarted(raw)
			// Pure lifecycle: it announces that the turn began and carries nothing the UI can render.
			// Dropping it is not a gap — `system_init` above already told the consumer a run exists.
			case 'turn.started':
				return EMPTY
			case 'item.completed':
				return { frames: this.decodeItem(raw) }
			case 'turn.completed':
				return this.decodeTurnCompleted(raw)
			case 'turn.failed':
				return this.decodeTurnFailed(raw)
			case 'error':
				return this.decodeTopLevelError(raw)
			// `item.started` / `item.updated` land here, and so does anything a newer build adds.
			// Silently, on the same reasoning `FrameDecoder`'s default branch carries: an unknown frame
			// is not an anomaly, and a decoder that treats it as one dies on the first CLI upgrade.
			default:
				return EMPTY
		}
	}

	private decodeThreadStarted(raw: Record<string, unknown>): DecodedLine {
		const threadId = str(raw.thread_id) ?? ''
		this.threadId = threadId
		// `model: ''` because codex does not announce one on this transport — measured, `thread.started`
		// carries `thread_id` and nothing else. Empty is what `FrameDecoder` also produces for an absent
		// model, so the consumer sees one shape for "not stated" rather than two.
		return { frames: [{ kind: 'system_init', sessionId: threadId, model: '' }] }
	}

	private decodeItem(raw: Record<string, unknown>): AgentFrame[] {
		const item = isRecord(raw.item) ? raw.item : {}
		const id = str(item.id) ?? ''
		switch (item.type) {
			case 'agent_message': {
				const text = str(item.text) ?? ''
				this.lastAgentMessage = text
				return [{ kind: 'assistant_text', messageId: id, text, parentToolUseId: null }]
			}
			// codex's reasoning is a COMPLETED item, not a stream of deltas, so one item is one whole
			// thought. `thinking_delta` is still the right frame: it is the union's only thinking-shaped
			// member, and its consumers append rather than assume a chunk size.
			case 'reasoning':
				return [{ kind: 'thinking_delta', delta: str(item.text) ?? '' }]
			// See point 2 of the class docblock. Warned, never framed.
			case 'error':
				this.onWarn?.(`codex item error (turn continues): ${str(item.message) ?? 'no message'}`)
				return []
			// UNFALSIFIED, and deliberately not guessed: `command_execution`, `file_change`,
			// `mcp_tool_call`, `web_search` and `todo_list` are documented item types this corpus does
			// NOT contain, because the local model used for the measurement declined to call any tool
			// (`raw/s2-tool.jsonl` — it answered that it had no tools for reading local files). Mapping
			// them to `tool_use`/`tool_result` without a capture would be inventing field names; they
			// drop until someone measures one.
			default:
				return []
		}
	}

	private decodeTurnCompleted(raw: Record<string, unknown>): DecodedLine {
		const usage = readUsage(raw.usage)
		return {
			frames: [{ kind: 'result', stopReason: AgentStopReason.END_TURN, usage }],
			terminal: {
				stopReason: AgentStopReason.END_TURN,
				usage,
				text: this.lastAgentMessage,
				isError: false,
				sessionId: this.threadId,
				apiErrorStatus: null,
			},
		}
	}

	/**
	 * A turn that ended badly. STRUCTURALLY REACHABLE, NOT IN THE CORPUS — and the distinction is the
	 * point of saying it here.
	 *
	 * This shape was observed live while measuring (a 400 from a model the account could not use), and
	 * it did NOT get saved as a capture: `grep turn.failed raw/*.jsonl` finds nothing. So the field
	 * names below are transcribed from that session rather than replayable, which is a weaker claim
	 * than everything else in this file makes, and the reason to write it down instead of letting the
	 * code imply otherwise.
	 *
	 * `UNKNOWN` rather than a guessed reason: the event says the turn failed, never why in the
	 * vocabulary `AgentStopReason` speaks. `isError` is what actually carries the verdict.
	 */
	private decodeTurnFailed(raw: Record<string, unknown>): DecodedLine {
		const error = isRecord(raw.error) ? raw.error : {}
		const detail = str(error.message) ?? 'codex reported a failed turn with no message'
		return {
			frames: [{ kind: 'error', detail }],
			terminal: {
				stopReason: AgentStopReason.UNKNOWN,
				usage: readUsage(raw.usage),
				text: this.lastAgentMessage,
				isError: true,
				sessionId: this.threadId,
				apiErrorStatus: null,
			},
		}
	}

	/**
	 * The top-level `{"type":"error"}`. Same provenance caveat as `decodeTurnFailed` — observed live,
	 * absent from the corpus.
	 *
	 * It yields a frame but NO terminal record, because the two arrive as a PAIR carrying the same
	 * message and `turn.failed` is the half that ends the turn. Minting a terminal here as well would
	 * end the run twice on one failure.
	 *
	 * `message` was measured to be double-encoded at least once — a JSON *string* whose content is a
	 * JSON object (`"{\"type\":\"error\",\"status\":400,…}"`). It is passed through verbatim rather
	 * than re-parsed: whether that holds for every API error is UNFALSIFIED, and a decoder that
	 * unwraps on a guess would mangle the errors that are plain prose.
	 */
	private decodeTopLevelError(raw: Record<string, unknown>): DecodedLine {
		return { frames: [{ kind: 'error', detail: str(raw.message) ?? 'codex reported an error with no message' }] }
	}
}

/**
 * codex's five token buckets → `AgentTurnUsage`.
 *
 * FIVE, and the vendor documents four. `cache_write_input_tokens` is undocumented
 * (learn.chatgpt.com/docs/non-interactive-mode lists the other four) and it is the exact counterpart
 * of claude's `cacheCreationInputTokens` — reading the docs alone would have reported cache writes as
 * absent on a transport that reports them. Measured in every `turn.completed` of the corpus.
 *
 * `reasoning_output_tokens` is the fifth, and the one `AgentTurnUsage` grew an optional bucket for:
 * on a reasoning model it can dominate the turn's cost, and dropping it under-bills systematically.
 *
 * KNOWN GAP, harmless against 0.150.0 and recorded so it is not rediscovered. `AgentUsageEvent`
 * declares `reasoningOutputTokens` OPTIONAL, whose meaning is "the transport did not report this" —
 * but `count()` maps a missing field to `0`, which asserts the opposite: "the transport reported
 * none". Every `turn.completed` in the corpus carries the field, so today the two readings coincide
 * and nothing downstream can tell them apart. They stop coinciding the day a build drops it, and the
 * failure is silent under-billing that looks like measurement. The fix is to let this one bucket stay
 * `undefined` when the key is absent — deliberately NOT taken here, because it changes the payload of
 * an event already in flight and belongs with the consumer audit, not with a decoder correction.
 */
function readUsage(raw: unknown): AgentTurnUsage {
	const usage = isRecord(raw) ? raw : {}
	return {
		inputTokens: count(usage.input_tokens),
		outputTokens: count(usage.output_tokens),
		cacheCreationInputTokens: count(usage.cache_write_input_tokens),
		cacheReadInputTokens: count(usage.cached_input_tokens),
		reasoningOutputTokens: count(usage.reasoning_output_tokens),
	}
}

export type { DecodedLine, TerminalResultRecord }
