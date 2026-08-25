import type { NotificationService } from './NotificationService'

/** Web Notifications API — resolves without throwing when permission is denied. */
export class BrowserNotificationService implements NotificationService {
	async notify(input: { title: string; body?: string }): Promise<void> {
		if (typeof Notification === 'undefined') return
		if (Notification.permission === 'default') await Notification.requestPermission()
		if (Notification.permission !== 'granted') return
		new Notification(input.title, { body: input.body })
	}
}
