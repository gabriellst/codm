/**
 * Where the MCP JSON-RPC door is mounted. A LEAF module for the same reason `wire.ts` is one: the base
 * `Agent` needs the path to build the endpoint it hands a CLI, and importing `router.ts` for it would
 * pull the MCP SDK and the GENERATED server module into every agent's module graph — including the
 * classifier, which has no tools and never touches either.
 */
export const MCP_ROUTE_PREFIX = '/mcp'
