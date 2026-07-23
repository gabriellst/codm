/**
 * Composition-root for client-side services (the general "client-side services"
 * pattern — renamed from NativeProvider because it owns ALL host adapters, not
 * just native ones). Mounted once in routes/__root.tsx.
 *
 * Bootstrap: pick the environment ONCE (`detectEnvironment`), DYNAMIC-import that
 * env's register fn (the code-split seam — the browser entry never fetches the
 * tauri chunk), build a fresh Container, register, and publish it on context.
 * While that async load is in flight the tree shows a splash — the analogue of
 * the backend resolving its per-env InstanceRegistry before serving.
 *
 * Tests/storybook inject a ready Container through the `container` prop (built from
 * environments/test.ts fakes) — that override is the DI seam that proves the console
 * runs against any binding with zero host present (see ServicesProvider.test.tsx).
 */
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { Container } from '../core/container'
import { detectEnvironment, ENVIRONMENTS } from '../environments'

const ContainerContext = createContext<Container | null>(null)

export function ServicesProvider({ children, container: injected }: { children: ReactNode; container?: Container }) {
	const [container, setContainer] = useState<Container | null>(injected ?? null)

	useEffect(() => {
		if (injected) return
		let cancelled = false
		const env = detectEnvironment()
		ENVIRONMENTS[env]().then(register => {
			if (cancelled) return
			const built = new Container()
			register(built)
			setContainer(built)
		})
		return () => {
			cancelled = true
		}
	}, [injected])

	if (!container) return <div className="fixed inset-0 grid place-items-center bg-background" data-services-splash />
	return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>
}

/** Read the bound Container. Throws (no silent host guessing) when used outside the provider. */
export function useContainer(): Container {
	const container = useContext(ContainerContext)
	if (!container) {
		throw new Error('useService/useContainer used outside <ServicesProvider> — mount it at the composition root (routes/__root.tsx)')
	}
	return container
}
