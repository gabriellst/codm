import type { WindowChrome, WindowService } from './WindowService'

/**
 * DEGRADAÇÃO HONESTA: uma aba de browser tem a barra do PRÓPRIO browser acima do documento — os
 * controles da janela nunca se sobrepõem ao console. `native` é a descrição exata do host, não um
 * default otimista (desktop-shell DSK-03).
 */
export class BrowserWindowService implements WindowService {
	async chrome(): Promise<WindowChrome> {
		return { titleBar: 'native' }
	}
}
