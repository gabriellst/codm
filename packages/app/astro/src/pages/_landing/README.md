# Landing vertical slice

Everything the landing page owns lives here — the `_` prefix keeps this folder out of
Astro's file router (stable since Astro 2.x, current in 5.x). The routes themselves
(`src/pages/index.astro`, `src/pages/en/index.astro`) stay thin shells that import
`~/pages/_landing/Landing.astro`.

```
_landing/
├── Landing.astro          composition root: one getEntry('landing'), typed slices down
├── DotWave.tsx            React island (hero + closing CTA backdrop)
├── sections/              Hero, Marquee, DemoSection, ChatMock, RouterSection,
│                          TerminalMock, FeaturesSection, ClosingCta,
│                          PricingSection (built, NOT mounted — D8)
└── content/
    ├── config.ts          collection DEFINITIONS (landing + plans) — re-exported by
    │                      src/content.config.ts, which only aggregates
    ├── i18n/{pt,en}/landing.json   the CONTENT
    ├── plans/plans.json            plans content (landing-only, PricingSection)
    └── loaders/plans.ts            custom loader (local JSON now, PLANS_SOURCE_URL seam)
```

## Boundary — what deliberately stays OUTSIDE the slice

| Artifact | Why it stays shared |
| --- | --- |
| `layouts/BaseLayout.astro` | Consumed by every blog page too. The landing has no landing-only layout; if it ever diverges, fork a `_landing/Layout.astro` then. |
| `components/Nav.astro`, `components/Footer.astro` | Rendered by BaseLayout on landing AND blog. They read landing copy via `getEntry('landing', ...)` — a dependency on the collection **name + schema**, never on slice file paths. Moving the JSON here does not invert direction: the collection is the contract. |
| `components/LocaleSwitcher.astro`, `components/BlogCard.astro` | Locale switching is site-wide; BlogCard is blog-only. |
| `src/i18n/index.ts` | Site-wide locale/route helpers. |
| `src/content.config.ts` | Astro requires collection registration at this top-level path; it aggregates `blog` (shared) + the slice's `landing`/`plans` re-exports. |
| `styles/global.css`, `content/blog/**`, `pages/blog/**` | Not landing concerns. |

## Rules

- Shared components may consume the `landing` collection (name + schema), but must
  never import a file from `_landing/` by path.
- Slice files may import shared modules (`~/i18n`, `~/layouts/*`, `~/components/*`);
  the reverse path-import is the violation.
- Section anchor ids (`#demo`, `#router`, `#features`) are referenced by `Nav.astro`
  (outside the slice) — treat them as part of the slice's public contract.
