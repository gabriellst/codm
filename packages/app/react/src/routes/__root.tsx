import '@/index.css'
import '@/lib/i18n'
import { Toaster } from '@/components/ui/sonner'
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
			<TanStackRouterDevtools />
			<ReactQueryDevtools />
		</QueryClientProvider>
	)
}
