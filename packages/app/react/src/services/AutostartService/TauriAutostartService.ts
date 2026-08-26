import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import type { AutostartService } from './AutostartService'

/** Launch-on-login via the typed tauri plugin-autostart API. The `autostart:allow-*`
 *  permissions derive from the shell's `autostart` capability
 *  (packages/app/tauri/config/capabilities.ts CAPABILITIES → CAPABILITY_PERMISSIONS). */
export class TauriAutostartService implements AutostartService {
	isEnabled(): Promise<boolean> {
		return isEnabled()
	}

	async enable(): Promise<void> {
		await enable()
	}

	async disable(): Promise<void> {
		await disable()
	}
}
