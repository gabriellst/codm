---
name: route (astro)
description: Create a new page route in the astro landing/blog app — file-based pages under packages/app/astro/src/pages/, optionally backed by a content collection. Includes i18n routing (`/pt/...` and `/en/...`), sitemap integration, and SEO metadata via BaseLayout.
---

> **Parent**: [`../SKILL.md`](../SKILL.md) — cross-platform mental model.
> **BEFORE IMPLEMENTING**: Open [`./registry.yaml`](./registry.yaml) and read `patterns` + `bad_practices`.

# Create Astro Route

An astro route is a `.astro` file under `src/pages/` whose path mirrors the URL. The astro app is the public surface — landing pages and the blog — so every route is SEO-first: a `<title>`, a `<meta name="description">`, OG tags, and (for blog posts) JSON-LD live in `BaseLayout.astro` and are passed through props.

## Mental model

| Route type             | File path                                       | URL                                  |
| ---------------------- | ----------------------------------------------- | ------------------------------------ |
| Static landing         | `src/pages/index.astro`                          | `/`                                  |
| Localized landing      | `src/pages/[locale]/index.astro`                 | `/pt/` or `/en/`                     |
| Dynamic blog post      | `src/pages/[locale]/blog/[slug].astro`           | `/pt/blog/<slug>` or `/en/blog/<slug>` |
| Static section page    | `src/pages/[locale]/about.astro`                 | `/pt/about` or `/en/about`           |
| API route (rare)       | `src/pages/api/og.png.ts`                        | `/api/og.png` (dynamic OG image)     |

