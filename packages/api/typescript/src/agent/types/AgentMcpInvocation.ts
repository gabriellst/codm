import type { AgentToolName } from '../enums'

/**
 * The MCP configuration + tool scope of ONE agent run (GOAL-agent-abstraction §4.2/§4.4).
 *
 * It is INVOCATION DATA, of the same nature as `binaryPath` and `cwd` — not an inventory of
 * executable functions. That distinction is the whole reason `AgentRunRequest` never grows a
 * `tools: Tool[]` field the way the origin `LlmRunner` has one: there, the runner MEDIATES the
 * tool loop; here the CLI talks to our MCP server over a SEPARATE transport and the runner keeps
 * doing exactly one thing — spawn a process and drain frames.
 *
 * IDENTITY BOUNDARY — the single most important line in this file. `token` is OPAQUE to the runner.
 * The claims (`ownerId`, `issueId`, `threadId`, `agentName`, `expiresAt`) live INSIDE it, which is
 * why `AgentRunRequest` still declares none of them (AC-1.11) and why no tool input schema declares
 * them either (AC-1.6). A model does not get to choose on whose behalf it acts, and an injected
 * prompt cannot complete another owner's issue.
 *
 * Lifecycle, with no ambiguity about who does what (§4.4):
 *  - MINTED by the base `Agent` in the concrete body of its template-method `run()` — the only layer
 *    that sees both the input envelope and the request it is building.
 *  - TRANSPORTED here, opaque: `Authorization` header (http) or process `env` (stdio).
 *  - VERIFIED by the MCP router on EVERY tool call — authorization is per-call, not per-run.
 *  - REVOKED by the RUNNER when the run terminates, however it terminates (normal, error,
 *    cancellation §4.11). A late tool call from a dead run gets a 401 and writes nothing.
 */
export interface AgentMcpInvocation {
	/**
	 * Which of the two §4.4 transports the boot-time detector settled on. A per-agent choice would be
	 * a capability decision made in the wrong place — it is a property of the machine + CLI build.
	 */
	transport: 'http' | 'stdio'
	/** `transport === 'http'`: absolute URL of the local MCP router, e.g. `http://127.0.0.1:<API_PORT>/mcp`. */
	endpoint?: string
	/** `transport === 'stdio'`: the entry stub, e.g. `{ command: 'bun', args: ['agent/mcp/stdio-entry.ts'] }`. */
	command?: { command: string; args: readonly string[] }
	/** The OPAQUE run token (§4.4). The runner never reads it and never mints it. */
	token: string
	/**
	 * The tool scope of THIS run — becomes `--allowedTools`. Comes from the agent's declared `tools`,
	 * NEVER from the runner. An empty scope does not produce an empty list: it produces no
	 * `AgentMcpInvocation` at all, which is what makes `request.mcp` present ⟺ `agent.tools.length > 0`
	 * (§4.3, rule 7).
	 */
	allowedTools: readonly AgentToolName[]
}
