import type { AgentStopReason } from '@codm/contracts-typescript/wire/enums'

/**
 * The token aggregate of ONE turn, carried BY the terminal `result` frame — it is not a frame of
 * its own (GOAL-agent-abstraction §4.3, rule 8; divergence D4 of the Fase-2 smoke).
 *
 * Four buckets, all REQUIRED. The wire splits input across three counters and on a real turn the
 * plain one is the smallest by orders of magnitude — measured in
 * `.specs/codedm/phase2-smoke/raw/s1-text.jsonl`: `input_tokens: 2` next to
 * `cache_creation_input_tokens: 9188` and `cache_read_input_tokens: 15273`. Total input for a turn
 * is `inputTokens + cacheCreationInputTokens + cacheReadInputTokens`.
 *
 * A FIFTH BUCKET, AND IT IS OPTIONAL RATHER THAN A ZERO. codex reports `reasoning_output_tokens`
 * alongside the other four (measured, `.specs/codedm/codex-smoke/raw/s1-text.jsonl`); claude's
 * transport has no counterpart field. Optional is the honest spelling of that difference: a required
 * bucket would make every claude turn assert `0`, which reads as "measured none" when the truth is
 * "this transport does not report it" — and on a reasoning model the number can dominate the turn's
 * cost, so the two are not interchangeable. Whether claude's `output_tokens` already includes
 * reasoning is UNFALSIFIED, which is the second reason not to fold this into `outputTokens`: the
 * fold would only be correct if that question had an answer.
 */
export interface AgentTurnUsage {
	inputTokens: number
	outputTokens: number
	cacheCreationInputTokens: number
	cacheReadInputTokens: number
	/** Reasoning tokens billed as output, when the provider reports them separately. Absent ⇒ not reported. */
	reasoningOutputTokens?: number
}

/**
 * The TRANSPORT taxonomy — the first of §4.3's three signal categories. One opaque wrapper union for
 * the whole wire grammar, deliberately NOT a class per frame type: this is wire format, not domain
 * vocabulary, and it rides the SSE side-channel only. It NEVER reaches the outbox.
 *
 * MEASURED, not derived from the product study. The Fase-2 decision gate (`bf217a2a`, artifact in
 * `.specs/codedm/phase2-smoke/`) corrected three things the earlier taxonomy got wrong, and the
 * shapes below are the corrected ones:
 *
 *  - **There is no `usage` frame** (D4). Usage is a FIELD: per-assistant at `message.usage`, and once
 *    already aggregated over the turn on the terminal `result`. Only the aggregate is modelled here.
 *  - **`tool_use` / `tool_result` / `text` / `thinking` are CONTENT BLOCKS, not frames** (D3). They
 *    are entries of `message.content[]` on an `assistant` (text/thinking/tool_use) or `user`
 *    (tool_result) frame, and one wire frame can carry several. Synthesizing this union therefore
 *    needs a real fan-out step over `content[]` — see `FrameDecoder`.
 *  - **`parentToolUseId` lives on `assistant`/`user` frames, NOT on `result`** (D1). Measured: the
 *    key `parent_tool_use_id` is absent from the `result` frame in all four captures. It is the
 *    accumulator's SCOPE key — what separates a sub-agent's transcript from the main agent's.
 */
export type AgentFrame =
	| { kind: 'system_init'; sessionId: string; model: string }
	| { kind: 'assistant_text'; messageId: string; text: string; parentToolUseId: string | null }
	| { kind: 'text_delta'; messageId: string; delta: string }
	| { kind: 'thinking_delta'; delta: string }
	| {
			kind: 'tool_use'
			toolUseId: string
			tool: string
			input: unknown
			/**
			 * A SANITIZED, already-summarized preview of `input` — `describeToolActivity(tool, input).target`
			 * from `@codm/contracts/cues`, computed once here at decode time (never a path, never file
			 * content, truncated to ~48 chars). This is what the rest of the system (the thinking-phase edit
			 * in `RunOrchestratorTurn`, chiefly) is meant to read — `input` itself stays on the frame for the
			 * consumers that already used it before this field existed (the terminal SSE panel's own
			 * `summarize()`, the domain fact accumulator), but nothing NEW should reach into raw `input`.
			 */
			target?: string
			parentToolUseId: string | null
	  }
	| { kind: 'tool_result'; toolUseId: string; ok: boolean; summary: string; parentToolUseId: string | null }
	| { kind: 'result'; stopReason: AgentStopReason; usage: AgentTurnUsage }
	| { kind: 'error'; detail: string }
