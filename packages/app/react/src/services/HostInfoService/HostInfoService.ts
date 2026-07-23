/** Which platform binding is active. Extend when a new host lands (e.g. 'expo'). */
export type NativePlatform = 'tauri' | 'browser'

/**
 * Diagnostics/telemetry ONLY. UI must never branch on the platform name —
 * add a capability to the relevant port instead. PORT only — impls colocated.
 */
export interface HostInfoService {
	platform(): Promise<NativePlatform>
}
