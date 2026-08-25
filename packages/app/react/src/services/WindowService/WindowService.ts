/**
 * WINDOW PORT — quem desenha os controles da janela em que o console está?
 *
 * O console NÃO consegue responder isso sozinho, e é essa a razão de ser uma porta em vez de um
 * `isTauri()` num componente: o fato é da JANELA do host. No macOS o shell declara
 * `titleBarStyle: 'Overlay'` (packages/app/tauri/config/window.ts) e o SO sobrepõe os semáforos ao
 * webview — o console é dono da altura toda e precisa reservar a faixa deles. No Windows e no Linux
 * o tauri ignora `Overlay` e o SO desenha uma barra de título nativa ACIMA do webview (min/max/
 * fechar de graça) — nada se sobrepõe, nada a reservar. Numa aba de browser, idem: a barra é a do
 * browser.
 *
 * A UI ramifica no que esta porta REPORTA (`titleBar`), nunca no nome do host (desktop-shell bp-02).
 *
 * Tipos puros, sem SDK de plataforma — a forma que uma implementação expo/nativa futura satisfaria
 * verbatim (DSK-07). `TitleBar` é declarado à mão (não importado das bindings) pela mesma razão que
 * `SupervisedSidecar`/`SystemPreconditionId`: a porta não conhece tauri. A implementação Tauri é
 * onde os dois se encontram, e é lá — e no teste serde do Rust — que uma divergência para de
 * compilar.
 */

/** Quem desenha os controles, do ponto de vista do webview. */
export const TITLE_BARS = ['overlay', 'native'] as const

export type TitleBar = (typeof TITLE_BARS)[number]

export interface WindowChrome {
	/** `overlay`: os controles do SO ficam SOBRE o webview (macOS). `native`: ficam ACIMA dele. */
	titleBar: TitleBar
}

export interface WindowService {
	/** O chrome desta janela (PULL). Estável durante a vida da janela — uma leitura basta. */
	chrome(): Promise<WindowChrome>
}
