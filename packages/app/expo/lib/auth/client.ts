import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import * as SecureStore from 'expo-secure-store'

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3030'

/**
 * Better-auth React Native client. The Expo plugin persists cookies/sessions
 * via `expo-secure-store` and routes OAuth deep-link redirects through the
 * `monorepo://` scheme registered in `app.json`.
 *
 * Use directly in routes:
 *   await auth.signIn.social({ provider: 'apple', idToken: { token } })
 *   await auth.signOut()
 *   const { data: session } = auth.useSession()
 */
export const auth = createAuthClient({
	baseURL: `${baseUrl}/v1/authentication`,
	plugins: [
		expoClient({
			scheme: 'monorepo',
			storagePrefix: 'monorepo',
			storage: SecureStore,
		}),
	],
})
