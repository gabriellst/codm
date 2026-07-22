# CodeDM Landing — Astro Architecture (definitive)

> Target workspace: `packages/app/astro`. Source of design truth: founder prototype `CodeDM Landing.dc.html` (inventory in the session analysis). This document is the build contract: every file path is exact, every decision is closed. Astro 5, static-first, minimal islands, typed content.

Status: **approved for build** · Date: 2026-07-22 · Supersedes the current 3-section `Landing.astro` pass entirely (copy included).

---

## 0. Decisions closed here (read first)

| # | Decision | Ruling |
|---|---|---|
| D1 | Locale routing shape | **Keep the `pages/{,en/}` duplication** (thin shells). A `[locale]/` dynamic folder cannot emit unprefixed `pt` routes under `prefixDefaultLocale: false`, and Astro rest-params (`[...locale]`) must be terminal segments so they can't nest `blog/`. The built scaffold pattern is the correct Astro 5 answer; shells stay ≤ 15 lines each. |
| D2 | Three.js island flavor | **React island, vanilla `three` in `useEffect` — NOT @react-three/fiber.** The scene is one `THREE.Points` with per-frame imperative mutation of 6,480 z-values; in R3F that code still lives in `useFrame` as imperative buffer writes, so the reconciler (+~35 kB) buys zero declarativity. Named ESM imports of the 7 classes used, Vite tree-shakes the rest. React (not a bare `<script>`) because the founder asked for "react para componentes necessários" and it gives us props/lifecycle/dispose for free — this is the one place it's warranted. |
| D3 | Landing typography | **Founder HTML wins.** Landing headings = Poppins w800 tight-tracked + w300 pairing, sentence case. Anton (`--font-display`) is **not used on the landing**; it remains registered for other surfaces. IBM Plex Mono becomes a first-class token (`--font-mono`). |
| D4 | Fonts delivery | **Self-hosted via @fontsource** (`@fontsource/ibm-plex-mono` 400/500/600 + `@fontsource/poppins` 300/400/500/600/700/800). Google Fonts preconnects/links in `BaseLayout.astro` are **removed** — a zero-telemetry brand must not phone Google. |
| D5 | Dark inversion sections | Router card + Closing CTA card get `class="dark"` wrappers so the existing `.dark` token block in `@codedm/app-styles/tokens.css` does the inversion. Internal grays = `var(--muted-foreground)` / `--foreground` opacity modifiers. No new hex, no new tokens for dark-internal grays. |
| D6 | View transitions | **No `<ClientRouter />`** (JS for near-zero benefit on a landing + blog). Ship the CSS-only cross-document rule `@view-transition { navigation: auto; }` in `global.css` — free progressive enhancement in Chromium/Safari, inert elsewhere. |
| D7 | Nav behavior | Founder's floating pill + hide-on-scroll, implemented as a ~12-line vanilla `<script>` inside `Nav.astro` (no island). Scaffold's LocaleSwitcher + Blog link are **kept**, restyled into the founder's pill shape. |
| D8 | Plans/pricing | Typed `plans` collection with a custom Content Layer loader. Local JSON today; documented env-var seam to fetch from the daemon at build. **No pricing section is mounted on the landing yet** (founder page has none) — the data layer + a ready `PricingSection.astro` exist so mounting is a one-line change. |
| D9 | Cross-workspace React | **No imports from `@codedm/app-react`** (package CLAUDE.md hard rule stands). Islands live in `src/components/islands/`. If a react-app primitive is ever truly needed, replicate the pattern, don't import the workspace. |
| D10 | Keyframe home | Animations registered as Tailwind v4 `@theme` `--animate-*` entries + `@keyframes` in the astro `src/styles/global.css` (landing-specific, not shared → not `web-utilities.css`). |

---

## 1. Page / routing structure

`astro.config.mjs` stays as-is: `i18n.defaultLocale: 'pt'`, `locales: ['pt','en']`, `routing.prefixDefaultLocale: false`, `output: 'static'`, sitemap i18n mapping `{ pt: 'pt-BR', en: 'en-US' }`.

```
src/pages/
├── index.astro                  # /            pt landing (thin shell)
├── blog/
│   ├── index.astro              # /blog        pt blog list
│   ├── [...slug].astro          # /blog/:slug  pt post
│   └── rss.xml.ts               # /blog/rss.xml         (NEW)
└── en/
    ├── index.astro              # /en/         en landing (thin shell)
    └── blog/
        ├── index.astro          # /en/blog
        ├── [...slug].astro      # /en/blog/:slug
        └── rss.xml.ts           # /en/blog/rss.xml      (NEW)
```

