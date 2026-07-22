# app-react — local conventions

> Scoped rules for `packages/app/react`. Architecture (route → component → primitive, data
> ownership, stores, forms) lives in the root `CLAUDE.md` and `docs/FRONTEND.md`. This file
> only pins conventions that are easy to get wrong **inside this package**.

## Formatting & locale

**Never hardcode a locale in any formatter.** Every locale-aware format (`Intl.NumberFormat`,
`Intl.DateTimeFormat`, `Number.prototype.toLocaleString`, `Date.prototype.toLocaleDateString`,
and the `formatMoney` / `formatPercent` helpers in `@/lib/format`) takes the **active app
locale** — never a literal `'pt-BR'` / `'en-US'` / `undefined`.

### The `Locale` type (typed, never `string`)

The locale is a typed union — the single source of truth is `@/lib/locale`:

```ts
// src/lib/locale.ts
export type Locale = 'pt-BR' | 'en-US'
export const DEFAULT_LOCALE: Locale = 'pt-BR'
```

- **Helper functions** take `locale: Locale = DEFAULT_LOCALE` — a typed param with a default,
  **not** `locale = 'pt-BR'` (which infers `string`).
- **`useLocale()`** (`@/hooks`) returns `Locale`, inferred from i18n (`en*` → `en-US`, else `pt-BR`).
  It is the source of the active locale inside components.

```ts
// ✅ helper: typed param + default
import { type Locale, DEFAULT_LOCALE } from '@/lib/locale'

export function formatPercent(ratio: number, locale: Locale = DEFAULT_LOCALE, fractionDigits = 1): string {
  return new Intl.NumberFormat(locale, { style: 'percent', ... }).format(ratio)
}

// ❌ never
export function formatPercent(ratio: number, locale = 'pt-BR') { ... }   // locale: string
new Intl.DateTimeFormat('pt-BR', { ... })                                // hardcoded
date.toLocaleDateString('pt-BR')                                         // hardcoded
```

### In a component: get the locale from the hook, thread it down

```tsx
import { useLocale } from '@/hooks'

export function SomeRow({ row }: SomeRowProps) {
  const locale = useLocale()
  return <span>{new Date(row.date).toLocaleDateString(locale)}</span>
}
```

- **Leaf components** (rendered N times) call `useLocale()` themselves — it's cheap and keeps
  them self-contained; don't prop-drill the locale.
- Inside a **`useMemo` column def** (DataTable cells), read `const locale = useLocale()` in the
  component body and add `locale` to the memo's dependency array.
- A module-level helper that a component passes down (e.g. `formatValue`) stays a typed
  `(locale: Locale = DEFAULT_LOCALE)` function; the component wraps it with the active locale:
  `const formatValue = (n: number) => formatCurrency(n, locale)`.

## Money

Money is always **cents + currency**, single-currency on the wire (converted server-side).
Components never pick a currency or a locale — they hand a `Money` to `useMoney()` and render
the finished string.

### The `Money` type comes from the SDK — not from `@/lib/format`

```ts
// ✅
import type { Money } from '@codedm/client-typescript/typescript'

// ❌ @/lib/format does NOT re-export Money
import type { Money } from '@/lib/format'
```

### Render money with `useMoney()`

`useMoney()` (`@/hooks`) returns a formatter already bound to the active locale (via `useLocale`):

```tsx
import { useMoney } from '@/hooks'

export function ProductCard({ product }: ProductCardProps) {
  const formatMoney = useMoney()
  return <span>{formatMoney(product.price)}</span>   // price: Money  → "R$ 12,34"
}
```

- Use `useMoney()` for any money value in a component — do **not** call `formatMoney` from
  `@/lib/format` directly in components (that bypasses locale inference). `formatMoney(money,
  locale)` is the low-level helper `useMoney` wraps; call it directly only outside React (tests).
- `sumMoney(items: Money[])` (`@/lib/format`) sums same-currency values into one `Money`.

## Components & ComponentProps

Components that render a layout/presentational root extend `ComponentProps<root>` so callers can
pass `className` + spread props — see the `component` skill (`bad_practice` **bp-20**, enforced by
the `classify-edit` edit hook + `bun review`). `({ className, ...props }: ComponentProps<'div'>)`
with `<div className={cn('…', className)} {...props}>`; leaves intersect:
`interface XProps extends ComponentProps<'div'> { item: T }`.

## Dialogs — useDialogStore only

Dialogs open via `useDialogStore().show(<XDialog item={item} />)` and close via `hide()` —
the dialog is self-contained and receives its subject by prop. **Never** `open`/`onOpenChange`
props, never `useState` holding the selected entity or an `isOpen` flag (component bp-24,
form react FRM-P35, store STR-P10 case 3). Unmounting via `hide()` clears form state for free.

## Enum labels — the typed i18n catalog, never strings in code

Human-readable enum labels come **only** from `t(\`enums.<Enum>.${value}\`)` or an
`i18nPrefix`-driven primitive (`<Select enum={XEnum} i18nPrefix="enums.X" />`). The t() keys
are **type-checked** — using them forces the matching entries into BOTH `src/locales/pt.json`
and `en.json` or `tsc` fails, which is the point. Never inline label strings next to enum
values, never a `Record<Enum, string>` **label** map in code (bp-23). Icon/color/variant
maps are a different thing — they resolve to styles, not labels, and they're canon (next
section).

## All user-facing text goes through i18n — never an inline literal

