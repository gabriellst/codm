import { configureClient } from '@template/client-typescript/http'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { Config, configureZod, handleApiError } from './lib'
import { routeTree } from './routeTree.gen'

configureZod()

configureClient({
	typescript: Config.baseUrl,
	rust: Config.baseUrl,
	go: Config.baseUrl,
})

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
