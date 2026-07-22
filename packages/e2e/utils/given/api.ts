import type { BrowserContext } from 'playwright'
import { createClient, type RequestConfig, type ResponseConfig } from '@template/client-typescript/http'

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:3030'
const baseClient = createClient('typescript')

export interface ApiSession {
	token: string
	cookies: { name: string; value: string; domain: string; path: string; httpOnly?: boolean }[]
	/**
	 * Pre-configured SDK client that injects session cookies automatically.
	 * Pass as: `await createPatient({ data }, { client: session.client })`
	 */
	client: <TData, _TError = unknown, TVariables = unknown>(config: RequestConfig<TVariables>) => Promise<ResponseConfig<TData>>
}

/**
 * Creates an SDK-compatible client function that injects the session cookie
 * and Origin header into every request.
 */
function createAuthenticatedClient(token: string) {
	return <TData, _TError = unknown, TVariables = unknown>(config: RequestConfig<TVariables>): Promise<ResponseConfig<TData>> => {
		const existingHeaders =
			config.headers instanceof Headers ? Object.fromEntries(config.headers.entries()) : ((config.headers as Record<string, string>) ?? {})

		return baseClient<TData, _TError, TVariables>({
			...config,
			headers: {
				...existingHeaders,
				Cookie: `better-auth.session_token=${token}`,
				Origin: API_BASE_URL,
			},
		})
	}
}

/**
 * Signs up via Better Auth API, returns session with authenticated client.
 */
export async function apiSignUp(params: { name: string; email: string; password: string }): Promise<ApiSession> {
	const response = await fetch(`${API_BASE_URL}/v1/authentication/sign-up/email`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Origin: API_BASE_URL,
		},
		body: JSON.stringify({
			...params,
			confirmPassword: params.password,
		}),
	})

	if (!response.ok) {
		const body = await response.text()
		throw new Error(`Sign-up failed (${response.status}): ${body}`)
	}

	const setCookies = response.headers.getSetCookie()
	let token = ''
	const cookies: ApiSession['cookies'] = []

	for (const cookie of setCookies) {
		const [nameValue, ...attrs] = cookie.split(';').map(s => s.trim())
		const eqIdx = nameValue.indexOf('=')
		const name = nameValue.slice(0, eqIdx)
		const value = decodeURIComponent(nameValue.slice(eqIdx + 1))

		let path = '/'
		let domain = 'localhost'
		let httpOnly = false

		for (const attr of attrs) {
			const [key, val] = attr.split('=')
			const lk = key.toLowerCase()
			if (lk === 'path' && val) path = val
			if (lk === 'domain' && val) domain = val
			if (lk === 'httponly') httpOnly = true
		}

		cookies.push({ name, value, domain, path, httpOnly })

		if (name === 'better-auth.session_token') {
			token = value
		}
	}

	return {
		token,
		cookies,
		client: createAuthenticatedClient(token),
	}
}

/**
 * Injects session cookies into a Playwright browser context.
 */
export async function injectSession(context: BrowserContext, session: ApiSession) {
	await context.addCookies(session.cookies)
}
