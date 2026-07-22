import type { BrowserContext } from 'playwright'
import { configureClient } from '@template/client-typescript/http'
import { generateEmail } from '../generators'
import { apiSignUp, injectSession, type ApiSession } from './api'

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:3030'
configureClient({ typescript: API_BASE_URL, go: API_BASE_URL })

export interface FreshUser {
	email: string
	password: string
	session: ApiSession
}

/**
 * Creates a fresh, signed-in user and injects the session cookie into the
 * given browser context. Use this from a test fixture before navigating to
 * an authenticated route.
 */
export async function givenFreshUser(
	context: BrowserContext,
	overrides: Partial<{ email: string; name: string; password: string }> = {},
): Promise<FreshUser> {
	const email = overrides.email ?? generateEmail()
	const password = overrides.password ?? 'Password123!'
	const name = overrides.name ?? 'Test User'

	const session = await apiSignUp({ name, email, password })
	await injectSession(context, session)

	return { email, password, session }
}
