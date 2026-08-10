---
name: storybook
description: Write and review ALL React frontend tests — Storybook stories (dumb args vs connected typed SDK mocks), colocated behavior tests (hooks, gates, pure modules), and the integration harness they run behavior against. Use when adding/reviewing any `*.stories.tsx` or `packages/app/react/**/*.test.{ts,tsx}`. Covers mockQuery/loadingQuery/errorQuery/mockMutation/mockSession, parameters.route/stores wiring, mocks colocation, the mock|live data toggle, composeStories + play in bun test, mountRouter, the two architecture rails, and tsc + storybook:build + bun test verification.
---

> **BEFORE WRITING A STORY OR A TEST**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional before writing
> 2. **`bad_practices`** — keep these violations in mind

# Frontend Testing — Stories, Colocated Tests, and the Integration Harness

Story the component **as it really is** — never refactor a data-owning component into a
presentational one just to story it. The framework (`@/storybook` + `.storybook/`) lets a connected
component keep its SDK hooks, route reads, stores, and session intact.

## Scope — this skill owns every frontend test

This skill is not "the stories skill" — it is **the frontend-testing skill**. It covers stories
(visual + `play` behavior), colocated tests (hooks, gates, pure modules — anything without a
screen), the integration harness those two batteries run behavior against, and the architecture
rails that make the wrong shape impossible to land. `packages/app/react/**/*.test.{ts,tsx}` is
classified in `.claude/registry.yaml` pointing here.

**The boundary rule — three places, one rule, no per-case judgment:**

| The unit under test... | Lives in |
|---|---|
| Has a screen (renders JSX, has variants, has a UI-visible behavior) | **Story**, `play` for behavior |
| Is an absence or a decision with no screen (hook, gate, pure module, port) | **Colocated test** |
| Crosses the stack with a real browser and real processes | **e2e** |

Never write a `.test.tsx` sibling for a component that has a story — that's the story's job (see
"Story-as-fixture" below). Never story a hook, a gate, or a pure function that renders nothing.

## Core decision — dumb vs connected

| Component kind | How to story | Tools |
|---|---|---|
| **Dumb / presentational** — all data via props, no hooks | `StoryObj` with `args` | plain Storybook; no providers, no MSW |
| **Connected** — owns data: SDK query/mutation hooks, `getRouteApi(id).useSearch()`, Zustand, `useSession()` | story the real component; declare wiring + typed mocks | `parameters.route`(+`search`) / `parameters.stores` + `mockQuery` / `loadingQuery` / `errorQuery` / `mockMutation` / `mockSession` |

If a component takes its data through props, it's dumb — pass `args`. If it reaches for data itself
(hooks, route, store, session), it's connected — use the framework. Don't add MSW/providers to a dumb
story, and don't strip the data layer from a connected one.

## Dumb component — `args`

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { StatusBadge } from '.'

const meta = { title: 'UI/StatusBadge', component: StatusBadge } satisfies Meta<typeof StatusBadge>
export default meta
type Story = StoryObj<typeof meta>

export const Confirmed: Story = { args: { status: 'CONFIRMED' } }
export const Pending: Story = { args: { status: 'PENDING' } }
```

## Connected component — the framework

The component keeps its real hooks. The global `withConnected` decorator (`.storybook/preview.tsx`)
activates on `parameters.route`: it synthesizes a memory router that reproduces the route id (so
`getRouteApi(id).useSearch()` resolves), builds a fresh per-story QueryClient, and seeds Zustand from
`parameters.stores`. Typed helpers from `@/storybook` build the MSW handlers, keyed off the SDK's
`getXQueryOptions(params)` — one import yields both the endpoint URL and the response type, so mocks
are `DeepPartial`-checked against the SDK (no casts).

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { getUsageQueryOptions, QuotasKeyEnum } from '@codm/client-typescript/typescript'
import type { GetUsageQueryResponse } from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { connected, errorQuery, loadingQuery, mockQuery } from '@/storybook'
import { UsageSummarySection } from '.'

// Mock builders colocated inline (single-consumer story). DeepPartial keeps them lean + type-checked.
const opts = getUsageQueryOptions()
const usage = (used: number): DeepPartial<GetUsageQueryResponse> => ({ quotas: [{ key: QuotasKeyEnum.EXAMPLE_KEY, used, included: 5_000 }] })

const meta: Meta<typeof UsageSummarySection> = {
  title: 'Dashboard/UsageSummary',
  component: UsageSummarySection,
  // connected() is the typed parameters builder — route is required, stores is checked. A route with
  // search params passes its zod parser: route: { id, validateSearch: s => searchSchema.parse(s ?? {}) }.
  parameters: connected({ route: { id: '/(app)/dashboard/' } }),
}
export default meta
type Story = StoryObj<typeof UsageSummarySection>

export const Default: Story = { parameters: { msw: { handlers: [mockQuery(opts, usage(42))] } } }
export const NearLimit: Story = { parameters: { msw: { handlers: [mockQuery(opts, usage(4_950))] } } }
export const Loading: Story = { parameters: { msw: { handlers: [loadingQuery(opts)] } } }
export const ErrorState: Story = { parameters: { msw: { handlers: [errorQuery(opts, 400)] } } }
```