Enum labels are one case of a wider rule: **every** user-facing string — JSX text children,
`aria-label`, `placeholder`, `title`, `alt` — comes from `t('<key>')`, never an inline literal.
The typed-keys trick only catches keys you *use* via `t()`; it cannot catch a literal that
*bypasses* `t()` — so `<Button>Save</Button>` and `placeholder="Buscar moeda"` are defects. The
typed lint rule `local/no-hardcoded-jsx-text` (scripts/eslint-rules/) flags them; i18n keys
(dotted paths like `enums.X.Y`) and non-text (numbers, symbols, `{expr}`) are not text and pass.

## Every actionable button is wired — a text-only button is a defect

A `<Button>` exists to *do* something: it carries an `onClick`/`onPress`, is `type="submit"` in a
form, or `asChild`/`render={<Link/>}` for navigation. A button with text and **no** handler does
nothing — the most common dead-UI bug. Wire it to the mutation/command it should call; **if that
command doesn't exist yet, create it** (the use case + controller + SDK hook), don't leave the
button inert. Enforced by `local/button-needs-handler`; the Base UI composition pattern
(`render={<Button/>}`, where the parent wires the action) and `disabled` placeholders are exempt.

## SDK enums type everything they touch — never widen to `string`

When a wire field is an SDK enum (`category: NotificationCategory`), every structure that
field flows through keeps the enum type — widening to `string` anywhere drops the
exhaustiveness the contract gives you for free. **Mechanically enforced**: the typed lint
rule `local/no-enum-widening` (scripts/eslint-rules/) errors on any literal-union value
flowing into a plain-`string` slot we own; external sinks (DOM/lib params), template
literals and explicit `String(x)` are the sanctioned boundaries:

- **Route search params** — `category: z.enum(NotificationCategoryEnum).optional()` (or the
  SDK's generated zod schema, e.g. `notificationCategorySchema`) in `validateSearch`, never
  `z.string()`. The URL contract is typed by the same enum the backend speaks.
- **Dispatch maps** (icon/color/variant per enum value) — one module-level map **colocated
  with the component that owns the dispatch**, keyed by the enum:
  `const CATEGORY_ICON: Record<NotificationCategory, ElementType> = { … }` — never
  `Record<string, …>`. Enum-keyed maps are exhaustive: a new enum member makes `tsc` demand
  the new entry, and lookups never need a `?? fallback`. (No `switch`/ternary chains on the
  value — `CMP-P18`.)
- **Iterating options** — `Object.values(XEnum)` inline where needed; no hand-typed parallel
  array of the values.

## State placement — five questions, asked BEFORE any useState

The owner rule is store `STR-P10`; this is the binding short form. For EVERY piece of
state, in order:

1. **Server data?** → SDK React Query hooks ONLY — never mirrored into useState.
2. **Bookmarkable/shareable view state?** (filters, tabs, pagination, search text,
   deep-linkable selection) → **ROUTE SEARCH PARAMS** — the case builders miss most.
   The search schema COMPOSES from the wire contract: start from the SDK query-params
   schema, `.omit()` app-global-store-owned fields (tenancyScope), `.and(z.object({...}))`
   route-local additions — and EVERY field carries `.default()` so a garbage deep link
   renders defaults. Exemplar: `dashboardSearchSchema` in `routes/(app)/dashboard/index.tsx`.
3. **Cross-component client state?** (sibling-shared selection, dialog content) → Zustand.
4. **Form fields?** → TanStack Form; derived values via `form.Subscribe` narrow selectors —
   never mirrored to useState/store on onChange.
5. **Truly local transient UI?** (hover, uncontrolled draft, private disclosure) → the ONLY
   sanctioned `useState`.

If a value fits case 2 AND case 3, case 2 wins (shareability beats convenience).

## Scaffold first

`bun cli` has recipes for routes, components, dialogs and forms (docs/CLI.md) — scaffold the
artifact, then fill it in. The scaffolds emit the canonical shapes (store-driven dialogs,
validateSearch shells, i18n-ready labels); hand-writing them from memory is how the canons
above get missed.

## Real-time — useServerEvents, never polling, never cache surgery

The backend streams owner-scoped integration events over SSE (`GET /v1/ui/events`,
`ListenEventsController`). The frontend consumes them through two hooks in `@/hooks`:

- **`useServerEventSource()`** — establishes THE connection. Mounted exactly once, in the
  `(app)` route layout. Components never mount it.
- **`useServerEvents(name | name[], callback)`** — typed subscription. `name` is the
  SDK-derived `ServerEventName` union (`ListenEventsQueryResponse['name']`) — a typo'd
  event name is a tsc error. Array form for sibling events; discriminate via `event.name`.

**The canonical callback is guard-then-invalidate:**

```tsx
const { data: session } = useGetSession()
const queryClient = useQueryClient()

useServerEvents('integration.billing.subscription_changed', event => {
  if (event.ownerId !== session?.session.ownerId) return           // 1. guard by envelope owner
  queryClient.invalidateQueries({ queryKey: listPlansQueryKey() })  // 2. invalidate
})
```

- **Invalidate the SDK query key — never `setQueryData`/manual cache mutation.** The query
  refetches and the single source of truth stays the backend read model.
- The stream is **already owner-scoped server-side** (the broadcaster filters by session
  owner) — an `event.ownerId` guard is only needed for SUB-owner scoping (a specific
  entity id). Owner-wide list refreshes subscribe and invalidate directly. The canonical
  callback also lives in the `useServerEvents` JSDoc.
- UI side-effects (scroll pinning, toasts) go AFTER the guard, never instead of invalidation.
- One shared handler for sibling events is canon
  (`useServerEvents(['x.updated', 'x.deleted'], invalidateList)`).
- Never poll (`refetchInterval`) for data that has a server event — subscribe instead.
- New events become subscribable by adding them to the curated `BROWSER_EVENTS` list in
  `ListenEventsController` (they MUST carry a direct `ownerId` — the broadcaster tenancy
  filter depends on it) and running `bun sdk`.
