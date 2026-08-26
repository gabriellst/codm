# Frontend Architecture

> Full architectural reference for the frontend workspaces. The **why** behind the patterns. For **how** to implement each artifact, load the matching `.claude/skills/<name>/SKILL.md` (or its `react`/`astro` variant).

## The two frontends

| Workspace | Path | Stack | URL space | Purpose |
|---|---|---|---|---|
| **react** | `packages/app/react/` | React 19 + Vite + **TanStack Start** + Router/Query/Form + Zustand + Base UI + Tailwind 4 | `/app/...` (basepath) | The app — auth, dashboards, mutations, anything stateful |
| **astro** | `packages/app/astro/` | Astro 5 + MDX + Tailwind 4 + `@astrojs/sitemap` + content collections | `/`, `/pt`, `/en`, `/blog/...` | Public-facing landing + blog + SEO |

A third workspace, **`packages/app/ui/`**, ships the shared UI primitives AND `@codm/app-ui/tokens.css` — design system + tokens consumed by `react` and `astro` so the landing page and the app look identical. A fourth, **`packages/app/tauri/`**, is the desktop shell: a Tauri v2 host that serves the react console as its webview and supervises the TS daemon + Go gateway sidecars (see `.claude/skills/desktop-shell/SKILL.md`).

**Routing handoff.** In production, nginx splits the request: `/` and `/blog/...` go to the astro build; `/app/...` goes to the TanStack Start server (with SSR on auth routes, hydrated app otherwise). Locally, `bun dev` runs both servers in parallel and you switch by URL prefix.

The **react app** is a **composition pipeline**: routes are thin shells that declare the URL contract and layout; every component owns its own data through React Query; URL state is shareable through search params; interactive state lives in Zustand. The typed SDK (`@codm/client-typescript`) feeds it all.

The **astro app** is **render-time**: pages and components run at build/SSR time, emit zero JavaScript by default, and reach for React islands (`client:*`) only when interactivity is genuinely needed. The `app/ui` workspace ensures dark mode / theme tokens line up with the react app.

The rest of this document covers the **react app** in depth. For the astro specifics, load the matching skill variant:

- `.claude/skills/component/{react,astro}/SKILL.md`
- `.claude/skills/route/{react,astro}/SKILL.md`
- `.claude/skills/primitive/{react,astro}/SKILL.md`
- `.claude/skills/form/react/SKILL.md` (no astro variant — use a React island)
- `.claude/skills/desktop-shell/SKILL.md` (flat — Tauri shell + `lib/native` seam)

---

## First-Class Citizens

| Citizen | Lives in | Role | Relates to |
|---|---|---|---|
| **Route** | `routes/**/route.tsx`, `index.tsx` | Thin shell: URL contract (path, `validateSearch`, `staticData.breadcrumb`, `errorComponent`) and layout composition. Does **not** fetch data to pass down | Renders components by name |
| **Component** | `routes/**/-components/Name/index.tsx` | Owns its own data: reads search params, Zustand, calls SDK hooks, handles mutations, renders inline skeleton on `undefined` data. Container components use the `Section` suffix as a naming convention (`PatientListSection`) but live in `-components/` like everything else | Composed inside routes; renders primitives and leaf components |
| **Leaf Component** | `routes/**/-components/Parent/Child/` (colocated) | Receives a single item via props (rendered N times inside a `.map()`); does not re-fetch | Used by a container component that owns the list query |
| **Primitive** | `@codm/app-ui/*` (`packages/app/ui/src/components/`) | Reusable UI atom (Base UI + CVA + Tailwind) | Used everywhere |
| **Form** | inside component / dialog | TanStack Form + SDK Zod schema (single or multi-step) | Submits via SDK mutation |
| **Store** | `stores/` (global) or `routes/**/-stores/` (route-scoped) | Zustand store for interactive client state; optional `persist` middleware | Read directly by components; never by leaf components |
| **Hook** | `hooks/` or `routes/**/-hooks/` | Cross-cutting helpers (`useDebouncedSearch`, `useDialogStore`, `useSessionMode`, …) | Encapsulates client behavior |
| **Dialog** | self-contained component | Opened via `useDialogStore.show(<...>)`; owns its form, mutations and invalidations | No `open`/`onOpenChange` props |

**Composition rule:**
- Routes describe URL + layout.
- Components fetch their own data — **no prop drilling of data, search params or callbacks**.
- Leaf components inside a `.map()` are the **only** case where props for data are appropriate.
- URL state lives in route search params; interactive state lives in Zustand.

