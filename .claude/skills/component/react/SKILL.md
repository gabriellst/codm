---
name: component
description: Create a React component that owns its own data. Use when building any route-specific UI — lists, panels, cards, dialogs, filters. Components fetch their own data via React Query, read params from routeApi.useSearch() or Zustand stores, and handle mutations internally.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Create React Component

Creates a React component that owns its data and actions.

## Core Mental Model

Every component is responsible for the data it renders:

| Need | Source | How |
|------|--------|-----|
| URL state (filters, pagination, selected ID) | Route search params | `routeApi.useSearch()` |
| Update URL state | Route navigate | `routeApi.useNavigate()` |
| Client state (UI toggles, selections, shared IDs) | Zustand store | `useStore()` |
| Server data | React Query | `useQuery()` / SDK hooks directly |
| Mutations | React Query | `useMutation()` / SDK hooks directly |

**No prop drilling of data, search params, or callbacks.** React Query deduplicates — if multiple components call the same query, only one request fires.

> **Prefetch é transparente.** A rota pode ter um loader que aquece o cache
> (`ensureQueryData` — ver skill `route/react` §Loader & Prefetch, RTE-P15). Isso NÃO muda nada
> aqui: o componente continua chamando seu hook SDK normalmente (cache hit se o prefetch
> chegou; fetch normal se não). NUNCA leia `useLoaderData()` para dados de servidor — a
> única exceção é dado de resolução de layout que o loader RETORNA (ex.: `channelId` do
> layout channel). Se os params do seu hook mudarem, atualize o loader da rota junto (bp-15).

## When to Use This Skill

- Building any route-specific UI component (list, panel, card, dialog, filter bar)
- Adding inline skeleton loading states
- Extracting repeated JSX into a local or nested component

## When NOT to Use This Skill

- Building reusable design system components (use `/primitive` skill)
- Creating a new page with routing (use `/route` skill)
- Creating forms with validation (use `/form` skill)
- Adding state management stores (use `/store` skill)
- Writing a Storybook story for this component (use `/storybook` skill) — dumb components story with `args`; the data-owning components this skill builds story via the connected framework (typed SDK mocks + `parameters.route`/`stores`)

> **Modal/Dialog with data input**: Use the `/form` skill for the form inside. This skill handles the dialog shell and layout.

## Prerequisites

- **Design System Check**: Check if `SYSTEM.md` exists at the project root. If not, use `/design-system` first.
- Check available primitives in `@/components/ui/` before creating new components
- SDK must be generated (use `/sdk` first) for types and enums

## Key Principles

1. **Component Owns Data**: Each component fetches what it needs via React Query. No data props from parent.
2. **Leaf Components Receive Props**: Components rendered N times in a `.map()` (cards, rows, badges) receive a single item as a prop. They don't re-query — the parent owns the list query and passes each item down.
3. **Two Param Sources**: URL state via `routeApi.useSearch()`, client state via `useStore()`.
4. **Open/Closed Principle**: Never hardcode options in JSX. Derive from SDK Enums + labels maps.
5. **DRY Local**: Repeated JSX in the same file → Extract to local component.
6. **Primitive First**: Always check `@/components/ui/` for existing primitives before creating raw HTML.
7. **ARIA-Navigable**: Every interactive element without visible text must have an `aria-label`. Form fields need `id={field.name}` to connect with `<FieldLabel htmlFor>`. This enables accessibility and E2E testing.

### Owns Query vs Receives Props — Decision Rule

**"Am I rendered N times in a `.map()`?"**

- **No** → component owns its query (reads IDs from store/search params, fetches data)
- **Yes** → component receives a single item as a prop (parent maps the list)

```
ProductList (owns query — rendered once)
  └── ProductCard ({ product } — rendered N times in .map())

ChatSidebar (owns query — rendered once)
  └── ChatListItem ({ item } — rendered N times in .map())

StatsGrid (owns query — rendered once)
  └── StatCard ({ stat } — rendered N times in .map())

PatientInfoPanel (owns query — rendered once, not repeated)
```

Leaf components (cards, rows, badges) are reusable and testable because they only depend on their props. They CAN own mutations (e.g., a delete button on a card) but they should NOT re-fetch the item they already received.

## Folder Structure

All components live in `-components/`. Dependencies are colocated under their parent:

