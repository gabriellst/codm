import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Config, daemonBaseUrl } from '@/lib/config'
import { Container, ServicesProvider } from '@/services'
import { SecretsToken } from '@/services/tokens'
import testBindings, { type FakeSecretsService } from '@/services/registry/test'
import { useCloudSessionStore } from '@/stores'
import { useLoopbackAuth } from './useLoopbackAuth'

/**
 * AC-3 — O LOOPBACK DESTRAVA O CONSOLE SEM RESTART.
 *
 * Monta o hook REAL contra um Container REAL (bindings de teste), faz o daemon responder o que ele
 * responderia, e assere o que de fato aconteceu na FRONTEIRA DE REDE (`fetch`) e nas stores — não
 * um espião nos internos do hook, que continuaria verde se a fiação quebrasse em silêncio.
 *
 * As três chamadas do fluxo são asseridas neste limite em vez de dubladas função a função: um stub
 * sobre `claimSignInCode` continuaria passando com a `baseURL` errada — e a `baseURL` é justamente o
 * que separa "pedir à minha máquina" de "pedir à nuvem", a distinção que o ADR 0001 existe para
 * manter visível.
 *
 * O hook dispara uma tentativa IMEDIATA na montagem (além do intervalo), e é dela que estes casos
 * dependem — nenhum teste aqui espera 1,5s de relógio real.
 */

const CODE = 'codigo-de-uso-unico'
const TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** ky entrega um `Request`, não uma string — `.toString()` num Request dá `"[object Request]"`. */
function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === 'string') return input
	if (input instanceof Request) return input.url
	return input.toString()
}

/** A sessão que `POST /auth/one-time-token/verify` devolve — o token guardado é `session.token`. */
function verifiedSession() {
	return {
		user: { id: '019e4d24-6524-7041-9e1c-8108180cddae', email: 'operator@example.test', name: 'Operator', emailVerified: true },
		session: { token: TOKEN, id: 'session-1', userId: '019e4d24-6524-7041-9e1c-8108180cddae', expiresAt: '2999-12-31T00:00:00.000Z' },
	}
}

/**
 * Nada aqui pré-conecta — mas `preconnect` faz parte do tipo de `fetch` (o Bun declara `fetch` como
 * função MAIS estática, declaração mesclada), então um stub sem ela é um `fetch` pela metade, não um
 * problema de tipagem. O tipo é DERIVADO da própria `fetch` em vez de redigitado; mesma leitura que
 * `tests/support/integration-harness.ts` faz do seu `nodeHttpFetch`.
 */
const preconnect: typeof fetch.preconnect = () => undefined

/** Roteia as três chamadas possíveis; qualquer outra falha alto, em vez de passar despercebida. */
function mockFetch(claim: () => Response, verify: () => Response): typeof fetch {
	const route = async (input: RequestInfo | URL): Promise<Response> => {
		const url = requestUrl(input)
		if (url.includes('/sign-in/loopback/claim')) return claim()
		if (url.includes('/one-time-token/verify')) return verify()
		if (url.includes('/session/cloud-token')) return jsonResponse({})
		throw new Error(`fetch inesperado: ${url}`)
	}
	return Object.assign(route, { preconnect })
}

