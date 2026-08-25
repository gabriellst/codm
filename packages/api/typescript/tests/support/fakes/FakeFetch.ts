// Typed fetch fake for services that take `fetchFn: typeof fetch` (bp-20).
// The ONE `as unknown as typeof fetch` cast (tsyringe-style centralization) lives
// here so test files never cast. Match a URL fragment to a Response factory.
export type FetchStub = typeof fetch

export interface FakeFetchCall {
	url: string
	init?: RequestInit
}

export interface FakeFetchOptions {
	/** url-substring → Response factory; first match wins */
	routes?: Record<string, () => Response>
	/** used when no route matches; defaults to an empty 200 JSON body */
	default?: () => Response
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
		...init,
	})
}

export function createFakeFetch(opts: FakeFetchOptions = {}): { fetch: FetchStub; calls: FakeFetchCall[] } {
	const calls: FakeFetchCall[] = []
	const impl = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
		calls.push({ url, init })
		for (const [fragment, make] of Object.entries(opts.routes ?? {})) {
			if (url.includes(fragment)) return make()
		}
		return (opts.default ?? (() => jsonResponse({})))()
	}
	// Centralized cast — the reason this fake exists (bp-20). Tests never cast.
	return { fetch: impl as unknown as FetchStub, calls }
}
