/**
 * Runtime configuration for the HTTP client.
 *
 * Uses globalThis to ensure singleton behavior across bundled modules.
 * Base URLs are keyed by SERVICE (typescript, rust, go, ...) because each
 * service in the polyglot template can be deployed at a different origin.
 */

export type ServiceBaseUrls = Record<string, string>

interface GlobalRegistry {
	[key: symbol]: ServiceBaseUrls | undefined
}

const SYMBOL = Symbol.for('@template/client-typescript:baseUrls')

const globalRegistry = globalThis as unknown as GlobalRegistry

function registry(): ServiceBaseUrls {
	if (!globalRegistry[SYMBOL]) globalRegistry[SYMBOL] = {}
	return globalRegistry[SYMBOL]!
}

/**
 * Set base URLs for one or more services. Successive calls merge into the
 * existing registry; pass `{ typescript: '...' }` to update just one entry.
 */
export function configureClient(baseUrls: Partial<ServiceBaseUrls>): void {
	Object.assign(registry(), baseUrls)
}

/** Read the configured base URL for a service, if any. */
export function getBaseUrl(service: string): string | undefined {
	return registry()[service]
}

/** Read all configured base URLs (frozen snapshot). */
export function getConfig(): Readonly<ServiceBaseUrls> {
	return { ...registry() }
}

/** Reset the registry. Primarily for tests. */
export function resetClient(): void {
	globalRegistry[SYMBOL] = {}
}

/**
 * Resolve a path/URL against the service's configured base URL. If `baseUrl`
 * is supplied per call (e.g. via the Client class) it takes precedence over
 * the registry. If neither is set, the path is returned unchanged.
 */
export function resolveURL(service: string, url: string, baseUrlOverride?: string): string {
	const base = baseUrlOverride ?? getBaseUrl(service)
	if (!base) return url

	let path: string
	try {
		const parsed = new URL(url)
		path = parsed.pathname + parsed.search + parsed.hash
	} catch {
		path = url
	}
	if (!path.startsWith('/')) path = `/${path}`
	return `${base.replace(/\/$/, '')}${path}`
}
