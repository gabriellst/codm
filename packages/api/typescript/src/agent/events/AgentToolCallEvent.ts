import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { AgentToolCallStatus } from '../enums'

/**
 * OBSERVED FACT: one tool invocation, WHOLE LIFECYCLE, emitted exactly once at its end
 * (GOAL-agent-abstraction §4.3).
 *
 * CONTEXT-ORIGIN: medscall `packages/api/src/agent/events/ChatToolCallEvent.ts`
 * @ c58ed45677c473b0415c03cfc741fea3a00946f4 — the SHAPE decision is adopted (one event per
 * invocation carrying start+end+outcome, rather than a start event and an end event that consumers
 * have to correlate), the fields are CodeDM's.
 *
 * Two rules of §4.3 are visible in this schema and neither is optional:
 *  - `status` is terminal-only, so `flush()` MUST materialize a `tool_use` that never received its
 *    `tool_result` as `FAILED`. An orphan tool call silently disappearing is the failure mode this
 *    field exists to make impossible.
 *  - the accumulator NEVER emits this event for a our own tool. Our own tools already
 *    persisted their fact through the use case that served the call; emitting here too would publish
 *    `integration.issue.completed` twice for one `complete_issue`.
 *
 * `startedAt` / `finishedAt` are ISO strings, not `Date`: the payload round-trips through the outbox
 * as JSON, and they are the TOOL's lifecycle, distinct from `BaseEvent.time` (when the fact was
 * minted).
 */
export const AgentToolCallEventSchema = z.domainEvent({
	/** Provider-assigned id correlating the `tool_use` frame with its `tool_result`. */
	toolUseId: z.string(),
	/**
	 * OPEN set — `z.string()`, deliberately, and this is the ONE exception §4.9 carves out. MCP servers
	 * add tools at runtime, so the tool name is not a value-set anyone can close. `model` and
	 * `stopReason` ARE closed and are therefore enums; conflating the two cases is what produced the
	 * brittle `TuiActionType` this rewrite deletes.
	 */
	tool: z.string(),
	input: z.record(z.string(), z.unknown()),
	output: z.record(z.string(), z.unknown()).optional(),
	status: z.enum(AgentToolCallStatus),
	startedAt: z.iso.datetime(),
	finishedAt: z.iso.datetime().optional(),
	errorMessage: z.string().optional(),
})

export class AgentToolCallEvent extends BaseDomainEvent<typeof AgentToolCallEventSchema> {
	static override readonly name = 'agent.turn.tool_call' as const
	static readonly schema = AgentToolCallEventSchema
}
