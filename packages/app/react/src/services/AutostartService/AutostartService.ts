/** Launch-on-login. Hosts without the capability: isEnabled resolves false, toggles no-op. */
export interface AutostartService {
	isEnabled(): Promise<boolean>
	enable(): Promise<void>
	disable(): Promise<void>
}