- Each landing shell does `getEntry('landing', '<locale>/landing')`, builds the SoftwareApplication JSON-LD (§5) and renders `<Landing locale="pt|en" />` inside `BaseLayout`. Nothing else.
- Anchor ids `#demo`, `#router`, `#features` are `id` attributes on `DemoSection` / `RouterSection` / `FeaturesSection` roots. Nav anchor links are plain `href="#demo"` etc. — same-page, locale-agnostic, zero JS. Add `scroll-behavior: smooth` + `scroll-margin-top` on sections in `global.css` (nav is floating, ~76px offset).
- Blog `[...slug].astro` keeps the existing per-locale `getStaticPaths` filter on `id.startsWith('<locale>/')` and drafts.

## 2. Content model (`src/content.config.ts`)

Three collections: `blog` (exists, unchanged), `landing` (schema **rewritten**), `plans` (new).

### 2.1 `landing` — one Zod schema, two entries

Loader unchanged (`glob` over `src/content/i18n/**/landing.json`). Full replacement schema — this is the contract the builder types against:

```ts
const chatMessage = z.object({
  kind: z.enum(['in', 'out', 'system']),
  label: z.string().optional(),        // mono label above outbound bubble ("✳ coupon-focus · Claude Code")
  text: z.string(),
})
const step = z.object({ title: z.string(), body: z.string() })
const featureCard = z.object({ kicker: z.string(), title: z.string(), body: z.string() })
const termLine = z.object({ key: z.string(), tone: z.enum(['dim', 'mid', 'faint']), text: z.string() })
const routerRow = z.object({ key: z.string(), text: z.string() })

const landing = defineCollection({
  loader: glob({ pattern: '**/landing.json', base: './src/content/i18n' }),
  schema: z.object({
    nav: z.object({
      links: z.object({ demo: z.string(), router: z.string(), features: z.string(), github: z.string(), blog: z.string() }),
      download: z.string(),
    }),
    hero: z.object({
      badge: z.string(),               // "Open source · runs on your machine · no account"
      titleBold: z.string(),           // "Text your codebase."
      titleLight: z.string(),          // "It texts you back."
      subtitle: z.string(),
      primaryCta: z.string(),          // "Download — macOS · Windows · Linux"
      secondaryCta: z.string(),        // "Star on GitHub"
    }),
    marquee: z.object({ items: z.array(z.string()).min(4) }),   // WhatsApp…OpenCode; component triples it
    demo: z.object({
      eyebrow: z.string(), title: z.string(), body: z.string(),
      steps: z.array(step).length(3),
      chat: z.object({
        initials: z.string(), name: z.string(), meta: z.string(), status: z.string(),
        messages: z.array(chatMessage).min(4),
      }),
    }),
    router: z.object({
      eyebrow: z.string(), titleBold: z.string(), titleLight: z.string(), body: z.string(),
      rows: z.array(routerRow).length(4),
      terminal: z.object({ header: z.string(), lines: z.array(termLine).min(6) }),
    }),
    features: z.object({
      title: z.string(), intro: z.string(),
      cards: z.array(featureCard).length(6),   // ISSUES/LABELS/WHISPERS/STOPS/ARTIFACTS/LOCAL
      controls: z.array(z.string()).length(6), // outlined mono chips
    }),
    closingCta: z.object({
      titleBold: z.string(), titleLight: z.string(), note: z.string(),
      primary: z.string(), secondary: z.string(),
    }),
    footer: z.object({
      copyright: z.string(),
      links: z.object({ github: z.string().url(), docs: z.string(), changelog: z.string() }),
    }),
  }),
})
```

- `src/content/i18n/en/landing.json`: transcribe the founder copy **verbatim** (it supersedes all current copy). `src/content/i18n/pt/landing.json`: author the pt translation — keep product nouns (whispers, stops, labels, artifacts) in English as brand vocabulary; translate prose. Chat transcript and terminal lines stay EN in both locales (they are product screenshots-in-text, not UI copy).
- `tone` mapping in `TerminalMock.astro`: `dim` → `text-[var(--muted-foreground)]`, `mid` → `text-[var(--foreground)]/85`, `faint` → `text-[var(--foreground)]/35` (rendered inside the `.dark` wrapper, so these resolve against inverted tokens).
- Real URLs go in `footer.links` / `nav.links.github` (single source; Nav and ClosingCta consume the same values). Until the org/repo URL is final use `https://github.com/codedm` — it's content, not code.

