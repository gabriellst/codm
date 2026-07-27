import type { ZodType } from 'zod'
import type { AgentModelId, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { AgentMessageRole, AgentName } from '../enums'
import type { ProviderCapabilities } from '../providers/ProviderDef'
import type { AgentMcpInvocation } from './AgentMcpInvocation'

/** One message of the turn being driven. Several messages = the SAME live turn, not several turns. */
export interface AgentMessage {
	role: AgentMessageRole
	content: string
}

/**
 * Everything the seam needs to drive one run (GOAL-agent-abstraction §4.2) — and nothing more.
 *
 * What is NOT here is the load-bearing part: no `ownerId`, no `issueId`, no `threadId`. Identity
 * travels INSIDE the opaque `mcp.token`, minted by the base `Agent` (the only layer that sees both
 * the envelope and the request) and read back by the tool handler. AC-1.11 greps for exactly that.
 *
 * `outputSchema` is the ONE switch that turns this call into "classification". There is no second
 * method on the seam and no second transport: structured output is the degenerate case of streaming,
 * validated once at the terminal event.
 *
 * `model` is `AgentModelId`, never `string` — same rule that makes `stopReason` an enum. Widening the
 * set is a contract edit, not a new literal at a call site.
 */
export interface AgentRunRequest<OutputSchema extends ZodType | undefined = undefined> {
	/** Identity for telemetry, logs and run-token claims. NEVER a resolution key. */
	agentName: AgentName
	provider: ProviderKind
	/** The thread's ABSOLUTE workspace path. Never optional — an implicit `process.cwd()` is the worst default. */
	cwd: string
	systemPrompt?: string
	messages: readonly AgentMessage[]
	outputSchema?: OutputSchema
	model?: AgentModelId
	session?: { resumeId?: string; newId?: string }
	/** Resolved by `ProviderDetector`; the runner falls back to the def's bare binary name. */
	binaryPath?: string
	/**
	 * What the probe found THIS binary can do, threaded from `ProviderDetector` beside `binaryPath`.
	 *
	 * By parameter, never from a module-level map, and §4.7 is explicit about why: a map that detection
	 * mutates makes `buildArgs` impure in practice — the argv would depend on whether detection had run
	 * yet, and two runs in one process could disagree for reasons invisible at the call site. Absent
	 * means the CONSERVATIVE set: no optional flag is passed, which is the only safe default because an
	 * older build aborts on an argument it does not recognize.
	 */
	caps?: ProviderCapabilities
	/** Present ⟺ the agent declared a non-empty tool scope (§4.4). Absent = this run has no tools. */
	mcp?: AgentMcpInvocation
	/** Cancellation → process-group kill. */
	signal?: AbortSignal
	/** Extra roots beyond `cwd` the agent may touch (`--add-dir`). */
	extraDirs?: readonly string[]
}
