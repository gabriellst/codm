# app-astro — local conventions

> Scoped rules for `packages/app/astro`. Architecture (route, component, primitive, landing/blog patterns) lives in the root `CLAUDE.md` and `.claude/skills/{route,component,primitive}/astro/`. This file pins the conventions that are easy to get wrong **inside this package**.

## Locale-prefixed routing (locale → path pattern)

Astro's i18n integration uses **route-based localization**: `[locale]` folder prefix maps to i18n routing. The app defines two locales (`pt` and `en`) at the Astro config level; `pt` is the default locale and renders **without prefix** (`/` for pt, `/en/...` for en), governed by `routing: { prefixDefaultLocale: false }` in `astro.config.mjs`.

- **Routes are colocated by locale**: `src/pages/[locale]/index.astro`, `src/pages/[locale]/blog/[...slug].astro`.
- **Detect the active locale inside a route** from `Astro.params.locale` (in `getStaticPaths` and the page body), never from `Astro.url` parsing — the params are the canonical source.
- **Link between locales** via the `localizedPath(url, targetLocale)` helper in `src/i18n/index.ts`, which strips the current prefix and applies the target one:
  ```astro
  <a href={localizedPath(Astro.url, 'en')}>English</a>
  ```
- **`getStaticPaths` must declare both locales explicitly** for every dynamic route:
  ```ts
  export async function getStaticPaths() {
    const posts = await getCollection('blog')
    return posts.flatMap(post => [
      { params: { locale: 'pt', slug: post.slug }, props: { post } },
      { params: { locale: 'en', slug: post.slug }, props: { post } },
    ])
  }
  ```
  If a content piece is **locale-exclusive** (e.g., `pt/` blog posts only), filter in the collection query before the `.map()` — don't generate dead routes.

## Static HTML first — React islands when JS is unavoidable

All routes and components are **`.astro` files** (server-rendered at build time / per-request in SSR) by default. They emit zero JavaScript.

**Reach for a React island (`.tsx`)** only when:
- The UI needs **controlled state** (`useState`, form submission with validation).
- It reads from `window` / `document` (theme detection, scroll position, viewport).
- It listens to user interactions beyond `<a href>` and plain form submission (`click` → state change, keyboard handlers).

**Choose the right hydration directive** (least JS first):
- `client:visible` (default) — hydrates only when scrolled into view. Use for below-the-fold widgets (newsletter signup, interactive cards).
- `client:load` — hydrates on page load. Use only for critical above-the-fold interactivity.
- `client:idle` — hydrates after the page becomes interactive (low priority, like analytics opt-ins).
- `client:media="(max-width: 768px)"` — conditional hydration (mobile-only features).
- `client:only="react"` — last resort, skips SSR. Use only when the component reads `window` at render time.

**Forms on the landing site** stay static (POST to an API route or transition to the React app at `/app`) unless they need real-time validation feedback — then wrap in a React island and mount with `client:visible`.

## Data fetching — getCollection + content collections, no SDK hooks

Routes and components fetch data via **Astro content collections** (Zod-typed) and **frontmatter `fetch()`**, never SDK React Query hooks (those are React-only).

### Content collections — build-time Zod

`src/content/config.ts` defines collections (blog posts, landing page copy). Each collection uses a `glob` loader + a Zod schema:

```ts
// src/content.config.ts
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      publishedAt: z.coerce.date(),
      coverImage: image().optional(),
      // ... other fields
    }),
})
```

Inside a route, fetch with `getCollection()` and filter if needed:

```astro
---
import { getCollection } from 'astro:content'

const posts = (await getCollection('blog', ({ id, data }) => 
  id.startsWith('pt/') && (import.meta.env.DEV || !data.draft)
)).sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime())
---
```

**Key patterns:**
- **Locale-scoped content** — prefix the content file path with locale (`pt/ola-mundo.mdx`, `en/hello-world.mdx`) and filter on `id.startsWith(locale)` in the collection call.
- **Draft posts** — add a `draft` boolean field to the schema; exclude them in production with `!data.draft` (the filter runs before returning the list).
- **Render MDX** — call `await post.render()` to get the `<Content />` component.

### Frontmatter `fetch()` — runtime SSR

For data that changes frequently (not checked in), fetch inside the route's frontmatter:

```astro
---
const data = await fetch(import.meta.env.PUBLIC_API_URL + '/api/stats')
  .then(r => r.json())
---
```

**Environment variables** in Astro:
- `PUBLIC_*` — visible to the browser (via `import.meta.env.PUBLIC_*`).
- Non-`PUBLIC_` — server-only, accessible only in frontmatter.

