// packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { configureClient } from '@codm/client-typescript/http'
import type { GetOnboardingQueryResponse } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { SetupChecklist } from './index'

/**
 * AC-13 — o painel deixou de listar os três passos incondicionalmente (spec Decision 15): ele agora
 * é a superfície do que ficou `DEFERRABLE` e ainda NÃO satisfeito, derivado do mesmo `STEP_TAXONOMY`
 * que `/onboarding` usa, alimentado pela mesma leitura (`useGetOnboarding`). Um passo satisfeito SOME
 * da lista por inteiro — não fica com um check — e sem nenhum pendente o painel não renderiza nada.
 */
describe('SetupChecklist — AC-13', () => {
	let root: Root | null = null
	let host: HTMLDivElement
	let queryClient: QueryClient
	const realFetch = globalThis.fetch

	beforeEach(async () => {
		// O texto de cada linha é o que distingue um passo do outro — sem idioma fixado, `t()` devolve
		// a chave.
		await i18n.changeLanguage('pt')
		configureClient({ typescript: 'http://localhost:3030', go: 'http://localhost:3032' })
		host = document.createElement('div')
		document.body.appendChild(host)
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	})

	afterEach(() => {
		globalThis.fetch = realFetch
		act(() => root?.unmount())
		root = null
		host.remove()
	})

	function serve(payload: GetOnboardingQueryResponse): void {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof globalThis.fetch
	}

	async function mount() {
		const rootRoute = createRootRoute({
			component: () => (
				<QueryClientProvider client={queryClient}>
					<SetupChecklist />
				</QueryClientProvider>
			),
		})
		const children = ['/channels', '/workspaces', '/attach', '/onboarding'].map(path =>
			createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
		)
		const router = createRouter({
			routeTree: rootRoute.addChildren(children),
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
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 30))
		})
	}

	it('um feito, dois não: só os dois não-feitos aparecem', async () => {
		serve({ currentStep: 'FINAL', completedAt: null, channelDone: true, workspaceDone: false, threadDone: false })
		await mount()

		expect(host.textContent).not.toContain(i18n.t('home.setupChannelTitle'))
		expect(host.textContent).toContain(i18n.t('home.setupWorkspaceTitle'))
		expect(host.textContent).toContain(i18n.t('home.setupThreadTitle'))
	})

	it('nada feito: os três aparecem', async () => {
		serve({ currentStep: 'VALUE', completedAt: null, channelDone: false, workspaceDone: false, threadDone: false })
		await mount()

		expect(host.textContent).toContain(i18n.t('home.setupChannelTitle'))
		expect(host.textContent).toContain(i18n.t('home.setupWorkspaceTitle'))
		expect(host.textContent).toContain(i18n.t('home.setupThreadTitle'))
	})

	it('tudo feito: o painel não renderiza nada', async () => {
		serve({ currentStep: 'FINAL', completedAt: '2026-08-09T00:00:00.000Z', channelDone: true, workspaceDone: true, threadDone: true })
		await mount()

		expect(host.textContent?.trim()).toBe('')
	})
})
