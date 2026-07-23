import { configureClient } from '@codedm/client-typescript/http'
import { generateEmail } from '../generators'
import { apiOperatorSession, type ApiSession } from './api'

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:3030'
// `go` rides the api-ts ChannelProxy shape (the canonical map in app lib/config.ts) — never :3032.
configureClient({ typescript: API_BASE_URL, go: `${API_BASE_URL}/v1/external/channel` })

export interface FreshUser {
	email: string
	password: string
	session: ApiSession
}

/**
 * Returns the operator session for a test. After the operator collapse (founder decision 2) there is
 * no sign-up and no login — every request is the single operator, stamped server-side by
 * OperatorMiddleware, and there is no session cookie to inject into a browser context. So this needs
 * NO BrowserContext: the API-flow specs run entirely through the SDK client and never launch a browser
 * (which also keeps the suite hermetic — no Playwright browser download). The email/password are
 * retained only so existing call sites keep their shape.
 */
export async function givenFreshUser(overrides: Partial<{ email: string; name: string; password: string }> = {}): Promise<FreshUser> {
	const email = overrides.email ?? generateEmail()
	const password = overrides.password ?? 'Password123!'
	return { email, password, session: apiOperatorSession() }
}
