# Plan — Dashboard static/promo reads (ui context)

**Date:** 2026-06-03 · **Branch:** `feat/bk-dash-polyglot` · Status: **DESIGN LOCKED (reviewed) — build not started.**

Dashboard-page reads #5–7 (Tier 2 — review-only). `ListRecommendedApps`, `ListPromotionalBanners`, `GetAppQrCode`.
Designed against `.specs/frontend-screens/SPEC.md` + `_schema-fundamentals.md`. No scope/mode discrimination — these are
global promo/static content.

---

## 1. Common disposition (all three)
- **Faker/static Query use cases in the `ui` context.** Data is CMS/external-link content with no real source — the use
  case returns static/faker payloads. Real swap (a CMS) is a later, contract-preserving change.
- **Empty ctx** — `ctx: z.object({})`. Global content, **not store-scoped**; the auth middlewares still run but the
  handler reads nothing from ctx (mirrors `GetFxRates`). No `storeId`, no `tenancyScope`, no inputs/params.
- **Names** = these (not the spec's `GetBanners`/`GetAppDownload`).
- **Ids are plain `z.string()`** (CMS/external ids, not entity UUIDs).

---

## 2. Endpoints

### `ListRecommendedApps` (shared across ~6 screens)
```ts
export const RecommendedAppSchema = z.object({
  id: z.string(),
  name: z.string(),
  logoUrl: z.url(),
  rating: z.number(),
  ratingCount: z.number(),
  description: z.string(),
  installUrl: z.url(),
})
export const ListRecommendedAppsOutputSchema = z.object({
  items: z.array(RecommendedAppSchema),
  advertiseUrl: z.url(),          // "Deseja anunciar sua marca aqui?" external link
})
```
> Spec OQ#1 floated a `context`/category param to tailor apps per screen — **deferred**; add only when a screen needs a
> different app set. **Define `RecommendedAppSchema` in `src/ui/schemas/` when this read is built** (the old
> speculative copy in `shared/schemas/ui` was deleted in the schema-reorg — schemas live with their query use case).

### `ListPromotionalBanners` (spec `GetBanners`)
```ts
export const ListPromotionalBannersOutputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    imageUrl: z.url(),
    targetUrl: z.url(),
  })),
})
```

### `GetAppQrCode` (spec `GetAppDownload`)
```ts
export const GetAppQrCodeOutputSchema = z.object({
  qrRedirectUrl: z.url(),   // QR target; a separate PUBLIC route 302s by User-Agent (iOS→App Store, Android→Play)
  iosUrl: z.url(),          // App Store badge
  androidUrl: z.url(),      // Google Play badge
})
```
> The actual User-Agent 302 redirect behind `qrRedirectUrl` is a **separate public redirect route** — out of scope for
> this read, which only returns the static URLs.

---

## 3. Build order
1. Use cases (faker/static) + controllers (GET, empty ctx, no query) for the three; barrels.
2. Register in `ui/registry.ts` + router (the reintroduced `ui` context — depends on the dashboard slice existing).
3. Define `RecommendedAppSchema`/`ListRecommendedAppsOutputSchema` in `src/ui/schemas/` (with this read).
4. `bun sdk`; repo `tsc` + `bun test` + `bun lint`; commit (`export PATH="$HOME/.bun/bin:$PATH"`).

## 4. Depends on / shared
- `ui` context (reintroduced in the dashboard slice).
- `@shared/schemas` (generic atoms only); `RecommendedAppSchema` is defined here when built.
