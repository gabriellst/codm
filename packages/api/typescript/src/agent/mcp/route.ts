/**
 * Where the MCP JSON-RPC door is mounted. A LEAF module for the same reason `wire.ts` is one: the base
 * `Agent` needs the path to build the endpoint it hands a CLI, and importing `router.ts` for it would
 * pull the MCP SDK and the GENERATED server module into every agent's module graph — including the
 * classifier, which has no tools and never touches either.
 */
export const MCP_ROUTE_PREFIX = '/mcp'

/**
 * Where an issue session's pre-tool hook posts (fase 2, item 3 — janela de arrependimento). A sibling of
 * the MCP prefix and a leaf for the same reason: the base `Agent` builds the URL it hands the runner, and
 * importing the controller for a path would drag a use case into every agent's module graph.
 */
export const PRE_TOOL_HOOK_PATH = '/agent/pre-tool-hook'