---

## Folder Structure

```
packages/app/react/src/
├── stores/                          # Global Zustand stores (shared across routes)
│   ├── useThemeStore.ts
│   └── useDialogStore.ts            # Global dialog state
├── hooks/                           # Global custom hooks
├── components/
│   └── ui/                          # Primitives (Base UI + CVA)
└── routes/
    └── [context]/
        ├── route.tsx or index.tsx   # Thin route shell + inline type exports
        ├── -components/             # ALL route-specific components live here
        │   ├── PatientListSection/  # Container — `Section` suffix by convention
        │   │   ├── index.tsx
        │   │   ├── PatientCard/     # Colocated leaf (receives single item)
        │   │   │   └── index.tsx
        │   │   └── stories/
        │   └── FilterBar/
        │       └── index.tsx
        ├── -stores/                 # Route-scoped Zustand stores
        └── -hooks/                  # Route-scoped custom hooks
```

Conventions:
- **All components live in `-components/`** — there is no separate `-sections/` folder.
- Container components use the `Section` suffix purely to signal "I own data and orchestrate this region of the screen" — they're still components.
- Each component has its own folder with `index.tsx` + optional `stories/`.
- Leaf components are colocated under their parent (e.g. `PatientListSection/PatientCard/`).
- Types are declared inline in the route file using SDK response types — no `-types/` folder.

---

## Why Routes Are Thin Shells

| Aspect | Routes | Components |
|---|---|---|
| URL contract | ✅ | ❌ |
| Search-params validation (`validateSearch`) | ✅ | ❌ |
| Breadcrumb (`staticData.breadcrumb`) | ✅ | ❌ |
| `errorComponent` | ✅ | ❌ |
| Conditional layout decisions | ✅ | ❌ |
| Fetch data | ❌ | ✅ |
| Read search params | layout-only via `Route.useSearch()` | ✅ via `routeApi.useSearch()` |
| Read Zustand | ❌ | ✅ |
| Render skeletons | ❌ (UI stays visible) | ✅ inline when `data` is undefined |

The route never blocks rendering on `isLoading` — every component is responsible for its own skeleton.

---

## "Owns Query" vs "Receives Props"

The decision rule for any new component: **"Am I rendered N times inside a `.map()`?"**

- **No** → component owns its query. Reads IDs from search params or Zustand and calls the SDK hook directly.
- **Yes** → component receives a single item as a prop. The parent owns the list query and maps it.

```
ProductList         ← owns useListProducts()           (rendered once)
  └── ProductCard   ← receives { product }             (rendered N times)

ChatSidebar         ← owns useListChannels()           (rendered once)
  └── ChatListItem  ← receives { item }                (rendered N times)

PatientInfoPanel    ← owns useGetPatient()             (rendered once, not repeated)
```

Leaf components are reusable and testable because they only depend on their props. They MAY own mutations (a delete button on a card) but they MUST NOT re-fetch the item they already received.

---

## State Management Strategy

| State Type | Solution | When |
|---|---|---|
| **Server data** | React Query via SDK hooks | All API data — each component fetches what it needs (React Query deduplicates) |
| **URL state** | TanStack Router search params | Bookmarkable: selected items, filters, pagination, active tabs |
| **Interaction state** | Zustand store | Ephemeral state shared between components (typing indicators, selected ID, draft state) |
| **Dialog state** | Global `useDialogStore` | Opening dialogs from anywhere |
| **Local state** | `useState` | Simple component state with no sharing |

### Decision framework

**URL search params when** state should survive refresh, be shareable, represent a user selection (selected chat, active tab), or affect data fetching (filters, pagination, sorting).

**Zustand store when** state is shared between multiple components but shouldn't be in the URL — real-time ephemeral state (typing indicators, presence, draft replies), or state that loses meaning on refresh.

**Global Dialog Store when** opening a dialog/modal from any component; the dialog content is self-contained (owns layout, buttons, behavior).

**`useState` when** the state is local to a single component and doesn't need to be shared.

### Search-param schemas

Compose SDK schemas with `.and()` — never `.extend()`, which overwrites SDK constraints like `.default()`, `.refine()`, `.max()`:

```ts
const searchSchema = listPatientsQueryParamsSchema.and(z.object({
  selectedId: z.string().optional(),
}))
```

Search inputs use `useDebouncedSearch` (TanStack Pacer) — debounces URL param updates at 300ms by default.

### Global Dialog pattern

Dialogs are self-contained components opened via `useDialogStore`. They own their form, mutation, query invalidation, and close behavior.

