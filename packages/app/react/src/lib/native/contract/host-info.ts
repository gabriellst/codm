/** Which platform binding is active. Extend when a new host lands (e.g. 'expo'). */
export type NativePlatform = 'tauri' | 'browser'

/**
 * Diagnostics/telemetry ONLY. UI must never branch on the platform name —
 * add a capability to the relevant port instead (see contract/index.ts rules).
 */
export interface HostInfoService {
	platform(): Promise<NativePlatform>
}
