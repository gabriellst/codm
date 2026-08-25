import type { HostInfoService, NativePlatform } from './HostInfoService'

export class BrowserHostInfoService implements HostInfoService {
	async platform(): Promise<NativePlatform> {
		return 'browser'
	}
}