```
route/
├── route.tsx               # Minimal — layout, conditional rendering
├── -stores/                # Zustand stores for shared state
├── -hooks/                 # Shared hooks (SSE, realtime)
└── -components/
    ├── ProductList/         # Fetches products, renders list
    │   ├── index.tsx
    │   ├── ProductCard/     # Receives single item as prop
    │   │   └── index.tsx
    │   └── stories/
    ├── FilterBar/           # Reads/writes search params directly
    │   └── index.tsx
    └── EmptyState/
        └── index.tsx
```

### Section Components (naming convention only)

`Section` is a **naming convention** for container components that own data and orchestrate a region of the screen — e.g., `PatientListSection`, `OverviewSection`. It is **not** a separate citizen type with its own rules.

- **Same rules as any other component** — a Section **owns its own query**, reads search params via `routeApi.useSearch()`, reads Zustand stores, dispatches mutations. **No `data` prop from the route.** Routes never fetch data to pass down.
- **Renders inline skeleton when its own `data` is undefined** — the static UI (headers, buttons, search inputs) stays visible while the data-dependent area shows a `<Skeleton />`. Routes never gate on `isLoading`.
- **Colocated in `-components/`** — sections live in the route's `-components/` folder, not a separate `-sections/` folder. The `Section` suffix is purely a name hint for "container that orchestrates this region".

```typescript
// CORRECT — section owns its query, no data prop from route
import { useListPatients } from '@codm/client-typescript/typescript'
const routeApi = getRouteApi('/(app)/patients/')

export function PatientListSection() {
  const { page, search } = routeApi.useSearch()
  const { data } = useListPatients({ params: { page, search } })

  return (
    <div>
      {/* Static UI always visible */}
      <SearchInput />
      {/* Data-dependent area handles its own skeleton */}
      {data ? <PatientGrid items={data.items} /> : <PatientGridSkeleton />}
    </div>
  )
}

// WRONG — section receiving data as prop (old pattern, do not use)
export function PatientListSection({ data }: { data: PatientListResponse | undefined }) { … }
```

## Data Access Pattern

### Route API for search params

Every component that needs search params uses `getRouteApi()`:

```typescript
import { getRouteApi } from '@tanstack/react-router'

const routeApi = getRouteApi('/(app)/products/')

export function ProductList() {
  const { page, search } = routeApi.useSearch()
  const navigate = routeApi.useNavigate()

  const { data } = useListProducts({ params: { page, search } })

  const handlePageChange = (page: number) =>
    navigate({ search: prev => ({ ...prev, page }) })
}
```

### Store for shared IDs and UI state

```typescript
export function ChatPanel() {
  const channelId = useChatStore(s => s.channelId)
  const { data } = useGetMessages({ params: { channelId } })
}
```

### Parent fetches list, leaf receives item

The only case where props are the right choice: a parent renders a list and passes each item to a leaf component. The leaf doesn't re-fetch — it renders one item.

```typescript
// Parent owns the list query
export function ProductList() {
  const { data } = useListProducts(...)
  return data?.items.map(p => <ProductCard key={p.id} product={p} />)
}

// Leaf renders one item — no query needed
function ProductCard({ product }: { product: ProductItem }) {
  return <Card>{product.name}</Card>
}
```

## Process

### Step 1: Check Existing Primitives

**ALWAYS** check `@/components/ui/` first for existing primitives:

```typescript
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { Table } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
```

**BLOCKING PREREQUISITE**: Run `ls packages/app/react/src/components/ui/` BEFORE creating any component.

#### HTML → Primitive Mapping (mandatory) [bp-11]

| HTML Element | Primitive | Import |
|-------------|-----------|--------|
| `<select>` | Select | `@/components/ui/select` |
| `<input>` | Input | `@/components/ui/input` |
| `<button>` | Button | `@/components/ui/button` |
| `<label>` | FieldLabel | `@/components/ui/field` |
| `<table>` | Table | `@/components/ui/table` |
| `<textarea>` | Textarea | `@/components/ui/textarea` |
| `<dialog>` | Dialog | `@/components/ui/dialog` |
| manual tabs | Tabs | `@/components/ui/tabs` |
| checkbox | Checkbox | `@/components/ui/checkbox` |
| radio | RadioGroup | `@/components/ui/radio-group` |
| loading spinner | Spinner/Skeleton | `@/components/ui/spinner` / `skeleton` |
| card styling | Card | `@/components/ui/card` |
| dropdown | DropdownMenu | `@/components/ui/dropdown-menu` |
| badge/tag | Badge | `@/components/ui/badge` |
| date input | DatePicker | `@/components/ui/date-picker` |
| toggle/switch | Switch | `@/components/ui/switch` |
| tooltip | Tooltip | `@/components/ui/tooltip` |
| popover | Popover | `@/components/ui/popover` |
| scrollable area | ScrollArea | `@/components/ui/scroll-area` |

