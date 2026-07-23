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

The `[locale]` folder pattern is the canonical i18n approach. The site default locale (`pt`) may redirect from `/` via `astro.config.mjs`.

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
