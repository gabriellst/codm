---
name: route
description: Create a TanStack Router page with proper routing setup. Use when adding pages like /products, /users/:id, /dashboard. Use this skill for any new route — list pages, detail pages, or dashboard views — including search params, data loading, and component layout.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Create TanStack Router Page

Creates a new frontend page with proper TanStack Router configuration, search params validation, and SDK integration.

## Why Routes Are Thin Shells

- Routes define the URL contract: path, search params validation, breadcrumbs, error handling
- Routes render the page layout and decide WHICH components appear based on state
- Routes do NOT fetch data for components — each component owns its own data via React Query
- Components read search params via `routeApi.useSearch()` and navigate via `routeApi.useNavigate()`
- Types are declared inline in the route file using SDK response types

## When to Use This Skill

- Adding a new page to the application (a URL that users can navigate to)
- Creating a page layout that composes components
- Adding URL-driven state like filters, pagination, or tab selection

## When NOT to Use This Skill

- Creating UI components (use `/component` skill)
- Creating design system primitives (use `/primitive` skill)
- Adding state that doesn't need a URL (use `/store` skill)
- Building forms with validation (use `/form` skill)

## Prerequisites

- SDK must be generated (use `/sdk` first)
- Hooks available in `@codm/client-typescript/typescript`

## Key Principles [RTE-01, RTE-02, RTE-03, RTE-04]

1. **Route is a Thin Shell**: Route defines URL contract, renders layout. Components fetch their own data.
2. **SDK is Law**: Use SDK schemas for search validation. Never hardcode types or query keys.
3. **URL State for Filters**: Use `Route.useSearch()` / `routeApi.useSearch()` for filters/pagination, never `useState`.
4. **Components Own Data**: Each component uses SDK hooks to fetch what it needs. No `data` props from route.

## Process

### Step 1: Create Folder Structure

```bash
# Required: Create route folder
mkdir -p packages/app/react/src/routes/<route-name>

# OPTIONAL: Only create these if you need them
mkdir -p packages/app/react/src/routes/<route-name>/-components  # All route-specific components
mkdir -p packages/app/react/src/routes/<route-name>/-hooks       # Custom hooks
mkdir -p packages/app/react/src/routes/<route-name>/-stores      # Zustand stores
```

**Note:** Types are declared directly in the route file — no `-types/` folder.

### Step 2: Create Route Component

The route defines URL contract and renders layout. Components fetch their own data.

```typescript
// packages/app/react/src/routes/customers/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@/lib/zod-validator'
import { z } from 'zod'
import { listCustomersQueryParamsSchema, type ListCustomersQueryResponse } from '@codm/client-typescript/typescript'
import { RouteError } from '@/components/RouteError'
import { Button } from '@codm/app-ui/button'
import { Link } from '@tanstack/react-router'
import { CustomerList } from './-components/CustomerList'
import { CustomerFilters } from './-components/CustomerFilters'

// Types exported for components
export type CustomerItem = ListCustomersQueryResponse['items'][number]

// Search schema
const customersSearchSchema = z.object({
  selectedCustomerId: z.string().optional(),
}).and(listCustomersQueryParamsSchema)

export type CustomersSearchParams = z.infer<typeof customersSearchSchema>

export const Route = createFileRoute('/(app)/customers/')({
  staticData: { breadcrumb: 'Clientes' },
  validateSearch: zodValidator(customersSearchSchema),
  errorComponent: RouteError,
  component: RouteComponent,
})

function RouteComponent() {
  // Route is a thin shell — just layout and static UI
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <Button asChild>
          <Link to="/customers/new">Novo Cliente</Link>
        </Button>
      </header>

      <CustomerFilters />
      <CustomerList />
    </div>
  )
}
```

### Step 3: Types Are Inline (No Separate File)

```typescript
// In route index.tsx
import type { ListCustomersQueryResponse } from '@codm/client-typescript/typescript'

export type CustomerItem = ListCustomersQueryResponse['items'][number]
export type CustomerStats = ListCustomersQueryResponse['stats']
```

Components import types from the route file:
```typescript
import type { CustomerItem } from '../..'
```

### Step 4: Generate Route Tree (CRITICAL!)

```bash
cd packages/app && bun tsr generate
```

**Without this step, the route will NOT work!**

## Route Patterns

### List Page (with search params)

```typescript
export const Route = createFileRoute('/(app)/customers/')({
  staticData: { breadcrumb: 'Clientes' },
  validateSearch: zodValidator(customersSearchSchema),
  errorComponent: RouteError,
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8 flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Clientes</h1>
      <CustomerFilters />
      <CustomerList />
    </div>
  )
}
```

### Detail Page (with path params)

```typescript
export const Route = createFileRoute('/(app)/customers/$id/')({
  staticData: { breadcrumbs: [{ label: 'Clientes', to: '/customers' }, { label: 'Detalhes' }] },
  errorComponent: RouteError,
  component: RouteComponent,
})

function RouteComponent() {
  // Route only provides layout — components fetch their own data using Route.useParams()
  return (
    <div className="flex-1 overflow-y-auto">
      <CustomerHeader />
      <CustomerDetails />
    </div>
  )
}
```

