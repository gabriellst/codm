import { invoke } from '../utils/tauri/invoke'
import type { AutostartService } from './AutostartService'

export class TauriAutostartService implements AutostartService {
	isEnabled(): Promise<boolean> {
		return invoke<boolean>('plugin:autostart|is_enabled')
	}

	async enable(): Promise<void> {
		await invoke('plugin:autostart|enable')
	}

	async disable(): Promise<void> {
		await invoke('plugin:autostart|disable')
	}
}
