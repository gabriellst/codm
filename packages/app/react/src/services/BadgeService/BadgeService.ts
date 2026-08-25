/** Dock/taskbar badge count. PORT only — impls colocated. */
export interface BadgeService {
	/** `null` clears the badge. */
	set(count: number | null): Promise<void>
}
