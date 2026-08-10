import http from 'node:http'
import { configureClient } from '@codm/client-typescript/http'
import type { IntegrationBackend, TestBedLike, TestingSurface } from '@codm/api-typescript/testing'

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
 */
export type { IntegrationBackend, TestBedLike }

async function loadTestingModule(): Promise<TestingSurface> {
	const spec = '@codm/api-typescript' + '/testing'
	return (await import(/* @vite-ignore */ spec)) as TestingSurface
}

/**
 * A fronteira do Go FALHA ALTO dentro do harness (spec Decision 10, AC-6): o gateway Go não sobe
 * junto do backend de integração (é um processo/eixo separado — fx + subprocesso sobre o mesmo
 * SQLite, spec futura), então apontar a SDK para o servidor TS faria qualquer endpoint do gateway
 * responder um 404 silencioso que parece bug do teste (foi isso, não falta de given, que deixou 3
 * componentes só-visuais nas migrações T9–T11). Em vez disso, a URL do Go aponta para ESTE stub —
 * um servidor local que responde 501 nomeando a fronteira, então uma asserção contra um endpoint Go
 * dentro do harness falha ALTO e LEGÍVEL em vez de mentir como "não encontrado".
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
		'O gateway Go não participa do harness de integração do console — comportamento gateway-owned é visual-only (story) ou e2e. Ver .specs/2026-08-10-eixo-unico-ambiente-design.md D10.',
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

export async function useIntegrationBackend(): Promise<IntegrationBackend> {
	const { startIntegrationBackend } = await loadTestingModule()
	const backend = await startIntegrationBackend()
	const port = await ensureGoBoundaryStub()
	configureClient({ typescript: backend.url, go: `http://localhost:${port}` })
	return backend
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
