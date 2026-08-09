import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { type Bindings, Container, ServicesProvider } from '@/services'
import type { PreconditionStatus } from '@/services'
import testBindings, { FakePreconditionsService } from '@/services/registry/test'
import { PreconditionsToken } from '@/services/tokens'
import { usePreconditionsStore } from '@/stores/usePreconditionsStore'
import { PreconditionsGate } from './PreconditionsGate'

/**
 * A PERGUNTA É "PARA ONDE O OPERADOR FOI", e ela só tem resposta num router de verdade — por isso
 * estes casos montam um `createMemoryHistory` em vez de espionar `useNavigate`. Um spy provaria que
 * chamamos a função; só o histórico prova que a tela mudou.
 *
 * Cada caso também assevera que os filhos do gate estão no DOM: sem isso a suíte seria vazia na pior
 * direção possível — um gate que nunca renderizasse nada passaria por "não redirecionou".
 */

function containerWith(statuses: PreconditionStatus[]): { container: Container; fake: FakePreconditionsService } {
	class Seeded extends FakePreconditionsService {
		constructor() {
			super(statuses)
		}
	}
	const container = new Container()
	container.load(testBindings)
	container.load([[PreconditionsToken, Seeded]] as unknown as Bindings)
	return { container, fake: container.resolve(PreconditionsToken) as FakePreconditionsService }
}

function routerAt(pathname: string, container: Container) {
	const rootRoute = createRootRoute({
		component: () => (
			<ServicesProvider container={container}>
				<PreconditionsGate />
				<div data-testid="console">console</div>
			</ServicesProvider>
		),
	})
	const dashboard = createRoute({ getParentRoute: () => rootRoute, path: '/dashboard', component: () => null })
	const onboarding = createRoute({ getParentRoute: () => rootRoute, path: '/onboarding', component: () => null })
	return createRouter({
		routeTree: rootRoute.addChildren([dashboard, onboarding]),
		history: createMemoryHistory({ initialEntries: [pathname] }),
	})
}

describe('PreconditionsGate', () => {
	let root: Root | null = null
	let host: HTMLDivElement

	beforeEach(() => {
		host = document.createElement('div')
		document.body.appendChild(host)
		usePreconditionsStore.getState().reset()
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host.remove()
	})

	async function mount(pathname: string, container: Container) {
		const router = routerAt(pathname, container)
		await act(async () => {
			root = createRoot(host)
			root.render(<RouterProvider router={router} />)
		})
		// Deixa o PULL do gate assentar antes de qualquer asserção sobre a rota.
		await act(async () => {
			await Promise.resolve()
		})
		return router
	}

	it('AC-3: com uma pendência, leva o operador ao /onboarding', async () => {
		const { container } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		const router = await mount('/dashboard', container)

		expect(host.querySelector('[data-testid="console"]')).not.toBeNull()
		expect(router.state.location.pathname).toBe('/onboarding')
	})

	it('AC-3: com tudo satisfeito, não retém nem move o operador', async () => {
		const { container } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: true }])
		const router = await mount('/dashboard', container)

		expect(host.querySelector('[data-testid="console"]')).not.toBeNull()
		expect(router.state.location.pathname).toBe('/dashboard')
		expect(usePreconditionsStore.getState().pending).toEqual([])
	})

	it('AC-4: o gatilho é o conjunto de pendências, não uma flag de "já visto"', async () => {
		// Segunda montagem com a MESMA pendência: se houvesse flag persistida, esta não redirecionaria.
		const first = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		const firstRouter = await mount('/dashboard', first.container)
		expect(firstRouter.state.location.pathname).toBe('/onboarding')

		act(() => root?.unmount())
		root = null
		usePreconditionsStore.getState().reset()

		const second = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		const secondRouter = await mount('/dashboard', second.container)
		expect(secondRouter.state.location.pathname).toBe('/onboarding')
	})

	it('Story 1: ao reganhar foco a sonda roda de novo e a pendência resolvida desaparece', async () => {
		const { container, fake } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		await mount('/onboarding', container)
		expect(usePreconditionsStore.getState().pending).toEqual(['FULL_DISK_ACCESS'])

		// O operador concedeu a permissão nos Ajustes e voltou para a janela.
		fake.set([{ id: 'FULL_DISK_ACCESS', satisfied: true }])
		await act(async () => {
			window.dispatchEvent(new Event('focus'))
			await Promise.resolve()
		})

		expect(usePreconditionsStore.getState().pending).toEqual([])
	})
})
