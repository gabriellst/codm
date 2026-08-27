import { configureClient } from '@codm/client-typescript/http'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { configureZod, handleApiError, serviceBaseUrls } from './lib'
import { routeTree } from './routeTree.gen'

configureZod()

// Per-service base URLs (origin-fork model on codm's generated seam): each service's SDK subpath
// resolves through this ONE registry (`createClient('<service>')` in the generated `_http.ts`), so
// declaring the URL here IS the per-service declaration. `go` — the gateway — points at the api-ts
// external/ChannelProxy route, never at :3032 directly (see `computeServiceBaseUrls`).
configureClient(serviceBaseUrls)

export function getRouter() {
	const queryClient = new QueryClient({
		queryCache: new QueryCache({
			onError: error => handleApiError(error),
		}),
		mutationCache: new MutationCache({
			// `suppressToast` — 2026-08-24 onboarding-attach-ux audit (item 6). A handful of onboarding
			// mutations (`useAddWorkspace`/`useAttachThread` inside `OnboardingWorkspaceStep`/
			// `OnboardingReviewStep`, `useCompleteOnboarding` in `OnboardingFlow`) now show their own
			// error INLINE, next to the "Próximo"/"Concluir" chain that already gates advancing on
			// success (item 2) — a global toast on top would be a second, redundant surface for the
			// SAME failure. Opt-in via `meta` (never a route/pathname check here): only the specific
			// mutation call sites that ALSO wired an inline replacement suppress the toast: every other
			// mutation — including these exact same hooks used OUTSIDE onboarding (`/workspaces`,
			// `/attach`) — keeps the toast unchanged.
			onError: (error, _variables, _context, mutation) => {
				if (mutation.meta?.suppressToast) return
				handleApiError(error)
			},
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

// Typed `meta` for `useMutation({ mutation: { meta: {...} } })` call sites — see the
// `MutationCache.onError` comment above.
declare module '@tanstack/react-query' {
	interface Register {
		mutationMeta: { suppressToast?: boolean }
	}
}
