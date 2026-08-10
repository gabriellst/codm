// packages/app/react/src/hooks/useSystemPreconditionProbe.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { type Bindings, Container, ServicesProvider } from '@/services'
import type { SystemPreconditionStatus } from '@/services'
import testBindings, { FakeSystemPreconditionsService } from '@/services/registry/test'
import { SystemPreconditionsToken } from '@/services/tokens'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { useSystemPreconditionProbe } from './useSystemPreconditionProbe'

/**
 * AC-18 — a sonda roda no mount e de novo no `focus`, e NÃO NAVEGA NUNCA (spec Decision 16). Esta
 * suíte substitui a antiga suíte do componente-guarda que sondava e navegava junto (o componente
 * morreu — o hook publica no store, quem navega agora é `OnboardingGate`) mas herda a cobertura de
 * Story 1 (a sonda reage ao foco) porque isso continua sendo comportamento DESTE hook.
 *
 * Cada caso monta um router de VERDADE (`createMemoryHistory`) e assevera que a localização NUNCA
 * muda — não basta provar que `statuses()` foi chamado; é preciso provar que nada tentou navegar.
 */

function containerWith(statuses: SystemPreconditionStatus[]): { container: Container; fake: FakeSystemPreconditionsService } {
	class Seeded extends FakeSystemPreconditionsService {
		constructor() {
			super(statuses)
		}
	}
	const container = new Container()
	container.load(testBindings)
	container.load([[SystemPreconditionsToken, Seeded]] as unknown as Bindings)
	return { container, fake: container.resolve(SystemPreconditionsToken) as FakeSystemPreconditionsService }
}

function ProbeMount() {
	useSystemPreconditionProbe()
	return <div data-testid="console">console</div>
}

function routerAt(pathname: string, container: Container) {
	const rootRoute = createRootRoute({
		component: () => (
			<ServicesProvider container={container}>
				<ProbeMount />
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

describe('useSystemPreconditionProbe', () => {
	let root: Root | null = null
	let host: HTMLDivElement

	beforeEach(() => {
		host = document.createElement('div')
		document.body.appendChild(host)
		useSystemPreconditionsStore.getState().reset()
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host.remove()
	})

	async function mount(pathname: string, container: Container) {
		const router = routerAt(pathname, container)
		// O router precisa estar CARREGADO antes do primeiro render: sem isto o `RouterProvider` monta
		// vazio e só resolve num tick futuro que a suíte cheia não garante. Sob `nx` o `.env` entra no
		// processo com NODE_ENV=development, o Bun resolve o build de DEV do React (que honra `act()`
		// estritamente em vez de descarregar de qualquer jeito), e a ausência disto vira 18 falhas.
		await router.load()
		await act(async () => {
			root = createRoot(host)
			root.render(<RouterProvider router={router} />)
		})
		// Deixa a sonda do mount assentar antes de qualquer asserção.
		await act(async () => {
			await Promise.resolve()
		})
		return router
	}

	it('AC-18: sonda no mount e publica as pendências no store', async () => {
		const { container } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])
		const router = await mount('/dashboard', container)

		expect(host.querySelector('[data-testid="console"]')).not.toBeNull()
		expect(useSystemPreconditionsStore.getState().pending).toEqual([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])
		// AC-18 — a navegação nunca é responsabilidade do hook: quem redireciona é a guarda de onboarding.
		expect(router.state.location.pathname).toBe('/dashboard')
	})

	it('AC-18: com tudo satisfeito, publica pendência vazia e continua sem navegar', async () => {
		const { container } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: true, repair: 'AVAILABLE' }])
		const router = await mount('/dashboard', container)

		expect(useSystemPreconditionsStore.getState().pending).toEqual([])
		expect(router.state.location.pathname).toBe('/dashboard')
	})

	it('Story 3: ao reganhar foco a sonda roda de novo e a pendência resolvida desaparece — sem navegar', async () => {
		const { container, fake } = containerWith([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])
		const router = await mount('/onboarding', container)
		expect(useSystemPreconditionsStore.getState().pending).toEqual([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])

		// O operador concedeu a permissão nos Ajustes e voltou para a janela.
		fake.set([{ id: 'FULL_DISK_ACCESS', satisfied: true, repair: 'AVAILABLE' }])
		await act(async () => {
			window.dispatchEvent(new Event('focus'))
			await Promise.resolve()
		})

		expect(useSystemPreconditionsStore.getState().pending).toEqual([])
		expect(router.state.location.pathname).toBe('/onboarding')
	})
})
