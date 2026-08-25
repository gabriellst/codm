# Storybook Connected-Stories Framework — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Let a story author showcase a real connected component (SDK hooks + URL/router/store/session wiring intact) with pure declarations, while mock responses are inferred from the SDK so `tsc` catches drift.

**Architecture:** A small framework under `packages/app/react/src/storybook/`: a typed `connected()` parameter builder + `DeepPartial` (types.ts), MSW handler builders keyed off SDK query/mutation options (mock.ts), and a global `withConnected` decorator that synthesizes a memory router from `parameters.route.id`, builds a fresh QueryClient, and applies `parameters.stores` to Zustand via `givenStores` (withConnected.tsx). MSW stays the transport, so the real ky client + zod parse remain in the request path. A `dataSource: mock | live` toolbar global lets connected stories run against the real backend (gated on `VITE_API_URL`; `live` resets MSW handlers so requests bypass). Verification is `bun tsc` (type-safety) + `bun run storybook:build` (rendering) — this workspace has no unit-test runner.

**Tech Stack:** TypeScript, Bun, TanStack Router/Query, MSW, Storybook 10 (react-vite), Zod, Tailwind

**Spec:** .specs/2026-06-04-storybook-connected-stories-framework-design.md
**Tasks:** 2
**Estimated minutes:** 110

---

## Task T1: A connected story declares its wiring + typed mocks (framework core)

**Files to write:**
- Create: `packages/app/react/src/storybook/types.ts`
- Create: `packages/app/react/src/storybook/mock.ts`
- Create: `packages/app/react/src/storybook/withConnected.tsx`
- Create: `packages/app/react/src/storybook/index.ts`
- Create: `packages/app/react/src/storybook/connected.typecheck.ts` — compile-smoke (positive type guard, tsc-included; NOT a `*.test.ts`, which the workspace tsconfig excludes from type-checking)
- Modify: `packages/app/react/.storybook/preview.tsx` — register `withConnected`; add the `dataSource: mock|live` toolbar global + gated `configureClient(VITE_API_URL)`

**Files to read:**
- `packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/AdditionalCostsSection.stories.tsx` — the hand-rolled pattern being formalized
- `packages/app/react/src/router.tsx` — production QueryClient defaults to mirror
- `packages/app/react/src/stores/useTenancyStore.ts` — the store `givenStores` applies `parameters.stores` to
- `packages/client/dist/typescript/src/typescript/hooks/useGetDashboard.ts` — query-options shape (`queryKey[0].url`, `queryFn` response type)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — these are Storybook tooling utilities, not `bun cli`-scaffoldable artifacts; PR-27 non-applicable)
**Depends on:** (none)

### Step T1.1 — Write the failing compile-smoke

This file is the automated type guard. There is NO test runner in this workspace and the react
`tsconfig.json` **excludes `*.test.ts`** from type-checking — so the guard must be a plain `.ts`
file (tsc includes it) full of valid calls. `bun x tsc` fails if the helpers don't exist (RED now),
and later fails if any SDK response/param shape drifts so a call stops type-checking (permanent
positive guard). No `@ts-expect-error` is shipped — the negative ("wrong shape is rejected") is a
one-time probe in Step T1.8. Create `packages/app/react/src/storybook/connected.typecheck.ts`:

```typescript
// packages/app/react/src/storybook/connected.typecheck.ts
// Compile-time smoke for the connected-stories helpers — NO runtime, NO test runner. `bun x tsc` is
// the check. This is intentionally NOT a *.test.ts (those are excluded from the workspace tsconfig),
// so tsc type-checks every call here; if an SDK response/param shape drifts, the build fails here.
import { createGoalMutationOptions, getDashboardQueryOptions } from '@template/client-typescript/typescript'

import { connected, errorQuery, loadingQuery, mockMutation, mockMutationError, mockQuery, mockSession } from '.'

// Exported so noUnusedLocals is satisfied; never imported by the app, so it tree-shakes out of builds.
export function connectedTypecheck() {
	const dashboard = getDashboardQueryOptions({ tenancyScope: 'SINGLE_STORE' })
	// AC-4: response type inferred from the SDK options; a DeepPartial of the real shape compiles, cast-free.
	void mockQuery(dashboard, { additionalCost: { refund: { value: { amountCents: 0, currency: 'BRL' }, deltaPct: null } } })
	void loadingQuery(dashboard)
	void errorQuery(dashboard, 400)

	const goal = createGoalMutationOptions()
	// AC-6: mutation url + response inferred; method is an explicit write verb.
	void mockMutation('post', goal, {})
	void mockMutationError('post', goal, 409)

	// AC-7: session typed off the app's own useSession.
	void mockSession(null)

	// AC-10: route is required; stores.tenancy is a typed TenancyScope.
	void connected({ route: { id: '/(app)/dashboard/' }, stores: { tenancy: 'MULTI_STORE' } })
}
```

