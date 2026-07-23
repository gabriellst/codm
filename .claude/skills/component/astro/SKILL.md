---
name: component (astro)
description: Create an Astro component for the landing/blog app (packages/app/astro/src/components/) — static, render-time HTML by default. Reaches for a React island (`.tsx` with `client:*`) only when interactivity is truly needed. Use for hero sections, feature grids, blog cards, marketing CTAs, and the static parts of the landing site.
---

> **Parent**: [`../SKILL.md`](../SKILL.md) — cross-platform mental model.
> **BEFORE IMPLEMENTING**: Open [`./registry.yaml`](./registry.yaml) and read `patterns` + `bad_practices`.

# Create Astro Component (static-first, island-when-needed)

Creates a server-rendered component for `packages/app/astro/`. Astro components render once at build time (or per-request in SSR) and **emit zero JavaScript** by default. Reach for a React island only when the UI genuinely needs interactivity that can't be done with CSS or progressive enhancement.

## Placement — vertical slice vs shared

Components that belong to **one page** live inside that page's vertical slice under `src/pages/_<page>/` (the `_` prefix keeps the folder out of the file router). The landing is the exemplar: `src/pages/_landing/{Landing.astro,sections/*,DotWave.tsx,content/{config.ts,i18n,plans,loaders}}` — components, islands, collection **definition** and **content** all colocated; `src/content.config.ts` only aggregates the slice's re-exported collections, and the route files (`index.astro`, `en/index.astro`) stay thin shells importing the slice's composition root. `src/components/` is reserved for **genuinely shared** components (Nav, Footer, LocaleSwitcher, BlogCard). Boundary rules: shared components may consume a slice's collection by **name + schema** (`getEntry('landing', ...)`) but must never path-import from `_<page>/`; slice files may import shared modules freely. See `src/pages/_landing/README.md` for the worked boundary table.

## Core mental model

| Need                                  | Source                          | How                                                                                |
| ------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Page-scoped data (build-time)         | `src/content/` collection       | `import { getCollection } from 'astro:content'`; `await getCollection('posts')`     |
| Page-scoped data (runtime SSR)        | Astro frontmatter `fetch()`     | `const data = await fetch(import.meta.env.PUBLIC_API_URL + '/...').then(r => r.json())` |
| URL state                             | `Astro.url.searchParams`         | `const tab = Astro.url.searchParams.get('tab')` (frontmatter, no client JS)         |
| Page-scoped params (`/blog/[slug]`)   | `Astro.params`                   | `const { slug } = Astro.params`                                                     |
| Interactivity (toggle, dropdown, form)| React island                    | `<MyIsland client:visible />` — but **only** when CSS / HTML can't do it            |
| i18n (translated strings)             | Project `i18n/` helper           | Import the locale dictionary in frontmatter; render literal strings                  |

**No React Query, no Zustand, no React hooks in `.astro` files.** Everything that needs runtime state lives on an explicit React island. Keep islands as small as possible.

## When to use this skill

- Building any section of a landing page (hero, features, testimonials, CTA, footer).
- Building a blog card / post header / post list shell.
- Composing a layout block that wraps other Astro components.
- Wrapping a tiny interactive widget (newsletter form, theme toggle) as a React island and consuming it from `.astro`.

## When NOT to use this skill

- Building a route or page → `/route` (astro variant).
- Building a complex stateful UI (chat, multi-step form) → that lives in `packages/app/react/`, not Astro. Link out to `/app/...` from the landing page.
- Building a primitive that is reused across `.astro` files → `/primitive` (astro variant).

## Folder structure

```
packages/app/astro/src/
├── components/
│   ├── Hero.astro                # static section
│   ├── FeatureGrid.astro          # static composition
│   ├── BlogCard.astro             # static, receives `post` prop
│   ├── ThemeToggle.tsx            # React island — has its own `.astro` shim if needed
│   └── ...
├── content/
│   ├── config.ts                   # collections schema (Zod)
│   └── posts/<slug>.mdx
├── layouts/
│   └── BaseLayout.astro            # wraps every page
├── pages/
│   ├── index.astro
│   └── blog/[slug].astro
├── i18n/
│   └── pt.ts | en.ts
└── styles/
    └── global.css                  # imports @codedm/app-styles/tokens.css
```

## Astro component anatomy

```astro
---
// Frontmatter — runs at build time (or per-request in SSR mode).
// TypeScript here.
import BaseLayout from '../layouts/BaseLayout.astro';
import { t } from '../i18n';

export interface Props {
  title: string;
  ctaHref?: string;
}

const { title, ctaHref = '/app' } = Astro.props;
const locale = Astro.currentLocale ?? 'pt';
---

<section class="bg-background py-24 text-center">
  <h1 class="text-4xl font-bold text-foreground">{title}</h1>
  <a
    href={ctaHref}
    class="mt-8 inline-flex items-center rounded-md bg-primary px-6 py-3 text-primary-foreground"
    aria-label={t(locale, 'hero.cta.aria')}
  >
    {t(locale, 'hero.cta.label')}
  </a>
</section>

<style>
  /* Optional component-scoped CSS. Most projects rely on Tailwind utilities. */
</style>
```

