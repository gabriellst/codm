/** Dock/taskbar badge count. */
export interface BadgeService {
	/** `null` clears the badge. */
	set(count: number | null): Promise<void>
}
