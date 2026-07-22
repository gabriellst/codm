---
name: storybook
description: Write Storybook stories for React components. Use when adding or reviewing a *.stories.tsx. Decides dumb (args) vs connected (real component + typed SDK mocks); covers mockQuery/loadingQuery/errorQuery/mockMutation/mockSession, parameters.route/stores wiring, mocks colocation, the mock|live data toggle, and tsc + storybook:build verification.
---

> **BEFORE WRITING A STORY**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional before writing
> 2. **`bad_practices`** — keep these violations in mind

# Storybook Stories

Story the component **as it really is** — never refactor a data-owning component into a
presentational one just to story it. The framework (`@/storybook` + `.storybook/`) lets a connected
component keep its SDK hooks, route reads, stores, and session intact.

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
import { getUsageQueryOptions, QuotasKeyEnum } from '@template/client-typescript/typescript'
import type { GetUsageQueryResponse } from '@template/client-typescript/typescript'
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

## Verification

This workspace has **no unit-test runner** and `tsconfig` excludes `*.test.ts`. Verify with:
- `bun x tsc --noEmit` — type-safety (mocks checked against the SDK; the typed-mock guard file `src/storybook/connected.typecheck.ts` is included)
- `bun run storybook:build` — every story compiles + render-constructs

Do **not** add a test runner or `@ts-expect-error` story tests — neither is wired here.

## When to use

- Adding or reviewing any `*.stories.tsx`.
- Showcasing a data-owning Section/card/dialog (use the connected framework).

## When NOT to use

- Authoring the component itself → `/component`.
- The framework internals (`@/storybook`, `.storybook/`) already exist — extend, don't re-create.

## Scaffold

No CLI verb yet — stories are hand-written next to the component (`<Component>.stories.tsx`).