The `[locale]` folder pattern is the canonical i18n approach (**Option B**): there is **no** unprefixed default locale — `/pt/…` **and** `/en/…` are both prefixed, and the whole home + blog live under one physical `src/pages/[locale]/` tree (`[locale]` is a *literal* on-disk folder — Astro's dynamic segment). `getStaticPaths` returns `[{params:{locale:'pt'}},{params:{locale:'en'}}]` and validates the segment with an `isLocale()` guard.

`/` is a **static client-side redirect shell** (`src/pages/index.astro`): `noindex`, detects locale in the browser (locale cookie → `navigator.language` → fallback `/pt/`) via `location.replace`, with a `<meta http-equiv="refresh">` + `<noscript>` fallback. Upgrade path (documented follow-up): move the decision to an **edge function / middleware** that reads `Accept-Language` + cookie at the CDN and 302s before any HTML ships.

> **Gotcha — do NOT set `i18n.routing.prefixDefaultLocale: true`.** With it `true`, Astro auto-generates its *own* redirect template at `/` and **clobbers** the hand-written client-side shell (you lose cookie/`navigator.language` detection). Keep it `false`: the `[locale]/` routes are file-based and don't rely on Astro's i18n routing at all.

## Colocation layout (Option B)

Everything a page needs lives inside its scope; nothing sits loose at the scope root:

```
src/
├── content.config.ts          # root aggregator — glob loaders point at the colocated _content
│                              #   (base: './src/pages/[locale]/_content', '.../blog/_content'; [locale] literal)
├── components/                # GLOBAL chrome only: Nav, Footer, LocaleSwitcher
├── layouts/BaseLayout.astro   # <html lang>, hreflang (pt-BR/en-US/x-default), og:locale, takes `locale` + `localeLinks`
└── pages/
    ├── index.astro            # /  → client-side redirect shell
    └── [locale]/
        ├── index.astro        # /pt/ /en/ — thin shell → _components/Home.astro
        ├── _components/       # Home.astro (composition) + sections (.astro)
        ├── _islands/          # interactive React (.tsx, client:*)
        ├── _content/          # config.ts (schema) + home.pt.json / home.en.json
        └── blog/
            ├── index.astro        # thin shell → _components/BlogList.astro
            ├── [...slug].astro    # getStaticPaths per-locale → _components/BlogPost.astro
            ├── rss.xml.ts         # RSS per locale
            ├── _components/       # BlogList / BlogPost / BlogCard (.astro)
            └── _content/{pt,en}/  # MDX per locale + _assets/ per locale
```

> **Gotcha — Astro's default slug generator eats dots** (`home.pt.json` → id `homept`, not `home.pt`). When a filename carries a meaningful dotted stem, pin the id in the glob loader: `generateId: ({ entry }) => entry.replace(/\.json$/, '')` → `home.pt`.

## Blog i18n (per-`translationKey` pairing)

- MDX is split per locale under `[locale]/blog/_content/{pt,en}/`; `translationKey` in the frontmatter links siblings.
- `[...slug].astro` `getStaticPaths` emits **one path per real `(locale, slug)` pair** — a pt-only post generates only `/pt/blog/<slug>`, **never** a phantom `/en/blog/<slug>`. A missing translation is normal, not an error.
- `hreflang` is emitted **only for translated pairs** (drive it from a per-page `localeLinks` prop on `BaseLayout`); the per-post LocaleSwitcher renders only when ≥2 alternates exist, so it **disappears** on an untranslated post.
- RSS is per locale (`/pt/blog/rss.xml`, `/en/blog/rss.xml`), each filtered to its locale with the right `<language>`.

## Asset policy (ratified)

- **`src/` vs `public/`** — assets under `src/` go through `astro:assets` (optimized, content-hashed, cache-busted; reference via `import`/`<Image>`/`getImage`). Assets in `public/` are served **raw** at a stable path (no transform) — use for `favicon`, `robots.txt`, and OG PNGs referenced by absolute URL.
- **Shared by default** — most logos/icons/illustrations are locale-agnostic; store them **once** and reference from both locales. Do **not** duplicate per locale.
- **Per-locale only when the image carries text** — a screenshot of localized UI, a diagram with baked-in labels. Then keep one file per locale.
- **Blog covers are colocated per locale** in `[locale]/blog/_content/{pt,en}/_assets/` — each post belongs to one language, so its cover is per-locale by nature.
- **External image-CDN / DAM trigger** — reach for one only when the library is large **and** you need on-the-fly transformations; build-time `astro:assets` stops scaling there.
- **OG images** — static `public/og/og-{pt,en}.png` today; per-locale OG generated at build (Satori / `@vercel/og`) is a documented follow-up, not a launch requirement.

## Anatomy of a page route

```astro
---
// src/pages/[locale]/index.astro
import BaseLayout from '../../layouts/BaseLayout.astro';
import Hero from '../../components/Hero.astro';
import FeatureGrid from '../../components/FeatureGrid.astro';
import { t } from '../../i18n';

export async function getStaticPaths() {
  return [{ params: { locale: 'pt' } }, { params: { locale: 'en' } }];
}

const { locale } = Astro.params;
---

<BaseLayout
  locale={locale}
  title={t(locale, 'home.title')}
  description={t(locale, 'home.description')}
  ogImage="/og/home.png"
>
  <Hero title={t(locale, 'home.hero.title')} ctaHref={`/${locale}/app`} />
  <FeatureGrid features={[{ icon: '⚡', key: 'fast' }, { icon: '🔒', key: 'secure' }, { icon: '🌐', key: 'global' }]} />
</BaseLayout>
```

## Dynamic routes (blog posts)

```astro
---
// src/pages/[locale]/blog/[slug].astro
import { getCollection, type CollectionEntry } from 'astro:content';
import BaseLayout from '../../../layouts/BaseLayout.astro';

export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts.map(post => ({
    params: { locale: post.data.locale, slug: post.slug.split('/').pop() },
    props: { post },
  }));
}

const { post } = Astro.props as { post: CollectionEntry<'posts'> };
const { Content } = await post.render();
---

<BaseLayout
  locale={post.data.locale}
  title={post.data.title}
  description={post.data.summary}
  ogImage={post.data.cover}
  jsonLd={{
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.data.title,
    datePublished: post.data.date.toISOString(),
    image: post.data.cover,
  }}
>
  <article>
    <h1>{post.data.title}</h1>
    <Content />
  </article>
</BaseLayout>
```

## Content collections

The blog uses Astro's content collections (Zod-typed frontmatter). The schema lives at `src/content/config.ts`. Adding a new post = adding an `.mdx` file under `src/content/posts/` with the schema-required frontmatter.

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

export const collections = {
  posts: defineCollection({
    type: 'content',
    schema: ({ image }) => z.object({
      title: z.string(),
      summary: z.string().min(40).max(180),
      locale: z.enum(['pt', 'en']),
      date: z.date(),
      cover: image(),
      tags: z.array(z.string()).default([]),
    }),
  }),
};
```

To add a new collection (e.g. `case-studies`, `changelog`):

1. Create the collection folder under `src/content/`.
2. Add the schema to `src/content/config.ts`.
3. Author a route under `src/pages/[locale]/<collection>/[slug].astro`.

## Sitemap & robots

`@astrojs/sitemap` is configured in `astro.config.mjs`. Any page in `src/pages/` is auto-included. To exclude:

```js
// astro.config.mjs
import sitemap from '@astrojs/sitemap';
export default defineConfig({
  integrations: [
    sitemap({
      filter: page => !page.includes('/admin/'),
    }),
  ],
});
```

`robots.txt` is a static file in `public/robots.txt` — keep `Sitemap:` pointing at the deployed origin.

## Output mode

The astro workspace defaults to **static output** (`output: 'static'`). Per-route SSR is opt-in via `export const prerender = false`. Only enable SSR when the page genuinely needs request-time data (e.g. a localized currency landing). Most landing/blog pages should stay static.

## OG images

Two approaches:

1. **Static OG per page** — drop a 1200×630 PNG in `public/og/<slug>.png` and reference it via `ogImage` on `BaseLayout`.
2. **Dynamic OG** — implement an API route (`src/pages/api/og/[slug].png.ts`) using `@vercel/og` or `satori-html`. Use only for blog posts where per-post imagery matters.

## Linking into the React app

The astro app and the react app run under a single nginx/Start deployment. From an astro route, link to the app at `/app` (or `/${locale}/app`); the react app handles routing from there. Do **not** import react components inside `.astro`.

## When NOT to use this skill

- Building UI on a route → `/component` (astro variant) for the body of the page; `/primitive` for reusable parts.
- Building a form → keep it static if possible (POST to api route or a React island); otherwise see `/form` (react variant) and host the form inside `packages/app/react/`.
- Building app screens (dashboards, settings, anything authenticated) → that's the react workspace.

## Checklist

- [ ] File lives under `src/pages/[locale]/...` (or under `src/pages/` for non-localized routes).
- [ ] `getStaticPaths` declares the locales (or other dynamic segments) explicitly.
- [ ] `BaseLayout` consumed with `title`, `description`, `ogImage`, and (for posts) `jsonLd`.
- [ ] All user-facing strings flow through `t(locale, key)`.
- [ ] No React hooks in the frontmatter; islands are explicit and minimal.
- [ ] Output mode left as `static` unless SSR is genuinely required.
- [ ] Sitemap includes the route (no `filter` opt-out unless intentional).
- [ ] No imports from `@codedm/app-react`.

## References

- `packages/app/astro/src/pages/` — existing routes.
- `packages/app/astro/src/content/config.ts` — collection schemas.
- `packages/app/astro/astro.config.mjs` — sitemap + integrations.
- `packages/app/astro/src/layouts/BaseLayout.astro` — SEO metadata baseline.
- Astro docs: https://docs.astro.build/en/core-concepts/routing/