### Step T1.2 — Run the compile-smoke to verify it fails

Run: `cd packages/app/react && bun x tsc --noEmit`
Expected: FAIL — `Cannot find module '.'` / `connected`, `mockQuery`, `mockMutation`, … not found (the framework files don't exist yet).

### Step T1.3 — Write the typed parameter contract

Create `packages/app/react/src/storybook/types.ts`:

```typescript
// packages/app/react/src/storybook/types.ts — typed contract for connected stories.
import type { RequestHandler } from 'msw'
import type { TenancyScope } from '@template/client-typescript/typescript'

/** How a connected story declares the TanStack route its component reads via getRouteApi(id). */
export interface RouteParam {
	/** The file-route id, e.g. '/(app)/dashboard/'. `(group)` segments become pathless layout routes. */
	id: string
	/** Static search defaults merged into the leaf's validateSearch (used when `validateSearch` is omitted). */
	search?: Record<string, unknown>
	/** Full search parser (e.g. the route's own zod schema). Takes precedence over `search`. */
	validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>
}

/** App-global Zustand state to set up for the story (applied before render via `givenStores`). */
export interface StoresParam {
	tenancy?: TenancyScope
}

/** The `parameters` block a connected story declares. The index signature keeps Storybook's own
 *  params (layout, msw, …) assignable while `route`/`stores` stay strongly typed. */
export interface ConnectedParameters {
	route: RouteParam
	stores?: StoresParam
	msw?: { handlers: RequestHandler[] }
	[key: string]: unknown
}

/** Typed builder for a connected story's `parameters` — gives autocomplete + tsc checking on route/stores.
 *  (Storybook's `Parameters` is an open `[k: string]: any`, so interface augmentation can't type these;
 *  this builder is how the type-safety is delivered.) */
export const connected = (params: ConnectedParameters): ConnectedParameters => params

/** Recursive Partial that also descends arrays — lets a mock supply only the fields a component reads
 *  while still type-checking the fields it does supply against the SDK response (no `as unknown as`). */
export type DeepPartial<T> = T extends ReadonlyArray<infer U>
	? ReadonlyArray<DeepPartial<U>>
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T
```

### Step T1.4 — Write the typed MSW mock helpers

Create `packages/app/react/src/storybook/mock.ts`:

```typescript
// packages/app/react/src/storybook/mock.ts — MSW handler builders keyed off SDK query/mutation options.
// The SDK options object carries BOTH the endpoint url (queryKey/mutationKey[0].url, a literal via
// `as const`) and the response type (queryFn/mutationFn), so one import yields url-matching + inference.
import { http, HttpResponse, delay } from 'msw'
import type { RequestHandler } from 'msw'
import type { QueryFunction } from '@tanstack/react-query'

import type { useSession } from '@/hooks'

import type { DeepPartial } from './types'

type QueryOptionsLike = { queryKey: readonly [{ url: string }, ...unknown[]]; queryFn?: QueryFunction<unknown> }
type MutationOptionsLike = { mutationKey: readonly [{ url: string }, ...unknown[]]; mutationFn?: (...args: never[]) => Promise<unknown> }
type MutationMethod = 'post' | 'put' | 'patch' | 'delete'

type QueryResp<O> = O extends { queryFn?: QueryFunction<infer R> } ? R : never
type MutationResp<O> = O extends { mutationFn?: (...args: never[]) => Promise<infer R> } ? R : never

const glob = (key: readonly [{ url: string }, ...unknown[]]) => `*${key[0].url}`

/** Mock a successful GET. `response` is a DeepPartial of the SDK response — type-checked, lean, cast-free. */
export function mockQuery<O extends QueryOptionsLike>(options: O, response: DeepPartial<QueryResp<O>>): RequestHandler {
	return http.get(glob(options.queryKey), () => HttpResponse.json(response))
}

/** Mock a never-resolving GET — drives the component's loading/skeleton state. */
export function loadingQuery(options: QueryOptionsLike): RequestHandler {
	return http.get(glob(options.queryKey), async () => {
		await delay('infinite')
		return HttpResponse.json(null)
	})
}

/** Mock a failed GET. Default 400 — a 4xx so ky fails fast (it retries 5xx). */
export function errorQuery(options: QueryOptionsLike, status = 400): RequestHandler {
	return http.get(glob(options.queryKey), () => new HttpResponse(null, { status }))
}

/** Mock a successful mutation. Method is explicit (it isn't in the SDK options); url + response inferred. */
export function mockMutation<O extends MutationOptionsLike>(method: MutationMethod, options: O, response: DeepPartial<MutationResp<O>>): RequestHandler {
	return http[method](glob(options.mutationKey), () => HttpResponse.json(response))
}

/** Mock a failed mutation (e.g. 409 ALREADY_EXISTS). */
export function mockMutationError(method: MutationMethod, options: MutationOptionsLike, status = 400): RequestHandler {
	return http[method](glob(options.mutationKey), () => new HttpResponse(null, { status }))
}

/** Mock the better-auth session endpoint so components calling useSession() get a fixed value.
 *  Typed off the app's own useSession so it stays in sync with the session shape. */
export function mockSession(session: ReturnType<typeof useSession>): RequestHandler {
	return http.get('*/v1/authentication/get-session', () => HttpResponse.json(session))
}
```

### Step T1.5 — Write the connected decorator

Create `packages/app/react/src/storybook/withConnected.tsx`:

```tsx
// packages/app/react/src/storybook/withConnected.tsx — global decorator. Activates only when
// `parameters.route` is present; otherwise the story renders untouched (primitive stories unaffected).
import * as React from 'react'
import type { Decorator } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, type AnyRoute } from '@tanstack/react-router'
import { getWorker } from 'msw-storybook-addon'

import { useTenancyStore } from '@/stores'

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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/** Set up the story's given store state before render — follows the backend's `given*` helper pattern. */
function givenStores(stores: StoresParam | undefined) {
	if (stores?.tenancy) useTenancyStore.setState({ tenancyScope: stores.tenancy })
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
		}
	})

	if (!harness) return <Story />

	return (
		<QueryClientProvider client={harness.queryClient}>
			<RouterProvider router={harness.router} />
		</QueryClientProvider>
	)
}
```

### Step T1.6 — Write the barrel

Create `packages/app/react/src/storybook/index.ts`:

```typescript
// packages/app/react/src/storybook/index.ts — public surface for connected stories (import from '@/storybook').
export { connected } from './types'
export type { ConnectedParameters, DeepPartial, RouteParam, StoresParam } from './types'
export { errorQuery, loadingQuery, mockMutation, mockMutationError, mockQuery, mockSession } from './mock'
export { withConnected } from './withConnected'
```

### Step T1.7 — Register the decorator in preview

Modify `packages/app/react/.storybook/preview.tsx` — add `withConnected` as the innermost (last) decorator so the story renders inside the theme wrapper AND the router. Proposed file (complete):

```tsx
// packages/app/react/.storybook/preview.tsx — COMPLETE final file.
import React from 'react'
import type { Preview } from '@storybook/react'
import { configureClient } from '@template/client-typescript/http'
import { initialize, mswLoader } from 'msw-storybook-addon'
import i18n from '../src/lib/i18n'
import { withConnected } from '../src/storybook'
import '../src/index.css'

// Live mode: point the SDK client at a real backend, but ONLY when VITE_API_URL is set. The story
// harness never runs the app's router.tsx (where configureClient normally happens), so without this
// the client is unconfigured and resolveURL returns paths relative to the Storybook origin (:6006) —
// which is the correct default for mock-driven stories. Mocked stories still intercept regardless.
const apiUrl = import.meta.env.VITE_API_URL
if (apiUrl) configureClient({ typescript: apiUrl, go: apiUrl, rust: apiUrl })

// Start the MSW worker once for all stories. Unhandled requests pass through so non-mocked
// stories are unaffected; stories opt into network mocking via `parameters.msw.handlers`.
initialize({ onUnhandledRequest: 'bypass' })

const preview: Preview = {
	// Theme + locale toggles in toolbar
	globalTypes: {
		theme: {
			description: 'Global theme for components',
			toolbar: {
				title: 'Theme',
				icon: 'circlehollow',
				items: [
					{ value: 'light', icon: 'sun', title: 'Light' },
					{ value: 'dark', icon: 'moon', title: 'Dark' },
				],
				dynamicTitle: true,
			},
		},
		locale: {
			description: 'Active language (i18n)',
			toolbar: {
				title: 'Locale',
				icon: 'globe',
				items: [
					{ value: 'pt', title: 'Português' },
					{ value: 'en', title: 'English' },
				],
				dynamicTitle: true,
			},
		},
		dataSource: {
			description: 'Mocked responses (default) vs the real backend (needs VITE_API_URL + bun dev:api + auth)',
			toolbar: {
				title: 'Data',
				icon: 'database',
				items: [
					{ value: 'mock', title: 'Mock' },
					{ value: 'live', title: 'Live' },
				],
				dynamicTitle: true,
			},
		},
	},

	initialGlobals: {
		theme: 'light',
		locale: 'pt',
		dataSource: 'mock',
	},

	// Global wrappers for all stories. Order matters: theme/i18n is outermost; withConnected is
	// innermost so a connected story renders inside the theme div AND its synthesized router.
	decorators: [
		(Story, context) => {
			const theme = context.globals.theme
			const locale = context.globals.locale as string
			React.useEffect(() => {
				if (locale && i18n.language !== locale) i18n.changeLanguage(locale)
			}, [locale])
			return (
				<div className={theme === 'dark' ? 'dark' : ''}>
					<div className="bg-background min-h-screen p-6">
						<Story />
					</div>
				</div>
			)
		},
		withConnected,
	],

	loaders: [mswLoader],

	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		backgrounds: { disable: true },
	},
}

export default preview
```

### Step T1.8 — Type-check passes, then probe the negative

Run: `cd packages/app/react && bun x tsc --noEmit`
Expected: PASS — 0 errors. The framework resolves and every call in `connected.typecheck.ts` type-checks (positive guard for AC-4, AC-6, AC-7, AC-10).

Then probe the negative once (proves a bad shape is rejected, without shipping broken code): temporarily change `refund: { value: { amountCents: 0, currency: 'BRL' }, deltaPct: null }` to `refund: 'nope'` in `connected.typecheck.ts` and re-run `bun x tsc --noEmit`.
Expected: FAIL — string is not assignable to the `refund` MoneyMetric (the DeepPartial response type is enforced; there is no cast escape hatch). **Revert the edit** before continuing.

### Step T1.9 — Verify Storybook still builds (no regressions)

Run: `cd packages/app/react && bun run storybook:build`
Expected: build succeeds — the new decorator is inert for all existing stories (none set `parameters.route` yet).

### Step T1.10 — Lint

Run: `cd packages/app/react && bun lint`
Expected: 0 errors.

### Step T1.11 — Commit

```bash
git add packages/app/react/src/storybook/ packages/app/react/.storybook/preview.tsx
git commit -m "feat(app): typed Storybook framework for connected stories (Task T1)"
```

---

## Task T2: The dashboard AdditionalCosts story renders through the framework

**Files to write:**
- Modify: `packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/AdditionalCostsSection.stories.tsx` — migrate all six states onto the framework; delete `buildRouter`/`StoryCard` and every `as unknown as` cast

**Files to read:**
- `packages/app/react/src/routes/(app)/dashboard/index.tsx` — `dashboardSearchSchema` (the route's search parser)
- `packages/app/react/src/storybook/index.ts` — the framework surface authored in T1

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — editing an existing story file)
**Depends on:** T1

### Step T2.1 — Migrate the story onto the framework

Rewrite the story so wiring is declarative: meta declares `parameters: connected({ route })`; each story declares only its `msw.handlers` (and `stores` where the scope differs). Mock builders stay inline in the file (colocated), but drop the `as unknown as GetDashboardQueryResponse` casts — `mockQuery` accepts a `DeepPartial`, so the builders are now type-checked against the SDK response. Proposed file (complete):

```tsx
// packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/AdditionalCostsSection.stories.tsx
// COMPLETE final file — migrated onto the connected-stories framework (@/storybook).
import type { Meta, StoryObj } from '@storybook/react'
import { getDashboardQueryOptions } from '@template/client-typescript/typescript'
import type { GetDashboardQueryResponse } from '@template/client-typescript/typescript'

import { connected, errorQuery, loadingQuery, mockQuery } from '@/storybook'

import { dashboardSearchSchema } from '../../index'
import { AdditionalCostsSection } from '.'

// ---------------------------------------------------------------------------
// Mock GetDashboard responses (colocated, inline). Only the `additionalCost` paths the card reads
// are populated; mockQuery accepts a DeepPartial of GetDashboardQueryResponse, so these are
// type-checked against the SDK shape WITHOUT casts. Every money leaf is a MoneyMetric whose `value`
// is a Money { amountCents, currency } (single, already-converted currency, spec D1); counts stay
// plain NumberMetric.
// ---------------------------------------------------------------------------
const cents = (major: number) => Math.round(major * 100)
const money = (major: number, currency = 'BRL') => ({ value: { amountCents: cents(major), currency }, deltaPct: null })
const num = (value: number) => ({ value, deltaPct: null })

const operationalItems = [
	{ id: '1', name: '123', flow: 'EXPENSE', frequency: 'ONCE', amountCents: 1000, currency: 'BRL', startDate: '2026-06-01T00:00:00Z', endDate: null },
	{ id: '2', name: 'Servidor', flow: 'EXPENSE', frequency: 'MONTHLY', amountCents: 12000, currency: 'BRL', startDate: '2026-06-01T00:00:00Z', endDate: null },
]

function singleAdditionalCost(v: number, items: typeof operationalItems = []) {
	return {
		chargeback: {
			byStatus: {
				total: money(v * 3),
				segments: { OPEN: money(v), UNDER_REVIEW: money(0), WON: money(v), LOST: money(v), ACCEPTED: money(0) },
			},
			fees: money(v),
		},
		refund: money(v),
		taxes: { ads: money(v), others: money(v) },
		operational: { total: money(v * 2), items },
		warranty: money(v),
	}
}

// DeepPartial of GetDashboardQueryResponse — branch chosen by `kind`. No casts: tsc checks every leaf.
function singleResponse(v: number, items: typeof operationalItems = []) {
	return {
		kind: 'SINGLE_GLOBAL',
		tenancyScope: 'SINGLE_STORE',
		dashboardMode: 'GLOBAL',
		store: { id: 'store-1', currency: 'BRL' },
		additionalCost: singleAdditionalCost(v, items),
	} satisfies DashboardMock
}

function nationalResponse(v: number, items: typeof operationalItems = []) {
	return {
		kind: 'SINGLE_NATIONAL',
		tenancyScope: 'SINGLE_STORE',
		dashboardMode: 'NATIONAL',
		store: { id: 'store-1', currency: 'BRL' },
		additionalCost: { ...singleAdditionalCost(v, items), draftOrders: { count: num(7), value: money(350) } },
	} satisfies DashboardMock
}

function multiResponse() {
	// Multi-store consolidated: money already converted to a single reporting currency (spec D1).
	const a = money(120)
	return {
		kind: 'MULTI_GLOBAL',
		tenancyScope: 'MULTI_STORE',
		dashboardMode: 'GLOBAL',
		additionalCost: {
			chargeback: { byStatus: { total: money(360), segments: { OPEN: a, UNDER_REVIEW: a, WON: a, LOST: a, ACCEPTED: a } }, fees: a },
			refund: a,
			taxes: { ads: a, others: a },
			operational: { total: money(240), items: [] },
			warranty: a,
		},
	} satisfies DashboardMock
}

// DeepPartial alias keeps the builders honest against the SDK response without forcing full payloads.
type DashboardMock = import('@/storybook').DeepPartial<GetDashboardQueryResponse>

// The query options give mockQuery both the endpoint url and the response type (params value is
// irrelevant to url-path matching).
const dashboardOptions = getDashboardQueryOptions({ tenancyScope: 'SINGLE_STORE' })

const meta: Meta<typeof AdditionalCostsSection> = {
	title: 'Dashboard/AdditionalCostsCard',
	component: AdditionalCostsSection,
	parameters: connected({
		layout: 'centered',
		route: { id: '/(app)/dashboard/', validateSearch: search => dashboardSearchSchema.parse(search ?? {}) },
	}),
	decorators: [
		Story => (
			<div className="w-[420px]">
				<Story />
			</div>
		),
	],
}
export default meta
type Story = StoryObj<typeof AdditionalCostsSection>

/** Populated single-store costs — hover a row for its breakdown; operational has a titled tooltip. */
export const Default: Story = {
	parameters: { msw: { handlers: [mockQuery(dashboardOptions, singleResponse(150.5, operationalItems))] } },
}

/** All-zero period — mirrors the reference mockup ("R$ 0,00"). */
export const Zeroed: Story = {
	parameters: { msw: { handlers: [mockQuery(dashboardOptions, singleResponse(0))] } },
}

/** National mode — adds the `draftOrders` row; operational tooltip shows `name (1x)` + amount. */
export const National: Story = {
	parameters: { msw: { handlers: [mockQuery(dashboardOptions, nationalResponse(150.5, operationalItems))] } },
}

/** Consolidated (multi-store) — same rows; money already converted to a single reporting currency. */
export const Consolidated: Story = {
	parameters: {
		stores: { tenancy: 'MULTI_STORE' },
		msw: { handlers: [mockQuery(dashboardOptions, multiResponse())] },
	},
}

/** Pending query — header value + rows show skeletons. */
export const Loading: Story = {
	parameters: { msw: { handlers: [loadingQuery(dashboardOptions)] } },
}

/** Request fails (400 → no ky retry) — inline error message. */
export const ErrorState: Story = {
	parameters: { msw: { handlers: [errorQuery(dashboardOptions, 400)] } },
}
```

### Step T2.2 — Type-check (proves casts are gone + mocks match the SDK)

Run: `cd packages/app/react && bun x tsc --noEmit`
Expected: PASS — 0 errors. If a mock builder leaf mismatches the SDK response shape, `tsc` errors here (that is the type-safety working — fix the offending leaf, do not re-add a cast).

### Step T2.3 — Build Storybook (proves all six states render through the framework)

Run: `cd packages/app/react && bun run storybook:build`
Expected: build succeeds; the `Dashboard/AdditionalCostsCard` stories (Default, Zeroed, National, Consolidated, Loading, ErrorState) compile and render-construct via the synthesized router + MSW.

### Step T2.4 — Lint

Run: `cd packages/app/react && bun lint`
Expected: 0 errors.

### Step T2.5 — Commit

```bash
git add "packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/AdditionalCostsSection.stories.tsx"
git commit -m "refactor(app): migrate AdditionalCosts story to connected-stories framework (Task T2)"
```

---

## Final Validation

- [ ] `cd packages/app/react && bun x tsc --noEmit` — type check clean (covers the type-safety ACs via the `connected.typecheck.ts` compile-smoke + the cast-free story)
- [ ] `cd packages/app/react && bun lint` — lint clean
- [ ] `cd packages/app/react && bun run storybook:build` — Storybook builds (covers the rendering ACs)
- [ ] AC mapping (every spec AC → ≥1 verification path):
  - AC-1 (decorator inert without `parameters.route`) → `storybook:build` green in `T1.9` with all pre-existing stories untouched
  - AC-2 (router synthesized from id, story mounted at leaf) → `T2.3` `storybook:build` renders `Dashboard/AdditionalCostsCard` (the section calls `getRouteApi('/(app)/dashboard/').useSearch()`)
  - AC-3 (search defaults via `validateSearch`) → `T2.3`, meta `route.validateSearch: dashboardSearchSchema.parse`
  - AC-4 (`mockQuery` response type-checked, no cast) → `connected.typecheck.ts` compile-smoke (positive) + `T1.8` negative probe (wrong leaf → tsc fails) + `T2.2` cast-free `tsc` on the real story
  - AC-5 (`loadingQuery`/`errorQuery`) → `T2.3` Loading + ErrorState stories
  - AC-6 (`mockMutation` typed, explicit method) → `connected.typecheck.ts` (`mockMutation('post', goal, {})` + `mockMutationError`) type-checked by `T1.8`
  - AC-7 (`mockSession` on get-session endpoint) → `mock.ts:mockSession` typed off `ReturnType<typeof useSession>`; compiled by `T1.8` `tsc`
  - AC-8 (`parameters.stores` applies Zustand state) → `T2.3` Consolidated story sets `stores.tenancy: 'MULTI_STORE'`; `withConnected.givenStores`
  - AC-9 (fresh QueryClient per story, no bleed) → `withConnected` `React.useState` factory creates one per story
  - AC-10 (typed `route`/`stores`) → `connected.typecheck.ts` `connected({ route, stores })` type-checked by `T1.8`; `T1.8` negative probe confirms an invalid value fails tsc
  - AC-11 (story migrated, casts dropped, six states render) → `T2.1` rewrite + `T2.2`/`T2.3`
  - AC-12 (`storybook:build` + `tsc` pass) → Final Validation rows 1 & 3
  - AC-13 (`dataSource` toolbar + live-mode handler reset + gated `configureClient`) → `T1.7` preview (`globalTypes.dataSource`, gated `configureClient`) + `withConnected` (`getWorker().resetHandlers()` when `live`); compiled by `T1.9` `storybook:build`. Live request itself is the manual smoke in Notes.
  - AC-14 (defaults unchanged: `VITE_API_URL` unset + `dataSource: mock`) → `T1.9`/`T2.3` `storybook:build` runs mock-only (no `configureClient`, handlers intercept); `initialGlobals.dataSource: 'mock'`

## Notes

- **No unit-test runner in `packages/app/react`** (no `test` script, no vitest/@storybook/test) AND the workspace `tsconfig.json` excludes `*.test.ts`/`*.test.tsx` from type-checking. Per spec AC-12 the gates are `bun x tsc --noEmit` and `bun run storybook:build`. The type-safety ACs are guarded by `connected.typecheck.ts` — a plain (non-`.test`) compile-smoke that tsc DOES include, full of valid calls — plus the cast-free real story; the one-time negative ("wrong shape fails tsc") is the probe in Step T1.8. No `@ts-expect-error` is shipped (it would be unverified here anyway, since tsc skips `.test` files and `bun test` strips types). Adding a test runner is out of scope.
- **No new dependencies.** `msw`, `msw-storybook-addon`, `@storybook/react(-vite)`, `@tanstack/react-query`, `@tanstack/react-router` are already devDeps/deps of the workspace.
- **No SDK regen / Contract Lock.** This plan touches no controller or schema — frontend-only. `getDashboardQueryOptions` / `createGoalMutationOptions` already exist in `@template/client-typescript`.
- **Live backend mode (AC-13/14).** Flip the `Data` toolbar to `Live` and launch Storybook with the backend reachable: `bun dev:api` then `VITE_API_URL=http://localhost:3030 bun storybook` (from `packages/app/react`). In `live`, `withConnected` resets MSW handlers so each connected story's request hits `:3030`. Default (`Mock`, no env var) is unchanged. **Auth reuses your existing app session — no login code in Storybook:** the SDK ky client already sends `credentials: 'include'` (`packages/client/dist/typescript/src/http/client.ts:151`), the better-auth session cookie is host-scoped to `localhost` (shared across ports), and `:6006 → :3030` is same-site so the `SameSite=Lax` cookie is sent. So: log into the app once in the same browser, then flip to `Live`. **Backend prerequisite, out of scope:** the API's CORS must allow `http://localhost:6006` with `Access-Control-Allow-Credentials: true` (exact origin, not `*`); if you aren't logged in, `live` requests 401 (expected). The live request is a **manual smoke** (needs a running backend + an app session); `bun tsc`/`storybook:build` only prove the wiring compiles. `.storybook/preview.tsx` is not in the `tsc` `include` (`["src"]`), so its types are checked by the Storybook (vite/esbuild) build, not `bun x tsc`.
- **No `bun cli` scaffold steps.** None of these files (Storybook decorator, MSW helpers, type contract, a `.stories.tsx` edit) are scaffoldable verbs (`bun cli` covers route/component/store/form/primitive only) — PR-27 is non-applicable.
- **Design refinements vs the spec wording**, all faithful to the ACs: (1) session is the `mockSession` helper, not a `parameters.session` consumed by the decorator, because the MSW addon registers handlers from `parameters.msw.handlers` before decorators run — and AC-7 already describes the helper form; (2) type-safety for `route`/`stores` is delivered by the `connected()` builder rather than interface augmentation, because Storybook's `Parameters` is an open `[k: string]: any` that augmentation can't tighten; (3) `mockQuery`/`mockMutation` take a `DeepPartial` of the SDK response so lean mocks stay cast-free (AC-4 + AC-11). The `Parameters` augmentation mentioned in spec Decision 10 is therefore intentionally not implemented; `connected()` supersedes it.