### Layout Routes

```typescript
export const Route = createFileRoute('/(app)/customers')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="customers-layout">
      <Outlet />
    </div>
  )
}
```

### Layout Route with Loader

When a layout route needs to resolve data for child routes (e.g., resolving an instance ID):

```typescript
import { getChannelChannelsResolveQueryOptions, PlatformEnum } from '@codm/client-typescript/channel/app'

export const Route = createFileRoute('/(app)/channel')({
  loader: async ({ context }) => {
    const resolved = await context.queryClient.ensureQueryData(
      getChannelChannelsResolveQueryOptions({ params: { platform: PlatformEnum.PlatformWhatsApp } }),
    )
    return { channelId: resolved?.id ?? null }
  },
  component: RouteComponent,
})
```

Child routes read loader data via `getRouteApi`:
```typescript
const channelRouteApi = getRouteApi('/(app)/channel')
const { channelId } = channelRouteApi.useLoaderData()
```

## Loader & Prefetch (canon)

O app roda com `defaultPreload: 'intent'` + `defaultPreloadStaleTime: 0` (`router.tsx`):
hover/focus em `<Link>` prefetcha chunk + loader, e o React Query é o único dono de staleness.
O loader NÃO muda a posse do dado — componentes continuam com seus hooks (thin shell intacto);
ele só aquece o cache com o MESMO `<sdk>QueryOptions` que o hook usa.

**Decision tree — toda rota nova passa por aqui:**

1. Componentes da rota disparam query no mount? → **loader obrigatório** com
   `context.queryClient.ensureQueryData(<sdk>QueryOptions(...))`.
2. Params vêm do search? → **`loaderDeps` obrigatório**, retornando SÓ os campos que afetam o
   dado. Campos UI-only (`view`, `selectedId`, flags de modal) ficam fora — a menos que o
   componente passe o search INTEIRO ao hook; aí deps espelham o search inteiro.
3. **Identidade de queryKey é a regra de ouro:** o objeto de params do loader espelha
   byte-a-byte o que o componente passa ao hook. Divergência = duas entradas de cache =
   prefetch inútil, falha SILENCIOSA (bp-15).
4. **Erro de prefetch nunca falha a navegação:** single → `.catch(() => null)`;
   multi → `Promise.allSettled`. O componente mantém o tratamento de erro (toast + seção).
5. Query condicionada a search param (`selectedId`)? → prefetch condicional no mesmo
   loader (spread condicional no array do allSettled).
6. **Exceções legítimas** (rota SEM loader, justificar no PR): (a) rota sem query própria;
   (b) rotas role-gated prefetcham por role via `context.session` quando a sessão está no
   router context (beforeLoad); (c) queries atrás de dialog/`enabled` condicional ficam FORA
   do prefetch (a rota ainda tem loader para as incondicionais, se existirem).

### Single query, deps espelhando o search inteiro

```typescript
export const Route = createFileRoute('/(app)/resources/')({
  validateSearch: zodValidator(resourcesSearchSchema),
  // Sections pass the whole search object to useListResources — deps must mirror it.
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(listResourcesQueryOptions({ params: deps })).catch(() => null)
  },
  errorComponent: RouteError,
  component: RouteComponent,
})
```

### Single query, deps parciais (várias seções, mesma queryKey)

```typescript
loaderDeps: ({ search }) => ({ from: search.from, to: search.to }),
loader: async ({ context, deps }) => {
  await context.queryClient.ensureQueryData(getReportQueryOptions({ params: deps })).catch(() => null)
},
```

### Multi-query + prefetch condicional (master-detail)

```typescript
// múltiplas queries de seções sempre montadas; dialog/role-gated ficam fora
loader: async ({ context }) => {
  await Promise.allSettled([
    context.queryClient.ensureQueryData(getProfileQueryOptions()),
    context.queryClient.ensureQueryData(listResourcesQueryOptions({ params: {} })),
  ])
},

// lista sempre; details só com selectedId na URL
loaderDeps: ({ search }) => search,
loader: async ({ context, deps }) => {
  await Promise.allSettled([
    context.queryClient.ensureQueryData(listResourcesQueryOptions({ params: deps })),
    ...(deps.selectedId
      ? [context.queryClient.ensureQueryData(getResourceDetailsQueryOptions({ id: deps.selectedId }))]
      : []),
  ])
},
```

scaffold: `bun cli route '(app)/resources' --extend=listResourcesQueryParamsSchema --loader --i18n=resources`
(detail: `--detail --loader=getResourceDetailsQueryOptions`)

## Breadcrumbs (staticData)

**Top-level pages** — `breadcrumb` (single string):
```typescript
staticData: { breadcrumb: 'Clientes' },
```

**Nested/detail pages** — `breadcrumbs` (array, full chain):
```typescript
staticData: { breadcrumbs: [{ label: 'Clientes', to: '/customers' }, { label: 'Detalhes' }] },
```

Rules:
- Use Portuguese labels
- Layout routes should NOT have `staticData.breadcrumb` (they are invisible wrappers, not pages)
- Last breadcrumb has no link (current page)