### 2.2 `blog` — schema unchanged, seed to 2 posts per locale

Existing schema (title/description/publishedAt/updatedAt/author/coverImage/tags/draft/translationKey) already covers the requested frontmatter; **locale lives in the path** (`pt/…`, `en/…`), not frontmatter — keep it that way (the id-prefix filter is the established pattern).

Add one more example post per locale, paired via `translationKey`:

- `src/content/blog/pt/roteando-issues-pelo-chat.mdx` (`translationKey: routing-issues`)
- `src/content/blog/en/routing-issues-from-chat.mdx` (`translationKey: routing-issues`)

Content: a short (~400 word) walkthrough of the reply-quote → label routing model — doubles as living documentation of §router copy. Existing `ola-mundo` / `hello-world` posts get `translationKey: hello-world` added so the pairing convention is exercised.

### 2.3 `plans` — typed collection + build-time fetch seam

**Files:** `src/content/plans/plans.json` (source of truth today) + `src/content/loaders/plans.ts` (loader) + entry in `content.config.ts`.

```ts
// src/content/loaders/plans.ts
import type { Loader } from 'astro/loaders'

export function plansLoader(): Loader {
  return {
    name: 'codedm-plans',
    load: async ({ store, parseData, logger }) => {
      // SEAM: when the daemon exposes GET /public/plans, set PLANS_SOURCE_URL at build
      // time and this loader fetches instead of reading the checked-in JSON. Same shape,
      // same Zod schema — the rest of the site never knows the difference.
      const url = import.meta.env.PLANS_SOURCE_URL
      const plans = url
        ? await fetch(url).then(r => { if (!r.ok) throw new Error(`plans fetch ${r.status}`); return r.json() })
        : (await import('../plans/plans.json')).default
      store.clear()
      for (const plan of plans) {
        store.set({ id: plan.id, data: await parseData({ id: plan.id, data: plan }) })
      }
      logger.info(`loaded ${plans.length} plans (${url ? 'remote' : 'local'})`)
    },
  }
}
```

```ts
// content.config.ts addition
const plans = defineCollection({
  loader: plansLoader(),
  schema: z.object({
    id: z.string(),
    order: z.number().int(),
    price: z.object({ monthly: z.number(), currency: z.string() }), // 0 = free/OSS tier
    highlighted: z.boolean().default(false),
    copy: z.record(z.enum(['pt', 'en']), z.object({
      name: z.string(), blurb: z.string(), cta: z.string(), features: z.array(z.string()),
    })),
  }),
})
export const collections = { blog, landing, plans }
```

Numeric data is locale-agnostic; labels are embedded per-locale in `copy` so one entry serves both routes. `PricingSection.astro` (in `src/components/landing/`) consumes `getCollection('plans')` sorted by `order` — built now, mounted later by adding one line to `Landing.astro` when product says go.

### 2.4 Live data ("chamadas pontuais") — `LiveStats.tsx` island

`src/components/islands/LiveStats.tsx` — small React island for genuinely-live numbers (e.g. running agent count, GitHub stars):

- Reads `import.meta.env.PUBLIC_STATS_URL`; if unset, **renders the static fallback string passed as a prop and never fetches** — the landing is fully functional with no daemon/endpoint.
- `useEffect` fetch with `AbortController` + 3s timeout; on any failure, keeps the fallback. No spinner, no layout shift (fallback and live value share the same mono pill markup).
- Mounted `client:visible`, only where a live number is actually shown (initially: nowhere — it ships as infrastructure alongside the plans seam; first consumer is the future PricingSection or a hero "n sessions running" pill).

## 3. Islands & scripts (complete JS inventory)

| Unit | File | Kind | Directive | Why |
|---|---|---|---|---|
| Dot-wave canvas | `src/components/islands/DotWave.tsx` | React island | `client:visible` (both hosts) | Only real JS payload. See D2. |
| Live stats | `src/components/islands/LiveStats.tsx` | React island | `client:visible` | §2.4; dormant until an endpoint exists. |
| Nav hide-on-scroll | inline `<script>` in `src/components/Nav.astro` | vanilla | n/a | ~12 lines; no state, no React. |
| Everything else | `.astro` | zero-JS | — | Marquee/pulse/entrance are pure CSS. |

