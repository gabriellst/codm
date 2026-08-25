import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import type { NotificationService } from './NotificationService'

/** OS notifications via the typed tauri plugin-notification API. `notification:default`
 *  derives from the shell's `notification` capability (packages/app/tauri/config/capabilities.ts
 *  CAPABILITIES → CAPABILITY_PERMISSIONS). */
export class TauriNotificationService implements NotificationService {
	async notify(input: { title: string; body?: string }): Promise<void> {
		let granted = await isPermissionGranted()
		if (!granted) {
			const permission = await requestPermission()
			granted = permission === 'granted'
		}
		if (!granted) return
		sendNotification({ title: input.title, body: input.body })
	}
}
