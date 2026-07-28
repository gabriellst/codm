/**
 * The run-token ambient context shared by the MCP router (which ESTABLISHES it) and the generated
 * per-scope `_http.ts` shims (which READ it).
 *
 * ### Why it lives in the SDK package and not in the api
 * The generated tool handlers are emitted into `@codedm/client-typescript`, and that package cannot
 * import from `packages/api` — the api depends on it, so the edge would be a cycle. The shims can only
 * import from their own package, so the seam has to live here. Nothing domain-shaped does: this module
 * knows about an opaque string and nothing else.
 *
 * ### Why it is NOT re-exported from `./http`
 * `@codedm/client-typescript/http` is what the BROWSER bundles. This module imports
 * `node:async_hooks`, which would break that bundle the moment it was pulled in transitively. It is
 * its own subpath on purpose, reachable only from the mcp scopes and from the api.
 *
 * ### Why `AsyncLocalStorage` and not a module-level variable
 * Tool calls are concurrent by nature — several agent runs can be in flight in one daemon, each with
 * its own token. A module-level "current token" would attach run A's credential to run B's outbound
 * request under nothing more exotic than two overlapping awaits. `AsyncLocalStorage` is the only
 * primitive that keeps that impossible without threading a parameter through generated code we do not
 * author (the generated handlers take no config argument — measured: `mcpGenerator` passes
 * `isConfigurable={false}`).
 */

import { AsyncLocalStorage } from 'node:async_hooks'

/** What one in-flight tool call carries. Deliberately just the opaque token — claims stay in the api. */
export interface McpRunContext {
	/** The opaque run token, verified by the router before the context was established. */
	token: string
}

const storage = new AsyncLocalStorage<McpRunContext>()

/** Run `fn` with the given context established for every async continuation beneath it. */
export function withMcpRunContext<T>(context: McpRunContext, fn: () => T): T {
	return storage.run(context, fn)
}

/** The context of the tool call currently in flight, or `undefined` outside one. */
export function currentMcpRunContext(): McpRunContext | undefined {
	return storage.getStore()
}

/** The header the run token travels in, single-sourced so the router and the shim cannot drift. */
export const MCP_RUN_TOKEN_HEADER = 'x-codedm-run-token'

/**
 * Read the current run token, or FAIL.
 *
 * This is the confused-deputy guard, and the failure is the feature (AC-6.19(c)): a generated tool
 * handler invoked outside a router-established context must NOT fall back to an anonymous request. The
 * daemon would serve that request as ITSELF — full operator authority, no run, no issue confinement —
 * which would turn the MCP server into an in-process privilege escalator. Throwing instead means the
 * only way to reach the domain through a tool is through the router that verified a token.
 */
export function requireMcpRunToken(): string {
	const context = currentMcpRunContext()
	if (!context) {
		throw new Error(
			'MCP tool handler invoked outside a run-token context — refusing to issue an unauthenticated request. ' +
				'Tool handlers must be called from the MCP router, which establishes the context after verifying the token.',
		)
	}
	return context.token
}
