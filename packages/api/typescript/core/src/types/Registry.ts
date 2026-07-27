import type { DependencyContainer } from 'tsyringe-neo'

export type RegistryToken = string | (abstract new (...args: any[]) => any)

export type RegistryEntry =
	| { token: RegistryToken; instance: any }
	| { token: RegistryToken; useFactory: (container: DependencyContainer) => any }
	/** TRANSIENT class binding — a fresh instance per `resolve`. See `registerAll` for when to want it. */
	| { token: RegistryToken; useClass: new (...args: any[]) => any }

export interface InstanceRegistry {
	mock: RegistryEntry[]
	integration: RegistryEntry[]
	real: RegistryEntry[]
}

/**
 * Apply one env's entries to a container.
 *
 * THREE binding forms, and the lifecycle is the difference between them:
 *  - `instance` holding a CLASS  → `registerSingleton`. The default, and right for anything that owns
 *    state or a resource: repositories, the stream registry, the runner.
 *  - `useFactory`                → transient, built by the given function on every resolve.
 *  - `useClass`                  → TRANSIENT, built by the container on every resolve.
 *
 * `useClass` exists because a singleton CAPTURES its dependency graph at first construction, and for a
 * stateless collaborator that is a liability rather than a saving. The agents (§4.8) are the case:
 * each holds nothing but a reference to the singleton `AgentRunner` and its prompt builder, so a
 * singleton agent buys no shared state — while it does mean that rebinding `AgentRunner` (which is
 * exactly what `TestBed.override` does, and what the DI-env seam of §8 rule 8 rests on) silently fails
 * to reach an agent that some earlier resolve already built. Transient makes the graph honest at every
 * resolve, at the cost of one object allocation.
 */
export function registerAll(container: DependencyContainer, entries: RegistryEntry[]): void {
	for (const entry of entries) {
		if ('useFactory' in entry) {
			container.register(entry.token as any, { useFactory: entry.useFactory })
		} else if ('useClass' in entry) {
			container.register(entry.token as any, { useClass: entry.useClass })
		} else if (typeof entry.instance === 'function') {
			container.registerSingleton(entry.token as any, entry.instance)
		} else {
			container.registerInstance(entry.token as any, entry.instance)
		}
	}
}

// ── Declarative bindings — one declaration per token, envs as COLUMNS ─────────────────────────────
// The raw InstanceRegistry shape redeclares every token per env (3×), so "bound in mock but
// forgotten in real" is invisible — the orphan-binding twin of the orphan-handler class. A
// BindingDecl declares the token ONCE with its per-env values: divergence is a visible column,
// absence is a DECLARED `null`, and `integration` omitted mirrors `real` (integration is
// production-against-the-real-database by convention — same impl, sandboxed infra).

/**
 * A binding value: a class (registered as SINGLETON), a plain instance, a lazy `{ useFactory }`, or a
 * `{ useClass }` for a TRANSIENT class binding (see `registerAll` for which to reach for).
 */
export type BindingValue = { useFactory: (container: DependencyContainer) => any } | { useClass: new (...args: any[]) => any } | any

export interface BindingDecl {
	token: RegistryToken
	/** mock-env binding. `null` = declared absence — the token is intentionally unbound there. */
	mock: BindingValue | null
	/** real-env binding. `null` = declared absence. */
	real: BindingValue | null
	/** integration-env binding. OMITTED = mirrors `real`; `null` = declared absence. */
	integration?: BindingValue | null
}

/** Expand per-token declarations into the per-env InstanceRegistry the runtime consumes. */
export function expandBindings(decls: readonly BindingDecl[]): InstanceRegistry {
	const toEntry = (token: RegistryToken, value: BindingValue): RegistryEntry => {
		if (typeof value === 'object' && value !== null && 'useFactory' in value) return { token, useFactory: value.useFactory }
		if (typeof value === 'object' && value !== null && 'useClass' in value) return { token, useClass: value.useClass }
		return { token, instance: value }
	}
	const registry: InstanceRegistry = { mock: [], integration: [], real: [] }
	for (const decl of decls) {
		const integration = decl.integration === undefined ? decl.real : decl.integration
		if (decl.mock !== null) registry.mock.push(toEntry(decl.token, decl.mock))
		if (integration !== null) registry.integration.push(toEntry(decl.token, integration))
		if (decl.real !== null) registry.real.push(toEntry(decl.token, decl.real))
	}
	return registry
}

export function registerHandlers(container: DependencyContainer, handlers: Record<string, new (...args: any[]) => any>): void {
	for (const [name, HandlerClass] of Object.entries(handlers)) {
		if (typeof HandlerClass === 'function' && name !== 'default') {
			container.registerSingleton(HandlerClass, HandlerClass)
		}
	}
}
