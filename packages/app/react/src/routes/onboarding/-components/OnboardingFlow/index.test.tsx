// packages/app/react/src/routes/onboarding/-components/OnboardingFlow/index.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import i18n from '@/lib/i18n'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings, { FakePreconditionsService } from '@/services/registry/test'
import { PreconditionsToken } from '@/services/tokens'
import { usePreconditionsStore } from '@/stores/usePreconditionsStore'
import { useOnboardingStore } from '../../-stores/useOnboardingStore'
import { OnboardingFlow } from './index'

/**
 * O BURACO QUE ESTE ARQUIVO FECHA: o gate manda quem tem pendência para o /onboarding, e o
 * /onboarding tinha um "Pular" que devolvia a pessoa ao console. As duas coisas juntas dariam um
 * laço — ou, pior, um console aberto sem a permissão, que é exatamente a falha de origem.
 *
 * Sem pendência, nada disso existe: o fluxo tem que continuar sendo os três slides de apresentação
 * de sempre, com o "Pular" no lugar. Um teste que só cobrisse o caso bloqueado deixaria passar uma
 * regressão que tira a saída de todo mundo.
 */
describe('OnboardingFlow', () => {
	let root: Root | null = null
	let host: HTMLDivElement

	beforeEach(async () => {
		// O texto do cartão é o que distingue "slide da permissão presente" de "ausente" — sem idioma
		// fixado, `t()` devolve a chave e os dois casos veriam a mesma coisa.
		await i18n.changeLanguage('pt')
		host = document.createElement('div')
		document.body.appendChild(host)
		useOnboardingStore.getState().reset()
		usePreconditionsStore.getState().reset()
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host.remove()
	})

	async function mount() {
		const container = new Container()
		container.load(testBindings)
		container.load([[PreconditionsToken, FakePreconditionsService]] as unknown as Bindings)

		const rootRoute = createRootRoute({
			component: () => (
				<ServicesProvider container={container}>
					<OnboardingFlow />
				</ServicesProvider>
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
		// Deixa o roteador assentar a rota inicial antes de qualquer asserção sobre o DOM — o mesmo
		// tick que o idioma de `PreconditionsGate.test.tsx` usa para o PULL do gate.
		await act(async () => {
			await Promise.resolve()
		})
	}

	it('com pendência, abre no slide da permissão e não oferece saída', async () => {
		usePreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		await mount()

		expect(host.textContent).toContain('Acesso Total ao Disco')
		expect(host.querySelector('a[href="/dashboard"]')).toBeNull()
	})

	it('sem pendência, é o fluxo de apresentação de sempre — com o Pular no lugar', async () => {
		usePreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: true }])
		await mount()

		expect(host.textContent).not.toContain('Acesso Total ao Disco')
		expect(host.querySelector('a[href="/dashboard"]')).not.toBeNull()
	})

	it('o slide da permissão vem PRIMEIRO — o operador não precisa caçá-lo', async () => {
		usePreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: false }])
		await mount()

		// Quatro marcadores de slide (permissão + os três de apresentação), com o primeiro ativo.
		expect(useOnboardingStore.getState().currentSlide).toBe(0)
		expect(host.textContent).toContain('Acesso Total ao Disco')
	})
})
