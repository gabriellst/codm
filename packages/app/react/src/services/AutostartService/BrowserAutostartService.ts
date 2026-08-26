import type { AutostartService } from './AutostartService'

/** Launch-on-login is meaningless for a browser tab — isEnabled false, toggles no-op (port rule). */
export class BrowserAutostartService implements AutostartService {
	async isEnabled(): Promise<boolean> {
		return false
	}

	async enable(): Promise<void> {
		// unsupported in a browser tab — no-op by design (see AutostartService.ts)
	}

	async disable(): Promise<void> {
		// unsupported in a browser tab — no-op by design (see AutostartService.ts)
	}
}
