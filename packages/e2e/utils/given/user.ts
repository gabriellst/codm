import type { BrowserContext } from 'playwright'
import { configureClient } from '@template/client-typescript/http'
import { generateEmail } from '../generators'
import { apiOperatorSession, injectSession, type ApiSession } from './api'

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:3030'
configureClient({ typescript: API_BASE_URL, go: API_BASE_URL })

export interface FreshUser {
	email: string
	password: string
	session: ApiSession
}

/**
 * Returns the operator session for a test. After the operator collapse (founder decision 2) there
 * is no sign-up and no login — every request is the single operator, stamped server-side by
 * OperatorMiddleware. The email/password are retained only so existing call sites keep their shape.
 */
export async function givenFreshUser(
	context: BrowserContext,
	overrides: Partial<{ email: string; name: string; password: string }> = {},
): Promise<FreshUser> {
	const email = overrides.email ?? generateEmail()
	const password = overrides.password ?? 'Password123!'

	const session = apiOperatorSession()
	await injectSession(context, session)

	return { email, password, session }
}