### Step 2: Create Component

Create folder: `packages/app/react/src/routes/products/-components/ProductList/index.tsx`

```typescript
import { getRouteApi } from '@tanstack/react-router'
import { ComponentProps } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useListProducts, useDeleteProduct, listProductsQueryKey } from '@codm/client-typescript/typescript'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebouncedSearch } from '@/hooks'
import { ProductCard } from './ProductCard'

const routeApi = getRouteApi('/(app)/products/')

function SkeletonRows() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map(key => (
        <Card key={key} className="p-4">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-4 w-16" />
        </Card>
      ))}
    </div>
  )
}

export function ProductList({ className, ...props }: ComponentProps<'div'>) {
  const { page, search } = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const queryClient = useQueryClient()

  const { data } = useListProducts({ params: { page, search } })
  const deleteProduct = useDeleteProduct()

  const { inputValue, handleSearchChange } = useDebouncedSearch({
    initialValue: search ?? '',
    onSearch: value => navigate({ search: prev => ({ ...prev, search: value || undefined, page: 1 }) }),
  })

  const handleDelete = async (id: string) => {
    await deleteProduct.mutateAsync(
      { id },
      {
        onSuccess: () => toast.success('Produto excluído'),
        onSettled: () => queryClient.invalidateQueries({ queryKey: listProductsQueryKey() }),
      },
    )
  }

  return (
    <div className={cn('w-full flex flex-col gap-4', className)} {...props}>
      {/* Static UI always visible */}
      <Input placeholder="Buscar..." value={inputValue}
        onChange={e => handleSearchChange(e.target.value)} />

      {/* Data-dependent area */}
      {data ? (
        data.items.length === 0 ? (
          <Empty><EmptyHeader><EmptyTitle>Nenhum produto encontrado</EmptyTitle></EmptyHeader></Empty>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.items.map(product => (
              <ProductCard key={product.id} product={product} onDelete={handleDelete} />
            ))}
          </div>
        )
      ) : (
        <SkeletonRows />
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <Pagination currentPage={page ?? 1} totalPages={data.totalPages}
          onPageChange={p => navigate({ search: prev => ({ ...prev, page: p }) })} />
      )}
    </div>
  )
}
```

## State Decision Guide

| State Type | Where to Put | Example |
|------------|--------------|---------|
| Filters, pagination, tabs, selected ID | URL (`search`) | `?page=2&status=active&chatId=abc` |
| Shared IDs resolved at runtime | Zustand Store | `channelId` from API resolve |
| UI toggles (panel open, selection) | Zustand Store | `isPanelOpen`, `selectedItem` |
| Ephemeral UI (hover, animation) | `useState` | `isHovered`, `isExpanded` |

## Discriminated union → variant component

When the backend models a screen's operation/config as a **discriminated union** (genuinely different shapes per discriminant — the connect body keyed by `(platform, connectionMode)`, `shippingFee` keyed by `mode`), the component reflects the cases instead of flattening them.

**Rule:** the discriminant is a *selector/filter*; render one sub-component per variant, dispatched by a **map keyed on the discriminant** — never an `if`/`switch` chain that re-declares fields.

**How the filtering works (4 steps):**

