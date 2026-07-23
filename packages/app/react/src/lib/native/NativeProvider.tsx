/**
 * Composition-root injection for the native contract (see contract/index.ts).
 *
 * The platform binding is decided ONCE at bootstrap: `isTauri()` picks the
 * platform module, loaded via DYNAMIC import — the browser bundle never fetches
 * the tauri chunk (and vice versa). Because every contract method is
 * Promise-based by rule, the provider hands out a LAZY facade synchronously:
 * each call awaits the platform module on first use, so consumers never see a
 * "not ready yet" state and the context value is stable for the whole session.
 *
 * Tests / storybook inject fakes through the `services` prop — that override is
 * the DI seam that proves the console runs against any implementation of the
 * contract with zero tauri present (see NativeProvider.test.tsx).
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { DialogService, NativeServices } from './contract'
import { isTauri } from './isTauri'

const NativeContext = createContext<NativeServices | null>(null)

let platformServices: Promise<NativeServices> | null = null

/** Bind once per page load — tauri webview gets the tauri chunk, everything else the browser one. */
function loadPlatformServices(): Promise<NativeServices> {
	platformServices ??= isTauri()
		? import('./platforms/tauri').then(m => m.createTauriServices())
		: import('./platforms/browser').then(m => m.createBrowserServices())
	return platformServices
}

/** Synchronous facade over the async platform binding — legal because every port method returns a Promise. */
function lazyServices(load: () => Promise<NativeServices>): NativeServices {
	return {
		dialog: {
			supportsFolderPicker: () => load().then(s => s.dialog.supportsFolderPicker()),
			pickFolder: options => load().then(s => s.dialog.pickFolder(options)),
		},
		notification: {
			notify: input => load().then(s => s.notification.notify(input)),
		},
		badge: {
			set: count => load().then(s => s.badge.set(count)),
		},
		secrets: {
			get: key => load().then(s => s.secrets.get(key)),
			set: (key, value) => load().then(s => s.secrets.set(key, value)),
			delete: key => load().then(s => s.secrets.delete(key)),
		},
		autostart: {
			isEnabled: () => load().then(s => s.autostart.isEnabled()),
			enable: () => load().then(s => s.autostart.enable()),
			disable: () => load().then(s => s.autostart.disable()),
		},
		hostInfo: {
			platform: () => load().then(s => s.hostInfo.platform()),
		},
	}
}

export function NativeProvider({ children, services }: { children: ReactNode; services?: NativeServices }) {
	const value = useMemo(() => services ?? lazyServices(loadPlatformServices), [services])
	return <NativeContext.Provider value={value}>{children}</NativeContext.Provider>
}

/** All ports. Prefer the per-capability hooks in components — they document what is consumed. */
export function useNative(): NativeServices {
	const services = useContext(NativeContext)
	if (!services) {
		throw new Error('useNative() outside <NativeProvider> — mount it at the composition root (routes/__root.tsx)')
	}
	return services
}

export function useDialogService(): DialogService {
	return useNative().dialog
}