| Type | Props | Has form |
|---|---|---|
| **Create** | none | Yes — TanStack Form with empty defaults |
| **Update** | entity ID | Yes — fetches data, pre-fills form |
| **Delete / Confirm** | entity ID + display name | No — just a mutation call |

Opening:
```tsx
const { show } = useDialogStore()
show(<CreateUnitDialog />)
show(<UpdatePatientDialog patientId={patient.id} />)
show(<DeleteServiceDialog serviceId={service.id} serviceName={service.name} />)
```

Dialog component:
```tsx
export function CreateItemDialog() {
  const { hide } = useDialogStore()
  const form = useForm({ ... })
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Create Item</DialogTitle></DialogHeader>
      <form noValidate onSubmit={e => { e.preventDefault(); form.handleSubmit() }}>
        {/* fields */}
        <DialogFooter>
          <Button variant="outline" onClick={hide}>Cancel</Button>
          <Button type="submit">Create</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
```

The app layout reads `useDialogStore` and renders a `<Dialog>` shell directly — no provider needed. Callers provide `<DialogContent>` with their desired size, header, footer, and buttons. Dialogs unmount on `hide()`, so form state is cleaned up automatically. For destructive confirmations, use the generic `ConfirmDialog` primitive at `@codm/app-ui/confirm-dialog` plus `useDialogStore.confirm(options): Promise<boolean>`.

For shared color/label mappings across an enum, use the maps in `@/lib` — do not redefine local variant maps. Prefer `Record<Enum, ...>` lookups over `switch`/`case` for closed vocabularies (Open–Closed).

---

## SDK Usage

The SDK is generated from both backends' OpenAPI specs (`bun sdk`). Import from a single path:

```ts
import {
  useListExample,
  useCreateExample,
  listExampleQueryParamsSchema,
  createExampleMutationRequestSchema,
  CreateExampleMutationRequest,
  ExampleStatus,
  listExampleQueryKey,
} from '@codm/client-typescript/typescript'
```

### Type inference

Declare derived types at the route file and import from there:
```ts
export type ExampleItem = ListExampleQueryResponse['items'][number]
// in components:
import type { ExampleItem } from '../..'
```

### Discriminated-union payloads

Method-discriminated payloads (e.g. `payInvoice` — `CARD` vs `PIX`) arrive as a Zod union. Reach a variant's fields via the schema's `.def.options`, and use the generated discriminator enum for the tag values — no need to import the auto-generated PascalCase variant names:

```ts
import {
  payInvoiceMutationRequestSchema,
  PayInvoiceMutationRequestMethodEnum,
} from '@codm/client-typescript/typescript'

// options[0] = CARD variant, options[1] = PIX variant
payInvoiceMutationRequestSchema.def.options[0].shape.paymentMethodId
PayInvoiceMutationRequestMethodEnum.CARD // 'CARD'
```

### Query keys & mutations

```ts
// ✅ Use SDK query-key functions
await queryClient.invalidateQueries({ queryKey: listExampleQueryKey() })

// ✅ Mutation calls — direct top-level properties (no params/body/query prefixes)
await createMutation({ data: formData })
await updateMutation({ id: entityId, data: formData })
await deleteMutation({ id: entityId })
```

---

## API Error Handling

Every API error returned by the backend has a typed code (`ApiErrorsEnum` from the SDK). The frontend has a **global dispatcher** that converts each code into either a translated toast or a custom side-effect — most often **navigation**. This means a backend middleware throwing `ONBOARDING_NOT_COMPLETED` automatically redirects the user to `/onboarding` without any per-component code.

### How it wires (read once, then forget)

```
SDK throws on a query / mutation
        │
        ▼
main.tsx
   QueryCache.onError  ──► handleApiError(error)
   MutationCache.onError ─►
        │
        ▼
lib/errors.ts
   extractErrorCode(error) → 'ONBOARDING_NOT_COMPLETED'
   customErrorHandlers[code] ?? defaultErrorHandler
        │
        ▼
Custom handler runs (e.g. router.navigate({ to: '/onboarding' }))
   OR
Default handler shows toast.error(i18n.t(`errors.${code}`))
```

Because the wiring lives at the `QueryCache` / `MutationCache` level, **every** query/mutation in the app inherits this behaviour. No `try/catch`, no `onError` callback per mutation — the dispatcher handles it once.

### The two surfaces

