# Storybook Connected-Stories Framework — Design Spec

**Date:** 2026-06-04
**Status:** Draft
**Bounded Context:** frontend tooling — `packages/app/react` (Storybook)
**Kind:** chore (developer tooling)
**Story Points:** 5 — frontend-only, single workspace, no migration; but one global decorator + 5 typed mock helpers + Storybook `Parameters` type-augmentation + restructuring an existing connected story. Riskiest piece is `mockSession` (better-auth `useSession` cache under MSW).

## Context

`packages/app/react` already runs Storybook 9 (`@storybook/react-vite`) with MSW wired for network-mocked stories: `msw` + `msw-storybook-addon` are devDeps, `public/mockServiceWorker.js` is committed, `.storybook/main.ts` serves it via `staticDirs: ['../public']`, and `.storybook/preview.tsx` calls `initialize({ onUnhandledRequest: 'bypass' })` + `loaders: [mswLoader]`, plus theme/locale toolbar globals and an i18n decorator.

The one existing connected-component story — `src/routes/(app)/dashboard/-components/AdditionalCostsSection/AdditionalCostsSection.stories.tsx` — proves the pattern works but does it entirely by hand (~80 lines of plumbing per file): it hand-builds a stub memory router that reconstructs the file-route id `/(app)/dashboard/` (pathless `(app)` parent + `dashboard/` child) so `getRouteApi('/(app)/dashboard/').useSearch()` resolves; spins up a `QueryClient` with `retry:false`; sets the app-global tenancy store inline via `useTenancyStore.setState`; and writes raw MSW handlers (`http.get('*/v1/ui/dashboard', …)`) whose responses are cast with `as unknown as GetDashboardQueryResponse`.

The SDK (`@template/client-typescript`) gives us everything needed to remove that boilerplate type-safely. Each query hook file (e.g. `getDashboardQueryOptions` in the generated hooks) exports a `getXQueryOptions(params)` object that carries **both** the endpoint URL (`.queryKey[0].url === '/v1/ui/dashboard'`) and the response type (`queryOptions<GetDashboardQueryResponse, …>`). The real router (`src/router.tsx`) defines the production `QueryClient` shape (`retry:false`, `throwOnError:false`, `QueryCache.onError → handleApiError`) and `basepath:'/app'`. Session is read through `src/hooks/useSession.ts` → `auth.useSession()` (better-auth, `src/lib/auth.ts`), which fetches `…/v1/authentication/get-session` — so session can be mocked on the same MSW transport as everything else. App-global stores live in `src/stores/` (`useTenancyStore`, barrel `src/stores/index.ts`).

This is frontend-only tooling; no backend, contract, or migration is touched.

## Problem

1. Standing up a connected-component story today means re-deriving the same ~80 lines per file: a route-id-reconstructing stub router, a `QueryClient`, inline store mutation, and hand-written MSW globs. Every new connected story re-discovers this shape.
2. Mock responses are cast (`as unknown as GetDashboardQueryResponse`) instead of type-checked, so a drifted SDK response shape is not caught by `tsc` in stories.
3. There is no first-class, discoverable way to express the common states (loading, error, empty), mutations (forms/actions), global-store preconditions, or an authenticated session — each story re-invents them with raw MSW + `delay`/status codes.

## Goal

A story author can showcase the **real connected component** (its SDK hooks + URL/router/store/session wiring intact — never a presentational-only refactor) by writing pure declarations: a `parameters.route` block plus typed mock helpers in `parameters.msw.handlers`. The framework synthesizes the router, QueryClient, store seeding, and providers; mock responses are inferred from the SDK so `tsc` catches drift; and loading/error/empty/mutation/session states each have a one-call helper. The transport stays MSW, so the real ky client and zod parse remain in the request path.

## Decisions

