import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { configureClient } from '@codm/client-typescript/http'
import i18n from '@/lib/i18n'
import { Dialog } from '@/components/ui/dialog'
import { ThreadSettingsDialog } from '.'

/**
 * O AGENTE MORTO PRECISA APARECER, NÃO FALHAR A TURN.
 *
 * `AttachThread` passou a recusar um provider que esta engine não sabe dirigir — mas conversas
 * anexadas ANTES disso continuam no banco e continuam abrindo (a decisão foi fechar a escrita, não a
 * leitura). Sem esta seção, aquela conversa simplesmente nunca responde e a única pista fica no log da
 * primeira turn, que o operador não lê. Aqui ele vê o motivo na tela que já abre por conversa.
 *
 * A asserção é contra o texto RENDERIZADO no portal (o dialog monta em `document.body`), não contra um
 * dublê do hook: a resposta é servida pelo `fetch` de verdade, então perder a propagação de
 * `comingSoon` em qualquer ponto — DTO, SDK ou componente — deixa este caso vermelho.
 */

const THREAD_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

/** A resposta de `GET /v1/threads/:id/settings` com um binding morto (CODEX) e um vivo. */
const SETTINGS = {
	mentionGate: { enabled: true, tag: '@codm' },
	participants: [{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true }],
	invokerCount: 1,
	bufferSize: '50',
	providers: [
		{ provider: 'CLAUDE_CODE', comingSoon: false },
		{ provider: 'CODEX', comingSoon: true },
	],
}

describe('ThreadSettingsDialog — o provider sem runner aparece como "Em breve"', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	const realFetch = globalThis.fetch

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		configureClient({ typescript: 'http://localhost:3030', go: 'http://localhost:3032' })
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
			// Só a leitura de settings interessa aqui; o chat é a query irmã que o cabeçalho usa para o
			// subtítulo, e entra com o mínimo que ele lê.
			const body = url.includes('/settings') ? SETTINGS : { thread: { displayName: 'Ada' } }
			return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
		}) as typeof globalThis.fetch
	})

	afterEach(() => {
		globalThis.fetch = realFetch
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	async function mount(): Promise<void> {
		host = document.createElement('div')
		document.body.appendChild(host)
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		/*
		 * Router de memória porque a zona de perigo do dialog lê a rota atual (`useRouterState`) para
		 * decidir se navega depois de apagar. Um harness mínimo — rota raiz só — em vez de dublar o hook:
		 * o componente sob teste é o exportado, inteiro, como o console monta.
		 */
		const rootRoute = createRootRoute({
			component: () => (
				<QueryClientProvider client={queryClient}>
					{/* O dialog é conteúdo puro (bp-24): quem o abre é o store. Num teste o `Dialog` aberto
					    faz o papel do store, e o conteúdo vai para o portal em `document.body`. */}
					<Dialog open>
						<ThreadSettingsDialog threadId={THREAD_ID} />
					</Dialog>
				</QueryClientProvider>
			),
		})
		const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/'] }) })
		// O router precisa estar CARREGADO antes do primeiro render: sem isto o `RouterProvider` monta
		// vazio e só resolve num tick futuro que a suíte cheia não garante — foi assim que este arquivo
		// passava sozinho e falhava sob `nx`.
		await router.load()
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(<RouterProvider router={router} />)
		})
		await settled()
	}

	/**
	 * Espera o corpo sair do skeleton — POR CONDIÇÃO, nunca por um `sleep` fixo.
	 *
	 * Duas queries React Query têm que resolver antes do primeiro texto aparecer, e quanto isso demora
	 * não é propriedade do componente. Faz polling em janelas de `act` para que cada resolução seja
	 * aplicada antes da próxima checagem — e falha com uma mensagem que diz o que ficou pendurado, em
	 * vez de estourar num `toContain` sem contexto.
	 */
	async function settled(): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (document.body.textContent?.includes(i18n.t('session.boundAgents'))) return
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error('o corpo do dialog nunca saiu do skeleton')
	}

	it('lista os agentes anexados e marca o que não é dirigível', async () => {
		await mount()

		const text = document.body.textContent ?? ''
		expect(text).toContain('Claude Code')
		expect(text).toContain('Codex')
		expect(text).toContain(i18n.t('common.comingSoon'))
		expect(text).toContain(i18n.t('session.boundAgentsComingSoonHint'))
	})

	/** Sem binding morto NÃO há aviso — uma tarja permanente vira decoração e ninguém a lê. */
	it('não avisa nada quando todos os agentes são dirigíveis', async () => {
		SETTINGS.providers = [{ provider: 'CLAUDE_CODE', comingSoon: false }]
		try {
			await mount()

			const text = document.body.textContent ?? ''
			expect(text).toContain('Claude Code')
			expect(text).not.toContain(i18n.t('session.boundAgentsComingSoonHint'))
		} finally {
			SETTINGS.providers = [
				{ provider: 'CLAUDE_CODE', comingSoon: false },
				{ provider: 'CODEX', comingSoon: true },
			]
		}
	})
})