| Surface | Where | Purpose |
|---|---|---|
| `errorsEnum` | `packages/app/react/src/lib/errors.ts` | Union of all error codes — `ApiErrorsEnum` from the SDK + frontend-only codes (`NETWORK_ERROR`, `UNKNOWN_ERROR`, `SESSION_EXPIRED`). |
| `customErrorHandlers` | `packages/app/react/src/lib/errors.ts` | `Partial<Record<ErrorCode, ErrorHandler>>` — opt-in override per code. Empty by default = falls through to toast. |

```ts
// packages/app/react/src/lib/errors.ts (excerpt)
const customErrorHandlers: Partial<Record<ErrorCode, ErrorHandler>> = {
  ONBOARDING_NOT_COMPLETED: () => {
    router.navigate({ to: '/onboarding' })
  },
  ONBOARDING_ALREADY_COMPLETED: () => {
    auth.getSession().then(({ data }) => {
      const session = data as unknown as SignIn200 | null
      const ownerKind = session?.session?.ownerKind
      if (ownerKind === OwnerKindEnum.ORGANIZATION) router.navigate({ to: '/dashboard' })
      else if (ownerKind === OwnerKindEnum.INDIVIDUAL) router.navigate({ to: '/dashboard' })
    })
  },
}
```

### When to add a custom handler vs let it toast

| Symptom | Treatment | Why |
|---|---|---|
| User is in the wrong state for this call (`ONBOARDING_NOT_COMPLETED`, `SESSION_EXPIRED`) | **Custom handler** — `router.navigate(...)` | Redirect explains the next step. A toast on top of a redirect is double-noise. |
| Conditional redirect based on session (`ONBOARDING_ALREADY_COMPLETED`) | **Custom handler** — read session, navigate | Frontend needs the runtime context to choose the destination. |
| User did something invalid (`PATIENT_NOT_FOUND`, `ALREADY_EXISTS`, `INSUFFICIENT_STOCK`) | **Default toast** | The user stays on the page; toast tells them what's wrong. |
| Network / system failure (`NETWORK_ERROR`, `UNKNOWN_ERROR`) | **Default toast** | Generic failure message. |

### Adding a new routing-by-error case

1. **Backend** — throw `BaseError<XErrors>('YOUR_CODE')` from a middleware (preferred) or use case.
2. **Backend** — register the code in `<ctx>/errors/index.ts` and in `GlobalErrorMapper` with the correct HTTP status (see `docs/BACKEND.md` → Error Handling).
3. Run `bun sdk` so the code appears in `ApiErrorsEnum`.
4. **Frontend** — add the i18n key in `pt.json` and `en.json` under `errors.YOUR_CODE` (defensive fallback if the custom handler is later removed).
5. **Frontend** — add the custom handler:
   ```ts
   const customErrorHandlers: Partial<Record<ErrorCode, ErrorHandler>> = {
     YOUR_CODE: () => router.navigate({ to: '/your-route' }),
   }
   ```

After step 5 every query and mutation in the entire app automatically routes when the backend returns `YOUR_CODE`. No per-component change needed.

### Rules

- **Never wrap a mutation in `try/catch` to handle errors.** `MutationCache.onError` already runs globally — wrapping duplicates the toast or, worse, swallows the dispatcher's custom handler.
- **Never read `error.code` from a query/mutation result.** The dispatcher already extracted it and ran the right handler. If a component needs to do something extra on an error, use `error` from React Query's `useQuery` return for *visual* state only — never for navigation.
- **Always add an i18n key when you add a custom handler.** Even if the handler navigates away, removing it later should fall back to a translated toast rather than a raw code on screen.
- **Custom handlers are for global semantics.** "User must finish onboarding" is global. "This specific form failed to save" is not — that's the toast's job.

### Key files

- `packages/app/react/src/main.tsx` — `QueryClient` setup with `QueryCache.onError` + `MutationCache.onError` calling `handleApiError`.
- `packages/app/react/src/lib/errors.ts` — `errorsEnum`, `customErrorHandlers`, `handleApiError`, `extractErrorCode`, `defaultErrorHandler`.
- `packages/app/react/src/locales/{pt,en}.json` — `errors.<CODE>` keys.

For the backend side of this contract (middlewares, error registration, status mapping), see `docs/BACKEND.md` → Error Handling and `.claude/skills/middleware/SKILL.md`.

---

## Forms

Forms use TanStack Form with SDK Zod schemas, so validation stays synchronized with the backend automatically.

- `validators.onSubmit` — SDK schema.
- `defaultValues` — SDK type.
- Select options — SDK enums.
- Input masking — Maskito via the `/form` skill.

