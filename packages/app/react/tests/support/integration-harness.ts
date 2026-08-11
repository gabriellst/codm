import http from 'node:http'
import { configureClient } from '@codm/client-typescript/http'
import type { IntegrationBackend, IntegrationBackendOptions, TestBedLike, TestingSurface } from '@codm/api-typescript/testing'

/**
 * A casca do console sobre o servidor de integração: sobe (uma vez por processo — o servidor
 * cacheia), aponta a SDK para ele e devolve o backend. Givens são compostos pelo TESTE
 * (`givenX(backend.asTestBed(), …)`) — a casca não os conhece (spec AC-3).
 *
 * DUAS metades, de propósito (founder correction, spec Decision 5/6; catálogo completo T7/T8):
 *
 * - `import type { IntegrationBackend, TestBedLike, TestingSurface } from
 *   '@codm/api-typescript/testing'` acima é um import de TIPO — some por completo na emissão. O
 *   subpath resolve no `.d.ts` ACHATADO e COMMITADO (`packages/api/typescript/testing.d.ts`, spec
 *   Decision 9) — zero imports relativos a `src/`, então este `tsc` nunca precisa entender a
 *   estrutura interna do backend (decorators do tsyringe-neo, `@auth/*`, etc.) para tipar isto.
 *   `TestingSurface` é o tipo agregado (a mesma forma que o `satisfies` do lado backend prova
 *   fresca) — usado abaixo só para tipar o RETORNO do carregamento dinâmico, nunca redeclarado.
 *
 * - A IMPLEMENTAÇÃO é alcançada por `import()` DINÂMICO com especificador COMPUTADO
 *   (`spec = '@codm/api-typescript' + '/testing'`), nunca um literal: um literal deixaria o `tsc`
 *   do react seguir o import estaticamente (mesmo sendo `import()`) e tentar tipar o módulo alvo —
 *   que arrastaria o grafo inteiro do backend de volta para dentro do `tsc` deste workspace, exatamente
 *   o que este harness existe para NÃO fazer. Em runtime, `import()` sempre resolve a STRING (o bun
 *   nem sabe se veio de um literal ou de uma concatenação) — só o `tsc` estático se importa com a
 *   forma da expressão.
 *
 * `IntegrationBackendOptions` (spec .specs/2026-08-10-eixo-ambiente-go-design.md D9/D11, T8) é o
 * MESMO tipo que `startIntegrationBackend` aceita — `useIntegrationBackend` é pass-through puro,
 * nunca redeclara `{ services?: ... }` localmente. `services` nomeia workspaces do manifesto
 * (`template.config.ts`), hoje só `'apiGo'` declara receita de boot.
 */
export type { IntegrationBackend, IntegrationBackendOptions, TestBedLike }

async function loadTestingModule(): Promise<TestingSurface> {
	const spec = '@codm/api-typescript' + '/testing'
	return (await import(/* @vite-ignore */ spec)) as TestingSurface
}

/**
 * A fronteira do Go FALHA ALTO dentro do harness POR PADRÃO (spec Decision 10/11, AC-6/AC-8): sem
 * opt-in, o gateway Go não sobe junto do backend de integração, então apontar a SDK para o servidor
 * TS faria qualquer endpoint do gateway responder um 404 silencioso que parece bug do teste (foi
 * isso, não falta de given, que deixou 3 componentes só-visuais nas migrações T9–T11). Em vez disso,
 * a URL do Go aponta para ESTE stub — um servidor local que responde 501 nomeando a fronteira, então
 * uma asserção contra um endpoint Go dentro do harness falha ALTO e LEGÍVEL em vez de mentir como
 * "não encontrado".
 *
 * COM opt-in (spec Decision 9/11, AC-6/AC-8, T7/T8) — `useIntegrationBackend({ services: ['apiGo'] })`
 * — o gateway sobe de verdade como subprocesso (receita `template.config.ts`'s `WORKSPACES.apiGo.testBoot`,
 * resolvida e executada por `startIntegrationBackend`) e ESTE stub nunca é criado: a URL do Go no
 * `configureClient` aponta para o subprocesso real (`backend.services.apiGo`), e o `/api` que o
 * `forwardToChannel` do lado TS normalmente prepende na produção (o OpenAPI do Go omite o próprio
 * mount) é prependido aqui do mesmo jeito — a única diferença é que ninguém está fazendo proxy.
 *
 * O corpo do erro usa `{ code, message }` — a MESMA forma que `FastifyHttpRouter.handleError` emite
 * para `HttpControllerError` (`core/src/services/HttpRouter/FastifyHttpRouter.ts`) — não
 * `{ error, message }`: o cliente HTTP gerado (`packages/client/dist/typescript/src/http/client.ts`)
 * só promove `errorData.code` para `Error.code`; um campo `error` cairia no fallback
 * `'UNKNOWN_ERROR'` e o teste de fronteira (AC-6) não teria como assertar o código
 * programaticamente sem reabrir o corpo bruto da resposta.
 *
 * `node:http`, NÃO `Bun.serve` (medido, não assumido — a primeira tentativa usava `Bun.serve` e
 * TODA requisição contra ele, qualquer status, morria com `HPE_UNEXPECTED_CONTENT_LENGTH` do lado
 * cliente): `happy-dom`'s `fetch` polyfill (`tests/setup.ts`'s `GlobalRegistrator`) volta pro
 * `node:_http_client` por baixo, e o parser HTTP/1.1 dele não entende a resposta que o servidor
 * NATIVO do Bun escreve — incompatibilidade de framing entre os dois runtimes, não algo corrigível
 * por header. Um `http.createServer` de verdade fala o dialeto que o cliente Node espera.
 *
 * O preflight CORS importa: o cliente da SDK usa `credentials: 'include'`
 * (`packages/client/dist/typescript/src/http/client.ts`), então `happy-dom` manda `OPTIONS` antes
 * de qualquer `GET`/`POST` cross-origin — e um preflight fora de 2xx é reportado como "Same Origin
 * Policy" genérico (mascarando o 501 real). O stub responde ao preflight com 204 + os MESMOS
 * cabeçalhos CORS que `FastifyHttpRouter.getCorsHeaders` já emite para o backend real, e só então
 * devolve 501 para o método efetivo.
 */
