import { getCurrentWindow } from '@tauri-apps/api/window'
import type { BadgeService } from './BadgeService'

/** Dock/taskbar badge via the typed `@tauri-apps/api/window` window API. The
 *  `core:window:allow-set-badge-count` permission derives from REPO.desktop.capabilities.badge
 *  → CAPABILITY_PERMISSIONS. Passing `undefined` clears the badge. */
export class TauriBadgeService implements BadgeService {
	async set(count: number | null): Promise<void> {
		await getCurrentWindow().setBadgeCount(count ?? undefined)
	}
}