Three form shapes covered by the `/form` skill:
1. Standalone page form (sign-in, create, update).
2. Multi-step wizard with field arrays.
3. Dialog form (Type C — opened via `useDialogStore`).

---

## Routing & Navigation

- Route files declare `staticData: { breadcrumb: 'Label' }` (consumed by the Header via `useMatches()`).
- `validateSearch` parses URL params with an SDK-composed Zod schema.
- `errorComponent` is always defined.
- `createSearchParamsUpdater` produces stable navigation utilities for components.
- Route trees are regenerated with `cd packages/app && bun tsr generate` after route changes.

---

## Data Loading & Prefetch (react)

> React platform only (TanStack Router/Start). Astro fetches differently — see its route skill.

Duas máquinas de cache com papéis distintos: o **TanStack Router** decide *quando* vale buscar
(navegação, hover, focus — ciclo de vida da navegação); o **React Query** decide *se* precisa
buscar (cache hit? stale?). O loader é o ponto de encontro: o Router o chama, ele delega ao
React Query via `context.queryClient.ensureQueryData(<sdk>QueryOptions(...))`.

Invariantes de app (`packages/app/react/src/router.tsx`):

- `defaultPreload: 'intent'` — hover/focus em `<Link>` prefetcha o chunk da rota E roda o loader.
- `defaultPreloadStaleTime: 0` — zera o cache próprio do Router para loaders; o React Query é a
  ÚNICA autoridade de staleness (sem isso haveria dois caches com regras de expiração brigando).
- Router context = DI: `{ queryClient }`. Loaders rodam fora do React — o context é o
  equivalente de injeção de dependência para esse mundo sem hooks.

O loader roda em três gatilhos: preload por intenção (hover/focus — especulativo), navegação de
fato (reusa o preload em voo se houver), e mudança de `loaderDeps` (mesma rota, search novo).
`ensureQueryData` tem a semântica exata para isso: cache tem dado → retorna SEM request (hover
repetido = zero tráfego); cache vazio → busca e popula. Quando o componente monta, o `useQuery`
do hook encontra o cache quente (render imediato) e ainda revalida em background (staleTime 0).

Três regras fazem o sistema funcionar — detalhes e snippets na skill `route/react`
(§Loader & Prefetch) e enforcement no registry (RTE-P15..P17, bp-14..bp-17):

1. **Identidade de queryKey:** o loader usa o MESMO `<sdk>QueryOptions` com o MESMO shape de
   params que o hook do componente. Divergência = segunda entrada de cache = prefetch inútil,
   falha silenciosa.
2. **`loaderDeps` declara a identidade do dado a partir da URL** — o Router só re-roda o loader
   quando deps mudam, e o preload é calculável sem renderizar nada.
3. **Erro de prefetch nunca falha a navegação** (`.catch(() => null)` / `Promise.allSettled`) —
   o loader é um otimizador de cache, não o dono do dado; falha degrada para o comportamento
   antigo (componente trata), nunca para RouteError de página inteira.

A posse do dado NÃO muda: componentes seguem donos via hooks SDK (thin shell — bp-13); o loader
só aquece o cache. Scaffold: `bun cli route ... --loader` (docs/CLI.md).

---

## Session & Conditional Routing

BetterAuth provides session data (user + session with custom fields). The base hook is `useSession()`.

When a specific field drives UI behavior, expose it through a **derived hook**:

```ts
export const useSessionMode = () => {
  const session = useSession()
  if (!session) return { value: undefined }
  return { value: session.session.mode }
}
```

Custom session fields (declared via BetterAuth `additionalFields`) can drive:
- **Navigation** — sidebar items per role/mode.
- **Feature gating** — show/hide based on session state.
- **Routing** — redirect or conditionally render.

```ts
const { value } = useSessionMode()
const items = value === 'OWNER' ? OWNER_ITEMS : MEMBER_ITEMS
```

### Sign-in custom params

Pass extra parameters at sign-in time via `fetchOptions.body`; the backend reads them in a BetterAuth `after` hook on `/sign-in` to derive session fields or cookies:

```ts
await auth.signIn.email({
  email, password,
  fetchOptions: { body: { customParam: 'value' } },
})
```

### Key files

- `packages/app/react/src/lib/auth.ts` — BetterAuth client setup.
- `packages/app/react/src/hooks/useSession.ts` — Base session hook.
- `packages/app/react/src/hooks/` — Derived session hooks (e.g., `useSessionMode.ts`).

---