let goBoundaryStub: http.Server | null = null
let goBoundaryPort: number | null = null

const GO_BOUNDARY_ERROR = {
	code: 'GO_GATEWAY_NOT_IN_HARNESS',
	message:
		"O gateway Go não participa do harness de integração por padrão — opte por services: ['apiGo'] " +
		"(useIntegrationBackend({ services: ['apiGo'] })) para apontar este endpoint ao subprocesso real. " +
		'Ver .specs/2026-08-10-eixo-ambiente-go-design.md D11.',
}

function corsHeaders(req: http.IncomingMessage): Record<string, string> {
	return {
		'Access-Control-Allow-Origin': (req.headers.origin as string | undefined) || '*',
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-account-id',
		'Access-Control-Allow-Credentials': 'true',
	}
}

async function ensureGoBoundaryStub(): Promise<number> {
	if (goBoundaryPort !== null) return goBoundaryPort
	goBoundaryStub = http.createServer((req, res) => {
		if (req.method === 'OPTIONS') {
			res.writeHead(204, corsHeaders(req))
			res.end()
			return
		}
		res.writeHead(501, { ...corsHeaders(req), 'Content-Type': 'application/json' })
		res.end(JSON.stringify(GO_BOUNDARY_ERROR))
	})
	await new Promise<void>((resolve, reject) => {
		goBoundaryStub?.once('error', reject)
		goBoundaryStub?.listen(0, resolve)
	})
	const address = goBoundaryStub.address()
	if (address === null || typeof address === 'string') throw new Error('go boundary stub failed to bind a TCP port')
	goBoundaryPort = address.port
	return goBoundaryPort
}

/**
 * MEASURED, not assumed (T8): TWO distinct call sites need to reach the Go co-tenant subprocess
 * once `services: ['apiGo']` is requested, and BOTH break under happy-dom's `fetch` —
 *
 * 1. `startIntegrationBackend({ services: [...] })`'s own readiness poll —
 *    `packages/api/typescript/tests/support/testBoot.ts`'s `bootService`, reached through the SAME
 *    computed dynamic import `loadTestingModule()` uses — calls the PROCESS-GLOBAL `fetch` to hit
 *    the co-tenant's health path. Repro: a `beforeAll` timeout at bun's 5s default hook deadline,
 *    well before `bootService`'s own 30s internal one — `[harness] apiGo ready on …` never printed.
 *
 * 2. Every SDK call this file's own tests (and T9's migrated components) make AFTERWARDS, straight
 *    at `backend.services.apiGo` via `configureClient`'s `go` entry. Repro: `health()` rejects with
 *    happy-dom's `NetworkError: Cross-Origin Request Blocked`.
 *
 * SAME root cause both times: inside the react test process, `globalThis.fetch` is happy-dom's
 * CORS-enforcing polyfill (`tests/setup.ts`'s `GlobalRegistrator`, preloaded for every file this
 * `bunfig.toml` runs, this one included) — and the Go gateway sends no CORS headers, because it is
 * never meant to be hit by a browser directly: production always proxies through api-ts's
 * `forwardToChannel` (see `src/lib/config.ts`'s docblock: "No VITE_GATEWAY_URL exists on purpose").
 * The harness deliberately does NOT reproduce that proxy hop for `services` mode (spec Decision 9:
 * "a URL do Go aponta pro subprocesso real" — direct, mirroring the TS-side sibling
 * `cross-service.spike.test.ts`, which talks to the gateway with a plain, non-browser `fetch` and
 * never meets this wall) — so a REAL desktop console would hit the identical CORS wall if it ever
 * tried this same direct topology; only a dedicated test process, whose whole point is reaching
 * gateway-owned state, is meant to bypass it.
 *
 * `testBoot.ts` is T7's committed surface (this task's scope fence keeps backend/test-support files
 * out of bounds — the fix belongs to whichever side actually runs under a DOM polyfill), so this
 * swaps `globalThis.fetch` for a `node:http`-backed implementation — no CORS algorithm, because
 * `node:http` has no browser security model to enforce — the MOMENT `services` is requested, kept
 * installed for the returned backend's whole lifetime (both call sites above need it), restored by
 * the wrapped `stop()` below. Scoped to the `services` path only: the default (no-`services`) boot
 * never calls this, so it stays byte-identical (spec D9) — the ONLY new state is process-global and
 * this file's own dedicated process (`bunfig.toml`'s `pathIgnorePatterns`) never shares it with a
 * default-suite file.
 */
function nodeHttpFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): ReturnType<typeof fetch> {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
	const method = init?.method ?? 'GET'
	const headers = init?.headers as Record<string, string> | undefined
	return new Promise((resolveReq, rejectReq) => {
		const req = http.request(url, { method, headers }, res => {
			const chunks: Buffer[] = []
			res.on('data', (chunk: Buffer) => chunks.push(chunk))
			res.on('end', () => {
				resolveReq(
					new Response(Buffer.concat(chunks), {
						status: res.statusCode ?? 0,
						statusText: res.statusMessage,
					}),
				)
			})
		})
		req.on('error', rejectReq)
		if (typeof init?.body === 'string') req.write(init.body)
		req.end()
	})
}
// `typeof fetch` is Bun's merged function+namespace declaration (a callable PLUS a static
// `preconnect`) — a plain function value is structurally incompatible without this, no cast
// involved: `preconnect` genuinely is part of the type this gets assigned to below.
nodeHttpFetch.preconnect = (_url: string | URL, _options?: { dns?: boolean; tcp?: boolean; http?: boolean; https?: boolean }): void => undefined

/** `null` = not patched. Module-level so `stop()` (installed once, below) can restore the EXACT
 *  happy-dom fetch this process registered, never a guess. */
let originalFetch: typeof fetch | null = null

function patchFetchForServices(): void {
	originalFetch ??= globalThis.fetch
	globalThis.fetch = nodeHttpFetch
}

function restoreFetch(): void {
	if (!originalFetch) return
	globalThis.fetch = originalFetch
	originalFetch = null
}

/**
 * Sobe (ou reusa — uma vez por processo, ver `startIntegrationBackend`'s doc) o backend de
 * integração e aponta a SDK para ele. `options` é PASS-THROUGH puro para `startIntegrationBackend`
 * (T7's law: um backend por processo — pedir `services` num processo que já bootou sem eles lança o
 * erro legível de `startIntegrationBackend`, nunca mascarado aqui).
 *
 * A URL do Go no `configureClient` é decidida pelo que o backend REALMENTE bootou
 * (`backend.services.apiGo`), nunca pelo `options` local desta chamada — a mesma leitura vale tanto
 * para quem pediu `services: ['apiGo']` quanto para uma chamada posterior no MESMO processo que não
 * pediu nada: o processo já subiu com o gateway, então a fronteira já é o subprocesso real para
 * todo mundo nele.
 */
export async function useIntegrationBackend(options?: IntegrationBackendOptions): Promise<IntegrationBackend> {
	const requestsServices = (options?.services?.length ?? 0) > 0
	if (requestsServices) patchFetchForServices()
	const { startIntegrationBackend } = await loadTestingModule()
	const backend = await startIntegrationBackend(options)
	const goServiceUrl = backend.services.apiGo
	if (goServiceUrl) {
		// Subprocesso real: o OpenAPI do Go omite o próprio mount `/api` (mesma razão do
		// `forwardToChannel` do lado TS) — a base URL configurada aqui carrega esse prefixo.
		configureClient({ typescript: backend.url, go: `${goServiceUrl}/api` })
	} else {
		const port = await ensureGoBoundaryStub()
		configureClient({ typescript: backend.url, go: `http://localhost:${port}` })
	}
	// requestsServices, não goServiceUrl: a restauração precisa acontecer sempre que
	// patchFetchForServices() rodou, mesmo no caso (defensivo, nunca observado) de um boot com
	// services pedido que devolvesse `services` vazio.
	if (!requestsServices) return backend
	return { ...backend, stop: () => backend.stop().finally(restoreFetch) }
}

/**
 * O catálogo completo de givens do backend (spec Decision 8, T7/T8), para quem o teste consumidor
 * precisa semear estado direto via repositório (nunca via use case) — ver `@codm/api-typescript`
 * `tests/support/given`. Reexportado por este mesmo caminho computado porque o react não tem alias
 * para os fontes do api (spec Decision 5/6): o teste consumidor não importa `given/index.ts`
 * diretamente, importa daqui. NUNCA a facade `@deprecated createGivenHelpers` (TST-18) — ela não
 * entra nesta superfície; os 15 `givenX` soltos + `GIVEN_MENTION_TAG` sim.
 */
export async function loadBackendGivens(): Promise<Omit<TestingSurface, 'startIntegrationBackend'>> {
	const { startIntegrationBackend: _startIntegrationBackend, ...givens } = await loadTestingModule()
	return givens
}
