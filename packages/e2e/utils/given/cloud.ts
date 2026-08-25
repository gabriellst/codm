import type { Page } from 'playwright'

/**
 * Seeds the cloud device token `CloudSessionGate` checks for, entirely client-side, before any
 * navigation happens.
 *
 * `CloudSessionGate` (`packages/app/react/src/components/console/CloudSessionGate.tsx`) wraps every
 * `(app)` route and redirects to `/login` whenever `SecretsService.get(CLOUD_DEVICE_TOKEN_SECRET_KEY)`
 * resolves empty. Real login is a GitHub/Google OAuth device-code handshake that hands the callback to
 * the OS's default browser (`CloudSessionService.openBrowser` / `onAuthCallback`) — nothing this suite
 * can drive. In the web build the secret lives in `localStorage`, namespaced by the DEV-ONLY fallback
 * (`BrowserSecretsService`, never real storage on desktop — that's the OS keychain via
 * `TauriSecretsService`): key = `${SECRET_PREFIX}${CLOUD_DEVICE_TOKEN_SECRET_KEY}` =
 * `'codm.native.secret.codm.cloud.deviceToken'` (see `packages/app/react/src/services/SecretsService/
 * BrowserSecretsService.ts` + `packages/app/react/src/services/CloudSessionService/CloudSessionService.ts`).
 * The gate only checks PRESENCE — it never validates the token against a real cloud backend (the API's
 * own auth is the separately-collapsed single-operator model, `OperatorMiddleware`) — so any non-empty
 * string satisfies it.
 *
 * Call BEFORE the first `goto` in a test that needs to reach an `(app)` route: `addInitScript` runs on
 * every document load in this browser context, ahead of the app's own scripts, so the store's boot-time
 * read (`CloudSessionGate`'s effect) always sees the seeded value.
 */
export async function authenticateCloudSession(page: Page): Promise<void> {
	await page.addInitScript(() => {
		localStorage.setItem('codm.native.secret.codm.cloud.deviceToken', 'e2e-fake-device-token')
	})
}
