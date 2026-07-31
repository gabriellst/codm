import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureClient } from '@codm/client-typescript/http'
import i18n from '@/lib/i18n'
import { ProvidersSection } from '.'

/**
 * O BOTÃO PRECISA PEDIR `refresh=true`, NÃO SÓ PEDIR DE NOVO.
 *
 * O cache do `ProviderDetector` é por PROCESSO: sem TTL, sem watch de filesystem. Um GET comum em
 * `/v1/terminal/providers` é respondido com o catálogo montado no boot do daemon, então um botão que
 * apenas refizesse a query devolveria exatamente a mesma lista para sempre — o operador instala um
 * CLI, clica, nada muda, e parece que funcionou. Só `?refresh=true` re-sonda (provado em números no
 * `DetectProviders.test.ts`: 1 probe, ainda 1 sem refresh, 2 com refresh).
 *
 * Por isso a asserção é sobre a URL que o `ky` de fato pede, e não sobre um spy no hook: um teste que
 * dublasse o hook continuaria verde com o `refresh` perdido no caminho, que é justamente a regressão
 * em jogo.
 */

const CLAUDE = { name: 'CLAUDE_CODE', status: 'DETECTED', binaryPath: '/usr/local/bin/claude', version: '1.0.0', comingSoon: false }
const CODEX = { name: 'CODEX', status: 'NOT_INSTALLED', comingSoon: true }

describe('ProvidersSection — botão Reescanear', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let requested: string[] = []
	const realFetch = globalThis.fetch

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		configureClient({ typescript: 'http://localhost:3030', go: 'http://localhost:3032' })
		requested = []
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			requested.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
			return new Response(JSON.stringify({ providers: [CLAUDE, CODEX] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})
		}) as typeof globalThis.fetch
	})

	afterEach(() => {
		globalThis.fetch = realFetch
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	let invalidated: unknown[][] = []

	function mount(): void {
		host = document.createElement('div')
		document.body.appendChild(host)
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		invalidated = []
		const realInvalidate = queryClient.invalidateQueries.bind(queryClient)
		queryClient.invalidateQueries = (filters => {
			if (filters?.queryKey) invalidated.push(filters.queryKey as unknown[])
			return realInvalidate(filters)
		}) as typeof queryClient.invalidateQueries
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(
				<QueryClientProvider client={queryClient}>
					<ProvidersSection />
				</QueryClientProvider>,
			)
		})
	}

	async function settle(ms = 60): Promise<void> {
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, ms))
		})
	}

	function rescanButton(): HTMLButtonElement {
		const buttons = [...(host?.querySelectorAll('button') ?? [])] as HTMLButtonElement[]
		const button = buttons.find(b => b.textContent?.includes(i18n.t('settings.rescanProviders')))
		if (!button) throw new Error('botão Reescanear não renderizado')
		return button
	}

	it('FALSEADOR — o clique pede refresh=true; a carga inicial não', async () => {
		mount()
		await settle()

		// A montagem serve o catálogo em cache: uma leitura comum, sem refresh.
		expect(requested.some(url => url.includes('/v1/terminal/providers'))).toBe(true)
		expect(requested.some(url => url.includes('refresh=true'))).toBe(false)

		requested = []
		await act(async () => {
			rescanButton().click()
		})
		await settle()

		expect(requested.filter(url => url.includes('refresh=true'))).not.toHaveLength(0)
	})

	it('ao concluir, invalida também o catálogo do wizard de anexar — senão ele segue com a lista velha', async () => {
		mount()
		await settle()

		await act(async () => {
			rescanButton().click()
		})
		await settle()

		// A chave do wizard é `[{ url: '/v1/ui/attach-thread-wizard' }]`; a invalidação por PREFIXO
		// alcança as páginas com search/cursor, que carregam params extras na chave.
		const wizardInvalidations = invalidated.filter(key => JSON.stringify(key).includes('/v1/ui/attach-thread-wizard'))
		expect(wizardInvalidations).not.toHaveLength(0)
	})

	it('mostra estado de carregando enquanto re-sonda — ~700ms é perceptível', async () => {
		mount()
		await settle()

		// A sondagem completa custa ~700ms (6 spawns), então o botão precisa dizer que está trabalhando
		// em vez de ficar inerte. Segura a resposta para observar o estado intermediário.
		let release: (() => void) | undefined
		globalThis.fetch = (async () => {
			await new Promise<void>(resolve => {
				release = resolve
			})
			return new Response(JSON.stringify({ providers: [CLAUDE, CODEX] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})
		}) as typeof globalThis.fetch

		await act(async () => {
			rescanButton().click()
		})

		expect(rescanButton().disabled).toBe(true)

		await act(async () => {
			release?.()
			await new Promise(resolve => setTimeout(resolve, 60))
		})

		expect(rescanButton().disabled).toBe(false)
	})
})
