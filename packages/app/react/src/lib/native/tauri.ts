import type { NativeShell } from './types'

/**
 * Tauri v2 implementation of the NativeShell seam.
 *
 * Talks to the shell through the injected `window.__TAURI__` global
 * (`app.withGlobalTauri: true` in packages/app/tauri/tauri.conf.json) instead of
 * the `@tauri-apps/api` npm package — the invoke surface is identical
 * (`plugin:<name>|<command>` routing), and the console bundle stays host-agnostic:
 * no desktop-only dependency reaches the browser build.
 *
 * If this file ever migrates to `@tauri-apps/api` imports, they are legal HERE and
 * only here (see the `no-restricted-imports` rule in the root eslint config).
 *
 * `secret_get` / `secret_set` / `secret_delete` are custom shell commands
 * (packages/app/tauri/src-tauri/src/lib.rs) backed by the OS keychain.
 */

interface TauriGlobal {
	core: {
		invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
	}
}

function shell(): TauriGlobal {
	const injected = (window as { __TAURI__?: TauriGlobal }).__TAURI__
	if (!injected) {
		throw new Error('tauri NativeShell used outside a Tauri webview — check isTauri() selection in lib/native/index.ts')
	}
	return injected
}

const invoke = <T>(command: string, args?: Record<string, unknown>): Promise<T> => shell().core.invoke<T>(command, args)

export const tauriShell: NativeShell = {
	host: 'tauri',

	async pickFolder(options) {
		const selected = await invoke<string | string[] | null>('plugin:dialog|open', {
			options: { directory: true, multiple: false, title: options?.title },
		})
		if (Array.isArray(selected)) return selected[0] ?? null
		return selected
	},

	async notify(input) {
		let granted = await invoke<boolean>('plugin:notification|is_permission_granted')
		if (!granted) {
			const permission = await invoke<string>('plugin:notification|request_permission')
			granted = permission === 'granted'
		}
		if (!granted) return
		await invoke('plugin:notification|notify', { options: { title: input.title, body: input.body } })
	},

	badge: {
		async set(count) {
			await invoke('plugin:window|set_badge_count', { value: count ?? undefined, label: 'main' })
		},
	},

	secrets: {
		get: key => invoke<string | null>('secret_get', { key }),
		set: async (key, value) => {
			await invoke('secret_set', { key, value })
		},
		delete: async key => {
			await invoke('secret_delete', { key })
		},
	},

	autostart: {
		isEnabled: () => invoke<boolean>('plugin:autostart|is_enabled'),
		enable: async () => {
			await invoke('plugin:autostart|enable')
		},
		disable: async () => {
			await invoke('plugin:autostart|disable')
		},
	},
}
