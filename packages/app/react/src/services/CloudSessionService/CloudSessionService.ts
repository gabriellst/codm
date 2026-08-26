/**
 * `SecretsService` key the device token is stored under (keychain on desktop, the dev-only
 * localStorage fallback in the browser). Shared by every consumer that reads/writes the token —
 * `CloudSessionGate` (checks presence on boot), `useLoopbackAuth` (writes it after exchange), and
 * the account menu's logout control (deletes it) — so the name lives once, next to the port these
 * consumers already import.
 */
export const CLOUD_DEVICE_TOKEN_SECRET_KEY = 'codm.cloud.deviceToken'

/**
 * The desktop's half of the OAuth device-code handshake (SP2 spec Decisions 4/7, Task T6). The
 * host owns exactly ONE thing neither React nor the wire contract can: como entregar uma URL a um
 * programa FORA deste webview — o navegador padrão do SO, para a tela de consentimento que a nuvem
 * hospeda. Todo o resto do fluxo — retirar o código, trocá-lo por sessão, guardar, revogar — passa
 * pela SDK e pelo `SecretsService`, não por esta porta.
 *
 * ── o `onAuthCallback` FOI EMBORA, e o que ele fazia agora é HTTP ────────────────────────────────
 * Havia aqui um segundo método, para assinar o deep link `codm://` que o SO roteava de volta. O deep
 * link morreu por limitação de plataforma: no macOS o roteamento de esquema exige um `.app` com o
 * esquema no `Info.plist`, o `tauri dev` não gera bundle, e o registro em runtime é recusado — então
 * em desenvolvimento o login abria o app INSTALADO, não o que estava rodando. A volta passou a ser o
 * loopback do RFC 8252 (`useLoopbackAuth` retira o código do daemon local), que é HTTP comum e não
 * precisa de porta de host nenhuma. Esta interface encolheu para o único poder que continua sendo
 * exclusivo do shell.
 *
 * PORT only, like every other file here — no platform SDK, no react.
 */
export interface CloudSessionService {
	/**
	 * Opens `url` in the SYSTEM's default browser — never this webview. The desktop shell has no
	 * cookie jar to share with a browser-hosted OAuth session, and rendering the provider's consent
	 * screen inside the app's own webview would defeat the point of a system-trusted browser chrome
	 * for a login prompt.
	 */
	openBrowser(url: string): Promise<void>
}
