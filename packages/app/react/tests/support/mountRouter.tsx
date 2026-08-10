import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
	RouterProvider,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	type AnyRouter,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

/**
 * O CANON DE MONTAGEM DE ROTA, EMPACOTADO (spec Decision 11) — quem monta rota em teste não
 * consegue esquecer o `router.load()`, porque não escreve essa parte.
 *
 * A armadilha que isto mata, medida em 10/08: sem `load()` o RouterProvider monta VAZIO e só
 * resolve num tick futuro. O build de produção do React descarrega o render sem honrar `act()` e
 * mascarava o buraco; o de desenvolvimento (que o nx ativa via NODE_ENV do .env) o expõe — 18
 * testes passavam por acidente. O rail irmão (`tests/architecture/router-load.test.ts`) pega quem
 * montar na mão.
 */
export interface MountedRouter {
	router: AnyRouter
	host: HTMLDivElement
	/** Espera POR CONDIÇÃO — nunca sleep fixo. Falha nomeando o que ficou pendurado. */
	settled(predicate: () => boolean, label?: string): Promise<void>
	unmount(): void
}

export async function mountRouter(
	ui: ReactNode,
	options?: { path?: string; extraPaths?: string[] },
): Promise<MountedRouter> {
	const host = document.createElement('div')
	document.body.appendChild(host)

	const rootRoute = createRootRoute({ component: () => <>{ui}</> })
	const children = (options?.extraPaths ?? ['/dashboard', '/onboarding']).map(path =>
		createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
	)
	const router = createRouter({
		routeTree: rootRoute.addChildren(children),
		history: createMemoryHistory({ initialEntries: [options?.path ?? '/'] }),
	})

	// A LINHA que este helper existe para ninguém esquecer:
	await router.load()

	let root: Root | null = null
	await act(async () => {
		root = createRoot(host)
		root.render(<RouterProvider router={router} />)
	})
	await act(async () => {
		await Promise.resolve()
	})

	return {
		router,
		host,
		async settled(predicate, label = 'condição') {
			for (let attempt = 0; attempt < 100; attempt++) {
				if (predicate()) return
				await act(async () => {
					await new Promise(resolve => setTimeout(resolve, 10))
				})
			}
			throw new Error(`mountRouter.settled: ${label} nunca aconteceu`)
		},
		unmount() {
			act(() => root?.unmount())
			host.remove()
		},
	}
}
