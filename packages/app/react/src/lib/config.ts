import { getBaseUrl } from '@codm/client-typescript/http'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3030'

/**
 * The per-service SDK base-url shape, derived from ONE daemon base url — used both for the
 * browser/dev default below (`VITE_API_URL`) and, in a packaged desktop app, for the RUNTIME
 * override `ServicesProvider` applies once the host reports which port it actually resolved
 * (`HostInfoService.apiBaseUrl()` — spec 2026-08-25/26: a packaged app no longer bakes its daemon's
 * port at build time, since there is no single port to bake any more, see
 * `packages/app/tauri/config/ports.ts`). ONE formula, two call sites — never redigited.
 *
 * `go` is the GATEWAY SDK's base (`@codm/client-typescript/go`) — the api-ts external/ChannelProxy
 * wildcard, NOT the Go service itself. The browser never talks to the gateway (:3032): every gateway
 * op (pairing resolve/connect, channel reads, the SSE `/events` stream) rides the api-ts origin,
 * which strips this prefix, stamps the operator identity as `X-Owner-Id` and forwards to
 * `${API_GO_URL}/api` server-side (origin-fork pattern). No VITE_GATEWAY_URL exists on purpose.
 *
 * O prefixo é montado AQUI, e só aqui. `Config` chegou a expor um `gatewayBaseUrl` com esta mesma
 * fórmula sobre o `baseUrl` ASSADO no build — ninguém o consumia (só comentários o citavam), e num
 * app empacotado ele seria a porta errada, o mesmo defeito que levou o login a `127.0.0.1:3030`.
 * Uma segunda cópia de uma fórmula que já vive aqui é a próxima ocorrência do mesmo bug esperando
 * um call site; a rail `tests/architecture/daemon-base-url.test.ts` cobre a reintrodução.
 */
export function computeServiceBaseUrls(daemonBaseUrl: string) {
	return {
		typescript: daemonBaseUrl,
		go: `${daemonBaseUrl}/external/channel`,
	} as const
}

export const Config = {
	/**
	 * O default ASSADO NO BUILD (`VITE_API_URL`). Serve para semear o registro da SDK em
	 * `router.tsx` e como fallback — NÃO para montar uma URL do daemon à mão: num app empacotado a
	 * porta é escolhida em runtime. Quem monta URL usa `daemonBaseUrl()` (abaixo), e a rail
	 * `tests/architecture/daemon-base-url.test.ts` guarda essa fronteira.
	 */
	baseUrl,
	/**
	 * The CLOUD deployment's own origin (SP2 Task T6) — where the desktop console opens the system
	 * browser for OAuth sign-in and where the `/cloud/devices/{exchange,revoke}` calls land.
	 * DELIBERATELY separate from `baseUrl`: `baseUrl` is THIS machine's local daemon, `cloudUrl` is
	 * the shared identity service (Railway). O device code cunhado por `/cloud/desktop-callback`
	 * só existe no banco do processo que o emitiu — exchange/revoke têm que bater NAQUELA origem.
	 *
	 * O fallback para `baseUrl` é um beco sem saída, não uma coincidência de dev: `/api/auth/*` é
	 * montado APENAS sob `CODM_PROFILE=cloud` (src/index.ts), então o daemon local devolve 404 ali.
	 * (O comentário anterior afirmava o contrário e estava errado — medido em 2026-08-07, quando o
	 * app empacotado, sem `VITE_CODM_CLOUD_URL` assado no build, abriu o login em localhost:3030.)
	 * Os releases assam a URL real a partir de `packages/app/tauri/src-tauri/shell-env.json` (gerado
	 * de `tauri/config/cloud.ts` — a MESMA origem que o shell entrega ao daemon em `CODM_CLOUD_URL`
	 * e autoriza na CSP); em dev, aponte a variável para a cloud de verdade se quiser exercitar
	 * login.
	 */
	cloudUrl: import.meta.env.VITE_CODM_CLOUD_URL ?? baseUrl,
} as const

/**
 * The CANONICAL per-service SDK base-url map — the one registry every `configureClient` call site
 * (router, storybook preview) spreads. Keys are the generated client subpaths; `go` rides the
 * ChannelProxy shape (see `computeServiceBaseUrls`), never :3032 directly. This is the BROWSER/DEV
 * default (`VITE_API_URL`, baked at build time); `ServicesProvider` re-calls `configureClient` with
 * `computeServiceBaseUrls(hostApiBaseUrl)` in a packaged desktop app, once the host reports its
 * resolved port — see that function's doc.
 */
export const serviceBaseUrls = computeServiceBaseUrls(Config.baseUrl)

/**
 * A ORIGEM DO DAEMON **EM RUNTIME** — a única leitura válida para quem monta uma URL do daemon à
 * mão. `Config.baseUrl` NÃO serve para isso: ele é o valor ASSADO no bundle (`VITE_API_URL`, ou
 * `localhost:3030`), e num app empacotado o daemon não escuta mais nessa porta — o shell escolhe
 * a primeira candidata livre de `packages/app/tauri/config/ports.ts` (47330/47340/…) e o
 * `ServicesProvider` empurra o resultado para o registro da SDK com `configureClient`.
 *
 * ── o que quebrou por ler o valor assado (medido em 26/08/2026, build 0.5.4+) ────────────────────
 * O login com GitHub/Google mandava a porta do daemon à nuvem como query param (RFC 8252) lendo
 * `new URL(Config.baseUrl).port` → `3030`. O provedor autenticava, o `/desktop-callback` cunhava o
 * código de uso único e redirecionava o navegador para `http://127.0.0.1:3030/sign-in/loopback?code=…`
 * — uma porta onde NINGUÉM escuta. O código nunca chegava ao daemon, o laço do `useLoopbackAuth`
 * consultava a gaveta errada, e da cadeira do operador o login simplesmente não fechava. A mesma
 * causa alcançava o stream SSE, o terminal, os avatares e a pré-visualização de artefato: toda URL
 * montada à mão apontava para a porta de dev.
 *
 * O registro da SDK (`getBaseUrl('typescript')`) já é a resposta certa porque é o MESMO valor que
 * toda chamada gerada usa — não há um segundo lugar a sincronizar. O fallback para `Config.baseUrl`
 * cobre quem nunca chamou `configureClient` (storybook, testes isolados), e é exatamente o default
 * que `router.tsx` registra no carregamento do módulo.
 *
 * É uma FUNÇÃO, e não uma constante, de propósito: o valor só existe depois do boot assíncrono do
 * `ServicesProvider`, então uma constante de módulo congelaria o default antes da resposta do host.
 */
export function daemonBaseUrl(): string {
	return getBaseUrl('typescript') ?? Config.baseUrl
}