The mock helpers (`@/storybook`):

| Helper | Use |
|---|---|
| `mockQuery(getXQueryOptions(p), resp)` | successful GET; `resp` is `DeepPartial` of the SDK response |
| `loadingQuery(opts)` | never-resolving GET → loading/skeleton state |
| `errorQuery(opts, status=400)` | failed GET (4xx — ky retries 5xx) |
| `mockMutation(method, getXMutationOptions(), resp)` | successful POST/PUT/PATCH/DELETE (method explicit) |
| `mockMutationError(method, opts, status)` | failed mutation (e.g. 409) |
| `mockSession(value)` | seeds `useSession()` via the better-auth get-session endpoint |

## Mocks colocation

Mocks live **with their stories**, never in a central `src/mocks/` barrel:
- **Single consumer** → inline the fixtures in the `.stories.tsx`.
- **Shared by N sibling stories** → a feature-local file (e.g. `dashboard/-components/dashboard.mocks.ts`) whose handler is built via the typed helpers; the stories import from it.

## Data source — mock (default) vs live backend

A `Data` toolbar toggle (`dataSource: mock | live`) flips connected stories: `mock` serves
`parameters.msw.handlers`; `live` resets MSW so requests hit the real backend (run Storybook with
`VITE_API_URL=http://localhost:3030`). Live reuses your existing app session — the better-auth cookie
is host-scoped to `localhost`, shared across ports — so log into the app once, then flip to Live. No
login UI; CORS for `:6006` is a backend prerequisite.

## Behavior in stories — `play` runs in `bun test` too

A story is not just the Storybook browser's fixture — it's also the **only** fixture `bun test`
needs for anything that has a screen. Two mechanisms make that true:

- **`composeStories(module)`** — import it from `tests/support/storybook`, **never** from
  `@storybook/react` directly. The wrapper is same-named as the upstream export on purpose (founder
  ruling: no product vocabulary in portable tooling — the *module path* is the namespace, not the
  function name); it calls `ensureProjectAnnotations()` once per process (applies the real
  `.storybook/preview.tsx` decorators/loaders) before delegating to the upstream compositor. A
  component that has a story never gets an independent `.test.tsx` mount — the test imports
  `composeStories` and either exercises `play`, or, when an assertion doesn't fit `play`, does the
  minimal extra mount around the same composed story (the story stays the fixture either way).
- **`tests/architecture/stories-smoke.test.tsx`** — a generic glob-driven smoke (`Bun.Glob('src/**/*.stories.tsx')`,
  no story named) that composes and renders **every** story in the repo inside `bun test`. A story
  that stops compiling or fails to mount fails this test by name, on every commit — `storybook:build`
  is not wired into any gate, so this smoke is what closes that hole. It names zero product stories,
  so a fork inherits the gate without inheriting any CODM story.

