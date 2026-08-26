import { commands } from '@codm/app-tauri/commands'
import type { WindowChrome, WindowService } from './WindowService'

/**
 * O host, tipado ponta a ponta por tauri-specta (packages/app/tauri/commands/bindings.ts — nome do
 * comando e retorno vêm do Rust em src-tauri/src/commands/window.rs). Sem `invoke` stringly:
 * renomeie `titleBar` ou uma variante no Rust e ESTE arquivo para de compilar, porque o
 * `WindowChrome` gerado deixa de ser atribuível ao da porta. É esse o trilho contra deriva.
 *
 * O comando decide pelo `titleBarStyle` DECLARADO da janela chamadora cruzado com o SO — o console
 * nunca infere "macOS ⇒ overlay"; ele pergunta.
 */
export class TauriWindowService implements WindowService {
	async chrome(): Promise<WindowChrome> {
		return await commands.windowChrome()
	}
}