1. **Transport is MSW (network-level), not QueryClient cache seeding.** All mocks resolve as MSW handlers so the real ky client + zod parse stay in the path and loading/error timing is realistic. Cache-seeding (`setQueryData`) is explicitly rejected.
2. **Authoring is declarative via `parameters` + a single global decorator** (`withConnected`), not an imperative render factory or meta-builder. Stories carry data, not JSX plumbing.
3. **The decorator is inert unless `parameters.route` is present**, so existing primitive/dumb-component stories (the 35 under `components/ui/stories/`) are unaffected.
4. **Mock helpers key off the SDK's `getXQueryOptions(params)` / `getXMutationOptions()` object.** Queries: URL comes from `.queryKey[0].url` (a literal via `as const`) and the response type is inferred from the options' `queryFn`/`DataTag` generic — one SDK import yields both URL-matching and full type safety. The response arg uses `NoInfer` so a mismatch fails `tsc` (eliminates `as unknown as` casts). Mutations: URL (`.mutationKey[0].url`), request body, and response type are all inferred from the options' `mutationFn`, **but the HTTP method is not present in the SDK options object** (it lives in the generated client fn). The author therefore passes the method as one explicit literal — `mockMutation('post', getXMutationOptions(), resp)` — keeping URL/body/response inferred. (`http.all` is the fallback only where a method literal is undesirable.)
5. **The stub router is synthesized from `parameters.route.id`**: segments split on `/`, `(group)` segments become pathless `id:` routes, the rest become `path:` routes, and the story's `context.component` (wrapped `() => <Story/>`) mounts at the leaf. Search defaults come from `parameters.route.search` and/or `parameters.route.validateSearch`.
6. **A fresh `QueryClient` is created per story** mirroring production defaults (`retry:false`, `throwOnError:false`) to prevent cross-story cache bleed.
7. **Provider nesting mirrors production**: `QueryClientProvider > RouterProvider`.
8. **Global-store preconditions are declared via `parameters.stores`** (e.g. `{ tenancy: 'MULTI_STORE' }`), seeded by the decorator before render — replacing inline `setState` in story bodies.
9. **Session is mocked via `parameters.session`** → an MSW handler on the better-auth get-session endpoint (`mockSession`), consistent with the MSW transport; no separate auth provider stub.
10. **Storybook's `Parameters` type is module-augmented** so `route`/`stores`/`session` are typed and `tsc`-checked.
11. **Typed helpers live in `src/` (importable as `@/storybook`)**, the decorator + preview wiring live in `.storybook/`. (Exact folder name confirmable at plan time; default `src/storybook/`.)
12. **The existing `AdditionalCostsSection.stories.tsx` is migrated onto the framework** as the regression proof; verification is headless via `bun run storybook:build`.
13. **Stories can run against the real backend instead of mocks, opt-in.** The SDK client is configured in `.storybook/preview.tsx` from `VITE_API_URL` — gated, so when the env var is unset the client stays unconfigured (requests resolve relative to the Storybook origin) and Storybook is mock-only by default. A Storybook toolbar global `dataSource: mock | live` (default `mock`) flips connected stories: in `live`, `withConnected` resets the MSW worker handlers (`getWorker().resetHandlers()`) so each request bypasses to the configured backend (MSW already initializes with `onUnhandledRequest: 'bypass'`); in `mock`, the story's `parameters.msw.handlers` serve the response. **No login UI is built in Storybook.** Authenticated `live` requests reuse the existing browser session cookie: the SDK ky client already sends `credentials: 'include'`, the better-auth session cookie is host-scoped to `localhost` (shared across ports), and `:6006 → :3030` is same-site so the default `SameSite=Lax` cookie is sent. The only **backend prerequisite, out of scope** is CORS: the API must allow `http://localhost:6006` with `Access-Control-Allow-Credentials: true` (an exact origin, not `*`). If the user isn't logged into the app, `live` requests 401 — expected.

## User Stories

- **Story 1:** As a frontend developer, I want to story a data-fetching Section by declaring its route + a typed query mock, so that I don't re-write the router/QueryClient/MSW plumbing each time.
  - Given a Section that calls `useGetDashboard` and reads `getRouteApi('/(app)/dashboard/').useSearch()`, when I set `parameters.route = { id: '/(app)/dashboard/' }` and `parameters.msw.handlers = [mockQuery(getDashboardQueryOptions(params), resp)]`, then the component renders with the mocked data and no hand-written router/provider code.
  - Given I pass a response whose shape doesn't match the SDK type, when I run `tsc`, then it fails at the `mockQuery` call (no cast escape hatch).

- **Story 2:** As a frontend developer, I want one-call helpers for loading and error states, so that I can show every state of a connected component declaratively.
  - Given `parameters.msw.handlers = [loadingQuery(getDashboardQueryOptions(params))]`, when the story renders, then the component shows its loading/skeleton state (request never resolves).
  - Given `errorQuery(getDashboardQueryOptions(params), 400)`, when the story renders, then the component shows its error state and ky does not retry (4xx).

- **Story 3:** As a frontend developer, I want to story a connected form/action, so that write-side components are covered.
  - Given `mockMutation(...)` with a success response, when the story's submit runs, then the success path renders.
  - Given `mockMutation(...)` with an error (e.g. 409 `ALREADY_EXISTS`), when submit runs, then the error path renders.

