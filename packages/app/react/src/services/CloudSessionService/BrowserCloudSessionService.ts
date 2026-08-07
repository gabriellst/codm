import type { CloudSessionService } from './CloudSessionService'

/**
 * HONEST DEGRADATION, same reasoning as `BrowserSupervisionService`: a plain browser tab has no OS
 * deep-link registration to hear back from — `codm://` only resolves to a process because the
 * desktop shell registered the scheme (packages/app/tauri/config/deeplink.ts). `openBrowser` still
 * does something useful (a new tab), but `onAuthCallback` has no host event to subscribe to, so it
 * is a no-op subscription rather than inventing one.
 */
export class BrowserCloudSessionService implements CloudSessionService {
	async openBrowser(url: string): Promise<void> {
		window.open(url, '_blank', 'noopener,noreferrer')
	}

	async onAuthCallback(): Promise<() => void> {
		return () => undefined
	}
}
