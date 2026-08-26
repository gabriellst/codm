/** Which platform binding is active. Extend when a new host lands (e.g. 'expo'). */
export type NativePlatform = 'tauri' | 'browser'

/**
 * `platform()` is diagnostics/telemetry ONLY — UI must never branch on it; add a capability to the
 * relevant port instead. `apiBaseUrl()` is NOT diagnostics: it is the one load-bearing fact a
 * packaged desktop app cannot bake at build time any more (spec 2026-08-25/26). The daemon's port
 * used to be assumed fixed (`VITE_API_URL` baked into the bundle); the packaged shell now tries a
 * small candidate list (`packages/app/tauri/config/ports.ts`) at boot and keeps whichever one was
 * actually free, so the console has to ASK which one won instead of assuming.
 *
 * `null` means "this host does not decide" — the browser implementation always answers `null`,
 * and the caller (`ServicesProvider`) keeps the `VITE_API_URL`-derived default `router.tsx` already
 * configured at module load. PORT only — impls colocated.
 */
export interface HostInfoService {
	platform(): Promise<NativePlatform>
	/** The daemon's resolved base URL (`http://127.0.0.1:<port>`), or `null` when the host does not
	 *  supply one (browser/dev — `VITE_API_URL` already decided it). */
	apiBaseUrl(): Promise<string | null>
}
