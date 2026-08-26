import type { Controller } from '../types/Controller'
import type { Router } from '../types/Router'

/** The static shape a controller CLASS carries when it declares itself model-callable. */
export interface McpExposedControllerClass {
	readonly name: string
	readonly mcpScopes?: readonly string[]
}

/**
 * `OP(C)` — the operationId of a controller, BY THE EMITTER'S OWN RULE, spelled once.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THIS USED TO BE TWO COPIES AND A TEST BETWEEN THEM. `OpenAPI.buildOperationId` derived it from the
 * instance; `agent/mcp/manifest.ts#operationIdOf` re-derived it from the class, and
 * `tests/architecture/mcp-manifest.test.ts` asserted set-equality between the two so a drift in
 * either would be a red test rather than a silently empty tool. One function with two callers is
 * strictly better than two functions with a referee.
 *
 * THE MULTI-METHOD SUFFIX IS NOT REPRODUCIBLE FROM A CLASS, AND THAT IS SAID OUT LOUD
 * `buildOperationId` appends the HTTP method when a controller declares MORE THAN ONE — but `method`
 * is an INSTANCE property, so a class-side scan cannot know it. `methods` is therefore optional here:
 * the emitter passes the real list, a class-side scan passes nothing and gets the base name. No
 * controller in any declared scope has ever had more than one method, and the golden snapshot
 * (`tests/architecture/mcp-exposure.test.ts`) compares the class-side scan against the EMITTED spec
 * in both directions — so a controller that grows a second method turns into a red test, not into a
 * tool nobody can call.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export function operationIdOf(target: McpExposedControllerClass | Controller, method?: string, methods?: readonly string[]): string {
	const className = 'name' in target && typeof target.name === 'string' && target.name.length > 0 ? target.name : target.constructor.name
	const baseName = className.replace('Controller', '')
	if (!method || !methods || methods.length <= 1) return baseName
	return `${baseName}${method.charAt(0).toUpperCase() + method.slice(1)}`
}

/**
 * The scopes a controller DECLARED — empty for everything nobody declared.
 *
 * THE DEFAULT IS NOT EXPOSED, and that is the entire security property: measured on the real spec,
 * `@kubb/plugin-mcp` with no `include` filter turned ALL 40 operations into tools. An endpoint born
 * tomorrow is not a model-callable tool tomorrow, because its class says nothing.
 *
 * Accepts an INSTANCE (the emitter walks `router.controllers`, already resolved by DI) or a CLASS
 * (a runtime scan walks the `controllers/index.ts` barrels). Both read the same `static`.
 */
export function mcpScopesOf(target: McpExposedControllerClass | Controller): readonly string[] {
	const source = (typeof target === 'function' ? target : target.constructor) as McpExposedControllerClass
	return source.mcpScopes ?? []
}

/**
 * A scan of the declared MCP exposure — `operationId ↔ scope`, both directions.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * A LOCAL OBJECT, NOT A REGISTRY. Its predecessor was a module-level `Map` in
 * `core/src/utils/McpScopeRegistry.ts`, populated by a SIDE-EFFECT import from the api package
 * (`agent/mcp/register.ts`) because the emitter lives in core and core must not import from `src`.
 * The `static` on the controller removes the need for that crossing entirely: the declaration
 * ARRIVES with the controller. So this is constructed where it is used, from what the caller already
 * holds, and it dies with the call. Nothing to register, nothing to order at boot, nothing to forget
 * to import — the measured failure of the predecessor was that commenting out ONE side-effect line
 * dropped the whole tool surface to zero with a green build.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export class McpExposure {
	private readonly byOperation = new Map<string, string[]>()
	private readonly byScope = new Map<string, string[]>()

	private constructor(entries: Iterable<readonly [string, readonly string[]]>) {
		for (const [operationId, scopes] of entries) {
			if (scopes.length === 0) continue
			this.byOperation.set(operationId, [...scopes])
			for (const scope of scopes) this.byScope.set(scope, [...(this.byScope.get(scope) ?? []), operationId])
		}
	}

	/** From resolved controller INSTANCES — what `generateSpecification(routers)` already holds. */
	static fromRouters(routers: readonly Router[]): McpExposure {
		const controllers = routers.flatMap(router => router.controllers ?? [])
		return new McpExposure(controllers.map(controller => [operationIdOf(controller), mcpScopesOf(controller)] as const))
	}

	/** From controller CLASSES — what a runtime scan of the `controllers/index.ts` barrels holds. */
	static fromClasses(classes: Iterable<McpExposedControllerClass>): McpExposure {
		return new McpExposure([...classes].map(controller => [operationIdOf(controller), mcpScopesOf(controller)] as const))
	}

	/** The scopes exposing an operation. Empty for every operation nobody declared. */
	scopesFor(operationId: string): readonly string[] {
		return this.byOperation.get(operationId) ?? []
	}

	/** The operationIds of a scope, SORTED — the shape the published manifest and the snapshot compare. */
	operationIds(scope: string): readonly string[] {
		return [...(this.byScope.get(scope) ?? [])].sort()
	}

	/** Every scope something declared, sorted. Empty when this service has no MCP surface at all. */
	scopes(): readonly string[] {
		return [...this.byScope.keys()].sort()
	}

	/** `scope → operationIds`, the exact object published at the spec root as `x-mcp-scopes`. */
	manifest(): Record<string, string[]> {
		return Object.fromEntries(this.scopes().map(scope => [scope, [...this.operationIds(scope)]]))
	}
}
