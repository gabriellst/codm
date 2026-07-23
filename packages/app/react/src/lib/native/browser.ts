import type { NativeShell } from './types'

/**
 * Browser implementation of the NativeShell seam — dev server / e2e / any plain tab.
 *
 * Every capability degrades HONESTLY: no fake paths, no silent security downgrade
 * pretending to be a keychain (the localStorage secret store is namespaced and
 * documented as dev-only in types.ts).
 */

const SECRET_PREFIX = 'codedm.native.secret.'

export const browserShell: NativeShell = {
	host: 'browser',

	// Browsers cannot hand a filesystem PATH to a web page (File System Access API
	// yields handles, not paths) — and the daemon needs a real path. Honest null;
	// the UI keeps its manual path input for the browser host.
	async pickFolder() {
		return null
	},

	async notify(input) {
		if (typeof Notification === 'undefined') return
		if (Notification.permission === 'default') await Notification.requestPermission()
		if (Notification.permission !== 'granted') return
		new Notification(input.title, { body: input.body })
	},

	badge: {
		async set(count) {
			const nav = navigator as Navigator & {
				setAppBadge?: (count?: number) => Promise<void>
				clearAppBadge?: () => Promise<void>
			}
			if (count === null || count === 0) await nav.clearAppBadge?.()
			else await nav.setAppBadge?.(count)
		},
	},

	secrets: {
		async get(key) {
			return localStorage.getItem(`${SECRET_PREFIX}${key}`)
		},
		async set(key, value) {
			localStorage.setItem(`${SECRET_PREFIX}${key}`, value)
		},
		async delete(key) {
			localStorage.removeItem(`${SECRET_PREFIX}${key}`)
		},
	},

	autostart: {
		async isEnabled() {
			return false
		},
		async enable() {
			// unsupported in a browser tab — no-op by design (see types.ts)
		},
		async disable() {
			// unsupported in a browser tab — no-op by design (see types.ts)
		},
	},
}