### DotWave.tsx spec

```
Props: { variant: 'hero' | 'cta'; density?: number /* 0.4–2, default 1 */; speed?: number /* 0–4, default 0 */ }
```

- Named imports only: `Scene, PerspectiveCamera, WebGLRenderer, BufferGeometry, BufferAttribute, PointsMaterial, Points` from `three`.
- Scene per the inventory: camera `(50, w/h, 0.1, 100)` at `z=8`; grid `cols=90*density × rows=72*density` over 22×20 plane; `PointsMaterial` size 0.035 transparent — `variant==='hero'` → color `0x161616` opacity 0.22, `'cta'` → `0xffffff` opacity 0.2; points `rotation.x=-1.12`, `position.y=0.2`; rAF loop with the three-sine z-field, `t += 0.004 + speed*0.01`; mouse-parallax lerp 0.03; `pixelRatio = min(devicePixelRatio, 2)`.
- **Hardening the prototype lacked (required):** (a) `matchMedia('(prefers-reduced-motion: reduce)')` → render one static frame, no rAF; (b) `IntersectionObserver` on the host → cancel rAF offscreen, resume when visible; (c) full cleanup in the effect return — cancel rAF, remove `resize`/`mousemove` listeners, `geometry.dispose()`, `material.dispose()`, `renderer.dispose()`, remove canvas.
- Mounted twice: inside `Hero.astro` and `ClosingCta.astro` as `<DotWave client:visible variant="hero|cta" />` in an `absolute inset-0 pointer-events-none` host div. The hero host is in the initial viewport so `client:visible` hydrates immediately — no need for `client:load`; one directive everywhere.
- Canvas is decorative: host gets `aria-hidden="true"`.

### Nav script

Processed (bundled) `<script>` in `Nav.astro`: track `lastY`; on `scroll` (passive), if `y > 80 && y > lastY` add the hidden class (`-translate-y-[140%] opacity-0`), else remove; nav element has `transition-[transform,opacity] duration-300`. Guard with `matchMedia('(prefers-reduced-motion: reduce)')` → skip listener.

## 4. Design system

### 4.1 `src/styles/global.css` (rewrite)

```css
@import "tailwindcss";
@import "@codedm/app-styles/tokens.css";
@import "@codedm/app-styles/web-utilities.css";
@import "@fontsource/poppins/300.css";   /* + 400,500,600,700,800 */
@import "@fontsource/ibm-plex-mono/400.css"; /* + 500,600 */

@theme {
  --font-sans: "Poppins", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", monospace;
  --font-display: "Anton", "Poppins", system-ui, sans-serif; /* kept for non-landing surfaces */

  --animate-pulse-dot: pulse-dot 2s ease-in-out infinite;      /* hero badge dot */
  --animate-pulse-dot-fast: pulse-dot 1.6s ease-in-out infinite; /* chat "Running" dot */
  --animate-rise-in: rise-in 0.5s ease both;                   /* hero entrance */
  --animate-marquee: marquee 26s linear infinite;
}
@keyframes pulse-dot { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
@keyframes rise-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
@keyframes marquee { to { transform: translateX(-50%) } }

@view-transition { navigation: auto; }          /* D6 — CSS-only, zero JS */

html { scroll-behavior: smooth; }
::selection { background: var(--secondary); }
body { background: var(--background); color: var(--foreground); font-family: var(--font-sans); }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .animate-marquee, .animate-rise-in { animation: none; }
}
```

Tailwind v4 derives `font-mono`, `animate-marquee`, etc. from `@theme` — no plugin config.

### 4.2 Token mapping rules (enforced in review)