## Shared design tokens via `@codm/app-styles`

The astro app imports `@codm/app-styles/tokens.css` once in `src/styles/global.css`:

```css
@import "@codm/app-styles/tokens.css";
@import "@codm/app-styles/web-utilities.css";
```

After that, all components use **CSS variables** (`var(--background)`, `var(--primary)`) or **Tailwind utilities** that map to those tokens. Never inline a hex value. If a token is missing, add it to the shared `tokens.css` rather than forking inline.

Example (from `BaseLayout.astro`):
```astro
<body class="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
```

## i18n — `getLocale()` + content collection entries

Locale-aware copy lives in **content collections** (e.g., the `landing` collection with `src/content/i18n/{pt,en}/landing.json`). Fetch the entry inside the route using `getEntry()`:

```astro
---
import { getEntry } from 'astro:content'
import { getLocale } from '~/i18n'

const locale = getLocale(Astro.url)
const entry = await getEntry('landing', `${locale}/landing`)
const t = entry!.data
---

<h1>{t.hero.title}</h1>
```

**Pattern:** never hardcode strings inside `.astro` — all user-facing copy flows through a content entry keyed by locale. Tests assert on the JSON keys, not the literal strings.

## BaseLayout — SEO metadata baseline

Every page passes through `BaseLayout.astro`, which emits:
- `<title>` and `<meta name="description">`
- Open Graph tags (`og:title`, `og:image`, `og:url`)
- Twitter card meta
- Canonical link
- Optional `<script type="application/ld+json">` for structured data

```astro
<BaseLayout
  title={post.data.title}
  description={post.data.summary}
  ogImage={ogUrl}
  canonical="https://..."
  jsonLd={{ '@context': 'https://schema.org', '@type': 'BlogPosting', ... }}
>
  <!-- page content -->
</BaseLayout>
```

The layout also wraps `<Nav>` and `<Footer>` (both `.astro` files that call `getLocale()` to detect the current locale and emit locale-aware navigation).

## React islands in `.astro` — islands are siblings, not nested

A React island lives as a `.tsx` file in `src/components/` and is imported + mounted from `.astro` with a `client:*` directive:

```astro
---
import ThemeToggle from '~/components/ThemeToggle.tsx'
---

<nav>
  <ThemeToggle client:visible />
</nav>
```

**Island conventions:**
- Island `.tsx` files can import React hooks and have `export default function` (not named exports).
- The `.astro` file imports and mounts the island; the island receives props.
- No Zustand in islands (state lives in the island's `useState`); islands are ephemeral and don't need cross-page state.
- Forms inside islands validate against SDK schemas (same as the React app) if they submit to the API.

## Checklist (before declaring done)

- [ ] Routes and components are `.astro` files (islands are `.tsx` siblings, minimal, mounted with the smallest hydration directive).
- [ ] Content is sourced from collections (`getCollection`, `getEntry`), never hardcoded strings.
- [ ] All user-facing text flows through a locale-scoped content entry or collection.
- [ ] Routes use `getStaticPaths` to declare locales explicitly; locale-exclusive content is filtered before `.map()`.
- [ ] Colors come from CSS variables / Tailwind utilities mapped to `tokens.css`, never inline hex.
- [ ] Locale is detected from `Astro.params.locale` or `getLocale(Astro.url)`, never from URL parsing.
- [ ] Links between locales use `localizedPath(Astro.url, targetLocale)`.
- [ ] No imports from `@codm/app-react/*` — astro is its own workspace.
- [ ] SEO: `<title>`, `<meta name="description">`, OG tags, and (for blog posts) `jsonLd` are passed to `BaseLayout`.
- [ ] Output mode left as `static` unless SSR is genuinely required per-route.

## References

- `src/pages/` — route files (locale-prefixed, `.astro` with `getStaticPaths`).
- `src/components/` — primitives and islands (`.astro` + `.tsx`).
- `src/content/config.ts` — collection schemas (Zod).
- `src/content/i18n/` — locale entries (`pt/landing.json`, `en/landing.json`).
- `src/i18n/index.ts` — locale helpers (`getLocale()`, `localizedPath()`, `LOCALES`).
- `src/layouts/BaseLayout.astro` — SEO baseline, Nav, Footer.
- `src/styles/global.css` — imports `tokens.css` + `web-utilities.css`.
- `astro.config.mjs` — i18n config (`routing: { prefixDefaultLocale: false }`), integrations, output mode.
- `.claude/skills/{route,component,primitive}/astro/SKILL.md` — skill playbooks.
