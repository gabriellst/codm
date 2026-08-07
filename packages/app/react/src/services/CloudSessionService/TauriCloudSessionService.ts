import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'
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

	/**
	 * Entrega TANTO a URL que iniciou o app quanto as que chegam com ele já aberto.
	 *
	 * `onOpenUrl` do plugin só faz `listen('deep-link://new-url')` — nada mais. Quando o macOS ABRE o
	 * app por causa do link (o caso normal: o usuário estava no browser e clicou em "abrir o codm"),
	 * a URL chega antes do webview existir, o evento se perde e o login travava na tela de login sem
	 * dizer nada (medido em 2026-08-07). `getCurrent()` é a única forma de recuperá-la, e por isso
	 * esta porta consulta as duas fontes — quem consome não deveria precisar saber se o app já
	 * estava aberto.
	 */
	async onAuthCallback(listener: (url: string) => void): Promise<() => void> {
		const launchUrls = await getCurrent()
		for (const url of launchUrls ?? []) listener(url)

		return await onOpenUrl(urls => {
			for (const url of urls) listener(url)
		})
	}
}
