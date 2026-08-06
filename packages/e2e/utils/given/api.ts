import type { BrowserContext } from 'playwright'
import { createClient, type RequestConfig, type ResponseConfig } from '@codm/client-typescript/http'

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:3130'
const baseClient = createClient('typescript')

export interface ApiSession {
	token: string
	cookies: { name: string; value: string; domain: string; path: string; httpOnly?: boolean }[]
	/**
	 * Pre-configured SDK client. After the operator collapse there is a single operator and no
	 * session cookie — OperatorMiddleware stamps the operator on every request — so this only adds
	 * the Origin header. Pass as: `await createOwner({ data }, { client: session.client })`.
	 */
	client: <TData, _TError = unknown, TVariables = unknown>(config: RequestConfig<TVariables>) => Promise<ResponseConfig<TData>>
}

/** SDK client that injects the Origin header (no auth cookie — the server runs as the operator). */
function createOperatorClient() {
	return <TData, _TError = unknown, TVariables = unknown>(config: RequestConfig<TVariables>): Promise<ResponseConfig<TData>> => {
		const existingHeaders =
			config.headers instanceof Headers ? Object.fromEntries(config.headers.entries()) : ((config.headers as Record<string, string>) ?? {})

		return baseClient<TData, _TError, TVariables>({
			...config,
			headers: {
				...existingHeaders,
				Origin: API_BASE_URL,
			},
		})
	}
}

/**
 * Returns the operator session — no sign-up, no cookies. CODM is single-operator (founder
 * decision 2); the API stamps the operator identity server-side via OperatorMiddleware.
 */
export function apiOperatorSession(): ApiSession {
	return {
		token: 'operator',
		cookies: [],
		client: createOperatorClient(),
	}
}

/** No-op kept for call-site compatibility — the operator model carries no session cookie to inject. */
export async function injectSession(_context: BrowserContext, _session: ApiSession): Promise<void> {
	return
}