## React islands — when you can't avoid them

Some UIs require JS: a controlled form, a live counter, an interactive carousel. Wrap the interactive piece as a `.tsx` file, then mount it from `.astro` with a `client:*` directive.

```astro
---
import ThemeToggle from '../components/ThemeToggle.tsx';
---

<nav>
  <!-- Renders the island only after the page becomes visible -->
  <ThemeToggle client:visible />
</nav>
```

**Choose the right directive** — least JavaScript first:

| Directive          | When to use                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `client:load`      | Critical above-the-fold interactivity. Sends JS on initial page load.   |
| `client:visible`   | Below-the-fold widgets — newsletter form, carousel, comments. Default. |
| `client:idle`      | Non-urgent — analytics opt-ins, live chat bubble.                       |
| `client:media`     | Conditional — only mobile, only desktop.                                 |
| `client:only="react"` | Last resort — Astro can't pre-render the component (e.g. uses `window`). Ships JS *and* skips SSR. |

If you can implement it with `<details>`, a CSS-only dropdown, or a form that POSTs to an API route, do that instead. Islands are escape hatches.

## i18n

The `astro` workspace uses route-based i18n: `/pt/...`, `/en/...`. Detect the current locale from `Astro.currentLocale` and pass it to a `t()` helper that reads `src/i18n/<locale>.ts`.

```astro
---
import { t } from '../i18n';
const locale = Astro.currentLocale ?? 'pt';
---

<h1>{t(locale, 'home.title')}</h1>
```

Never hard-code strings inside `.astro` — even short ones. The `t()` helper is the single contract; the test asserts on translation keys, not literal text.

## Shared tokens — `@codedm/app-styles`

The astro app imports `@codedm/app-styles/tokens.css` once from `src/styles/global.css`. After that, components use CSS variables (`var(--background)`, `var(--primary)`, etc.) or Tailwind utility classes mapped to those tokens. **Never inline a hex value.** If a token doesn't exist for what you need, add it to the shared `tokens.css` rather than forking color values per page.

## Open/Closed Principle — derive lists from data

Same as react: never hardcode lists in JSX. Source from `getCollection()`, from a frontmatter array, or from a typed constant in `src/lib/`.

```astro
---
import { getCollection } from 'astro:content';
import BlogCard from '../components/BlogCard.astro';

const posts = await getCollection('posts');
posts.sort((a, b) => +b.data.date - +a.data.date);
---

<ul role="list" aria-label="Blog posts">
  {posts.map(post => (
    <li role="listitem">
      <BlogCard post={post} />
    </li>
  ))}
</ul>
```

## SEO & accessibility (mandatory)

Every Astro page-level component should:

- Emit a `<title>` and `<meta name="description">` (usually via `BaseLayout`).
- Set `lang` on `<html>` to the current locale.
- Provide JSON-LD for blog posts and landing pages via `<script type="application/ld+json" set:html={...}>`.
- Use semantic HTML: `<header>`, `<main>`, `<section>`, `<article>`, `<nav>`, `<footer>`.
- Add `aria-label` to icon-only links and `role="list"` / `role="listitem"` to non-`<ul>` lists.
- Add `<a rel="noreferrer">` on external links and consider `target="_blank"` for outbound only when intentional.

## Open Graph & sitemap

- Use `<meta property="og:*">` tags in `BaseLayout.astro` (or per-page overrides).
- The site uses `@astrojs/sitemap` configured in `astro.config.mjs`. Anything in `src/pages/` is auto-included; exclude via `serialize` if needed.
- Generate OG images via the `dynamic-og` route if the page is high-value (homepage, top posts).

## Checklist (before declaring done)

- [ ] Component is a `.astro` file (or, if interactive, a `.tsx` island wrapped from `.astro`).
- [ ] No React hooks or Zustand inside the `.astro` frontmatter.
- [ ] Data comes from `getCollection`, `Astro.props`, or a frontmatter `fetch()` — never from a React Query hook inside `.astro`.
- [ ] All user-facing strings flow through `t(locale, key)`.
- [ ] Colors come from CSS variables / Tailwind utility classes that map to `tokens.css`.
- [ ] If a React island was used, the directive is the smallest viable (`client:visible` ≥ `client:load`).
- [ ] Semantic HTML; icon-only links have `aria-label`.
- [ ] No imports from `@codedm/app-react/*` — astro is its own workspace.

## References

- `packages/app/astro/src/components/` — existing Astro components.
- `packages/app/astro/src/content/config.ts` — content collection schemas.
- `packages/app/astro/src/i18n/` — locale dictionaries.
- `packages/app/astro/astro.config.mjs` — sitemap, MDX, Tailwind plugins.
- `packages/app/styles/tokens.css` — shared design tokens.
- Astro docs: https://docs.astro.build/en/concepts/islands/
