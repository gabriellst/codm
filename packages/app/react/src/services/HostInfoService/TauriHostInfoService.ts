import type { HostInfoService, NativePlatform } from './HostInfoService'

export class TauriHostInfoService implements HostInfoService {
	async platform(): Promise<NativePlatform> {
		return 'tauri'
	}
}
