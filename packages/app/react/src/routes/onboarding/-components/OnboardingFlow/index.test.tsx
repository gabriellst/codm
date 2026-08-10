// packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { configureClient } from '@codm/client-typescript/http'
import type { GetOnboardingQueryResponse } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings, { FakeSystemPreconditionsService } from '@/services/registry/test'
import { SystemPreconditionsToken } from '@/services/tokens'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { onboardingSteps, type StepId } from '../steps'
import { OnboardingFlow } from './index'

/**
 * O BURACO QUE ESTE ARQUIVO FECHA mudou de forma (spec Decisions 4/5/12/13): o `/onboarding` deixou
 * de ser três slides fixos com um quarto slide de pendência PREFIXADO sob condição — agora é a
 * composição pura `onboardingSteps`, e uma `SystemPrecondition` pendente é só mais um `StepId`,
 * ADJACENTE ao "Concluir" (Decision 5), não mais o primeiro passo da lista. O "Pular" escondido
 * morreu junto do `blocked` (Decision 13): não existe MAIS NENHUM link de saída — quem sai é o
 * botão final, que agora conclui o onboarding de verdade. E a ABERTURA (Decision 12/AC-10) deixou de
 * ser um `reset()` incondicional para 0 — agora lê `useGetOnboarding()` e semeia o primeiro passo NÃO
 * vencido, daí o fetch dublado nesta suíte.
 */
