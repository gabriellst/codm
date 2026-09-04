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
 *
 * `input instanceof Request` MUST be handled as its own case, not folded into the `init` reads below
 * (T9/T12 fix, scope fence lifted for this defect only — founder-approved, .plans/2026-08-10-eixo-
 * ambiente-go.md): every SDK mutation goes through `ky`, and `ky` NEVER calls `fetch(url, init)` for
 * a request with a body — it always builds its own `Request` first and calls `fetch(request, extra)`
 * with a SINGLE meaningful argument (traced in `node_modules/.bun/ky@1.14.3/node_modules/ky/
 * distribution/core/Ky.js`, `#fetch()`: `return this.#options.fetch(this.#originalRequest, nonRequestOptions)` —
 * `nonRequestOptions` is `ky`-internal config like `onDownloadProgress`, never method/headers/body).
 * Reading `init?.method`/`init?.headers`/`init?.body` alone — the ORIGINAL shape of this function —
 * silently dropped method/headers/body for every such call: it degraded to a bodyless, headerless GET
 * indistinguishable from success until the server rejected the missing payload. Invisible through T8
 * because `health()` (GET, no body) was the only call exercised; surfaced by T9's `services: ['apiGo']`
 * migrations, whose POSTs (create/connect a channel) all silently 4xx'd this way. The `(input:
 * string|URL, init)` path — the ORIGINAL two lines below — is UNCHANGED: `ky` never reaches it, so it
 * carries no evidence either way, and narrowing its behavior isn't this fix's job.
 */
async function nodeHttpFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): ReturnType<typeof fetch> {
	let url: string
	let method: string
	let headers: Record<string, string> | undefined
	let body: Buffer | string | undefined

	if (input instanceof Request) {
		url = input.url
		method = input.method
		// `init` wins on conflict — matches real `fetch(request, init)` semantics, where the second
		// argument overrides fields already on the Request. `Headers` normalizes casing on `.set()`,
		// so two entries for the same header spelled differently can't survive the merge.
		const merged = new Headers(input.headers)
		if (init?.headers) new Headers(init.headers).forEach((value, key) => merged.set(key, value))
		headers = Object.fromEntries(merged.entries())
		// `arrayBuffer`, not `text` — a `Request` body is never assumed textual (could be JSON, could
		// be binary); `node:http` accepts a `Buffer` directly. `.clone()` because `Request#arrayBuffer`
		// consumes the body stream — `ky` itself still holds `this.#originalRequest` for its own retry
		// logic, so consuming without cloning would race a legitimate retry against an empty stream.
		body = Buffer.from(await input.clone().arrayBuffer())
	} else {
		// UNCHANGED — `ky` never calls this branch (see docblock above); kept byte-identical.
		url = typeof input === 'string' ? input : input.toString()
		method = init?.method ?? 'GET'
		headers = init?.headers as Record<string, string> | undefined
		if (typeof init?.body === 'string') body = init.body
	}

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
		if (body !== undefined) req.write(body)
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
/**
 * O ORÇAMENTO DE BOOT — declarado UMA vez aqui, e passado por todo `beforeAll` que sobe o backend.
 *
 * `beforeAll(fn)` sem prazo herda o default de 5000ms do bun, e esse número nunca foi escolhido para
 * ESTE hook: ele compila o gateway Go (`go build`, medido em 6.5s com o cache do Go frio) e boota
 * dois servidores. Passado o prazo, o bun mata o hook — e o `Bun.spawn` do build morre com SIGTERM,
 * que chega ao leitor como `testBoot: build for 'apiGo' failed (exit 143)` com stderr VAZIO: uma
 * mensagem que acusa o build de ter falhado quando o que falhou foi o relógio.
 *
 * Não é uma particularidade de um SO nem de uma máquina — é o cache do Go. Um clone novo, uma CI sem
 * cache ou um `go clean -cache` num mac reproduzem o mesmo estouro; este host só chegou lá primeiro.
 * O prazo é folgado de propósito: ele não mede nada e não protege contra lentidão, só impede que um
 * default acidental decida o que é uma falha de build.
 *
 * O boot é UM por processo (ver `startIntegrationBackend`), então o custo é pago uma vez por arquivo
 * de teste, não por caso.
 */
export const INTEGRATION_BOOT_TIMEOUT_MS = 120_000

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

/**
 * Esta invocação é a lane cross-service? — a pergunta que decide se uma suíte `services: ['apiGo']`
 * deve rodar aqui, e a substituta do `pathIgnorePatterns` que NÃO funciona.
 *
 * ── POR QUE A EXCLUSÃO POR CAMINHO NÃO BASTA ────────────────────────────────────────────────────
 * `bunfig.toml` declara `pathIgnorePatterns = ["**\/*.services.test.tsx", …]` justamente para manter
 * estas suítes fora da suíte padrão — cada uma faz `go build` + spawn de subprocesso, e a lei de UM
 * backend por processo (`startIntegrationBackend`) proíbe que convivam com a lane default, que boota
 * sem `services`. Medido em 2026-09-03 (bun 1.3.4, Windows): a exclusão é INERTE. Os 8 arquivos
 * rodam na suíte padrão, `bun test` conta os mesmos 62 arquivos com qualquer padrão, e a flag de
 * linha de comando equivalente (`--path-ignore-patterns`) não muda nada — nem com separador `/`,
 * nem com `\`, nem com um padrão que casaria qualquer coisa (`*services*`).
 *
 * O sintoma disso não é "8 suítes a mais": é a lane default INTEIRA ficando vermelha. A primeira
 * `.services` a bootar tenta limpar o scratch dir que a lane default já abriu, e no Windows apagar
 * um arquivo com handle aberto é `EBUSY` — 28 falhas em cascata, nenhuma delas apontando para a
 * causa.
 *
 * ── POR QUE UMA FLAG DECLARADA, E NÃO OUTRO PADRÃO DE CAMINHO ───────────────────────────────────
 * Porque a informação "esta invocação é a lane cross-service" é ESTRUTURAL, e o `tests/setup.ts`
 * já a declara por este mesmo motivo, com a lição escrita ali: a primeira versão tentou FAREJAR
 * `--path-ignore-patterns` em `process.argv` e não funcionou — "inferir de convenção falhou,
 * declarar não falha". `scripts/test-cross-service.ts` é quem declara (`CODM_CROSS_SERVICE: '1'`,
 * um processo por arquivo). Uma suíte que pergunta ISTO não depende de matcher de glob, de
 * separador de caminho, nem de qual SO está rodando — é a mesma resposta no mac e no Windows.
 */
export const RUNNING_CROSS_SERVICE_LANE = process.env.CODM_CROSS_SERVICE === '1'
