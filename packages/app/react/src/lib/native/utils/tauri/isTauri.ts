/**
 * Host detection for the NativeShell seam.
 *
 * Tauri v2 always injects `window.__TAURI_INTERNALS__` into its webview; with
 * `app.withGlobalTauri: true` (set in packages/app/tauri/tauri.conf.json) it also
 * exposes `window.__TAURI__` — the object tauri.ts invokes through. Checking both
 * keeps detection honest even if the global flag is toggled.
 */
export function isTauri(): boolean {
	if (typeof window === 'undefined') return false
	return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
}
