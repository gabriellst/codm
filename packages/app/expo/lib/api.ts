import { configureClient } from '@codedm/client-typescript/http'
import { resolveDefaultDaemonUrl } from './daemon'

/**
 * Synchronously points every SDK service (TS reads + Go channel worker) at the
 * default local-daemon origin so the very first render can fire requests.
 * `applyStoredDaemonUrl()` (called from the root layout on mount) then re-points
 * the client at the operator's SecureStore override, if any.
 *
 * CodeDM has no account — there is no session cookie to inject; the daemon is
 * trusted on the local network.
 */
export function initApiClient() {
	const baseUrl = resolveDefaultDaemonUrl()
	configureClient({ typescript: baseUrl, go: baseUrl })
}
