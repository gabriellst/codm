const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3030'

/**
 * The per-service SDK base-url shape, derived from ONE daemon base url — used both for the
 * browser/dev default below (`VITE_API_URL`) and, in a packaged desktop app, for the RUNTIME
 * override `ServicesProvider` applies once the host reports which port it actually resolved
 * (`HostInfoService.apiBaseUrl()` — spec 2026-08-25/26: a packaged app no longer bakes its daemon's
 * port at build time, since there is no single port to bake any more, see
 * `packages/app/tauri/config/ports.ts`). ONE formula, two call sites — never redigited.
 */
export function computeServiceBaseUrls(daemonBaseUrl: string) {
	return {
		typescript: daemonBaseUrl,
		go: `${daemonBaseUrl}/external/channel`,
	} as const
}

export const Config = {
	baseUrl,
	/**
	 * Base URL for the GATEWAY SDK (`@codm/client-typescript/go`) — the api-ts
	 * external/ChannelProxy wildcard, NOT the Go service itself. The browser never talks to the
	 * gateway (:3032): every gateway op (pairing resolve/connect, channel reads, the SSE `/events`
	 * stream) rides the api-ts origin, which strips this prefix, stamps the operator identity as
	 * `X-Owner-Id` and forwards to `${API_GO_URL}/api` server-side (origin-fork pattern — their
	 * `channelBaseUrl = ${VITE_API_URL}/external/channel`). No VITE_GATEWAY_URL exists on purpose.
	 */
	gatewayBaseUrl: `${baseUrl}/external/channel`,
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
 * ChannelProxy shape (see Config.gatewayBaseUrl), never :3032 directly. This is the BROWSER/DEV
 * default (`VITE_API_URL`, baked at build time); `ServicesProvider` re-calls `configureClient` with
 * `computeServiceBaseUrls(hostApiBaseUrl)` in a packaged desktop app, once the host reports its
 * resolved port — see that function's doc.
 */
export const serviceBaseUrls = computeServiceBaseUrls(Config.baseUrl)
