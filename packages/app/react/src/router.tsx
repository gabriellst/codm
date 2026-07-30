import { configureClient } from '@codm/client-typescript/http'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { configureZod, handleApiError, serviceBaseUrls } from './lib'
import { routeTree } from './routeTree.gen'

configureZod()

// Per-service base URLs (medscall model on codedm's generated seam): each service's SDK subpath
// resolves through this ONE registry (`createClient('<service>')` in the generated `_http.ts`), so
// declaring the URL here IS the per-service declaration. `go` — the gateway — points at the api-ts
// external/ChannelProxy route, never at :3032 directly (see Config.gatewayBaseUrl).
configureClient(serviceBaseUrls)

export function getRouter() {
	const queryClient = new QueryClient({
		queryCache: new QueryCache({
			onError: error => handleApiError(error),
		}),
		mutationCache: new MutationCache({
			onError: error => handleApiError(error),
		}),
		defaultOptions: {
			queries: {
				retry: false,
				throwOnError: false,
			},
		},
	})

	return createTanStackRouter({
		routeTree,
		basepath: '/app',
		context: { queryClient },
		// Prefetch route chunks + loaders on hover/focus. `defaultPreloadStaleTime: 0`
		// hands staleness control to React Query: the loader always re-runs and
		// `ensureQueryData` decides from its cache whether a request actually fires.
		defaultPreload: 'intent',
		defaultPreloadStaleTime: 0,
		scrollRestoration: true,
	})
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
	interface StaticDataRouteOption {
		breadcrumb?: string
		breadcrumbs?: Array<{ label: string; to?: string }>
		wrapperClassName?: string
	}
}
