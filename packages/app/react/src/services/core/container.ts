import type { Token } from './token'

/**
 * Minimal DI container — the frontend analogue of the backend's per-context
 * DI (registry.ts → InstanceRegistry → tsyringe child container), rebuilt without
 * decorators/reflect-metadata so nothing fights Vite or the async code-split.
 *
 * SINGLETON by default: services are stateless host adapters, so a token resolves
 * its factory once and caches the instance for the container's lifetime. A fresh
 * Container is the isolation seam — one per environment bootstrap, one per test
 * (mirrors the backend's child-container-per-suite).
 */
export class Container {
	readonly #factories = new Map<symbol, (c: Container) => unknown>()
	readonly #cache = new Map<symbol, unknown>()

	/** Bind a token to a factory. Re-registering overwrites the factory (valid until first resolve). */
	register<T>(t: Token<T>, factory: (c: Container) => T): void {
		this.#factories.set(t.key, factory)
	}

	/** Resolve (and cache) the instance for a token. Throws — naming the token — when unbound. */
	resolve<T>(t: Token<T>): T {
		if (this.#cache.has(t.key)) return this.#cache.get(t.key) as T

		const factory = this.#factories.get(t.key)
		if (!factory) {
			throw new Error(
				`No binding registered for token "${t.key.description ?? '<anonymous>'}" — did the environment register it? (see services/environments)`,
			)
		}
		const instance = factory(this) as T
		this.#cache.set(t.key, instance)
		return instance
	}
}
