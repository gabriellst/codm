---
name: route
description: Create a page route. Defines the URL contract, search/path params validation, layout, and breadcrumbs. Routes through a react / expo / astro child based on the working directory.
---

# Create Route (parent)

A **route** is the URL contract for a page: it declares the path, validates path/search params, defines the layout, and composes route-scoped components. Each platform implements this with its own router.

## Platform routing (READ FIRST)

| Working file path                            | Use                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/app/react/**`                      | [`./react/SKILL.md`](./react/SKILL.md) + [`./react/registry.yaml`](./react/registry.yaml) — TanStack Router + Start (file-based via `bun tsr generate`) |
| `packages/app/expo/**`                       | **DORMANT** — no expo workspace in this repo (`packages/app/expo` removed); no file resolves here. [`./expo/`](./expo/SKILL.md) kept as reference only, in case a mobile target returns. |
| `packages/app/astro/**/*.astro`              | [`./astro/SKILL.md`](./astro/SKILL.md) + [`./astro/registry.yaml`](./astro/registry.yaml) — Astro pages + content collections + sitemap |

If the path is **ambiguous**, ask the user once and don't proceed until they answer.

## What "route" means (cross-platform)

A route is:

1. **A URL contract** — path segments, optional locale prefix, validated search params (where supported), breadcrumb metadata.
2. **A thin shell** — declares layout + which route-scoped components render in it. Does **not** fetch data to pass into components; on the interactive platforms, components own their own data.
3. **Server-renderable on react (Start) and astro** — static-by-default on astro; opt-in SSR on react Start; pure client on expo.

## Shared principles

1. **One file per route.** File path mirrors URL.
2. **Validated search params.** React: `validateSearch: zodValidator`. Expo: `useTypedSearchParams(schema)`. Astro: parse `Astro.url.searchParams` in frontmatter.
3. **Localized paths** where the platform supports it. React + astro use a `[locale]` segment; expo uses i18next dictionaries scoped per route.
4. **Breadcrumbs / `<title>`** declared at the route level. React via `staticData.breadcrumb`; astro via `<BaseLayout title=...>`; expo via `<Stack.Screen options={{ title }} />`.
5. **No data fetching in the route shell** (react/expo). Components own their data. Astro is the exception — its frontmatter IS where data fetching happens.

## When to use this skill

- Adding a new page or screen URL.
- Adding a localized variant of an existing route.
- Adding an Astro content page (blog post, landing section as its own URL).

## When NOT to use this skill

- Adding a sub-section of an existing route → `/component`.
- Adding a modal / dialog → `/component` (react) or `/sheet` (expo).
- Adding a primitive → `/primitive`.

## Checklist (parent-level)

- [ ] Platform identified from working directory (or asked the user).
- [ ] Reading only the matching child SKILL + registry.
- [ ] Search/path params declared with the right validator for the platform.
- [ ] Route file is a thin shell — components own their data (react/expo) or frontmatter owns it (astro).
