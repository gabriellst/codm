import type { Token } from './token'

/**
 * A constructable service class, optionally declaring its dependencies as a
 * static `deps` tuple of tokens. The container reads `deps`, resolves each one
 * (recursively), and passes the instances to the constructor in order. `any[]`
 * on the ctor args is deliberate: it is the one spot that lets a class with a
 * TYPED constructor (`new (engine: Engine) => Car`) be stored behind a single
 * uniform ctor type — `unknown[]` would break under strictFunctionTypes because
 * ctor params are contravariant.
 */
// biome-ignore lint/suspicious/noExplicitAny: uniform ctor storage requires any[] (see docstring)
export type Ctor = (new (...args: any[]) => unknown) & { deps?: readonly Token<unknown>[] }

/** A declarative environment record: `[Token, Class]` pairs, ZERO `new`. */
export type Bindings = readonly (readonly [Token<unknown>, Ctor])[]

/**
 * Minimal DI container — the frontend analogue of the backend's per-context DI
 * (registry.ts → InstanceRegistry → tsyringe child container), rebuilt without
 * decorators/reflect-metadata so nothing fights Vite or the async code-split.
 *
 * DECLARATIVE: an environment hands the container a record of `[Token, Class]`
 * pairs via `load`; the container is the ONLY place `new` ever runs (`new K(...)`
 * in `resolve`). Dependencies are declared as `static deps` on the class and
 * wired RECURSIVELY at resolve time — no factory closures, no `new` scattered
 * across the registry.
 *
 * SINGLETON by default: services are stateless host adapters, so a token resolves
 * its class once and caches the instance for the container's lifetime. A fresh
 * Container is the isolation seam — one per environment bootstrap, one per test
 * (mirrors the backend's child-container-per-suite).
 */
export class Container {
	readonly #bindings = new Map<symbol, Ctor>()
	readonly #cache = new Map<symbol, unknown>()
	readonly #resolving = new Set<symbol>()

	/** Merge an environment's declarative bindings. Re-loading a token overwrites (valid until first resolve). */
	load(bindings: Iterable<readonly [Token<unknown>, Ctor]>): void {
		for (const [t, c] of bindings) this.#bindings.set(t.key, c)
	}

	/**
	 * Resolve (and cache) the instance for a token. Reads the class's `static deps`,
	 * resolves each recursively, and constructs. Throws — naming the token — when a
	 * binding is missing or a dependency cycle is detected.
	 */
	resolve<T>(t: Token<T>): T {
		if (this.#cache.has(t.key)) return this.#cache.get(t.key) as T // singleton

		const K = this.#bindings.get(t.key)
		if (!K) throw new Error(`Sem binding para "${String(t.key.description)}" — o environment carregou esse token? (services/registry)`)
		if (this.#resolving.has(t.key)) throw new Error(`Dependência circular: "${String(t.key.description)}"`)

		this.#resolving.add(t.key)
		const deps = (K.deps ?? []).map(d => this.resolve(d)) // recursivo
		const inst = new K(...deps) as T
		this.#resolving.delete(t.key)
		this.#cache.set(t.key, inst)
		return inst
	}
}
