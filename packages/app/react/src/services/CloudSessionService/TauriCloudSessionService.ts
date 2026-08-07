import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { open } from '@tauri-apps/plugin-shell'
import type { CloudSessionService } from './CloudSessionService'

/**
 * `openBrowser` → `@tauri-apps/plugin-shell`'s `open`, scoped by `shell:default`
 * (packages/app/tauri/config/capabilities.ts `cloudSession`) — hands the OAuth URL to the OS's
 * default browser, never this webview.
 *
 * `onAuthCallback` → `@tauri-apps/plugin-deep-link`'s `onOpenUrl`, scoped by `deep-link:default`
 * (packages/app/tauri/config/capabilities.ts `deepLink`, wired by the shell in T5's
 * `src-tauri/src/lib.rs`). The plugin hands back every URL matching the registered `codm://`
 * scheme (config/deeplink.ts) as an array — this port only ever expects one at a time, so each
 * entry is replayed to `listener` individually.
 */
export class TauriCloudSessionService implements CloudSessionService {
	async openBrowser(url: string): Promise<void> {
		await open(url)
	}

	async onAuthCallback(listener: (url: string) => void): Promise<() => void> {
		return await onOpenUrl(urls => {
			for (const url of urls) listener(url)
		})
	}
}
