import type { BadgeService } from './BadgeService'

/** Badging API where available (installed PWA); silent no-op elsewhere — honest, not faked. */
export class BrowserBadgeService implements BadgeService {
	async set(count: number | null): Promise<void> {
		const nav = navigator as Navigator & {
			setAppBadge?: (count?: number) => Promise<void>
			clearAppBadge?: () => Promise<void>
		}
		if (count === null || count === 0) await nav.clearAppBadge?.()
		else await nav.setAppBadge?.(count)
	}
}
