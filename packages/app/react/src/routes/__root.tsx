import '@/index.css'
import '@/lib/i18n'
import { Toaster } from '@/components/ui/sonner'
import { AppChrome } from '@/components/console/AppChrome'
import { RouteError } from '@/components/RouteError'
import { SupervisionGate } from '@/components/console/SupervisionGate'
import { ServicesProvider } from '@/services'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import type { ReactNode } from 'react'

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
			<TanStackRouterDevtools />
			<ReactQueryDevtools />
		</QueryClientProvider>
	)
}
