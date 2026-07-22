# app-expo — local conventions

> Scoped rules for `packages/app/expo`. The architecture (Expo Router, uniwind, native
> primitives) lives in `.claude/skills/{route,component,form,primitive}/expo/` and the
> expo-only `sheet` skill. This file pins the conventions that are easy to get wrong
> **inside this package** — several deliberately DIVERGE from the react web app.

## Modals are routes (NAV-MODAL)

There is no Dialog primitive and no `useDialogStore` on mobile — **the router is the modal
state machine**. A deep-linkable modal is a `(sheets)/<name>/` route registered in the root
`app/_layout.tsx` via `Stack.Screen` with an **explicit `presentation`**; dismissal pairs with
it (`router.back()` for `pageSheet`/`formSheet`, `router.dismiss()` for `fullScreenModal`).
The sheet receives **at most ids via typed params** and fetches its own data inside
(sheet `SHT-P05`) — never the subject object through a store/context/params, and never raw
`useLocalSearchParams` (route-closure RC-06 gates it). The id-only case still goes through
the typed hook with a default:
`const [{ id }] = useTypedSearchParams(z.object({ id: z.string().default('') }))` — a
garbage/empty deep link renders the not-found state, never crashes. Route folder and
registration land in the SAME change (both drift directions exist as live bugs).

## State placement (expo spelling of store STR-P10)

- Screen filters/tabs/pagination → `useTypedSearchParams(schema)` from `@/lib/typed-route`,
  **every field `.default()`-ed** (a garbage deep link renders defaults, never crashes).
  `useLocalSearchParams` raw or `useState` for filters is wrong.
- Server data → SDK hooks only; never mirrored into `useState`.
- Ephemeral overlay open-state (a transient filter Sheet) → local `useState` — the one
  sanctioned case; deep-linkable modals are routes (above).
- Wizard/draft state → a route-scoped `-stores/<flow>-store.ts` consumed by one route.

## Locale & money — `@/lib` helpers, not hooks

`useLocale()` / `useMoney()` **do not exist on mobile**. Dates/money format via the helpers in
`@/lib/format` and `@/lib/format-date` (locale resolved from i18n inside the helper). Never a
hardcoded `'pt-BR'`/`ptBR`, never a per-component `format*` wrapper (component/expo bp-16).
SDK `Money` is **cents**; the lib money helper takes **units** — convert before rendering.

## Enum labels — the typed i18n catalog, never strings in code

Human-readable enum labels come **only** from typed `t(\`enums.<Enum>.${value}\`)` keys
(react-i18next, typed against `locales/en.json` via `@types/i18next.d.ts`). Using `t()`
forces the matching entries into BOTH `locales/pt.json` and `en.json` or `tsc` fails —
which is the point: the catalog can never drift. When a screen displays an SDK enum value
(a category, a status, a type), that display string is **copy, not style** — it goes through
the catalog exactly like every other piece of screen copy you localize. Adding
`enums.<EnumName>.<VALUE>` entries to both locale files is part of the SAME change that
renders the value. Never inline label strings next to enum values, never a
`Record<Enum, string>` **label** map in code, never re-case the raw wire value
(`value.replace('_', ' ')` is a label map in disguise). Icon/color/variant maps keyed by
the SDK enum are a different thing — they resolve to styles, not labels, and they're canon
(`Record<NotificationCategory, CategoryStyle>` module-level, exhaustive, no `?? fallback`).

## Colocation truth

Every file under `app/` is a route node to expo-router — colocated components live at
`-components/<Name>/index.tsx` with **named exports only** (a default export makes a phantom
route navigable). Auth gating happens at the layout level — screens inside `(tabs)` are
already gated; only routes OUTSIDE gated groups (e.g. `(sheets)/...`) wrap in `<Protected>`.
