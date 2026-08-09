import '@/index.css'
import '@/lib/i18n'
import { Toaster } from '@/components/ui/sonner'
import { AppChrome } from '@/components/console/AppChrome'
import { PreconditionsGate } from '@/components/console/PreconditionsGate'
import { RouteError } from '@/components/RouteError'
import { SupervisionGate } from '@/components/console/SupervisionGate'
import { useAnalyticsConsent, useAnalyticsPageview } from '@/hooks'
import { ServicesProvider } from '@/services'
import { useDeepLinkAuth } from '@/routes/(app)/-hooks/useDeepLinkAuth'
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
			{/* THE WINDOW'S SHELL, and the reason it is here and not in a route layout.
			    `titleBarStyle: 'Overlay'` + `hiddenTitle` (packages/app/tauri/config/window.ts) are
			    properties of the WINDOW: there is no OS title bar over ANY route, and the macOS traffic
			    lights are overlaid on whatever the webview paints top-left. So "this window has no
			    native title bar" is true for every React route, not just the authenticated console —
			    which is why AppChrome lived in `(app)/route.tsx` and `/attach`, `/onboarding` and
			    `/styleguide` (all SIBLINGS of `(app)`, not children) came up with no drag surface at all
			    and their own headers under the traffic lights.
			    It sits OUTSIDE ServicesProvider on purpose: that provider swaps its children for a
			    splash while the DI container loads, and the bar needs no container — `isTauri()` is a
			    plain util — so nothing is gained by making the window undraggable during boot.
			    The boot-error splash is NOT part of this: separate window, plain HTML, no React. */}
			<div className="flex h-dvh flex-col overflow-hidden bg-route-background text-foreground">
				<AppChrome />
				{/* The routes' scroll container. Screens below are sized against THIS box (`h-full` /
				    `min-h-full`), never the viewport — the bar has already taken its band out of it. */}
				<div className="min-h-0 flex-1 overflow-auto">
					{/* Client-side services — environment detected & bound ONCE here (see @/services). */}
					<ServicesProvider>
						{/* SP2 (spec Decisions 4/7): listens for the codm://auth deep link no matter which
						    screen is showing — the OS can hand the callback back while the operator is on
						    /login, i.e. exactly when CloudSessionGate (nested inside (app)) has redirected
						    away and unmounted. Root-level, and OUTSIDE SupervisionGate on purpose, so the
						    subscription itself is never gated behind the daemon's own readiness check. */}
						<DeepLinkAuthListener />
						{/* Pré-condições do ambiente (spec Decision 6): a rota /onboarding passa a significar "há
						    pendência", não "primeira execução". Root-level como o DeepLinkAuthListener porque a
						    verificação é do processo — vale de qualquer tela — e porque re-sondar no foco da janela
						    precisa estar montado enquanto o operador está nos Ajustes do macOS. */}
						<PreconditionsGate />
						{/* SP4 — product telemetry (PostHog). Root-level like DeepLinkAuthListener: pageviews
						    and consent are process-wide (every route, not just (app)), and identify() has to
						    react to the SAME status CloudSessionGate/useDeepLinkAuth flip from whichever
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
					</ServicesProvider>
				</div>
			</div>
			{/* Overlays de dev — apareciam no app EMPACOTADO por estarem montados sem condição
			    (reportado em 2026-08-07, v0.1.3). Ver ./-devtools por que o import é dinâmico. */}
			<Suspense fallback={null}>
				<Devtools />
			</Suspense>
		</QueryClientProvider>
	)
}

/** Thin mount point — `useDeepLinkAuth` needs the DI container (`useCloudSession`/`useSecrets`),
 *  so it can only be called from a descendant of `ServicesProvider`, never from `RootComponent`
 *  itself (whose own render body sits above that context boundary). Renders nothing. */
function DeepLinkAuthListener() {
	useDeepLinkAuth()
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