## Onboarding Step Taxonomy

The `/onboarding` wizard and the dashboard's deferred-items panel are both driven by the same
vocabulary of **steps** — declared once, in `packages/app/react/src/routes/onboarding/-components/steps.ts`.

### `Step` is the genus, `SystemPrecondition` is a species

Every screen the wizard shows — an intro slide, a setup task, a host permission — is a `Step`. A
`SystemPrecondition` is not a special case bolted on top: it's just the species of `Step` whose
existence and satisfaction come from a fact about the operator's machine (a macOS permission) rather
than from the product's own data. It slots into the same `StepId` union, the same
`STEP_COMPONENTS` dispatch map, and the same taxonomy table as every other step — it just happens to
appear and disappear from the wizard's step list on its own, driven by a host probe instead of a
persisted flag.

### Two orthogonal axes, two different readers

A step declares exactly two properties, and each one is read by a **different surface**. Keeping
them orthogonal — never inferring one from the other — is what stops the wizard from needing to know
anything about the dashboard, and vice versa.

| Axis | Values | Governs | Question it answers |
|---|---|---|---|
| **`kind`** | `INFORMATIVE` \| `REQUIRED` \| `DEFERRABLE` | The **wizard** | What happens if the operator leaves this step undone right now? |
| **`impact`** | `BLOCKING` \| `ADVISORY` | The **dashboard** | What stays broken later, while it's undone? |

`INFORMATIVE` means seeing the step **is** completing it (an intro slide — there's nothing to
satisfy). `REQUIRED` means the wizard's "Concluir" button stays disabled until it's satisfied.
`DEFERRABLE` means the operator can finish onboarding without it, and the step reappears somewhere
else afterward. `BLOCKING` means some real capability doesn't work while the step is outstanding;
`ADVISORY` means only the step itself is missing — nothing else breaks.

A step's `kind` never determines its `impact`, and the wizard component never reads `impact` (nor
does the dashboard panel read `kind`). The three intro slides and the final step are `INFORMATIVE` +
`ADVISORY`. `WORKSPACE` is `DEFERRABLE` + `BLOCKING` (the operator can finish onboarding without a
workspace and add one later from the dashboard). `CHANNEL`/`CONTACT`/`AGENTS`/`REVIEW`/
`FULL_DISK_ACCESS` are `REQUIRED` + `BLOCKING` since 2026-08-26 (founder override, revoking the
original decision that had all five as `DEFERRABLE`: the wizard let "Próximo"/"Concluir" advance with
no channel paired, no contact/provider picked, and no reviewed+attached thread — a real defect, not a
deliberately deferred step). `ADVISORY`-without-`BLOCKING` combinations remain first-class,
deliberately unused-but-declared members of the union (the vocabulary exists to be documented even
before every combination has a member). `STEP_TAXONOMY` is a `Record<StepId, …>`, not a `Partial` —
a new `StepId` without an entry fails `tsc`, not silently renders a blank card.

The wizard's own "Próximo" gate (`CAN_CONTINUE` in `OnboardingFlow`, one `Record<StepId, boolean>`
per render derived from live store/query state — same dispatch-by-map canon as `AttachThreadWizard`'s
own `CAN_CONTINUE`) is a **separate, finer-grained** mechanism from `kind`: it blocks advancing past
**any** step with nothing chosen yet, `WORKSPACE` included, even though `WORKSPACE`'s `kind` doesn't
block "Concluir". `kind: REQUIRED` only governs whether **finishing the wizard** is possible
(`canComplete`); `CAN_CONTINUE` governs whether **leaving the current step** is possible. A step can
be gated by one, the other, or both.

### Four sources of satisfaction — and the one that can never be persisted

A step's `kind`/`impact` say what it means to be undone; a **separate** question is where the
wizard learns whether it's *currently* done. There are exactly four sources, one per species:

| Species | Satisfaction comes from |
|---|---|
| Presentation (intro slides) | Persisted journey position (`currentStep`, from the server) |
| Setup (channel, workspace, thread) | Derived from the database — an existence query, re-run on every read |
| `SystemPrecondition` | The host — a live probe (`SystemPreconditionsService.statuses()`) |
| Final | None — it's the destination, not something that gets satisfied |

