/**
 * Composition-root for client-side services (the general "client-side services"
 * pattern — renamed from NativeProvider because it owns ALL host adapters, not
 * just native ones). Mounted once in routes/__root.tsx.
 *
 * Bootstrap: pick the environment ONCE (`detectEnvironment`), DYNAMIC-import that
 * env's DECLARATIVE bindings record (the code-split seam — the browser entry never
 * fetches the tauri chunk), build a fresh Container, `load` the record, and publish
 * it on context. While that async load is in flight the tree shows a splash — the
 * analogue of the backend resolving its per-env InstanceRegistry before serving.
 *
 * Tests/storybook inject a ready Container through the `container` prop (built from
 * registry/test.ts fakes) — that override is the DI seam that proves the console runs
 * against any binding with zero host present (see ServicesProvider.test.tsx).
 */
import { configureClient } from '@codm/client-typescript/http'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { computeServiceBaseUrls } from '@/lib/config'
import { Container } from '../core/container'
import { detectEnvironment, ENVIRONMENTS } from '../registry'
import { HostInfoToken, LoggingToken } from '../tokens'

const ContainerContext = createContext<Container | null>(null)

export function ServicesProvider({ children, container: injected }: { children: ReactNode; container?: Container }) {
	const [container, setContainer] = useState<Container | null>(injected ?? null)

	useEffect(() => {
		if (injected) return
		let cancelled = false
		const env = detectEnvironment()
		ENVIRONMENTS[env]().then(async bindings => {
			if (cancelled) return
			const built = new Container()
			built.load(bindings)
			// DIAGNOSTICABILITY (2026-08-07 incident) — forward console.{error,warn,...} to the
			// host's persisted log file BEFORE anything below this provider gets a chance to render
			// and log. This IS the console's boot: the ONE place every capability binding already
			// gets wired, so it is also the one place the console's own error output gets wired to
			// somewhere a diagnosis can actually find it (BrowserLoggingService no-ops outside
			// Tauri — see LoggingService/BrowserLoggingService.ts).
			await built.resolve(LoggingToken).attachConsole()
			if (cancelled) return
			// RUNTIME SDK BASE URL (spec 2026-08-25/26) — a packaged desktop app no longer bakes the
			// daemon's port at build time (`VITE_API_URL`): the shell tries a small candidate list at
			// boot and keeps whichever one was actually free (`packages/app/tauri/config/ports.ts`),
			// so the port is unknowable until the host is asked. This is the ONE place that asks,
			// BEFORE any route below (Outlet lives inside this provider) can fire a query — a `null`
			// answer (browser/dev) leaves `router.tsx`'s module-load `configureClient(serviceBaseUrls)`
			// — the `VITE_API_URL` default — untouched.
			const hostApiBaseUrl = await built.resolve(HostInfoToken).apiBaseUrl()
			if (hostApiBaseUrl) configureClient(computeServiceBaseUrls(hostApiBaseUrl))
			if (cancelled) return
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
