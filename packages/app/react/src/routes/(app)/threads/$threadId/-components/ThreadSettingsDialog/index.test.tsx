import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { configureClient } from '@codm/client-typescript/http'
import { getHomeDashboardQueryKey, getSessionChatQueryKey } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { Dialog } from '@/components/ui/dialog'
import { useDialogStore } from '@/stores/useDialogStore'
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
	customPrompt: 'Fale sempre em inglês com este cliente.',
	customPromptMaxLength: 8000,
	providers: [
		{ provider: 'CLAUDE_CODE', comingSoon: false },
		{ provider: 'CODEX', comingSoon: true },
	],
}

/** Toda requisição que o diálogo dispara, para as asserções de ESCRITA (o prompt personalizado). */
const sent: { url: string; method: string; body?: string }[] = []

describe('ThreadSettingsDialog — o provider sem runner aparece como "Em breve"', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	const realFetch = globalThis.fetch

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		configureClient({ typescript: 'http://localhost:3030', go: 'http://localhost:3032' })
		sent.length = 0
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
			// Método e corpo podem chegar pelo `init` OU pelo `Request` — o cliente da SDK usa a segunda
			// forma, e ler só o `init` registrava toda escrita como um GET sem corpo.
			const request = input instanceof Request ? input : undefined
			sent.push({
				url,
				method: init?.method ?? request?.method ?? 'GET',
				body: typeof init?.body === 'string' ? init.body : await request?.clone().text(),
			})
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

	/** A primeira requisição que casa com o predicado — mesma espera-por-condição do `settled()`. */
	async function sentRequest(matches: (r: (typeof sent)[number]) => boolean): Promise<(typeof sent)[number]> {
		for (let attempt = 0; attempt < 100; attempt++) {
			const found = sent.find(matches)
			if (found) return found
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error(`nenhuma requisição casou; vistas: ${sent.map(r => `${r.method} ${r.url}`).join(', ')}`)
	}

	it('lista os agentes anexados e marca o que não é dirigível', async () => {
		await mount()

		const text = document.body.textContent ?? ''
		expect(text).toContain('Claude Code')
		expect(text).toContain('Codex')
		expect(text).toContain(i18n.t('common.comingSoon'))
		expect(text).toContain(i18n.t('session.boundAgentsComingSoonHint'))
	})

	/**
	 * O PROMPT PERSONALIZADO chega na tela e volta pelo fio.
	 *
	 * Asserção contra o `fetch` de verdade, como o resto deste arquivo: o que precisa ser provado é a
	 * CORRENTE inteira — DTO → SDK → textarea → mutation → PUT — porque cada elo dela falha calado. Um
	 * campo esquecido no DTO desenha uma caixa vazia sobre um prompt que o agente continua obedecendo,
	 * e um botão sem handler é exatamente a UI morta que a regra da casa proíbe: nos dois casos o
	 * operador digita, clica, e nada acontece sem nada ficar vermelho.
	 */
	it('mostra o prompt salvo e escreve o editado em PUT /threads/:id/prompt', async () => {
		await mount()

		const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea')
		expect(textarea?.value).toBe(SETTINGS.customPrompt)

		// O setter nativo + `input` é o que o React reconhece como digitação numa textarea controlada;
		// mexer só em `.value` não emite change e o rascunho continuaria o antigo.
		const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
		act(() => {
			nativeValue?.call(textarea, 'Nunca prometa prazo.')
			textarea?.dispatchEvent(new Event('input', { bubbles: true }))
		})

		const save = [...document.body.querySelectorAll('button')].find(b => b.textContent === i18n.t('session.customPromptSave'))
		// Habilitado APENAS quando há edição pendente — é o que torna "não salvo" legível numa seção que,
		// ao contrário das irmãs, não salva sozinha.
		expect(save?.disabled).toBe(false)
		await act(async () => {
			save?.click()
		})

		// A mutation resolve num tick futuro; espera POR CONDIÇÃO, como o `settled()` acima e pela mesma
		// razão — quanto ela demora não é propriedade do componente.
		const put = await sentRequest(r => r.method.toUpperCase() === 'PUT' && r.url.includes(`/threads/${THREAD_ID}/prompt`))
		expect(JSON.parse(put.body ?? '{}')).toEqual({ customPrompt: 'Nunca prometa prazo.' })
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

/**
 * APAGAR NÃO PODE BUSCAR O QUE ACABOU DE APAGAR.
 *
 * O `onSuccess` do deletar já limpava o cache, mas com `invalidateQueries` nas três chaves DA THREAD
 * APAGADA — e invalidar significa "isso envelheceu, busque de novo". Buscar de novo uma thread
 * recém-apagada é um refetch que OBRIGATORIAMENTE falha: as três leituras respondem THREAD_NOT_FOUND
 * por desenho (spec de deleção, AC-3). O componente ainda está montado no instante do sucesso, então
 * o refetch saía ANTES da navegação e o operador levava um erro por ter feito o que o botão prometia.
 *
 * A asserção central é sobre a REDE, não sobre o cache: nenhuma requisição nova para os endpoints
 * daquela thread depois do DELETE. É o único predicado que fica vermelho se alguém trocar
 * `removeQueries` de volta por `invalidateQueries` — o cache "vazio" seria satisfeito pelos dois.
 *
 * HARNESS FIEL, e isso é o que tornou o teste possível: `confirm()` vem do `useDialogStore` e
 * SUBSTITUI o conteúdo do dialog pelo ConfirmDialog compartilhado. Montar o componente direto (como
 * os casos acima) deixa o confirm sem host onde renderizar, e o clique não existe. Aqui o host da
 * store é replicado como em `(app)/route.tsx`, e o dialog entra por `show()` — o mesmo caminho do app.
 */
describe('ThreadSettingsDialog — apagar a conversa', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	const realFetch = globalThis.fetch

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		configureClient({ typescript: 'http://localhost:3030', go: 'http://localhost:3032' })
		sent.length = 0
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
			const request = input instanceof Request ? input : undefined
			sent.push({ url, method: init?.method ?? request?.method ?? 'GET', body: undefined })
			const body = url.includes('/settings') ? SETTINGS : { thread: { displayName: 'Ada' } }
			return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
		}) as typeof globalThis.fetch
	})

	afterEach(() => {
		globalThis.fetch = realFetch
		act(() => useDialogStore.getState().hide())
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	/** Clica o primeiro botão cujo texto casa — o dialog vive num portal, então varre `document.body`. */
	async function clickButton(label: string): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			const button = [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
			if (button) {
				await act(async () => {
					button.click()
				})
				return
			}
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error(`botão "${label}" nunca apareceu`)
	}

	it('não dispara nenhuma requisição para a thread apagada depois do DELETE', async () => {
		host = document.createElement('div')
		document.body.appendChild(host)
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

		// O host da store, como `(app)/route.tsx` monta — é ele que dá lugar ao ConfirmDialog.
		function DialogHost() {
			const { content, open, hide } = useDialogStore()
			return (
				<Dialog open={open} onOpenChange={isOpen => !isOpen && hide()}>
					{content}
				</Dialog>
			)
		}
		const rootRoute = createRootRoute({
			component: () => (
				<QueryClientProvider client={queryClient}>
					<DialogHost />
				</QueryClientProvider>
			),
		})
		const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/'] }) })
		await router.load()
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(<RouterProvider router={router} />)
		})
		act(() => useDialogStore.getState().show(<ThreadSettingsDialog threadId={THREAD_ID} />))

		await clickButton(i18n.t('session.deleteThread.action'))
		await clickButton(i18n.t('session.deleteThread.confirmAction'))

		// O DELETE saiu…
		let deleteIndex = -1
		for (let attempt = 0; attempt < 100 && deleteIndex === -1; attempt++) {
			deleteIndex = sent.findIndex(r => r.method === 'DELETE')
			if (deleteIndex === -1)
				await act(async () => {
					await new Promise(resolve => setTimeout(resolve, 10))
				})
		}
		expect(deleteIndex).toBeGreaterThanOrEqual(0)

		// O EFEITO, nao so a chamada. O DELETE sair prova o fluxo ate o servidor; o que o operador vive
		// depois disso e a navegacao e a lista limpa — e era exatamente isso que faltava.
		//
		// POR QUE ISSO QUEBRAVA: `confirm()` SUBSTITUI o conteudo do dialog pelo ConfirmDialog, o que
		// DESMONTA o DangerZone enquanto o operador confirma. Callbacks passadas a `mutate(vars, {...})`
		// vivem no observer e o React Query nao as chama quando o componente desmontou — enquanto a
		// requisicao sai normalmente. Resultado no app real: a conversa era apagada no servidor e a UI
		// ficava parada. As callbacks no NIVEL DO HOOK vivem na mutacao, nao no observer, e sobrevivem.
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 150))
		})
		expect(queryClient.getQueryData(getSessionChatQueryKey(THREAD_ID))).toBeUndefined()
		expect(queryClient.getQueryData(getHomeDashboardQueryKey())).toBeUndefined()
		expect(router.state.location.pathname).toBe('/dashboard')
	})
})