**A host fact can never be persisted as "satisfied," full stop.** A macOS permission is revocable at
any moment, outside the app, with no event the console can subscribe to — so the only honest way to
know whether Full Disk Access is granted right now is to ask the host right now. If a
`SystemPrecondition`'s "done" state were written to the database once and read back later, revoking
the permission after that write would leave the wizard and the dashboard both confidently wrong. This
is why the server *never* receives or stores anything about `SystemPrecondition`s — it doesn't run on
the operator's machine and can't answer the question — and why the probe re-runs on every window
`focus`, not just on mount: focus is the only signal available that the operator might have changed
something in System Settings while the app was in the background.

The database-derived sources follow the same never-persist discipline for a related reason: a setup
step's "done" flag is a query ("does a `CONNECTED` channel exist?"), not a record of "the operator
once passed through here." Deleting the only channel un-does the `CHANNEL` step on the very next read
— there is no separate "completed setup steps" ledger to fall out of sync with reality.

See `packages/app/react/src/routes/onboarding/-components/steps.ts` for the concrete `StepId` union,
`STEP_TAXONOMY` table, and the pure `onboardingSteps(pending)` composition function.

---

## Frontend Testing — layers & boundary rule

The console's tests are not split by tool (Storybook vs. a test runner) — they're split by **whether
the unit under test has a screen**. Getting that placement right the first time is a single question,
not a case-by-case judgment call; the layers below are the mechanical consequence of answering it.

### The boundary rule

> **Has a screen → story (with `play` for behavior). Is an absence or a decision with no screen →
> colocated test. Crosses the stack with real processes and a real browser → e2e.**

A component that already has a `*.stories.tsx` never gets an independent `.test.tsx` sibling that
mounts it again — its behavior lives in `play`, executed by `bun test` via `composeStories`, not in a
second, parallel mount. A hook, a route guard, a pure module, or a service port has no screen to put a
story on, so it gets a colocated `.test.ts(x)` next to the file it tests. Anything that needs a real
browser and real backend processes together — the thing neither of the first two layers can honestly
simulate — is an e2e spec, unchanged.

### The four layers

| Layer | Runs in | Guarantees | Does **not** guarantee |
|---|---|---|---|
| **Story (visual)** | Storybook browser | The component renders correctly across its declared variants; states the real backend can't produce (forced error, eternal loading) are visible via MSW, which only works here (a real Service Worker) | Nothing about `bun test` — the browser never runs the commit gate |
| **Story `play` (behavior, in `bun test`)** | `bun test`, via `composeStories` (`tests/support/storybook`) + the smoke test | The story compiles and mounts on every commit (`stories-smoke.test.tsx` composes and renders every `*.stories.tsx` in the repo, generically, by glob); `play` interactions exercise real component behavior against the integration harness | Visual correctness (happy-dom has no layout) — that's the browser layer's job, not this one |
| **Colocated test (behavior, in `bun test`)** | `bun test`, next to the file under test | The same as `play`, for anything with no screen: a hook, a gate, a pure module — real Container, real assertions at the boundary that answers the question | A screen exists to look at — if you're describing what renders, you're in the wrong layer |
| **e2e** | Playwright, real browser + real processes | The path of truth end-to-end: file-backed SQLite, real migrations on disk, a real node bundle, a real browser | Fast feedback — it's the slowest, most expensive layer on purpose, and stays that way |

**Both `bun test` layers (story `play` and colocated) share one network rule:** behavior assertions
hit the **integration harness** by default — a real backend booted in-process. MSW is not banned, but
it is now VISUAL-ONLY: it works in the Storybook browser (a real Service Worker) and nowhere `bun test`
runs, because MSW measurably does not intercept under bun (see below). Nothing in `bun test` mocks the
network by hand — the harness computes the answer instead.

### The integration harness

`useIntegrationBackend()` (`packages/app/react/tests/support/integration-harness.ts`) boots the
**same production composition root** the console talks to in real life: `assembleMainRouter()`
(`packages/api/typescript/src/server.ts` — the one function both `src/index.ts`'s production boot and
this harness call, so the two can never drift apart) wired with `ALL_REGISTRIES.integration` (in-process
driver, real migrations, in-memory mediator), started on an ephemeral port, with the SDK client pointed
at it via `configureClient`. An SDK hook call inside a story `play` or a colocated test goes through a
real controller, real middleware, and a real use case — the test asserts the **computed** result
(`getOnboarding().completedAt`), never a mock's echo of what it was told to return.

**Why by default, not an occasional upgrade:** a typed mock only ever returns what was seeded, which
forces the test to assert by proxy (a call count, a request signature). The harness computing the
response lets the assertion be the behavior itself — the same category of trust the backend's own
integration tests already place in PGlite-backed suites.

