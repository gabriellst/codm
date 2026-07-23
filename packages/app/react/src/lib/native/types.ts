/**
 * NativeShell — the seam between the react console and whatever hosts it.
 *
 * The console runs in two hosts: the Tauri v2 desktop shell (packages/app/tauri)
 * and a plain browser tab (dev server / e2e). Every OS-integration capability the
 * UI needs crosses THIS interface — components import from `@/lib/native` and never
 * know which host they run in.
 *
 * RULE (desktop-shell skill): `@tauri-apps/*` imports are forbidden outside
 * `src/lib/native/` — the tauri implementation is the only file allowed to talk
 * to the shell runtime. Enforced by eslint `no-restricted-imports` (root config).
 */
export interface NativeShell {
	/** Which host is implementing the seam — for diagnostics/telemetry only.
	 *  NEVER branch UI on this: add a capability to the seam instead. */
	readonly host: 'tauri' | 'browser'

	/**
	 * Open the OS folder picker and resolve the ABSOLUTE path of the chosen
	 * directory, or null when the user cancels or the host has no path-capable
	 * picker (browser: File System Access handles carry no fs path — honest null).
	 */
	pickFolder(options?: { title?: string }): Promise<string | null>

	/** Fire an OS-level notification (falls back to the Web Notifications API). */
	notify(input: { title: string; body?: string }): Promise<void>

	/** Dock/taskbar badge count. `null` clears the badge. */
	badge: {
		set(count: number | null): Promise<void>
	}

	/**
	 * Small secret store for operator credentials (agent API keys, gateway apikey).
	 * Desktop: OS keychain via the shell's `secret_*` commands. Browser: localStorage
	 * DEV fallback — never treat the browser impl as secure storage.
	 */
	secrets: {
		get(key: string): Promise<string | null>
		set(key: string, value: string): Promise<void>
		delete(key: string): Promise<void>
	}

	/** Launch-on-login. Browser host: unsupported — isEnabled resolves false, toggles no-op. */
	autostart: {
		isEnabled(): Promise<boolean>
		enable(): Promise<void>
		disable(): Promise<void>
	}
}
