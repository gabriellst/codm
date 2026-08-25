/** OS-level notifications (browser: Web Notifications API). PORT only — impls colocated. */
export interface NotificationService {
	/** Fire a notification; resolves without throwing when permission is denied. */
	notify(input: { title: string; body?: string }): Promise<void>
}