**What it costs (measured):** boot happens once per `bun test` process — the module caches the booted
backend, so every subsequent `useIntegrationBackend()` call in the same run returns the same instance;
observed boot time is on the order of ~750–1080ms for that one-time cost, and a subsequent SDK round
trip (SDK → Fastify → SQLite) is on the order of ~20ms. The react side's `tsc` is **unaffected** — the
harness is reached through a frozen, structural, type-only contract
(`@codm/api-typescript/testing-contract`, zero internal backend aliases) plus a dynamic `import()` with
a **computed** specifier for the implementation, so react's `tsc` never has to walk the backend's
internal module graph to type this file. Seeding is composed by the **consuming test**
(`createGivenHelpers(backend.asTestBed())`, from `loadBackendGivens()`) — the harness itself knows no
product-specific `given` helper, which is what keeps it portable tooling rather than product code.

This is a **ratified exception** to "frontend only consumes the backend through the SDK": test code may
import the backend's test support (`@codm/api-typescript/testing`, `/testing-contract`) — production
code never may.

### The two rails

Two architecture tests in `packages/app/react/tests/architecture/` turn the canon's easiest-to-violate
rules into commit-time failures instead of tribal knowledge:

- **`router-load.test.ts`** — globs every `*.test.{ts,tsx}` under `src/`; a file that mounts
  `<RouterProvider` without a `router.load()` call first (and isn't using the shared `mountRouter`
  helper, which already includes it) fails, naming the file. The trap this closes was measured, not
  theoretical: without `load()`, `RouterProvider` mounts empty and only resolves on a future tick —
  production React's build swallows that render without honoring `act()`, so a test can pass by
  accident under the wrong build. 18 tests were green for exactly that reason before the rail existed.
- **`fetch-stub.test.ts`** — globs the same tree for `globalThis.fetch =`; any manual fetch stub
  outside a hardcoded `INVENTORY` array fails, naming the file. The inventory is **shrink-only**: it
  was seeded with today's pre-harness offenders so the tooling commit itself could land green without
  waiting on every consumer to migrate; each one that moves to the harness (or, for a genuinely
  unproducible state, to MSW-in-Storybook) comes out of the list. A new stub added anywhere outside the
  inventory is a fresh violation.

### MSW under bun — measured, not assumed

Both fallbacks the design considered were implemented and measured in isolation before being ruled
out: `msw-storybook-addon`'s `initialize()` needs a real browser Service Worker
(`'serviceWorker' in navigator` is `false` under bun/happy-dom — `worker.start()` doesn't throw, it
just never intercepts anything), and the `msw/node` fallback (`setupServer`) was built and measured
separately — even after fixing the "relative URL" root cause with an absolute `configureClient` base,
requests never reached the interceptor and hit the real network instead (`ECONNREFUSED`). An isolated
probe (a bare `http.request()`, no happy-dom/ky/story in the loop) reproduced the identical gap:
`@mswjs/interceptors`'s `ClientRequestInterceptor` does not hook `node:http` under bun — a runtime
incompatibility, not a wiring defect in this repo.

The founder's ruling from that measurement: unproducible states are **visual-only** — a story with MSW
handlers, viewed in the Storybook browser, where MSW genuinely works. There is no sanctioned network
double inside `bun test`; every behavior assertion that needs network hits the integration harness,
full stop. `packages/app/react/tests/support/storybook.spike.test.tsx` is a standing **canary**: it
asserts today's measured gap (a mocked participant's name never arrives in the rendered story) and
turns red the day msw-under-bun starts working — the trigger to revisit this ruling, not a routine
assertion to keep green forever. `.storybook/preview.tsx` guards MSW's `initialize()` to run only where
a real Service Worker exists, so no story under bun/happy-dom even attempts to install the broken
interceptor.

### Where the how-to lives

The `/storybook` skill (`.claude/skills/storybook/SKILL.md`) is the single playbook for all four
layers above — dumb vs. connected stories, the mock helper table, the colocated-test canon (mount
against the real Container, assert at the boundary, `mountRouter`, wait by condition, no layout
assertions in happy-dom), and the harness usage pattern. `packages/app/react/**/*.test.{ts,tsx}` is
classified to it in `.claude/registry.yaml`, so `/review` and `bun review` apply its checklist to
colocated tests the same way they already did to stories.

---

## References

- `docs/BACKEND.md` — Backend architecture (controllers, schemas, events, auth model)
- `docs/COMPONENTS.md` — Primitive component documentation
- `.claude/skills/<name>/SKILL.md` — Per-artifact implementation playbook
