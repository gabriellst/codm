import type { AutostartService } from '../../../contract'
import { invoke } from '../invoke'

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
