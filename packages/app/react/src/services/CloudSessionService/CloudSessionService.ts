/**
 * `SecretsService` key the device token is stored under (keychain on desktop, the dev-only
 * localStorage fallback in the browser). Shared by every consumer that reads/writes the token —
 * `CloudSessionGate` (checks presence on boot), `useDeepLinkAuth` (writes it after exchange), and
 * the account menu's logout control (deletes it) — so the name lives once, next to the port these
 * consumers already import.
 */
export const CLOUD_DEVICE_TOKEN_SECRET_KEY = 'codm.cloud.deviceToken'

/**
 * The desktop's half of the OAuth device-code handshake (SP2 spec Decisions 4/7, Task T6). The
 * host owns exactly ONE thing neither React nor the wire contract can: how to hand a URL to a
 * program OUTSIDE this webview (the OS's default browser, for the OAuth consent screen the cloud
 * hosts) and how to hear back when the OS routes the resulting `codm://auth?code=…` deep link to
 * this process. Everything else about the flow — trading the code for a device token, storing it,
 * revoking it — goes through the ordinary SDK + `SecretsService`, not this port.
 *
 * PORT only, like every other file here — no platform SDK, no react.
 */
export interface CloudSessionService {
	/**
	 * Opens `url` in the SYSTEM's default browser — never this webview. The desktop shell has no
	 * cookie jar to share with a browser-hosted OAuth session, and rendering the provider's consent
	 * screen inside the app's own webview would defeat the point of a system-trusted browser chrome
	 * for a login prompt.
	 */
	openBrowser(url: string): Promise<void>

	/**
	 * Subscribes to the `codm://` deep link the OS hands back once OAuth completes. `listener`
	 * receives the raw URL string (e.g. `codm://auth?code=<uuid>`) — parsing the `code` query param
	 * is the caller's job (`useDeepLinkAuth`), same division as `SupervisionService.subscribe`.
	 * Resolves to the unsubscribe function.
	 */
	onAuthCallback(listener: (url: string) => void): Promise<() => void>
}
