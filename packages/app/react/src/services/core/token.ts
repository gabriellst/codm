/**
 * A typed DI key. The `symbol` is the identity the Container maps on; the phantom
 * `_t` carries the bound type so `register`/`resolve` stay type-safe without any
 * decorator/reflect-metadata machinery (deliberately avoided — reflect-metadata is
 * friction under Vite and a hazard for code-splitting). Backend parity: this is the
 * frontend analogue of the api's `RegistryToken` (a class/string key), minus tsyringe.
 */
export interface Token<T> {
	readonly key: symbol
	/** Phantom — never assigned at runtime; exists only so `T` is inferable. */
	readonly _t?: T
}

/** Mint a fresh token. `description` is human-facing only (shows up in resolve errors). */
export const token = <T>(description: string): Token<T> => ({ key: Symbol(description) })
