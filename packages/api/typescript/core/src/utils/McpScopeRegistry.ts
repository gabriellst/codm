/**
 * Runtime registry mapping `operationId` → the MCP scopes that expose it as a tool.
 *
 * EXACT MIRROR of `GlobalErrorMapper` / `registerErrorCodes`, and for the same structural reason:
 * the OpenAPI emitter lives in `core`, the declaration lives in the api package
 * (`src/agent/mcp/manifest.ts`), and `core` must not import from `src`. So the api REGISTERS at
 * module-load time and the emitter READS. The router imports that the composition root performs
 * before `generateSpecification()` are what guarantee the registration has already happened — the
 * identical ordering guarantee `x-error-codes` already relies on.
 *
 * Core stays empty. Nothing here knows what a scope means; it only carries the declaration across the
 * package boundary so the emitter can stamp it onto the spec.
 *
 * WHAT THE EMITTER DOES WITH IT — two outputs, because they serve two different readers:
 *  - `x-mcp-scope` on the operation: the DECLARATION OF RECORD. Human-readable, greppable, survives
 *    into the committed `openapi.json`.
 *  - a synthetic TAG `mcp:<scope>`: the TRANSPORT. `@kubb/plugin-oas` filters by
 *    `tag | operationId | path | method | contentType` and by nothing else — there is no branch that
 *    reads a vendor extension, and an unknown filter `type` returns `false` silently. Without the tag
 *    the allowlist matches zero operations and the build still reports success.
 */

const registry = new Map<string, readonly string[]>()

/**
 * Declare which scopes expose an operation. Call at module load, from the ONE manifest.
 *
 * Idempotent by key: re-registering an operationId replaces its scope list rather than appending, so
 * a module evaluated twice (test harnesses re-import freely) cannot silently double a tag.
 */
export function registerMcpScopes(entries: Iterable<readonly [string, readonly string[]]>): void {
	for (const [operationId, scopes] of entries) registry.set(operationId, scopes)
}

/** The scopes an operation belongs to — empty for every operation nobody declared. THE DEFAULT IS NOT EXPOSED. */
export function mcpScopesFor(operationId: string): readonly string[] {
	return registry.get(operationId) ?? []
}

/** Snapshot for tests and for the count assertions the generator runs. */
export function mcpScopeRegistrySnapshot(): ReadonlyMap<string, readonly string[]> {
	return new Map(registry)
}
