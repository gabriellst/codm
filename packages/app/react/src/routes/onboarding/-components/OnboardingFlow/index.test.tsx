// packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import i18n from '@/lib/i18n'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings, { FakeSystemPreconditionsService } from '@/services/registry/test'
import { SystemPreconditionsToken } from '@/services/tokens'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { onboardingSteps } from '../steps'
import { OnboardingFlow } from './index'

/**
 * O BURACO QUE ESTE ARQUIVO FECHA mudou de forma (spec Decisions 4/5/13): o `/onboarding` deixou de
 * ser três slides fixos com um quarto slide de pendência PREFIXADO sob condição — agora é a
 * composição pura `onboardingSteps`, e uma `SystemPrecondition` pendente é só mais um `StepId`,
 * ADJACENTE ao "Concluir" (Decision 5), não mais o primeiro passo da lista. O "Pular" escondido
 * morreu junto do `blocked` (Decision 13): não existe MAIS NENHUM link de saída — quem sai é o
 * botão final, que agora conclui o onboarding de verdade.
 */
describe('OnboardingFlow', () => {
	let root: Root | null = null
	let host: HTMLDivElement
	let queryClient: QueryClient

	beforeEach(async () => {
		// O texto dos cartões é o que distingue um passo do outro — sem idioma fixado, `t()` devolve a
		// chave e os casos ficariam indistinguíveis.
		await i18n.changeLanguage('pt')
		host = document.createElement('div')
		document.body.appendChild(host)
		queryClient = new QueryClient()
		useOnboardingStore.getState().reset()
		useSystemPreconditionsStore.getState().reset()
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host.remove()
	})

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

		await act(async () => {
			root = createRoot(host)
			root.render(<RouterProvider router={router} />)
		})
		// Deixa o roteador assentar a rota inicial antes de qualquer asserção sobre o DOM.
		await act(async () => {
			await Promise.resolve()
		})
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

	it('abre sempre no primeiro passo (o slide de valor) — o reset ao entrar continua', async () => {
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
})
