import Constants from 'expo-constants'
import { configureClient } from '@template/client-typescript/http'

/**
 * Resolves the base URL for the SDK from (in order):
 *   - `Constants.expoConfig.extra.apiUrl` (set per environment in `app.json`),
 *   - `EXPO_PUBLIC_API_URL` (CI / .env override),
 *   - `http://localhost:3030` (Simulator dev fallback).
 *
 * Authentication cookies are persisted by `@better-auth/expo` in
 * `expo-secure-store`. The expo client patches the global `fetch` so the
 * session cookie ships with every request to the API origin — that means
 * the SDK's `ky`-based client picks it up automatically without explicit
 * header injection.
 */
export function initApiClient() {
	const baseUrl: string =
		(Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3030'

	configureClient({ typescript: baseUrl, rust: baseUrl, go: baseUrl })
}
