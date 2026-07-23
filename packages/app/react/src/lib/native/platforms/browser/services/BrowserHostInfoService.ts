import type { HostInfoService, NativePlatform } from '../../../contract'

export class BrowserHostInfoService implements HostInfoService {
	async platform(): Promise<NativePlatform> {
		return 'browser'
	}
}
