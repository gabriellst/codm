import { AgentMessageRole, AgentToolCallStatus } from '../../enums'
import { isCodmTool } from '../../mcp/wire'
import { AgentMessageEvent, AgentToolCallEvent, AgentUsageEvent, type AgentTurnFact } from '../../events'
import type { AgentFrame } from '../../types'

export interface TurnFactAccumulatorOptions {
	/**
	 * Fact identity — OPTIONAL, and ABSENT when the runner is the one folding.
	 *
	 * This is not laxity, it is AC-1.11 showing through: `AgentRunRequest` deliberately carries no
	 * `ownerId`/`issueId`/`threadId`, because identity travels inside the opaque MCP run token. A
	 * runner that stamped identity onto a fact would have had to know something the seam is designed
	 * not to give it. So the runner mints facts unstamped and the layer that DOES hold the envelope —
	 * the base `Agent`, and the use case that persists the stream (Fase 5) — supplies identity.
	 * `BaseDomainEvent` declares both optional for exactly this class of event.
	 */
	entityId?: string
	ownerId?: string
	/** Injected clock — the ONLY reason this class is not a bare function. Tests pin it; nothing reads `Date.now()` implicitly. */
	now?: () => Date
}

interface InflightToolCall {
	tool: string
	input: Record<string, unknown>
	startedAt: string
}

function asInput(value: unknown): Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/**
 * The fold from TRANSPORT frames to OBSERVED DOMAIN FACTS (GOAL-agent-abstraction §4.3, rule 2).
 *
 * A PURE state machine: `(frame) => AgentTurnFact | null`, plus `flush()`. No spawn, no I/O, no
 * ambient clock — which is what makes it testable over canned frame sequences, and what makes the
 * hard rules below assertable without ever starting a process.
 *
 * ### Rule 2 — facts come from HERE, not from the parser
 * The decoder's job ends at the wire taxonomy. Consolidating a transcript, closing a tool lifecycle
 * and counting tokens are domain judgements, and they live in one place so they can be argued about
 * in one place.
 *
 * ### Rule 3 — ANTI-DOUBLE-PUBLISH: our own tools mint NOTHING
 * A `tool_use`/`tool_result` naming one of OUR tools yields the FRAME (observability) and never a fact.
 * The fact for those calls was already persisted by the use case that served the MCP call (Fase 6);
 * minting here as well would publish `integration.issue.completed` TWICE for one `complete_issue`.
 * The guard is at ingestion — one of our calls is never even tracked — so `flush()` cannot resurrect
 * it as an orphan either.
 *
 * ### Sub-agent SCOPE — keyed by `parent_tool_use_id`, the one thing that survived D1
 * This accumulator consolidates the MAIN agent's turn. Frames carrying a non-null `parentToolUseId`
 * belong to a sub-agent (measured: `toolu_01WpAVhnCvdR8Ywmh4rK4jed` on three consecutive frames of
 * `raw/s3-subagent.jsonl`) and are transport-only here — they must not contaminate the main
 * transcript, and their tool calls must not appear as the main agent's. Nothing is lost: the
 * sub-agent's work is summarized in the PARENT's own `tool_use`/`tool_result` pair, which is scoped
 * to `null` and therefore does mint.
 *
 * ### Rule 8 — usage is minted ONCE, from the terminal aggregate
 * There is no `usage` frame. `AgentUsageEvent` is minted from the `result` frame's already-aggregated
 * four buckets; folding the per-assistant `message.usage` copies would count the same tokens twice.
 * A defensive guard makes a second `result` frame (which the corpus never shows) a no-op rather than
 * a second event.
 *
 * ### `AgentMessageEvent` cardinality — one per text BLOCK, minted mid-turn
 * `messageId` is the provider's message id, and the schema calls it the dedup key against PARTIAL
 * DELTAS: that purpose is honored because `text_delta` never mints a fact at all. It is NOT claimed
 * to be unique across facts — an assistant message carrying two `text` blocks mints two events with
 * the same id and different text. That is lossless and mid-turn; buffering to concatenate would
 * either delay every transcript row to `flush()` or force a multi-fact return that the `| null`
 * signature (and every consumer of it) deliberately does not have. Every assistant frame in the
 * measured corpus carries exactly one block.
 */