describe('OnboardingFlow', () => {
	let root: Root | null = null
	let host: HTMLDivElement
	let queryClient: QueryClient
	const realFetch = globalThis.fetch
	/** GETs a `/v1/ui/onboarding` — o contador que denuncia (ou não) a invalidação. */
	let onboardingReads = 0

	const FRESH_ONBOARDING: GetOnboardingQueryResponse = {
		currentStep: 'VALUE',
		completedAt: null,
		channelDone: false,
		workspaceDone: false,
		threadDone: false,
	}

	beforeEach(async () => {
		// O texto dos cartões é o que distingue um passo do outro — sem idioma fixado, `t()` devolve a
		// chave e os casos ficariam indistinguíveis.
		await i18n.changeLanguage('pt')
		configureClient({ typescript: 'http://localhost:3030', go: 'http://localhost:3032' })
		host = document.createElement('div')
		document.body.appendChild(host)
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		useOnboardingStore.getState().reset()
		useOnboardingSetupStore.getState().reset()
		useSystemPreconditionsStore.getState().reset()
		onboardingReads = 0
		serve(FRESH_ONBOARDING)
	})

	afterEach(() => {
		globalThis.fetch = realFetch
		act(() => root?.unmount())
		root = null
		host.remove()
	})

	// URL-aware: só `/v1/ui/onboarding` recebe o payload semeado — as peças REAIS dos passos de setup
	// (AC-14) batem em endpoints próprios (`attach-thread-wizard`, `channel/channels/*`, `workspaces`)
	// que precisam de uma resposta 200 válida para não quebrar a montagem; um objeto vazio basta, já
	// que essas suítes só afirmam que a peça real renderizou, nunca um estado de dado específico dela.
	function serve(payload: GetOnboardingQueryResponse): void {
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
			const isOnboardingRead = url.includes('/v1/ui/onboarding') && !url.includes('/complete') && !url.includes('/step')
			if (isOnboardingRead) onboardingReads += 1
			const body = isOnboardingRead ? payload : {}
			return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
		}) as typeof globalThis.fetch
	}

	async function mount() {
		const container = new Container()
		container.load(testBindings)
		container.load([[SystemPreconditionsToken, FakeSystemPreconditionsService]] as unknown as Bindings)

		const rootRoute = createRootRoute({
			component: () => (
				<QueryClientProvider client={queryClient}>
					<ServicesProvider container={container}>
						<OnboardingFlow />
					</ServicesProvider>
				</QueryClientProvider>
			),
		})
		const dashboard = createRoute({ getParentRoute: () => rootRoute, path: '/dashboard', component: () => null })
		const router = createRouter({
			routeTree: rootRoute.addChildren([dashboard]),
			history: createMemoryHistory({ initialEntries: ['/'] }),
		})

		// O router precisa estar CARREGADO antes do primeiro render: sem isto o `RouterProvider` monta
		// vazio e só resolve num tick futuro que a suíte cheia não garante. Sob `nx` o `.env` entra no
		// processo com NODE_ENV=development, o Bun resolve o build de DEV do React (que honra `act()`
		// estritamente em vez de descarregar de qualquer jeito), e a ausência disto vira 18 falhas.
		await router.load()
		await act(async () => {
			root = createRoot(host)
			root.render(<RouterProvider router={router} />)
		})
		// Deixa a leitura de onboarding resolver (fetch dublado) e o índice semear antes de qualquer
		// asserção sobre o DOM.
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 60))
		})
		return { router }
	}

	function clickButton(text: string) {
		const button = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes(text))
		if (!button) throw new Error(`button "${text}" not found`)
		act(() => button.click())
	}

	it('nunca oferece um link de saída — o "Pular" morreu junto do `blocked` (Decision 13)', async () => {
		await mount()
		expect(host.querySelector('a[href="/dashboard"]')).toBeNull()
	})

	it('sem progresso nenhum, abre no primeiro passo (o slide de valor)', async () => {
		await mount()
		expect(useOnboardingStore.getState().currentSlide).toBe(0)
		expect(host.textContent).toContain(i18n.t('onboarding.slide1Title'))
	})

	it('com pendência, o passo FULL_DISK_ACCESS entra na composição — adjacente ao Concluir, não no topo (Decision 5)', async () => {
		useSystemPreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])
		await mount()

		const steps = onboardingSteps(['FULL_DISK_ACCESS'])
		const fdaIndex = steps.indexOf('FULL_DISK_ACCESS')
		// intro → setup → SystemPrecondition → final: a pendência fica logo antes do FINAL.
		expect(fdaIndex).toBe(steps.length - 2)

		for (let i = 0; i < fdaIndex; i++) clickButton(i18n.t('onboarding.next'))
		expect(host.textContent).toContain('Acesso Total ao Disco')
	})

	it('sem pendência, o passo FULL_DISK_ACCESS não entra na composição', async () => {
		useSystemPreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: true, repair: 'AVAILABLE' }])
		await mount()

		const steps = onboardingSteps([])
		for (let i = 0; i < steps.length - 1; i++) clickButton(i18n.t('onboarding.next'))
		expect(host.textContent).not.toContain('Acesso Total ao Disco')
	})

	/**
	 * AC-10 / Story 3 — com `completedAt` gravado e `FULL_DISK_ACCESS` pendente, o wizard abre
	 * DIRETO naquele passo, sem precisar clicar "Avançar" nenhuma vez: os passos de conteúdo já estão
	 * vencidos (currentStep === FINAL, todos os `*Done` verdadeiros), e o primeiro não vencido é a
	 * própria pendência.
	 */
	it('AC-10: com completedAt e FULL_DISK_ACCESS pendente, abre naquele passo — não no slide 0', async () => {
		useSystemPreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])
		serve({ currentStep: 'FINAL', completedAt: '2026-08-09T00:00:00.000Z', channelDone: true, workspaceDone: true, threadDone: true })
		await mount()

		const steps = onboardingSteps(['FULL_DISK_ACCESS'])
		expect(useOnboardingStore.getState().currentSlide).toBe(steps.indexOf('FULL_DISK_ACCESS'))
		expect(useOnboardingStore.getState().currentSlide).not.toBe(0)
		expect(host.textContent).toContain('Acesso Total ao Disco')
	})

	/**
	 * AC-14 — os cinco passos de setup deixaram de ser o placeholder genérico (frente ONB-4b): cada um
	 * dispatcha para a peça REAL (`ConnectChannelForm`/`AddWorkspaceForm` de ONB-4a; `ContactStep`/
	 * `AgentsStep`/`ReviewStep` de `/attach`, por trás de um adaptador fino cada). Monta o wizard,
	 * navega até cada passo clicando "Próximo", e afirma em algo que SÓ a peça real renderiza — nunca
	 * o antigo título/corpo de placeholder — e que nenhum deles navegou para fora de `/onboarding`.
	 */
	describe('passos de setup — AC-14', () => {
		const SETUP_MARKERS: Record<'CHANNEL' | 'WORKSPACE' | 'CONTACT' | 'AGENTS' | 'REVIEW', string> = {
			CHANNEL: 'channels.pairStarting',
			WORKSPACE: 'workspaces.projectFolder',
			CONTACT: 'attach.noContacts',
			AGENTS: 'attach.stepAgentsTitle',
			REVIEW: 'attach.stepReviewTitle',
		}

		for (const [stepId, markerKey] of Object.entries(SETUP_MARKERS) as [StepId, string][]) {
			it(`${stepId}: renderiza a peça real e não navega para fora de /onboarding`, async () => {
				const { router } = await mount()

				const steps = onboardingSteps([])
				const index = steps.indexOf(stepId)
				for (let i = 0; i < index; i++) clickButton(i18n.t('onboarding.next'))
				await act(async () => {
					await new Promise(resolve => setTimeout(resolve, 60))
				})

				expect(host.textContent).toContain(i18n.t(markerKey))
				// Nada aqui pertence ao antigo placeholder genérico (só título+corpo, sem os textos de
				// domínio acima).
				expect(router.state.location.pathname).toBe('/')
				expect(host.querySelector('a[href="/channels"]')).toBeNull()
				expect(host.querySelector('a[href="/workspaces"]')).toBeNull()
				expect(host.querySelector('a[href="/attach"]')).toBeNull()
			})
		}
	})

	describe('concluir', () => {
		/**
		 * REGRESSÃO RELATADA EM 09/08: "tive que clicar em concluir duas vezes, a primeira não pegou".
		 *
		 * A mutation gravava `completedAt` no servidor e o componente navegava direto para
		 * `/dashboard` — que monta dentro do `OnboardingGate`, e o gate decide pelo `completedAt` de
		 * `useGetOnboarding()`. Com o cache ainda carregando a resposta ANTERIOR (`completedAt: null`),
		 * o gate devolvia o operador ao `/onboarding` no mesmo instante. A segunda tentativa
		 * funcionava só porque o React Query já tinha refeito o fetch nesse meio-tempo.
		 *
		 * O que este caso trava é a INVALIDAÇÃO: depois de concluir, a leitura de onboarding tem de
		 * ser refeita antes de a navegação acontecer. Contar os GETs é o jeito de asseverar isso sem
		 * depender de tempo — um refetch a mais é a assinatura da invalidação.
		 */
		it('invalida a leitura de onboarding ANTES de navegar — senão o gate lê o cache velho e devolve', async () => {
			const { router } = await mount()

			// O botão de concluir só existe no ÚLTIMO passo — avança até lá antes de medir.
			const steps = onboardingSteps([])
			for (let i = 0; i < steps.length - 1; i++) clickButton(i18n.t('onboarding.next'))
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 60))
			})

			const before = onboardingReads
			clickButton(i18n.t('onboarding.getStarted'))
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 80))
			})

			expect(onboardingReads).toBeGreaterThan(before)
			expect(router.state.location.pathname).toBe('/dashboard')
		})
	})
})