1. The set of *available* variants comes from a descriptor/registry read (e.g. `listPlatformDescriptors` → `selectedItem` carries `{ type, platform, connectionMode }`) **or** from a discriminant selector the user drives (a `mode` `<Select>`).
2. The selected discriminant value is the **filter key** — it picks (i) which sub-component/fields render and (ii) which concrete member schema validates.
3. Discriminant values are part of the contract member — **thread them into the body even when not editable** (the connect body's `type` comes from `selectedItem.type`; dropping it makes `safeParse` silently fail).
4. Single-discriminant variants hardcode the literal; multi-type platforms (e.g. YEVER = gateway + checkout) read the discriminant from the descriptor at runtime.

**References:** `ConnectIntegrationSheet/index.tsx` (dispatch lookup) + `platforms/index.ts` (`CONNECT_FORMS` map keyed by `` `${platform}:${connectionMode}` ``) + `platforms/*` (per-variant forms); `ShippingFeeForm.tsx` (union-as-field). The form side is `FRM-P43`/`FRM-P44` (incl. the `@/lib/union` helpers); the read-side mirror is the `composition-first-discriminated-bff-outputs` memory.

## Critical Rules

### Open/Closed Principle — Never Hardcode Options [CMP-P07, bp-09]

Derive options from SDK enums + labels map:

```typescript
import { SpecialtyEnum } from '@codm/client-typescript/typescript'
import { specialtyLabels } from '@/lib/labels'

const SPECIALTIES = Object.values(SpecialtyEnum)

function SpecialtyFilter({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">All specialties</option>
      {SPECIALTIES.map(specialty => (
        <option key={specialty} value={specialty}>{specialtyLabels[specialty]}</option>
      ))}
    </Select>
  )
}
```

### DRY Local — Extract Repeated JSX

```typescript
// WRONG
<div className="flex items-center gap-2"><span>{product.name}</span><Badge>{product.status}</Badge></div>
<div className="flex items-center gap-2"><span>{product.category}</span><Badge>{product.type}</Badge></div>

// CORRECT
function InfoRow({ label, badge }: { label: string; badge: string }) {
  return <div className="flex items-center gap-2"><span>{label}</span><Badge>{badge}</Badge></div>
}
<InfoRow label={product.name} badge={product.status} />
<InfoRow label={product.category} badge={product.type} />
```

### Use cn() for Conditional Classes

```typescript
<div className={cn(
  'base-classes',
  isActive && 'bg-green-100',
  !isActive && 'bg-gray-100',
  hasError && 'border-red-500',
)}>
```

### Keyboard shortcuts — canon: `@tanstack/react-hotkeys` [CMP-P19]

A component that binds a keyboard shortcut (Escape to close a panel, `mod+k` to focus search, arrows to
navigate a list) uses **`useHotkeys` from `@tanstack/react-hotkeys`** (dep already in
`packages/app/react/package.json`). Never hand-roll a `useEffect` + `window.addEventListener('keydown', …)`
+ manual cleanup — the hook owns registration, scoping, and teardown.

The shortcut lives in the component that **owns the state it mutates**, right next to the store/search read:

```typescript
import { useHotkeys } from '@tanstack/react-hotkeys'

// Escape closes the info panel — bound in the component that owns the panel state
export function InfoPanel() {
  const setPanelOpen = useChatStore(s => s.setPanelOpen)
  useHotkeys([{ hotkey: 'Escape', callback: () => setPanelOpen(false) }])
  // …render
}
```

`useHotkeys` takes an **array** of `{ hotkey, callback }` bindings, so one call registers several
shortcuts. Keep the `callback` a thin dispatch into a store action / navigate / mutation — no business
logic inline.

### Deferred side-effects — canon: `useTimeout` [CMP-P20]

For a self-clearing `setTimeout` (dismiss a banner, debounce a one-shot effect, delayed close), use the
shared **`useTimeout` hook** from `@/hooks` instead of a raw `setTimeout` + manual `clearTimeout` in a
`useEffect`. It returns `{ start, clear }`, cancels any in-flight timer on re-`start`, and auto-clears on
unmount:

```typescript
import { useTimeout } from '@/hooks'

export function ConfigBanner() {
  const bannerTimeout = useTimeout()
  // …
  bannerTimeout.start(() => setVisible(false), 4000)  // auto-cancels a previous start; cleared on unmount
}
```

## Dialog Patterns

```typescript
// Global dialog store — trigger from any component:
import { useDialogStore } from '@/stores/useDialogStore'
const { show, hide, confirm } = useDialogStore()

// Open dialog:
show(<DialogContent>...</DialogContent>)

// Inline confirmation:
const confirmed = await confirm({ title: 'Excluir?', variant: 'destructive' })
if (!confirmed) return
```

## ARIA Labels (AI-Navigable Components)

Every component must be navigable by AI agents and screen readers. Two mechanisms:

**`aria-label`** — for elements without visible text:

| Element | Convention | Example |
|---------|-----------|---------|
| Icon-only buttons | Action-first | `aria-label="Send message"` |
| Lists | Describe the collection | `role="list" aria-label="Conversation list"` |
| List items | Include dynamic context | `` role="listitem" aria-label={`Select conversation ${name}`} `` |
| Dialogs | Describe the purpose | `aria-label="New appointment form"` |
| Sections | Describe the region | `aria-label="Chat panel"` on `<section>` |
| Selects | Describe what is selected | `aria-label="Filter by status"` |

**`id` + `<FieldLabel htmlFor>`** — for form fields (no `aria-label` needed):

```tsx
<FieldLabel htmlFor={field.name}>Cidade</FieldLabel>
<Input id={field.name} ... />
// Combobox, Select, etc. must also forward id:
<ComboboxInput id={field.name} ... />
```

**Skip annotation for:** elements with self-describing text content (`<Button>Save</Button>`), purely decorative elements, internal layout wrappers.

**No shared constants file.** Use inline strings in both components and tests. The test string IS the contract — if the label changes, the test catches it.

## File Naming & Structure

- **Folder per component**: `ComponentName/index.tsx` (NOT `ComponentName.tsx`)
- **PascalCase** for folders: `ProductCard/`, `ProductList/`
- **Stories** in subfolder: `ComponentName/stories/ComponentName.stories.tsx`
- **Colocate dependencies** under their parent component folder

## Creating Stories

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { productStatusEnumEnum } from '@codm/client-typescript/typescript'
import { ProductCard } from '..'

const mockProduct = {
  id: 'prod-001',
  name: 'Product Name',
  price: 99.99,
  stock: 10,
  status: productStatusEnumEnum.ACTIVE,
}

const meta: Meta<typeof ProductCard> = {
  title: 'Products/ProductCard',
  component: ProductCard,
  decorators: [Story => <div className="w-[400px]"><Story /></div>],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { product: mockProduct } }
export const OutOfStock: Story = { args: { product: { ...mockProduct, stock: 0 } } }
```

### Story Title Pattern

| Component Location | Story Title |
|-------------------|-------------|
| `products/-components/ProductList/` | `Products/ProductList` |
| `products/-components/ProductList/ProductCard/` | `Products/ProductList/ProductCard` |

## Testing Components with Zustand Stores in Storybook

```typescript
decorators: [
  Story => {
    useEffect(() => {
      useDashboardStore.setState({ selectedAppointmentId: null })
    }, [])
    return <div className="w-[400px]"><Story /></div>
  },
],
```

## Checklist

- [ ] All `when: always` patterns present (verify against registry.yaml)
- [ ] Each conditional pattern evaluated (check which apply)
- [ ] No `bad_practices` violations (verify against registry.yaml)
- [ ] Ran `ls packages/app/react/src/components/ui/` BEFORE creating component
- [ ] Component fetches its own data (no data props from parent)
- [ ] Search params accessed via `routeApi.useSearch()`, not passed as props
- [ ] Mutations handled internally with toast + invalidate
- [ ] Icon-only buttons have `aria-label`
- [ ] List containers have `role="list"` + `aria-label`; items have `role="listitem"`
- [ ] Form inputs have `id={field.name}` to connect with `<FieldLabel htmlFor>`
- [ ] Compound inputs (Combobox, Select) forward `id` to their trigger/input element

## References

- `packages/app/react/src/components/ui/` — Available primitive components
- `packages/app/react/src/routes/(app)/channel/chat/` — Reference implementation (component-owns-data pattern)
- `packages/app/react/src/lib/utils.ts` — Utility functions (`cn`)
- `docs/FRONTEND.md` — Principles and architectural decisions
- `docs/COMPONENTS.md` — Primitive component documentation
- `/route` skill — For creating page routes
- `/store` skill — For Zustand stores
- `/primitive` skill — For creating new Base UI primitives
- `e2e/` — E2E test specs that exercise components via Playwright

## Gotchas — learned building StatCard

- **Composability: props for the homogeneous, `ReactNode` slots for the heterogeneous.** A card/section
  reused with small per-instance variations (a label adornment here, top-right action buttons there)
  should take those as `adornment?: ReactNode` / `actions?: ReactNode` slots — not a growing
  boolean/config props API. That's what keeps it from becoming a god-component.
- **Propagate "I'm on a tinted surface" with an explicit `onColor` boolean, not context.** A `tone` CVA
  on the shell + an `onColor` flag passed to the child atoms so they switch to `currentColor` instead of
  their own `success`/`destructive` token colors.
- **Dropping i18n keys breaks `t()` at *compile* time.** react-i18next types `t` from the resource keys,
  so removing a locale key errors every component still calling it (this caused the dashboard tsc
  failure). Pair locale cleanup with component cleanup.

## Gotchas — learned building AdditionalCostsCard

- **Scaffold first.** A new route/component/store/form/primitive → `bun cli …` *before* hand-writing.
  Its house rules pre-wire i18n (`t('<prefix>.<slot>')` + seeds both locale JSONs), `.and()` schema
  composition, and `className`/CVA + ComponentProps — exactly the things that otherwise come back as
  review rounds. Hand-write only when *editing* existing files.
- **All visible copy + every container `aria-label` is i18n from the first pass**, not a follow-up.
- **Components take `className` via `ComponentProps`.** `({ className, ...props }: ComponentProps<'div'>)`
  (or `ComponentProps<typeof Label>` etc.) merged with `cn('…', className)`; use the `@/components/ui`
  primitive (`Label`, `Tooltip`) — don't hand-roll a `<label>`/hover.
- **Consume discriminated-union BFF reads without narrowing.** A 4-variant union (GetDashboard
  `SINGLE_GLOBAL | SINGLE_NATIONAL | MULTI_GLOBAL | MULTI_NATIONAL`) lets you deep-access *common*
  nested paths directly (`data.details.chargeback.byStatus.total.value`) — the leaf type is the union
  across variants. Narrow (`data.kind === 'SINGLE_*'`) only for branch-specific fields like
  `data.store.currency` (absent on MULTI).
- **One render path for mono + consolidated money.** Model money leaves as
  `MoneyValue = number | Record<CurrencyCode, number>` with `formatMoneyValue`/`sumMoney`
  (`@/lib/format`): single-store passes numbers, consolidated passes per-currency records joined by
  " · ". Same component renders both tenancy scopes.
- **Bind rows to the rich `details` breakdown, not the flat totals** (`stat.costs.segments`). The
  breakdown is what feeds each row's hover tooltip (chargeback → Aberto/Perdido/Ganho/Taxas).
- **Type list + skeleton keys off the schema.**
  `const COST_KEYS = [...] as const satisfies readonly (keyof Details)[]` (with
  `type Details = GetXOutput['details']`). Rows AND the loading skeleton map the same typed tuple, so
  they can't drift from the contract.
- **i18n `t()` keys are literal-only.** A dynamic `t(\`a.b.${k}\`)` is a template-literal key the typed
  `t()` rejects (returns `unknown` → wall of TS2322). Write the full literal key per call. Translate in
  the owning Section; leaf components receive finished strings (stay presentational).

### Storybook for connected (data-fetching) components

A component that calls an SDK query hook + `getRouteApi(...).useSearch()` is storied with real infra,
not a presentational refactor:

- **MSW** (`msw-storybook-addon`): `initialize()` + `loaders:[mswLoader]` in `.storybook/preview.tsx`,
  `staticDirs:['../public']`, `bun x msw init public`; per-story
  `parameters.msw.handlers = [http.get('*/v1/<path>', () => HttpResponse.json(mock))]`.
- **QueryClient**: wrap the story in `QueryClientProvider` with `queries:{ retry:false }`.
- **Stub router**: reproduce the exact file-route id with a pathless `createRoute({ id:'(app)' })`
  parent + child `path:'x/'` (yields `/(app)/x/`), mounted via `RouterProvider` +
  `createMemoryHistory({ initialEntries:['/x'] })`.
- ky retries 5xx → use **400** in error stories to fail fast. Init i18n by importing `'../src/lib/i18n'`
  in the preview (its top-level-await bundles fine); add a `locale` toolbar globalType to preview both
  languages. **CLI gap:** `bun cli` does not scaffold this story harness yet — file it.
- Verify headlessly with `bun run storybook:build` (bg jobs have no browser).