export class StreamJsonToTurnFactAccumulator {
	private readonly inflight = new Map<string, InflightToolCall>()
	private readonly now: () => Date
	private usageMinted = false

	constructor(private readonly options: TurnFactAccumulatorOptions) {
		this.now = options.now ?? (() => new Date())
	}

	apply(frame: AgentFrame): AgentTurnFact | null {
		switch (frame.kind) {
			case 'assistant_text':
				if (frame.parentToolUseId !== null) return null
				return new AgentMessageEvent({
					entityId: this.options.entityId,
					ownerId: this.options.ownerId,
					payload: { messageId: frame.messageId, role: AgentMessageRole.ASSISTANT, text: frame.text },
				})

			case 'tool_use':
				// `isCodmTool`, NOT `startsWith('codm__')`. The Fase-1 guard was the latter and it would
				// have failed silently: the real wire name is `mcp__codm__RecordArtifact`, so the old
				// prefix sits in the MIDDLE and `startsWith` is false — the accumulator would mint a turn
				// fact for a call whose use case already persisted one, publishing
				// `integration.issue.completed` twice.
				if (frame.parentToolUseId !== null || isCodmTool(frame.tool)) return null
				this.inflight.set(frame.toolUseId, {
					tool: frame.tool,
					input: asInput(frame.input),
					startedAt: this.now().toISOString(),
				})
				return null

			case 'tool_result': {
				// An untracked id covers three cases at once, all correctly silent: one of OUR calls
				// (never tracked, rule 3), a sub-agent's own call, and a result for a `tool_use` this
				// process never saw (mid-stream attach).
				const started = this.inflight.get(frame.toolUseId)
				if (!started) return null
				this.inflight.delete(frame.toolUseId)
				return new AgentToolCallEvent({
					entityId: this.options.entityId,
					ownerId: this.options.ownerId,
					payload: {
						toolUseId: frame.toolUseId,
						tool: started.tool,
						input: started.input,
						status: frame.ok ? AgentToolCallStatus.COMPLETED : AgentToolCallStatus.FAILED,
						startedAt: started.startedAt,
						finishedAt: this.now().toISOString(),
						...(frame.ok ? {} : { errorMessage: frame.summary }),
					},
				})
			}

			case 'result': {
				if (this.usageMinted) return null
				this.usageMinted = true
				return new AgentUsageEvent({
					entityId: this.options.entityId,
					ownerId: this.options.ownerId,
					payload: frame.usage,
				})
			}

			// TRANSPORT-only by construction: partial deltas would double-count the consolidated text,
			// thinking is not transcript, `system_init` is session identity, `error` is diagnosed by the
			// terminal record.
			case 'system_init':
			case 'text_delta':
			case 'thinking_delta':
			case 'error':
				return null
		}
	}

	/**
	 * End of turn: materialize every `tool_use` that never received its `tool_result` as FAILED.
	 *
	 * This is the whole reason `AgentToolCallStatus` has no PENDING member — an orphaned tool call
	 * silently disappearing is the failure mode the terminal-only status exists to make impossible.
	 * Idempotent: the map is drained, so a second `flush()` returns nothing.
	 */
	flush(): AgentTurnFact[] {
		const facts: AgentTurnFact[] = []
		const finishedAt = this.now().toISOString()
		for (const [toolUseId, started] of this.inflight) {
			facts.push(
				new AgentToolCallEvent({
					entityId: this.options.entityId,
					ownerId: this.options.ownerId,
					payload: {
						toolUseId,
						tool: started.tool,
						input: started.input,
						status: AgentToolCallStatus.FAILED,
						startedAt: started.startedAt,
						finishedAt,
						errorMessage: 'tool call never reported a result before the turn ended',
					},
				}),
			)
		}
		this.inflight.clear()
		return facts
	}
}