- **Story 4:** As a frontend developer, I want to declare store + session preconditions in parameters, so that components depending on tenancy scope or the current user render correctly without inline `setState`.
  - Given `parameters.stores = { tenancy: 'MULTI_STORE' }`, when the story renders, then the component reads `MULTI_STORE` from `useTenancyStore`.
  - Given `parameters.session = { user: {...} }`, when a component calls `useSession()`, then it receives the mocked session.

- **Story 5:** As a frontend developer maintaining primitive stories, I want the new decorator to be inert for non-connected stories, so that the 35 existing `components/ui/stories/*` are unaffected.
  - Given a story with no `parameters.route`, when it renders, then no router/QueryClient is injected and behavior is unchanged.

## Acceptance Criteria

- [ ] AC-1: A global `withConnected` decorator activates only when `parameters.route` is present; stories without it render exactly as before.
- [ ] AC-2: Given `parameters.route.id`, the decorator synthesizes a memory router that reproduces that route id (incl. `(group)` pathless segments) and mounts the story's component at the leaf, so `getRouteApi(id).useSearch()` resolves.
- [ ] AC-3: `parameters.route.search` and/or `parameters.route.validateSearch` provide the leaf's search defaults; a component reading `useSearch()` receives them.
- [ ] AC-4: `mockQuery(getXQueryOptions(params), response)` derives the URL from the options' query key and returns an MSW handler; `response` is type-checked against the SDK response type via `NoInfer` (a mismatched or typo'd field fails `tsc` — no cast escape hatch).
- [ ] AC-5: `loadingQuery(...)` produces a never-resolving handler (loading state) and `errorQuery(..., status=400)` produces a 4xx handler (error state, no ky retry).
- [ ] AC-6: `mockMutation(method, getXMutationOptions(), response)` returns an MSW handler whose URL/request-body/response types are inferred from the SDK options and whose method is the explicit literal arg; supports both success and error variants.
- [ ] AC-7: `mockSession(user | null)` returns an MSW handler on the better-auth get-session endpoint; a component calling `useSession()` receives the mocked value.
- [ ] AC-8: `parameters.stores` seeds the named app-global Zustand store(s) before render (verified via `useTenancyStore`).
- [ ] AC-9: A fresh `QueryClient` (`retry:false`) is created per story; data from one story does not leak into another.
- [ ] AC-10: Storybook `Parameters` is augmented so `route`, `stores`, and `session` are typed; an invalid key/value fails `tsc`.
- [ ] AC-11: `AdditionalCostsSection.stories.tsx` is migrated onto the framework, drops its `as unknown as` casts and hand-rolled `buildRouter`/`StoryCard`, and still renders the same states (Default, Zeroed, National, Consolidated, Loading, ErrorState).
- [ ] AC-12: `bun run storybook:build` succeeds and `bun tsc` passes for the react workspace.
- [ ] AC-13: A `dataSource: mock | live` toolbar global exists (default `mock`); in `live`, `withConnected` calls `getWorker().resetHandlers()` so a connected story's requests bypass MSW to the configured backend. `.storybook/preview.tsx` calls `configureClient` only when `VITE_API_URL` is set. (Verified by `storybook:build` + code; the actual live request is a documented manual smoke, since it needs a running backend + auth.)
- [ ] AC-14: With `VITE_API_URL` unset and `dataSource: mock` (the defaults), behavior is unchanged from AC-1..AC-12 — Storybook is fully mock-driven and no real network call is made.

## Risks & Migration

- **better-auth `useSession` under MSW (AC-7).** `auth.useSession()` caches via better-auth's internal nanostore; mocking the get-session endpoint may need a cache reset or specific response envelope. This is the one piece with unknown-unknowns — if a clean MSW mock proves infeasible, fall back to seeding better-auth's store directly and note it in the plan.
- **Route-id synthesis (AC-2).** Reproducing arbitrary file-route ids (nested layouts, multiple `(group)` segments, dynamic `$param` segments) generically is the core of the decorator. Initial scope targets the id shapes the codebase actually uses (pathless groups + static path segments, as in `/(app)/dashboard/`); `$param` segments are supported only if a storied component needs them.
- **No backwards-compat concern** — additive tooling; the only existing connected story is migrated in the same change.

## Open Questions

- Final home for the importable helpers: `src/storybook/` (default) vs `src/test-utils/` — cosmetic, resolve at plan time.
- Whether to wire `handleApiError` into the story `QueryClient` so error stories also surface the production toast (fidelity) or keep error rendering purely in-component. Default: keep in-component; opt-in later.
