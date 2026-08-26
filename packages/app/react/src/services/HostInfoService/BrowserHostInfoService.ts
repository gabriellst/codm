import type { HostInfoService, NativePlatform } from './HostInfoService'

export class BrowserHostInfoService implements HostInfoService {
	async platform(): Promise<NativePlatform> {
		return 'browser'
	}

	// The browser never decides the API base URL — `router.tsx`'s module-scope `configureClient`
	// already resolved it from `VITE_API_URL`. Answering null keeps ServicesProvider from
	// overriding a config that was never this host's to make.
	async apiBaseUrl(): Promise<string | null> {
		return null
	}
}
