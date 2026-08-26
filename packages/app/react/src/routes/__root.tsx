import '@/index.css'
import '@/lib/i18n'
import '@/lib/registerErrorTranslator'
import { Toaster } from '@codm/app-ui/sonner'
import { AppChrome } from '@/components/console/AppChrome'
import { RouteError } from '@/components/RouteError'
import { SupervisionGate } from '@/components/console/SupervisionGate'
import { useAnalyticsConsent, useAnalyticsPageview, useSystemPreconditionProbe } from '@/hooks'
import { ServicesProvider } from '@/services'
import { useLoopbackAuth } from '@/routes/(app)/-hooks/useLoopbackAuth'
import { useAnalyticsIdentity } from '@/routes/(app)/-hooks/useAnalyticsIdentity'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { lazy, Suspense, type ReactNode } from 'react'

/**
 * Só existe no bundle de DESENVOLVIMENTO — ver ./-devtools para o porquê do módulo separado.
 *
 * A flag vem do `define` do vite (ver vite.config.ts) e NÃO de `import.meta.env.DEV`, que neste
 * projeto é `true` até no `build-spa` — foi por isso que o app empacotado exibia os overlays. A
 * condição precisa envolver o próprio `import()`: com o `lazy(...)` solto no topo, o Vite enxerga
 * um import dinâmico sempre alcançável e emite o chunk mesmo com a renderização gateada.
 */
const Devtools = __DEV_OVERLAYS__ ? lazy(() => import('./-devtools').then(m => ({ default: m.Devtools }))) : () => null

export interface RouterContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({
		meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'App' }],
	}),
	shellComponent: RootShell,
	component: RootComponent,
	errorComponent: RouteError,
})

function RootShell({ children }: { children: ReactNode }) {
	return (
		<html lang="pt">
			<head>
				<HeadContent />
			</head>
			<body>
				<div id="root">{children}</div>
				<Scripts />
			</body>
		</html>
	)
}

function RootComponent() {
	const { queryClient } = Route.useRouteContext()
	return (
		<QueryClientProvider client={queryClient}>
			{/* Client-side services — environment detected & bound ONCE here (see @/services). The
			    provider sits ABOVE the window shell: AppChrome asks the WindowService port whether this
			    host overlays its traffic lights (macOS) or draws a native title bar (Windows/Linux, a
			    browser tab), so the bar needs the container like every other port consumer. While the
			    bindings chunk loads the provider paints its splash instead of this tree — invisible in
			    practice, because the main window is BORN HIDDEN (config/window.ts `visible: false`)
			    until every sidecar has answered its health probe. */}
			<ServicesProvider>
				{/* THE WINDOW'S SHELL, and the reason it is here and not in a route layout.
				    `titleBarStyle: 'Overlay'` + `hiddenTitle` (packages/app/tauri/config/window.ts) are
				    properties of the WINDOW: there is no OS title bar over ANY route on macOS, and the
				    traffic lights are overlaid on whatever the webview paints top-left. So "this window's
				    chrome" is true for every React route, not just the authenticated console — which is
				    why AppChrome lived in `(app)/route.tsx` and `/attach`, `/onboarding` and `/styleguide`
				    (all SIBLINGS of `(app)`, not children) came up with no drag surface at all and their
				    own headers under the traffic lights.
				    The boot-error splash is NOT part of this: separate window, plain HTML, no React. */}
				<div className="flex h-dvh flex-col overflow-hidden bg-route-background text-foreground">
					<AppChrome />
					{/* The routes' scroll container. Screens below are sized against THIS box (`h-full` /
					    `min-h-full`), never the viewport — the bar has already taken its band out of it. */}
					<div className="min-h-0 flex-1 overflow-auto">
						{/* SP2 (spec Decisions 4/7): listens for the codm://auth deep link no matter which
						    screen is showing — the OS can hand the callback back while the operator is on
						    /login, i.e. exactly when CloudSessionGate (nested inside (app)) has redirected
						    away and unmounted. Root-level, and OUTSIDE SupervisionGate on purpose, so the
						    subscription itself is never gated behind the daemon's own readiness check. */}
						<DeepLinkAuthListener />
						{/* Pré-condições do ambiente (spec Decision 16): sonda e publica no store — NÃO navega.
						    Root-level como o DeepLinkAuthListener porque a verificação é do processo — vale de
						    qualquer tela — e porque re-sondar no foco da janela precisa estar montado enquanto o
						    operador está nos Ajustes do macOS. Quem decide "isso pede /onboarding" é o
						    `OnboardingGate`, montado em `(app)/route.tsx`, lendo o MESMO store. */}
						<SystemPreconditionProbe />
						{/* SP4 — product telemetry (PostHog). Root-level like DeepLinkAuthListener: pageviews
						    and consent are process-wide (every route, not just (app)), and identify() has to
						    react to the SAME status CloudSessionGate/useLoopbackAuth flip from whichever
						    screen is showing. */}
						<PostHogListener />
						{/* Supervision decides whether the console's server work can succeed AT ALL: with the
						    daemon down every request is doomed (it is the origin of all of them, the gateway's
						    proxied ones included), so they get paused rather than fired, failed and retried.
						    Root-level because the pause is process-wide, and it wraps the Outlet — never the
						    Toaster — so a held console can still speak. */}
						<SupervisionGate>
							<Outlet />
						</SupervisionGate>
						<Toaster />
					</div>
				</div>
			</ServicesProvider>
			{/* Overlays de dev — apareciam no app EMPACOTADO por estarem montados sem condição
			    (reportado em 2026-08-07, v0.1.3). Ver ./-devtools por que o import é dinâmico. */}
			<Suspense fallback={null}>
				<Devtools />
			</Suspense>
		</QueryClientProvider>
	)
}

/** Thin mount point — `useLoopbackAuth` needs the DI container (`useCloudSession`/`useSecrets`),
 *  so it can only be called from a descendant of `ServicesProvider`, never from `RootComponent`
 *  itself (whose own render body sits above that context boundary). Renders nothing. */
function DeepLinkAuthListener() {
	useLoopbackAuth()
	return null
}

/** Thin mount point, same reasoning as `DeepLinkAuthListener` — `useSystemPreconditionProbe` resolves
 *  `useSystemPreconditions()` from the DI container, so it can only run inside `ServicesProvider`. */
function SystemPreconditionProbe() {
	useSystemPreconditionProbe()
	return null
}

/** Thin mount point, same reasoning as `DeepLinkAuthListener` — all three PostHog hooks resolve
 *  `useAnalytics()` from the DI container, so they can only run inside `ServicesProvider`. One
 *  component so the three root-level effects are visibly a single concern in the tree. */
function PostHogListener() {
	useAnalyticsPageview()
	useAnalyticsConsent()
	useAnalyticsIdentity()
	return null
}