- **Never inline a hex** (package CLAUDE.md hard rule). Founder hex → tokens: `#161616` → `var(--primary)`/`var(--foreground)`; `#f7f7f7` → `var(--muted)`; `#f2f2f2` hover → `var(--muted)` or `hover:bg-[var(--hover)]`; `#ebebeb`/`#e2e2e2` → `var(--border)`; `#6a6a6a`/`#8a8a8a` → `var(--muted-foreground)` (accepted two-gray → one-gray collapse; where the founder's lighter gray matters, use `text-[var(--muted-foreground)]/80`).
- Dark cards: `<div class="dark rounded-[36px] bg-[var(--route-background)] …">` — inside, ordinary token classes resolve inverted (D5). Terminal inner panel = `bg-[var(--background)] border-[var(--border)]` within the dark scope.
- Radii: pills `rounded-full`; cards `rounded-[calc(var(--radius)*1.375)]` (22px), chat card `*1.625` (26px), dark sections `rounded-[36px]` (one-off arbitrary is fine — it's a radius, not a color).
- Chat-card shadow: one-off `shadow-[0_24px_60px_rgba(22,22,22,0.08)]` — accepted single exception to "no shadows"; do not tokenize.
- `text-balance` on H1/H2s, `text-pretty` on paragraphs; all founder `style-hover` attrs become `hover:` variants.

### 4.3 Component tree

```
src/components/
├── Nav.astro                    # MODIFY — founder pill row + anchors + Blog + LocaleSwitcher + scroll script
├── Footer.astro                 # MODIFY — logo · copyright · github/docs/changelog from t.footer
├── Landing.astro                # MODIFY — composition root: getEntry, passes typed slices down
├── LocaleSwitcher.astro         # keep (restyle to pill if needed)
├── BlogCard.astro               # keep
├── landing/                     # NEW — one file per section, each takes its `t` slice as Props
│   ├── Hero.astro               #   animate-rise-in wrapper, badge pulse dot, DotWave host, #⌂
│   ├── Marquee.astro            #   triples t.marquee.items, animate-marquee, aria-hidden dupes
│   ├── DemoSection.astro        #   id="demo" — 2-col grid, 3 steps
│   ├── ChatMock.astro           #   WhatsApp card — maps t.demo.chat.messages by kind
│   ├── RouterSection.astro      #   id="router" — .dark card, 4 rows
│   ├── TerminalMock.astro       #   maps t.router.terminal.lines by tone
│   ├── FeaturesSection.astro    #   id="features" — 3×2 grid + control chips
│   ├── ClosingCta.astro         #   .dark card + DotWave variant="cta"
│   └── PricingSection.astro     #   built, NOT mounted (D8) — getCollection('plans')
└── islands/
    ├── DotWave.tsx              # NEW — §3
    └── LiveStats.tsx            # NEW — §2.4
```

Sections receive their slice via Props (`interface Props { t: CollectionEntry<'landing'>['data']['demo']; locale: Locale }`) — the astro-component skill's "components own data" bends here to the established scaffold pattern: one `getEntry` in `Landing.astro`, typed slices down. Marquee/Chat/Terminal render arrays via `.map()` in frontmatter.

## 5. SEO / intl

### `src/layouts/BaseLayout.astro` (modify)

1. **Remove** the three Google Fonts `<link>`/preconnects (fonts are bundled — D4).
2. **hreflang alternates** — for every page, emit via `localizedPath(Astro.url, …)` against `Astro.site`:
   ```html
   <link rel="alternate" hreflang="pt-BR" href={ptUrl} />
   <link rel="alternate" hreflang="en-US" href={enUrl} />
   <link rel="alternate" hreflang="x-default" href={ptUrl} />
   ```
   Add helper `alternateUrls(url: URL, site: URL)` to `src/i18n/index.ts` returning `{ pt, en }` absolute URLs.
3. `<meta property="og:locale" content={locale === 'pt' ? 'pt_BR' : 'en_US'} />` + `og:locale:alternate`; `<html lang={locale === 'pt' ? 'pt-BR' : 'en'}>`.
4. Favicon links (`/favicon.svg` — the "DM" chip mark, black rounded square + white mono "DM"; NEW asset `public/favicon.svg`) + `<meta name="theme-color" content="#161616">`.
5. RSS autodiscovery: `<link rel="alternate" type="application/rss+xml" href={locale === 'pt' ? '/blog/rss.xml' : '/en/blog/rss.xml'}>`.

### Landing JSON-LD (in both index shells)

```ts
const jsonLd = {
  '@context': 'https://schema.org', '@type': 'SoftwareApplication',
  name: 'CodeDM', applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Windows, Linux',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  license: 'https://opensource.org/licenses/MIT',
  description: t.hero.subtitle, url: Astro.site?.href,
}
```

Blog posts keep the existing `BlogPosting` JSON-LD (already correct).

### RSS — `@astrojs/rss` (new dep)

`src/pages/blog/rss.xml.ts` + `src/pages/en/blog/rss.xml.ts`: `getCollection('blog')` filtered by locale prefix + `!draft`, sorted desc, items `{ title, description, pubDate, link: routeFor(locale, '/blog/' + slug) }`. Site title/description from the landing entry.

### Sitemap & OG

- Sitemap: already configured with the i18n map — no change. Verify `SITE_URL` is set in the production build env (falls back to localhost otherwise, which would poison canonical/sitemap/OG URLs — add to deploy checklist).
- OG image: `public/og/og-pt.png` + `public/og/og-en.png` (1200×630, black canvas, "Text your codebase. / It texts you back." in the bold/light pairing). Landing shells pass `ogImage={new URL(\`/og/og-${locale}.png\`, Astro.site).href}`. Static assets authored once — no satori pipeline for two images.
- `public/robots.txt`: append `Sitemap: <SITE_URL>/sitemap-index.xml`.

## 6. Build order (the builder executes top-to-bottom)

Each step leaves `astro check` + `astro build` green. Run from `packages/app/astro` unless noted.

**Step 1 — deps & fonts.** `packages/app/astro/package.json`: add `three`, `@types/three` (dev), `@fontsource/ibm-plex-mono`, `@fontsource/poppins`, `@astrojs/rss`. `bun install` from repo root.

**Step 2 — design foundation.** Rewrite `src/styles/global.css` (§4.1). Modify `src/layouts/BaseLayout.astro` (§5: drop Google Fonts, hreflang via new `alternateUrls` in `src/i18n/index.ts`, og:locale, favicon, theme-color, RSS link). Add `public/favicon.svg`.

**Step 3 — content contract (lock before components).** Rewrite the `landing` schema in `src/content.config.ts`; add `plans` collection + `src/content/loaders/plans.ts` + `src/content/plans/plans.json`. Author `src/content/i18n/en/landing.json` (founder copy verbatim) and `src/content/i18n/pt/landing.json` (translation per §2.1). This is the Phase-0 lock — every section component types against it.

**Step 4 — islands.** `src/components/islands/DotWave.tsx` (§3 spec incl. reduced-motion/IO/dispose) and `src/components/islands/LiveStats.tsx` (§2.4).

**Step 5 — sections.** Create `src/components/landing/{Hero,Marquee,DemoSection,ChatMock,RouterSection,TerminalMock,FeaturesSection,ClosingCta,PricingSection}.astro` per §4.3, token rules §4.2, anchor ids §1. PricingSection is built but not mounted.

**Step 6 — chrome & composition.** Rewrite `src/components/Nav.astro` (founder pill row: logo, `#demo/#router/#features` anchors, GitHub ↗, Blog, LocaleSwitcher, black Download pill; hide-on-scroll script). Rewrite `src/components/Footer.astro` (t.footer.links). Rewrite `src/components/Landing.astro` as the composition root. Update `src/pages/index.astro` + `src/pages/en/index.astro` (JSON-LD §5, ogImage, title from `t.hero.titleBold + ' ' + t.hero.titleLight`).

**Step 7 — blog & RSS.** Add the two new example posts (§2.2) + `translationKey` backfill on the existing pair. Create `src/pages/blog/rss.xml.ts` + `src/pages/en/blog/rss.xml.ts`. Append sitemap line to `public/robots.txt`.

**Step 8 — assets & gates.** Author `public/og/og-pt.png` / `og-en.png`. Gates: `bun x nx run app-astro:tsc` (astro check), `:lint`, `astro build` clean; manual pass: both locales render all 8 sections, anchors scroll, nav hides on scroll-down, marquee loops seamlessly, DotWave runs on hero + CTA and pauses offscreen, reduced-motion kills all animation, no request leaves the origin (fonts/three bundled — verify in devtools network), Lighthouse a11y/SEO ≥ 95, total JS < 150 kB gz (three ~120 kB is the ceiling-setter; everything else rounds to zero).

**Out of scope / follow-ups:** `/docs` and `/download` targets (nav links point at them; ship when those routes exist — until then Download anchors to the GitHub releases URL from `footer.links.github`), pricing section mount, first real `PLANS_SOURCE_URL` + `PUBLIC_STATS_URL` wiring.
