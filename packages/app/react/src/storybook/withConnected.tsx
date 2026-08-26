// packages/app/react/src/storybook/withConnected.tsx — global decorator. Activates only when
// `parameters.route` is present; otherwise the story renders untouched (primitive stories unaffected).
import * as React from 'react'
import type { Decorator } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, type AnyRoute } from '@tanstack/react-router'
import { getWorker } from 'msw-storybook-addon'

import { Container, ServicesProvider } from '@/services'
import testBindings from '@/services/registry/test'
import type { RouteParam, StoresParam } from './types'

const isGroup = (seg: string) => seg.startsWith('(') && seg.endsWith(')')

/** Build a memory router that reproduces `route.id`, mounting the story at the leaf so
 *  getRouteApi(id).useSearch() resolves. `(group)` → pathless layout route; other segments → path.
 *  The leaf keeps the trailing slash (index route), matching the file-route id shape. */
function buildRouter(route: RouteParam, Story: React.ComponentType) {
	const rootRoute = createRootRoute()
	const segments = route.id.split('/').filter(Boolean)
	const built: AnyRoute[] = []
	let parent: AnyRoute = rootRoute

	segments.forEach((seg, i) => {
		const isLast = i === segments.length - 1
		const captured = parent
		const config: Record<string, unknown> = { getParentRoute: () => captured }
		if (isGroup(seg)) config.id = seg
		else config.path = isLast ? `${seg}/` : seg
		if (isLast) {
			config.component = () => <Story />
			config.validateSearch = route.validateSearch ?? ((search: Record<string, unknown>) => ({ ...route.search, ...search }))
		}
		// createRoute's generics can't be satisfied by a dynamically-built config; the router is a
		// throwaway story harness, so the cast is contained here.
		// biome-ignore lint/suspicious/noExplicitAny: createRoute generics unsatisfiable with dynamic config
		const created = createRoute(config as any)
		built.push(created)
		parent = created
	})

	let subtree = built[built.length - 1]
	for (let i = built.length - 2; i >= 0; i--) subtree = built[i].addChildren([subtree])
	const routeTree = rootRoute.addChildren([subtree])

	// URL omits (group) segments — '/(app)/dashboard/' → '/dashboard'.
	const urlPath = `/${segments.filter(seg => !isGroup(seg)).join('/')}`
	return createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [urlPath || '/'] }) })
}

/** Set up the story's given store state before render — follows the backend's `given*` helper pattern.
 *  No app-global stores ship with the template (the Store-tenancy scope died with the owner-model
 *  collapse); a product re-adds its Zustand setState calls here, keyed by StoresParam. */
function givenStores(_stores: StoresParam | undefined) {
	// intentionally empty — see doc comment
}

/** Shared client for non-connected stories so any React Query hook (incl. forms' useMutation) has a
 *  provider and renders instead of throwing "No QueryClient set". Connected stories get their own. */
const fallbackQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false, throwOnError: false } } })

/** Build the DI Container a connected story mounts under `<ServicesProvider>`. F3 Wave 0 — before this,
 *  a connected story that composed anything reaching into client-side services (`useAnalytics`,
 *  `useSystemPreconditions`, …) had no Container in the tree and threw ("useService/useContainer used
 *  outside <ServicesProvider>"), which is why the fidelity pilot story had to fork onto a leaf
 *  component (`HomeDashboard`) instead of mounting the route's real composition (`HomeSection`). Uses
 *  `registry/test` — the SAME in-memory fakes the app's own test suites bind (`ServicesProvider.test.tsx`,
 *  `OnboardingFlow.stories.tsx`) — never `registry/tauri` (no host present in a browser/bun harness)
 *  and never `registry/browser` (that record's classes touch real browser APIs — geolocation-style
 *  side effects a story render shouldn't trigger). */
function buildTestContainer() {
	const container = new Container()
	container.load(testBindings)
	return container
}

export const withConnected: Decorator = (Story, context) => {
	const route = context.parameters.route as RouteParam | undefined
	const stores = context.parameters.stores as StoresParam | undefined
	const live = context.globals.dataSource === 'live'

	// Hook is called unconditionally (rules-of-hooks). Fresh per story (no cross-story cache bleed);
	// mirrors production defaults (src/router.tsx). Returns null when the story isn't connected.
	const [harness] = React.useState(() => {
		if (!route) return null
		// Live mode (toolbar `dataSource: live`): drop the story's MSW handlers so requests bypass to the
		// real backend (configured in preview.tsx from VITE_API_URL; MSW inits with onUnhandledRequest:'bypass').
		if (live) getWorker().resetHandlers()
		givenStores(stores)
		return {
			queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, throwOnError: false } } }),
			router: buildRouter(route, Story),
			container: buildTestContainer(),
		}
	})

	if (!harness)
		return (
			<QueryClientProvider client={fallbackQueryClient}>
				<Story />
			</QueryClientProvider>
		)

	return (
		<QueryClientProvider client={harness.queryClient}>
			<ServicesProvider container={harness.container}>
				<RouterProvider router={harness.router} />
			</ServicesProvider>
		</QueryClientProvider>
	)
}
