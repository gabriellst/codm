// packages/app/react/src/components/console/OnboardingGate.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { configureClient } from '@codm/client-typescript/http'
import type { GetOnboardingQueryResponse } from '@codm/client-typescript/typescript'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { OnboardingGate, resetOnboardingGateForTests } from './OnboardingGate'

/**
 * A GUARDA — a única coisa que decide "isso pede /onboarding" (spec Decision 14). Duas regras, dois
 * fatos diferentes:
 *
 *   · sem `completedAt` (fato do SERVIDOR) → SEMPRE navega, todo render.
 *   · com `completedAt` E algo pendente no store (fato do HOST) → navega UMA VEZ POR EXECUÇÃO
 *     (AC-11) — provado montando a guarda DUAS VEZES na mesma "execução" (o marcador é módulo,
 *     nunca resetado em produção) e checando que a segunda não bate no `/onboarding`.
 *
 * Cada caso monta um router de verdade e assevera a LOCALIZAÇÃO — nunca um spy de `navigate`.
 */
describe('OnboardingGate', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	const realFetch = globalThis.fetch

	beforeEach(() => {
		configureClient({ typescript: 'http://localhost:3030', go: 'http://localhost:3032' })
		useSystemPreconditionsStore.getState().reset()
		resetOnboardingGateForTests()
	})

	afterEach(() => {
		globalThis.fetch = realFetch
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	function serve(payload: GetOnboardingQueryResponse): void {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof globalThis.fetch
	}

	function routerAt(pathname: string, queryClient: QueryClient) {
		const rootRoute = createRootRoute({
			component: () => (
				<QueryClientProvider client={queryClient}>
					<OnboardingGate>
						<div data-testid="console">console</div>
					</OnboardingGate>
				</QueryClientProvider>
			),
		})
		const dashboard = createRoute({ getParentRoute: () => rootRoute, path: '/dashboard', component: () => null })
		const onboarding = createRoute({ getParentRoute: () => rootRoute, path: '/onboarding', component: () => null })
		return createRouter({
			routeTree: rootRoute.addChildren([dashboard, onboarding]),
			history: createMemoryHistory({ initialEntries: [pathname] }),
		})
	}

	async function mount(pathname: string) {
		host = document.createElement('div')
		document.body.appendChild(host)
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const router = routerAt(pathname, queryClient)
		await act(async () => {
			root = createRoot(host as HTMLDivElement)
			root.render(<RouterProvider router={router} />)
		})
		// Deixa a leitura de onboarding resolver (fetch real, ainda que dublado) e o roteador assentar
		// a navegação antes de qualquer asserção — dois microtasks não bastam para o round-trip do
		// React Query mais o redirect do TanStack Router.
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 60))
		})
		return router
	}

	it('AC-1: sem completedAt, leva SEMPRE ao /onboarding — fato do servidor, sem flag', async () => {
		serve({ currentStep: 'VALUE', completedAt: null, channelDone: false, workspaceDone: false, threadDone: false })
		const router = await mount('/dashboard')

		expect(router.state.location.pathname).toBe('/onboarding')
	})

	it('com completedAt e nada pendente, não navega — console abre normalmente', async () => {
		serve({ currentStep: 'FINAL', completedAt: '2026-08-09T00:00:00.000Z', channelDone: true, workspaceDone: true, threadDone: true })
		const router = await mount('/dashboard')

		expect(router.state.location.pathname).toBe('/dashboard')
		expect(host?.querySelector('[data-testid="console"]')).not.toBeNull()
	})

	it('AC-11: com completedAt e algo pendente, leva ao /onboarding UMA VEZ por execução', async () => {
		serve({ currentStep: 'FINAL', completedAt: '2026-08-09T00:00:00.000Z', channelDone: true, workspaceDone: true, threadDone: true })
		useSystemPreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])

		const first = await mount('/dashboard')
		expect(first.state.location.pathname).toBe('/onboarding')

		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null

		// Mesma execução (o marcador de módulo NÃO foi resetado) — o operador voltou para /dashboard
		// (ex.: concluiu o wizard) e a MESMA pendência do host continua lá. Uma segunda guarda fresca
		// não pode bater de volta no /onboarding.
		const second = await mount('/dashboard')
		expect(second.state.location.pathname).toBe('/dashboard')
	})
})