### `wrapperClassName` Override

Some routes (e.g., channel, agent) need to override the default page wrapper class. Use `staticData.wrapperClassName` for this:

```typescript
// Full-height route without padding (e.g., chat interface)
export const Route = createFileRoute('/(app)/channel/chat/')({
  staticData: { breadcrumb: 'WhatsApp', wrapperClassName: 'h-full w-full' },
  component: RouteComponent,
})
```

The app layout reads `wrapperClassName` from `staticData` and applies it to the page wrapper instead of the default padding/overflow classes.

## Critical Rules

### URL State for Filters — Never useState

```typescript
// WRONG
const [page, setPage] = useState(1)

// CORRECT
const { page } = routeApi.useSearch()
navigate({ search: prev => ({ ...prev, page: 2 }) })
```

### Validate Search with SDK Schema

```typescript
// No frontend-only fields — use SDK schema directly
validateSearch: zodValidator(listCustomersQueryParamsSchema)

// With frontend-only fields — compose with .and()
const schema = listCustomersQueryParamsSchema.and(
  z.object({ selectedId: z.string().optional() })
)
validateSearch: zodValidator(schema)

// Dropping params that AREN'T URL state — omit them, then .and() defaulted fields.
// e.g. tenancyScope is an account-level mode → a GLOBAL store (see /store), NOT search;
// and the SDK's required dates get URL defaults here:
const dashboardSearchSchema = getDashboardQueryParamsSchema
  .omit({ tenancyScope: true, startDate: true, endDate: true })
  .and(z.object({
    startDate: z.string().default(() => /* last 30d */ ''),
    endDate: z.string().default(() => ''),
  }))
```

> Compose search schemas from the SDK's `get<X>QueryParamsSchema` with `.omit().and()` — never
> `.extend()` (overwrites SDK `.default`/`.refine`), and never put account-level modes (tenancy,
> selected org, role view) in the URL — those are global store state, not bookmarkable filters.

### .optional() before .default() ordering

```typescript
// CORRECT
page: z.number().optional().default(1)
startDate: z.coerce.date().optional().default(() => startOfWeek(new Date()))

// WRONG — output type includes undefined
page: z.number().default(1).optional()
```

## File Naming Conventions

| File | Purpose |
|------|---------|
| `index.tsx` | Main page component + type exports |
| `route.tsx` | Layout wrapper (renders `<Outlet />`) |
| `$id/index.tsx` | Dynamic route segment |
| `-components/` | All route-specific components |
| `-stores/` | Zustand stores for this route |
| `-hooks/` | Custom hooks for this route |

## Folder Structure Example

```
packages/app/react/src/routes/
├── (app)/
│   ├── customers/
│   │   ├── index.tsx            # /customers (list) — thin shell
│   │   ├── -components/
│   │   │   ├── CustomerList/    # Fetches own data via useListCustomers
│   │   │   │   ├── index.tsx
│   │   │   │   └── CustomerCard/
│   │   │   └── CustomerFilters/ # Reads/writes search params via routeApi
│   │   └── $id/
│   │       ├── index.tsx        # /customers/:id — thin shell
│   │       └── -components/
│   │           ├── CustomerHeader/
│   │           └── CustomerDetails/
│   └── channel/
│       └── chat/
│           ├── route.tsx        # Layout + channelId sync
│           ├── -components/
│           │   ├── ChatSidebar/
│           │   ├── ChatPanel/
│           │   └── EmptyState/
│           └── -stores/
│               └── useChatStore.ts
└── sign-in/
    └── index.tsx
```

## Checklist

- [ ] All `when: always` patterns present (verify against registry.yaml)
- [ ] Each conditional pattern evaluated (check which apply)
- [ ] No `bad_practices` violations (verify against registry.yaml)
- [ ] `bun tsr generate` executed
- [ ] Route is a thin shell — no data fetching for components
- [ ] Components rendered without data/search/onSearchParamsChange props

## Utility Functions

### useDebouncedSearch (for search inputs in components)

```typescript
import { useDebouncedSearch } from '@/hooks'

const navigate = routeApi.useNavigate()
const { inputValue, handleSearchChange } = useDebouncedSearch({
  initialValue: search?.search ?? '',
  onSearch: value => navigate({ search: prev => ({ ...prev, search: value || undefined, page: 1 }) }),
})
```

### useRangeSearchParams (for calendars/date ranges)

```typescript
import { useRangeSearchParams } from '@/hooks'

const navigate = routeApi.useNavigate()
const { pendingRange, handleRangeChange } = useRangeSearchParams(
  updates => navigate({ search: prev => ({ ...prev, ...updates }) })
)
```

## References

- `packages/app/react/src/routes/(app)/channel/chat/` — Reference implementation (component-owns-data)
- `packages/app/react/src/hooks/useDebouncedSearch.ts` — Debounced search input
- `packages/app/react/src/hooks/useRangeSearchParams.ts` — Date range handling
- `docs/FRONTEND.md` — Principles and architectural decisions
- `/component` skill — For creating route-specific components
- `/form` skill — For creating forms
- `/store` skill — For Zustand stores
