---
name: component
description: Create a route-scoped component that owns its own data. Lives in <route>/-components/, reads URL/store state directly, fetches via SDK hooks. Routes through a react / astro child based on the working directory.
---

# Create Route-Scoped Component (parent)

A **component** in this codebase is the unit one step above primitives and one step below routes: it composes primitives, owns its data, and reads its own params. The two platforms (`react` web app, `astro` landing/blog) share the same mental model — they differ in how params come in and what they render against.

## Platform routing (READ FIRST)

Detect platform from the working directory and **load only the matching child**:

| Working file path                            | Use                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/app/react/**/*.tsx`                | [`./react/SKILL.md`](./react/SKILL.md) + [`./react/registry.yaml`](./react/registry.yaml) — TanStack Router `routeApi.useSearch()`, Base UI primitives |
| `packages/app/astro/**/*.astro` or `*.tsx`   | [`./astro/SKILL.md`](./astro/SKILL.md) + [`./astro/registry.yaml`](./astro/registry.yaml) — `.astro` components, React islands with `client:*` |

If the file path is **ambiguous**, ask the user once and don't proceed until they answer. Never duplicate platform-specific guidance into this parent file.

## Core mental model (cross-platform)

Every component is responsible for the data it renders. The component reads params, fetches data, and handles mutations internally. The parent route does NOT push data into it via props.

| Need                                       | Source                  | How                                                                                          |
| ------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------- |
| URL state (filters, selected ID, page)     | Route's URL params API  | React: `routeApi.useSearch()` · Astro: `Astro.url.searchParams` (frontmatter) |
| Update URL state                           | Route navigation API    | React: `routeApi.useNavigate()` · Astro: `<a href>` / full reload |
| Client state (UI toggles, selections)      | Zustand store           | `useStore(s => ...)` — react only; Astro components are stateless unless on a React island |
| Server data                                | React Query / SDK hook  | `useListX(...)` / `useGetX(...)` — react; Astro fetches in frontmatter (build-time or SSR) |
| Mutations                                  | React Query / SDK hook  | `useMutation(...)` — react; Astro is read-only (forms POST to an api route or React island) |

**No prop drilling of data, search params, or callbacks** on the interactive platform. React Query deduplicates — if multiple components call the same query, only one network request fires. On Astro, props flow top-down at render time but no client state survives navigation.

## Decision rule: owns query vs receives props

**"Am I rendered N times in a `.map()`?"**

- **No** → component owns its query. Reads IDs from store/params, calls SDK hook.
- **Yes** → component receives a single item as a prop. Parent owns the list query and maps items.

```
ProductList (owns query — rendered once)
  └── ProductCard ({ product } — rendered N times)
```

Leaf components (cards, rows, badges) are reusable + testable because they only depend on their props. They CAN own mutations (a delete button on a card) but should NOT re-fetch the item they already received.

## Shared principles (apply on ALL platforms)

1. **Component owns data** — fetches what it renders, never receives `data=` as a prop from a route.
2. **Two param sources only** — URL state or client state. No `useState` for things a user could share via deep link.
3. **Primitive first** — check the platform's `components/ui/` folder before reaching for raw HTML / RN primitives / Astro tags.
4. **Open/Closed Principle** — never hardcode lists of options in JSX. Derive options from SDK Enums + a labels map.
5. **DRY local** — repeated JSX in the same file → extract a local component (don't ship it as a primitive unless reused elsewhere).
6. **Accessibility / testability** — icon-only triggers need an accessible label (react: `aria-label`, astro: `aria-label` on the rendered HTML). Form fields connect their input to their label by ID.
7. **Folder per component** — `ComponentName/index.tsx` (NOT `ComponentName.tsx`) for react; `ComponentName.astro` (single file) is acceptable for astro components that don't have subleaves.
8. **Stories / previews are private** — `-stories/` (or equivalent) only; never export a `XSkeleton`.

## Folder structure (shared convention)

```
<route>/                       # react: route folder; astro: pages/ folder
├── (route entry)              # react: index.tsx; astro: index.astro
├── -components/                # react: route-private components; astro: relative imports
│   ├── ComponentName/
│   │   ├── index.tsx          # react
│   │   └── SubLeaf/index.tsx
│   └── ComponentName.astro    # astro
├── -stores/                    # react only (Zustand)
└── -hooks/                     # react only
```

## Platform differences (deep dive in each child)

| Concern                | React                                                | Astro                                                       |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Read URL state         | `const routeApi = getRouteApi('/(app)/products/'); routeApi.useSearch()` | `const { searchParams } = Astro.url` (frontmatter)         |
| Navigate / update URL  | `routeApi.useNavigate()`                             | `<a href>`; client islands navigate via `window.location`  |
| Primitive folder       | `@codm/app-ui/` (lowercase-kebab files)           | `src/components/` (.astro files; islands as .tsx)          |
| Modal patterns         | `Dialog`, `AlertDialog` global stores                | n/a — landing pages don't host modals; use a React island   |
| Icons                  | `@tabler/icons-react` (`IconX`)                      | Inline `<svg>` or `astro-icon`                              |
| Empty state primitive  | `Empty / EmptyHeader / EmptyTitle / EmptyMedia`      | Static markup                                               |
| Skeleton primitive     | `Skeleton` from `@codm/app-ui/skeleton`           | n/a — Astro is render-time; no skeletons                    |
| Interactivity boundary | Always interactive                                   | Stateless by default; opt into `client:*` on a React island |

## When to use this skill

- Building any route-specific UI component (list, panel, card, dialog shell, filter bar, landing section).
- Adding inline skeleton loading states (react).
- Extracting repeated JSX into a local or nested component.

## When NOT to use this skill

- Reusable design system component → `/primitive`
- New page / screen / astro page → `/route`
- Form with validation → `/form` (react only)
- State management → `/store` (react only)

> **Modal with data input** (react): use `/form` for the form. This skill covers the shell and layout.

## Checklist (parent-level, before reading the child)

- [ ] Platform identified from working directory (or asked the user).
- [ ] Reading only the matching child SKILL + registry.
- [ ] Component goes in `<route>/-components/` (react) or the appropriate `src/components/` location (astro).
- [ ] Decided owns-query-vs-receives-prop based on "Am I rendered N times in a `.map()`?".

Once the platform is settled, jump to the matching child for the full guide.