**MSW under bun does NOT intercept — measured, not assumed.** Two attempts, both measured in
isolation before being ruled out (`tests/support/storybook.ts` carries the full account,
`tests/support/storybook.spike.test.tsx` is the live proof): `msw-storybook-addon`'s `initialize()`
needs a real browser Service Worker (`'serviceWorker' in navigator` is `false` under bun/happy-dom —
`worker.start()` doesn't throw, it just never intercepts); the `msw/node` fallback (`setupServer`)
was implemented and measured separately — even with the "relative URL" root cause fixed
(`configureClient` given an absolute base), requests never reach the interceptor and go straight to
the real network (`ECONNREFUSED`). An isolated probe (bare `http.request()`, no happy-dom/ky/story in
the loop) reproduced the same gap: `@mswjs/interceptors`' `ClientRequestInterceptor` does not hook
`node:http` under bun — a runtime incompatibility, not a wiring bug in this repo.

Founder ruling from that measurement: states the real backend can't produce (a forced 4xx, an
eternal-loading skeleton) are **VISUAL-ONLY** — a story with MSW handlers, viewed in the Storybook
browser, where MSW does work. There is **no sanctioned network double in bun**. Every behavior
assertion that needs network — in a `play`, in a colocated test, anywhere running under `bun test` —
hits the **integration harness**, exclusively. `storybook.spike.test.tsx` is a **canary**: it asserts
today's measured gap (`mswDataArrived` is `false`) and goes red the day msw-under-bun starts working,
which is the trigger to revisit this ruling. `.storybook/preview.tsx` guards MSW's `initialize()` to
run only where `'serviceWorker' in navigator` is real (i.e. never under bun/happy-dom) — that guard
is existing infrastructure this skill documents, not something a story or test needs to reason about.

## The integration harness — where behavior assertions bat

`useIntegrationBackend()` (`tests/support/integration-harness.ts`) is the default network boundary
for any test — story `play` or colocated — that needs to assert real behavior instead of a canned
response:

```ts
import { useIntegrationBackend, loadBackendGivens } from '../../../tests/support/integration-harness'

const backend = await useIntegrationBackend()          // boots once per bun test process (cached)
await backend.reset()                                   // clean state per test
const { createGivenHelpers } = await loadBackendGivens()
const given = createGivenHelpers(backend.asTestBed())    // seed via repositories, not the use case under test
```

