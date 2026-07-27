import { z } from '@codedm/core-typescript'
import { ArtifactKind, StopKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentToolName } from '../../enums'

/**
 * The INPUT CONTRACT of the four `codedm__*` MCP tools (GOAL-agent-abstraction §4.4).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THE INVARIANT THIS FILE EXISTS TO HOLD: **not one of these schemas carries an identity field.**
 * No `ownerId`, no `issueId`, no `threadId`, ever. Identity travels in the opaque run token
 * (`AgentMcpInvocation.token`) and the router reads it from the CLAIMS. A model does not get to
 * choose on whose behalf it acts; a prompt-injected instruction cannot complete another owner's
 * issue because there is no field in which to say so. AC-1.6 asserts this mechanically over
 * `AGENT_TOOL_INPUT_SCHEMAS` — a new tool is covered the day it is added, with no list to maintain.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Every payload lands on vocabulary that is ALREADY FROZEN, and on a use case / event class that
 * already exists — the inversion changes WHO ORIGINATES a fact, never what the fact is:
 *
 * | tool                      | lands in                                              | frozen wire event                  |
 * |---------------------------|-------------------------------------------------------|------------------------------------|
 * | `codedm__complete_issue`  | `DeclareIssueComplete` → `TerminalSessionCompletedEvent` | `integration.issue.completed`     |
 * | `codedm__raise_stop`      | `DeclareStop` → `TerminalStopRaisedEvent`               | `integration.issue.stop_raised`   |
 * | `codedm__record_artifact` | `artifact/mcp/RecordArtifactTool` → `RecordArtifact`    | `integration.artifact.recorded`   |
 * | `codedm__ask_operator`    | `AskOperator` → the SAME `TerminalStopRaisedEvent`      | `integration.issue.stop_raised`   |
 *
 * Two placement notes, both deliberate and both already argued in §4.4:
 *
 *  - `record_artifact`'s SCHEMA is single-sourced here because `--allowedTools` is one flat list and
 *    `AgentToolName` is one enum. Its HANDLER is not: a tool is a thin controller of the context that
 *    OWNS the write it causes, so `RecordArtifactTool` is born in `artifact/mcp/` (Fase 6),
 *    dispatching the `RecordArtifact` use case that already carries `ref`/`meta`. Publishing
 *    `integration.artifact.recorded` from this context instead would create a SECOND publisher of a
 *    frozen event with no owner, and nothing would materialize the row.
 *  - `ask_operator` is deliberately a TYPED SUGAR over the same landing as `raise_stop`, with `kind`
 *    fixed by the handler to `HUMAN_REQUESTED` — the model does not pick the kind here. It is
 *    FIRE-AND-FORGET: the handler returns immediately. A synchronous "wait for the human" tool would
 *    hang the whole run until the watchdog on any night with nobody awake — the worst failure mode
 *    available.
 */

/** `codedm__complete_issue` — "I am done", with the summary that becomes the completion note. */
export const CompleteIssueToolInputSchema = z.object({
	summary: z.string().trim().min(1).max(4000),
})

/** `codedm__raise_stop` — "I am blocked", with the kind and the human-readable reason. */
export const RaiseStopToolInputSchema = z.object({
	// The DOMAIN half of StopKind is what a model may legitimately raise; the TRANSPORT half
	// (AUTH_REQUIRED / SERVER_ERROR) is observed by the runner, never declared. The schema stays on
	// the full frozen enum rather than redeclaring a narrowed value-set (§8 rule 5) — narrowing is
	// the handler's job, and it is one comparison against TRANSPORT_STOP_KINDS.
	kind: z.enum(StopKind),
	detail: z.string().trim().min(1).max(4000),
})

/** `codedm__record_artifact` — "I produced this", mirroring `RecordArtifactInputSchema` minus identity. */
export const RecordArtifactToolInputSchema = z.object({
	kind: z.enum(ArtifactKind),
	name: z.string().trim().min(1).max(200),
	ref: z.string().trim().min(1).max(2048),
	meta: z.string().optional(),
})

/** `codedm__ask_operator` — "I need a human to tell me X". Delivered as a HUMAN_REQUESTED stop. */
export const AskOperatorToolInputSchema = z.object({
	question: z.string().trim().min(1).max(4000),
})

/**
 * The tool registry: every `AgentToolName` mapped to its input schema. `Record<AgentToolName, …>` and
 * not an array, for the same reason `PROVIDER_DEFS` is a Record — exhaustiveness becomes a `tsc`
 * error rather than a boot-time check, and AC-1.6 iterates it without a hand list.
 */
export const AGENT_TOOL_INPUT_SCHEMAS = {
	[AgentToolName.COMPLETE_ISSUE]: CompleteIssueToolInputSchema,
	[AgentToolName.RAISE_STOP]: RaiseStopToolInputSchema,
	[AgentToolName.RECORD_ARTIFACT]: RecordArtifactToolInputSchema,
	[AgentToolName.ASK_OPERATOR]: AskOperatorToolInputSchema,
} as const satisfies Record<AgentToolName, unknown>
