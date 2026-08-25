import { open } from '@tauri-apps/plugin-shell'
import type { CloudSessionService } from './CloudSessionService'

/**
 * `openBrowser` → o `open` do `@tauri-apps/plugin-shell`, escopado por `shell:default`
 * (packages/app/tauri/config/capabilities.ts, `cloudSession`) — entrega a URL do OAuth ao navegador
 * padrão do SO, nunca a este webview.
 *
 * Esta classe tinha um segundo método, `onAuthCallback`, sobre o `@tauri-apps/plugin-deep-link`. Ele
 * saiu com o deep link: no macOS o roteamento de esquema exige um `.app` registrado, o `tauri dev`
 * não gera bundle, e o plugin recusa registrar em runtime — o login em desenvolvimento ia para o app
 * instalado. A volta agora é o loopback do RFC 8252, HTTP comum contra o daemon local, e não precisa
 * de nada que só o shell saiba fazer.
 */
export class TauriCloudSessionService implements CloudSessionService {
	async openBrowser(url: string): Promise<void> {
		await open(url)
	}
}