describe('useLoopbackAuth', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null
	let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>
	let container: Container
	let secrets: FakeSecretsService

	beforeEach(() => {
		useCloudSessionStore.setState({ status: 'checking' })
		container = new Container()
		container.load(testBindings)
		secrets = container.resolve(SecretsToken) as FakeSecretsService
	})

	afterEach(async () => {
		await act(async () => {
			root?.unmount()
			await new Promise(resolve => setTimeout(resolve, 10))
		})
		root = null
		host = null
		fetchSpy?.mockRestore()
	})

	function Probe() {
		useLoopbackAuth()
		return null
	}

	async function mount(): Promise<void> {
		host = document.createElement('div')
		document.body.appendChild(host)
		await act(async () => {
			root = createRoot(host!)
			root.render(
				<ServicesProvider container={container}>
					<Probe />
				</ServicesProvider>,
			)
		})
		// Deixa a tentativa imediata (e suas continuações) drenarem antes de asserir.
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 30))
		})
	}

	it('LBK-01: o código retirado do daemon vira sessão na keychain, empurrada ao daemon, e destrava o console', async () => {
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
			mockFetch(
				() => jsonResponse({ code: CODE }),
				() => jsonResponse(verifiedSession()),
			),
		)

		await mount()

		expect(useCloudSessionStore.getState().status).toBe('authenticated')
		expect(await secrets.get('codm.cloud.deviceToken')).toBe(TOKEN)

		// O `setCloudToken` gerado chegou ao fio COM o token — prova que o empurrão ao daemon usa a
		// função real com a forma real, não só que algum POST aterrissou no caminho certo.
		const push = fetchSpy.mock.calls.find(([input]) => requestUrl(input).includes('/session/cloud-token'))
		expect(push).toBeDefined()
		expect(await (push![0] as Request).clone().json()).toEqual({ token: TOKEN })
	})

	it('LBK-02: a retirada vai ao DAEMON LOCAL, e o resgate à NUVEM — origens diferentes, de propósito', async () => {
		// A asserção que um stub por função não conseguiria fazer. Trocar as duas origens é um erro
		// que compila, passa em todo teste de unidade, e só aparece quando alguém tenta logar.
		//
		// O CONTRATO, não o literal: `claim` bate em `daemonBaseUrl()` (o daemon LOCAL, na porta que o
		// host RESOLVEU no boot) e o resgate (`/one-time-token/verify`) bate em `Config.cloudUrl` (a
		// NUVEM) — nunca num host hard-coded, que é exatamente o que o default do repo
		// (`localhost:3030`) é. Sob nx o `.env` da raiz sobrescreve `VITE_API_URL` (ex.: `3045`), e uma
		// asserção presa ao default falha por divergência de ambiente, não por regressão real. E num
		// app EMPACOTADO nem o default vale: `Config.baseUrl` seria a porta errada (o incidente de
		// 26/08/2026 — o login aterrissava em `127.0.0.1:3030`, onde ninguém escuta).
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
			mockFetch(
				() => jsonResponse({ code: CODE }),
				() => jsonResponse(verifiedSession()),
			),
		)

		await mount()

		const calls = fetchSpy.mock.calls.map(([input]) => requestUrl(input))
		const claim = calls.find(u => u.includes('/sign-in/loopback/claim'))
		const verify = calls.find(u => u.includes('/one-time-token/verify'))
		expect(claim).toBeDefined()
		expect(verify).toBeDefined()

		expect(new URL(claim!).origin).toBe(new URL(daemonBaseUrl()).origin)
		expect(new URL(verify!).origin).toBe(new URL(Config.cloudUrl).origin)

		// `Config.cloudUrl` cai de volta ao mesmo default do daemon quando `VITE_CODM_CLOUD_URL` não está
		// configurada (dev/test) — nesse caso as duas origens são a MESMA de propósito, e forçar
		// desigualdade aqui reproduziria o mesmo erro sensível a ambiente que este teste existe para
		// eliminar. A distinção de origem só é exigível quando as duas fontes de config divergem.
		if (new URL(Config.cloudUrl).origin !== new URL(daemonBaseUrl()).origin) {
			expect(new URL(claim!).origin).not.toBe(new URL(verify!).origin)
		}
	})

	it('LBK-03: sem código ainda, o console fica trancado e NADA é resgatado', async () => {
		// O estado normal enquanto o operador ainda está digitando a senha no navegador. Um resgate
		// disparado aqui queimaria um token que não existe e produziria um toast de erro no meio de um
		// login que está indo bem.
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
			mockFetch(
				() => jsonResponse({ code: null }),
				() => jsonResponse(verifiedSession()),
			),
		)

		await mount()

		expect(useCloudSessionStore.getState().status).toBe('checking')
		expect(fetchSpy.mock.calls.some(([input]) => requestUrl(input).includes('/one-time-token/verify'))).toBe(false)
		expect(await secrets.get('codm.cloud.deviceToken')).toBeNull()
	})

	it('LBK-04: um código recusado pela nuvem deixa o console trancado, não quebrado', async () => {
		fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
			mockFetch(
				() => jsonResponse({ code: CODE }),
				() => jsonResponse({ message: 'Invalid token' }, 400),
			),
		)

		await mount()

		expect(useCloudSessionStore.getState().status).toBe('checking')
		expect(await secrets.get('codm.cloud.deviceToken')).toBeNull()
	})
})