- **What it is:** the real backend (`@codm/api-typescript/testing`'s `startIntegrationBackend()`) —
  the SAME production `assembleMainRouter()` (`src/server.ts`) boots for real on an ephemeral port,
  wired with `ALL_REGISTRIES.integration` (in-process driver, real migrations, in-memory mediator),
  with the SDK client pointed at it via `configureClient`. An SDK hook call in a story or test goes
  through a real controller, real middleware, and a real use case — the assertion checks the
  **computed** result (e.g. `getOnboarding().completedAt`), not a mock's echo.
- **Why by default, not the exception:** a typed mock returns whatever was seeded and forces the test
  to assert by proxy (call counts, signatures); the harness computing the answer lets the assertion
  be the behavior itself.
- **Seeding is state, not response.** Same process → the test resolves repositories/`given` helpers
  straight from the backend's container. `createGivenHelpers(backend.asTestBed())` — never
  `TestBed.create` inside this harness (that registers a **second**, disconnected container/database;
  see the bad practice below).
- **Cost, measured:** boot is a one-time cost per `bun test` process (the module caches the booted
  backend — every subsequent `useIntegrationBackend()` call in the same process returns the same
  instance); a round trip through SDK → Fastify → SQLite is on the order of tens of milliseconds. The
  react side's `tsc` cost is unaffected — the harness is reached by a **frozen, structural** type-only
  contract (`@codm/api-typescript/testing-contract`, zero internal backend aliases) plus a **dynamic
  import with a computed specifier** for the implementation, so react's `tsc` never has to understand
  the backend's internal module graph to type this file.
- **Inheritance, not redeclaration:** the harness does not reassemble its own router — it calls the
  exact `assembleMainRouter()` production boot uses, so the two never drift apart.

## Colocated test canon

Every test without a screen — a hook, a gate, a pure module, a port — follows the same five rules,
extracted from the docblocks that already practiced them (`ThreadSettingsDialog`, `SupervisionGate`,
`useThreadRealtime`, `virtual-list`) before this skill wrote them down:

1. **Mount the real thing against the real Container.** Don't stub the seam under test; wire the real
   services container (or the harness, for network behavior) and let the real code run.
2. **Assert at the boundary that actually answers the question** — the network response / the store
   / the DOM the user would see — never the hook's internal call count. A test that asserts "the hook
   was called" instead of "the pending list is now empty" survives a refactor that breaks the feature.
3. **`await router.load()` before the first render** — or, better, use `mountRouter` (below), which
   makes forgetting it impossible. Skipping it renders an empty `RouterProvider` that only resolves on
   a future tick; production React swallows the render without honoring `act()`, so tests can pass by
   accident under the wrong build — measured: 18 tests were green only because of this gap.
4. **Wait for a condition, never a fixed `sleep`.** A `setTimeout(resolve, N)` is either too short
   (flaky) or wastes real time on every run (slow) — poll a predicate instead (`mountRouter`'s
   `settled()` does this).
5. **happy-dom does not measure layout.** Any assertion about pixel size, scroll position, or visual
   overlap is a lie at this layer — that assertion belongs in a Storybook browser or e2e, not a
   colocated test.

**Canonical shape — given → mount/act → assert (see `registry.yaml`'s `canonical_snippet` for the
full listing):**

```tsx
const backend = await useIntegrationBackend()
await backend.reset()
const { createGivenHelpers } = await loadBackendGivens()
await createGivenHelpers(backend.asTestBed()).userWithAccount({})   // 1. given — seed via repository

const { router, settled, unmount } = await mountRouter(<GateUnderTest />)  // 2. mount — load() included

await settled(() => screen.queryByText('Ready') !== null, 'gate resolved') // 3. assert — the boundary,
unmount()                                                                   //    waited-for, not slept
```

### `mountRouter` — the mounting canon, packaged

`tests/support/mountRouter.tsx` returns `{ router, host, settled, unmount }`: builds a memory router,
calls `router.load()`, renders inside `act`, and hands back a `settled(predicate, label?)` that polls
until the predicate is true (or throws, naming `label`). Whoever mounts a route in a test can no
longer forget `load()` — the helper is the only thing that writes that line.

## Rails — the wrong shape fails by name

Two architecture tests in `tests/architecture/` make the canon's two easiest-to-violate rules
mechanically impossible to land silently:

- **`router-load.test.ts`** — globs every `*.test.{ts,tsx}` under `src/`; any file that mounts
  `<RouterProvider` without `router.load()` (and isn't using `mountRouter(`, which already includes
  it) fails, naming the offending file.
- **`fetch-stub.test.ts`** — globs the same tree for `globalThis.fetch =`; any manual fetch stub
  outside a hardcoded `INVENTORY` array fails, naming the file. **The inventory only shrinks** — it
  was seeded with today's offenders precisely so the tooling commit could land green on its own; each
  one that migrates to the integration harness (or, for a genuinely unproducible state, to
  MSW-in-Storybook) is removed from the list. A new manual fetch stub added anywhere outside the
  inventory is a fresh violation, not a grandfathered one.

## Verification

`bun test` now runs in this workspace (colocated tests + `composeStories`/`play` + the two rails +
the smoke), alongside the existing story checks:
- `bun x tsc --noEmit` — type-safety (mocks checked against the SDK; the typed-mock guard file `src/storybook/connected.typecheck.ts` is included)
- `bun run storybook:build` — every story compiles + render-constructs (kept as the Storybook-side check; the smoke test is what makes an equivalent failure block a commit)
- `bun test` — colocated tests, `composeStories` + `play`, the smoke, and the two rails

Do **not** add `@ts-expect-error` story tests, and do not hand-roll a manual `globalThis.fetch` stub
or a fixed `sleep` — the canon and the rails above cover both.

## When to use

- Adding or reviewing any `*.stories.tsx`.
- Showcasing a data-owning Section/card/dialog (use the connected framework).
- Adding or reviewing any `packages/app/react/**/*.test.{ts,tsx}` — a hook, a gate, a pure module, or
  a leftover `.test.tsx` sibling of a storied component.

## When NOT to use

- Authoring the component itself → `/component`.
- The framework internals (`@/storybook`, `.storybook/`, `tests/support/`) already exist — extend, don't re-create.
- e2e specs (`packages/e2e/`) → `/e2e`. This skill's harness runs `integration`; e2e stays `real` on purpose (a real file, real migrations, a real node bundle, a real browser) — never migrate an e2e spec to the harness to make it faster.

## Scaffold

No CLI verb yet — stories and colocated tests are hand-written next to the component/module
(`<Component>.stories.tsx`, `<module>.test.ts(x)`).
