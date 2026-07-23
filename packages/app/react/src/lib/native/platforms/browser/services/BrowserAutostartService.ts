import type { AutostartService } from '../../../contract'

/** Launch-on-login is meaningless for a browser tab — isEnabled false, toggles no-op (contract rule). */
export class BrowserAutostartService implements AutostartService {
	async isEnabled(): Promise<boolean> {
		return false
	}

	async enable(): Promise<void> {
		// unsupported in a browser tab — no-op by design (see contract/autostart.ts)
	}

	async disable(): Promise<void> {
		// unsupported in a browser tab — no-op by design (see contract/autostart.ts)
	}
}
