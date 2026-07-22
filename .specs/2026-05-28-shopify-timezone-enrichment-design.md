# Shopify Post-Activation Timezone Enrichment — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Bounded Context:** integration (fetches the timezone + writes it through tenancy's `StoreRepository`) + tenancy (standalone rider cleanup)
**Kind:** feature (+ rider cleanup)
**Story Points:** 3 — one cross-context behavior (the Shopify post-activation handler fetches the store timezone and writes it directly through tenancy's `StoreRepository`) plus a small standalone rider cleanup removing `updatedByUserId` from `UpdateStorePreferences`. No new contract, no integration event, no new handler, no migration.

## Context

The integration BC just gained a per-`(type, platform)` post-activation umbrella (Spec B1): `RunAdditionalPlatformHandler` (`packages/api/typescript/src/integration/handlers/RunAdditionalPlatformHandler.ts`) subscribes to `IntegrationActivatedEvent`, opens the sealed credentials, and runs the platform's `AdditionalPlatformHandler`. For Shopify that handler is `ShopifyAdditionalPlatformHandler` (`packages/api/typescript/src/integration/services/shopify/ShopifyAdditionalPlatformHandler.ts`), whose only step today is webhook registration. B1's stated goal was explicitly that the *next* platform-specific step (this spec's timezone fetch) would be "a line inside that platform's handler."

On the tenancy side, the `Store` aggregate (`packages/api/typescript/src/tenancy/entities/Store.ts`) carries a required `timezone` (IANA, validated by `IANA_TIMEZONE_RE`) and exposes `updatePreferences({ reportingCurrency?, timezone?, showStoreNameInNotifications? }, { hasOrders })` — the `hasOrders` ctx gates only the reporting-currency lock, never the timezone. `StoreRepository` (`packages/api/typescript/src/tenancy/repositories/StoreRepository.ts`) is the load/save port (`findById`, `save`).

Cross-context reads/writes inside `api` go through **the other context's Repository**, not the SDK HTTP client (CLAUDE.md: *"Para ler outro contexto: importe o Repository dele"*). There is working precedent: `notifications`' `IntegrationHandshakeFailedNotifyHandler` injects integration's `StoreIntegrationRepository`. `TestBed` registers `ALL_REGISTRIES`, so any BC's repository resolves from the shared container in both tests and the composed app. The reference monolith fetches the Shopify timezone at `https://{shopDomain}/admin/api/{version}/shop.json` reading `shop.iana_timezone` (`bk-dash-backend/.../TimezoneRetriever/ShopifyTimezoneRetriever.ts`).

Separately, `UpdateStorePreferences` (`packages/api/typescript/src/tenancy/usecases/UpdateStorePreferences.ts`) requires `updatedByUserId: z.uuid()` (sourced in `UpdateStorePreferencesController` from `ctx.user.id`) and stamps it onto the domain-event `ownerId` and the `StorePreferencesUpdatedEvent` payload. No consumer reads that payload field.

## Problem

1. When a Shopify sales-channel integration activates, the merchant's actual store timezone is never propagated to the tenancy `Store`. The Store keeps whatever timezone it was created with (a default), so analytics day-boundaries and notification timing can be wrong until the merchant manually fixes it in settings. The timezone is available from Shopify's `shop.json` at activation time — nothing reads it.
2. `UpdateStorePreferences` carries an `updatedByUserId` that adds no value (no consumer reads it) and forces every caller to supply an actor — awkward for any non-user-initiated update.

## Goal

When a Shopify store activates, its real IANA timezone is fetched from Shopify and applied to the tenancy `Store` automatically — no manual settings step. The Shopify handler fetches the timezone and writes it straight through tenancy's `StoreRepository` (a small, deliberate cross-context coupling, the sanctioned api-internal pattern). Separately, `UpdateStorePreferences` drops its dead `updatedByUserId`.

## Decisions

1. **`AdditionalPlatformHandler.run()` stays `Promise<void>`; the Shopify handler does the work inline.** `ShopifyAdditionalPlatformHandler` gains two constructor-injected collaborators: tenancy's `StoreRepository` and a `fetchFn` (defaulting to real `fetch` for the registry `useFactory`, mocked in tests). The `AdditionalPlatformHandler` abstract, `NuvemShopAdditionalPlatformHandler`, and `MockAdditionalPlatformHandler` are **untouched**.

2. **Cross-context write goes directly through tenancy's `StoreRepository`** — no integration event, no tenancy handler. `ShopifyAdditionalPlatformHandler` imports `StoreRepository` (and the `Store` entity) from tenancy and resolves it via DI. This is the sanctioned "import the other context's Repository" pattern (precedent: `notifications` → integration's `StoreIntegrationRepository`).

3. **Shopify timezone fetch:** `GET https://{shopDomain}/admin/api/2024-07/shop.json` with header `X-Shopify-Access-Token: {accessToken}`, reading `shop.iana_timezone`. Reuses the `2024-07` API version already constant in `ShopifyWebhookRegister`.

4. **Apply inline, no event.** When a non-blank `iana_timezone` comes back: `const store = await storeRepo.findById(storeId)`; if present, `store.updatePreferences({ timezone }, { hasOrders: false })` then `await storeRepo.save(store)`. `hasOrders: false` is safe — the timezone path is never gated by it. No `StorePreferencesUpdatedEvent` is emitted (the use-case path is bypassed; nothing consumes that event).

5. **Fetch is best-effort and never throws.** Webhook registration already succeeded by the time the fetch runs; a network error, non-2xx response, non-JSON body, missing/blank `iana_timezone`, or a vanished Store results in **no write** (the Store keeps its existing timezone). The spec deliberately does **not** mirror the reference's "fall back to `America/Sao_Paulo`" — clobbering a real value with a guessed default is worse than leaving it.

6. **Order within `run()`:** register webhooks first (must succeed — throws `WEBHOOK_REGISTRATION_FAILED` on failure so the outbox retries), then fetch + apply the timezone (best-effort). On an outbox retry after webhooks already succeeded, the timezone is re-fetched and re-applied; `updatePreferences` only writes when the value differs, so it's idempotent.

7. **Rider cleanup — remove `updatedByUserId` (standalone).** Independent of the feature above. Remove `updatedByUserId` from `UpdateStorePreferencesInputSchema`, the `UpdateStorePreferencesController` mapping (which sourced it from `ctx.user.id`), and the `StorePreferencesUpdatedEventSchema` payload. The domain-event `ownerId` is optional on `BaseDomainEvent`, so the event simply omits it. The sibling `UpdateStoreSettings` / `StoreSettingsUpdatedEvent` keep their own `updatedByUserId` — untouched.

8. **Out of scope.** NuvemShop timezone (`NuvemShopAdditionalPlatformHandler` stays webhook-only). Reporting-currency or other preference enrichment. Any UI. Backfilling timezone onto Shopify integrations activated before this ships.

## User Stories

- **Store owner connects Shopify.** As a Shopify merchant, I want my store's timezone applied automatically when I connect, so analytics and notifications use the right day boundaries without me configuring anything.
  - Given a `(SALES_CHANNEL, SHOPIFY)` integration activates, when `ShopifyAdditionalPlatformHandler.run()` runs after registering webhooks, then it fetches `shop.json`, reads `iana_timezone`, loads the Store via `StoreRepository`, and saves it with the fetched timezone.
  - Given the Shopify `shop.json` call fails or returns no `iana_timezone`, when `run()` continues, then no Store write happens, no error is thrown, and the Store's timezone is unchanged.
  - Given the Store row is gone, when `run()` runs, then it is a graceful no-op.

- **NuvemShop is unaffected.** Given a `(SALES_CHANNEL, NUVEM_SHOP)` integration activates, when its handler runs, then it registers webhooks and writes no timezone.

- **Developer maintaining preferences.** As a developer, I want `UpdateStorePreferences` to not require an actor id, so its callers don't have to supply a meaningless `updatedByUserId`.

## Acceptance Criteria

- [ ] AC-1: On a successful `shop.json` fetch returning `iana_timezone`, `ShopifyAdditionalPlatformHandler.run()` loads the Store via `StoreRepository` and saves it with `timezone` equal to the fetched value, after webhook registration (verified via injected `fetchFn` + a seeded Store).
- [ ] AC-2: On `shop.json` network error, non-2xx, non-JSON, missing/blank `iana_timezone`, or a missing Store, `run()` writes no Store and does **not** throw (webhook registration outcome unaffected).
- [ ] AC-3: `NuvemShopAdditionalPlatformHandler.run()` is unchanged — registers webhooks, writes no timezone.
- [ ] AC-4: `updatedByUserId` is removed from `UpdateStorePreferencesInputSchema`, `UpdateStorePreferencesController`, and `StorePreferencesUpdatedEventSchema`; `UpdateStorePreferences` runs without an actor; the sibling `UpdateStoreSettings` is untouched; `bun tsc` is green and the existing preferences tests pass.

## Risks & Migration

- **Deliberate cross-context coupling.** `integration` now depends on tenancy's `StoreRepository` + `Store`. Accepted: it's the documented api-internal cross-context pattern (CLAUDE.md), with working precedent (`notifications` → integration). `TestBed`/`ALL_REGISTRIES` makes the repo resolvable from the integration handler in both tests and the composed app.
- **No event on the inline path.** Skipping `StorePreferencesUpdatedEvent` for the timezone write is intentional (nothing consumes it). If a future read-model needs to react to timezone changes, it would move to the use-case path.
- **Rider blast radius.** Removing `updatedByUserId` touches `UpdateStorePreferences` (input + event), its controller, and their tests (`UpdateStorePreferences.test.ts`, `tenancy/events/index.test.ts`). The `updatedByUserId` references in `sales/*` (OrderOverride) and `UpdateStoreSettings` are unrelated and untouched. No consumer reads `StorePreferencesUpdatedEvent.payload.updatedByUserId`.
