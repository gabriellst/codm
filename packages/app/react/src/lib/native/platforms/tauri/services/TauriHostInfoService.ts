import type { HostInfoService, NativePlatform } from '../../../contract'

export class TauriHostInfoService implements HostInfoService {
	async platform(): Promise<NativePlatform> {
		return 'tauri'
	}
}
