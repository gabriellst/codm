/**
 * The MCP WIRE VOCABULARY — the one place the `mcp__<server>__<tool>` spelling is constructed.
 *
 * A LEAF module with no imports, and that is deliberate. Three things need this spelling and they sit
 * far apart in the graph: the runner (writes the server key into `--mcp-config` and the tool names
 * into `--allowedTools`), the manifest (derives the tool list an agent declares) and the turn-fact
 * accumulator (must RECOGNISE our own tools in the frame stream). Routing any of them through another
 * would drag a subprocess-spawning module into a pure state machine.
 *
 * ### The convention is NOT probed, and that is why it lives in one file
 * Claude Code namespaces MCP tools as `mcp__<key in the .mcp.json>__<tool name>`. The key is ours;
 * the shape is theirs, and nobody measured it in the viability probe. AC-6.1 measures it against a
 * real `claude`, and if the bytes differ the correction is ONE edit here — not a search-and-replace
 * across a runner, a manifest, an accumulator guard and their tests.
 */

/**
 * The server key our tools are namespaced under inside the CLI's MCP config.
 *
 * MIRRORS `template.config.ts` `REPO.brand` — kept a literal, not an import, on purpose (see the
 * module docblock: this is a LEAF file with zero imports so a correction is ONE edit here). Importing
 * `template.config.ts` would drag the repo root into `packages/api/typescript/src`, a tree that
 * `docker/Dockerfile.api` packages by copying only specific roots. Same decoupled-literal shape as
 * `modulePrefix` in `packages/api/go/pkg/openapi/walker.go` (`template/api-go/`) — both name their
 * source of truth in a comment instead of importing it.
 */
export const MCP_SERVER_KEY = 'codm'

/**
 * The prefix EVERY tool of ours carries on the wire.
 *
 * This is what the anti-double-publish guard keys on (§4.3 rule 3), and it is the thing the Fase-1
 * design got wrong in a way that would have failed silently: the frozen guard was
 * `frame.tool.startsWith(<the Fase-1 prefix>)`, which is FALSE for the real wire name — the old
 * prefix ends up in the MIDDLE of the real name. A guard that never matches emits a turn fact for a
 * tool call whose use case already persisted one, and `integration.issue.completed` is published
 * twice. Deriving the prefix from the key is what makes that class of drift impossible.
 */
export const MCP_TOOL_WIRE_PREFIX = `mcp__${MCP_SERVER_KEY}__` as const

/** `WIRE(C)` — the spelling an MCP client uses, and the string that goes into `--allowedTools`. */
export function wireToolName(operationId: string): string {
	return `${MCP_TOOL_WIRE_PREFIX}${operationId}`
}

/**
 * True when a `tool_use` / `tool_result` frame names one of OUR tools.
 *
 * Used by the accumulator to emit the frame (observability) and NEVER a fact: the fact was already
 * persisted, transactionally, by the use case that served the call.
 */
export function isCodmTool(toolName: string): boolean {
	return toolName.startsWith(MCP_TOOL_WIRE_PREFIX)
}
