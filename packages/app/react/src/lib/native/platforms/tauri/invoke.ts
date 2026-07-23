/**
 * The ONE tauri-runtime touchpoint. Talks to the shell through the injected
 * `window.__TAURI__` global (`app.withGlobalTauri: true` in the generated
 * tauri.conf.json) instead of the `@tauri-apps/api` npm package — the invoke
 * surface is identical (`plugin:<name>|<command>` routing) and the console
 * bundle stays host-agnostic: no desktop-only dependency in the browser build.
 *
 * If this platform ever migrates to `@tauri-apps/api` imports, they are legal
 * ONLY under lib/native/platforms/tauri/ (eslint `no-restricted-imports`, root
 * config — see .claude/skills/desktop-shell/SKILL.md).
 */

interface TauriGlobal {
	core: {
		invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
	}
}

function shell(): TauriGlobal {
	const injected = (window as { __TAURI__?: TauriGlobal }).__TAURI__
	if (!injected) {
		throw new Error('tauri platform services used outside a Tauri webview — check the NativeProvider binding')
	}
	return injected
}

export const invoke = <T>(command: string, args?: Record<string, unknown>): Promise<T> => shell().core.invoke<T>(command, args)
