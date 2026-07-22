import { createAuthClient } from 'better-auth/react'
import { Config } from './config'

export const auth = createAuthClient({
	baseURL: `${Config.baseUrl}/v1/authentication`,
})
