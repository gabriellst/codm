# Integration Webhook Registration on Activation — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Bounded Context:** integration
**Kind:** feature
**Story Points:** 8 — single BC for the register/handler work, PLUS a cross-service contract-lock: a new `SyncEventName` TypeSpec enum regenerated to Go + TS, the hand-written Go enum deleted and ~27 consumers substituted to the generated `wire.SyncEventName` (cross-service contract tie-breaker → +1 tier over the base 5). One new service-family (`WebhookRegister` abstract + factory + mock + 1 real impl) + one new event handler + registry/config wiring + one error code. No migration, no projection, no UI.

## Context

When a merchant connects a sales platform, the platform pushes order/product changes to us via webhooks — but only after we *register* those webhooks with the provider's API. Today that registration step does not exist anywhere in the polyglot codebase. The OAuth connect flow (`packages/api/typescript/src/integration/usecases/ConnectIntegration.ts`) persists the `StoreIntegration` and raises `IntegrationActivatedEvent` (`packages/api/typescript/src/integration/events/IntegrationActivatedEvent.ts`); the existing `IntegrationActivatedHandler` (`packages/api/typescript/src/integration/handlers/IntegrationActivatedHandler.ts`) reacts to that event by bridging it to the cross-service `integration.shared.integration.activated` event the Go sync worker consumes (for polling + accepting incoming webhooks). But nothing tells the *provider* where to send those webhooks.

The legacy fork has a working reference at `/Users/gabrielaraujo/Desktop/Projetos/bk-company/bk-dash-backend/backend-old/src/modules/internalEvents/handlers/SyncIntegrationtSetEvent/webhookRegisters/` — a `WebhookRegister` interface (`model.ts`), a per-platform factory (`factory.ts`), and impls for Shopify, NuvemShop, Cartpanda, Yampi. The Shopify impl (`ShopifyWebhookRegister.ts`) maps provider topics (`orders/create`, `products/update`, `order_transactions/create`, …) to canonical webhook types, then POSTs each topic to `https://{shopDomain}/admin/api/2024-07/webhooks.json` with an `address` pointing back at the app's webhook ingest endpoint.

This codebase already has the factory pattern this feature needs, three times over in the same BC: `HandshakeServiceFactory`, `OAuthCodeExchangerFactory`, and the just-shipped `AuthorizeUrlBuilderFactory` (all under `packages/api/typescript/src/integration/services/`). Each is a constructor-injected, `(type, platform)`-keyed resolver that throws `PLATFORM_NOT_SUPPORTED` for unbuilt platforms. Webhook registration is the same shape. Credentials are sealed in the `CredentialVault` (`packages/api/typescript/core/src/services/CredentialVault/`, `seal`/`open`) and persisted via `IntegrationCredentialSecretRepository`; the connect flow stores the `credentialSecretId` on the `StoreIntegration`. Webhook *ingest* (Go receiving the provider's POST and mapping it via the per-platform webhook-mapper-factory, per [[feedback_webhook_mapper_pattern]]) already exists on the Go side and is out of scope here.

## Problem

After a `StoreIntegration` activates, the provider is never told to send webhooks to our system. As a result a connected Shopify store produces no real-time order/product events — the only data path is Go's scheduled polling. The registration call (TS → provider webhook API) is the missing front-half; without it the webhook ingest Go already implements receives nothing.

## Goal

When a sales-platform integration activates, the provider's webhooks are automatically registered against our public Go ingest URL, with no manual step and no merchant action. A Shopify store connected via OAuth starts pushing `orders/*`, `products/*`, and `order_transactions/create` events to `${GO_WEBHOOK_PUBLIC_URL}/webhooks?platform=SHOPIFY&event=<canonical-event>&integrationId=<id>&storeId=<id>` — each provider topic mapped to its canonical `event` — within one outbox cycle of activation.

## Decisions

1. **TS owns the registration call.** The TS API opens the sealed credentials from the `CredentialVault`, builds the per-platform topic list, and POSTs to the provider's webhook-register API. Go is never taught provider register APIs — it only *receives* webhooks (existing concern). Matches the legacy reference impl.

2. **A second, independent handler subscribes to `IntegrationActivatedEvent`.** New `RegisterIntegrationWebhooksHandler` runs as a separate fan-out subscriber alongside the existing `IntegrationActivatedHandler` (Go bridge). Isolation: a webhook-registration failure must not block the Go-bridge publish, and vice-versa. Both are driven by the outbox.

3. **`WebhookRegister` abstract + `WebhookRegisterFactory` keyed by `(type, platform)`**, mirroring `HandshakeServiceFactory` / `OAuthCodeExchangerFactory` / `AuthorizeUrlBuilderFactory` exactly (constructor-injected per-platform impls, nested record keyed by the platform enum, `.get()` throws `PLATFORM_NOT_SUPPORTED`). The abstract contract:
   - `registerWebhooks(input: { credentials: Record<string, string>; storeIntegrationId: string; targetUrl: string }): Promise<void>`
   - `deleteWebhooks(input: { credentials: Record<string, string> }): Promise<void>` — defined on the contract for symmetry with the reference (Disconnect teardown), but **not wired to any caller in this spec** (see Out of Scope).

3a. The abstract base exposes a static `buildIngestUrl({ platform, event, integrationId, storeId })` that returns `${Config.env.GO_WEBHOOK_PUBLIC_URL}/webhooks?platform=${platform}&event=${event}&integrationId=${integrationId}&storeId=${storeId}` — matching the existing Go intake controller's required query params exactly (`packages/api/go/internal/webhooks/controllers/webhook.go`: `platform`, `event`, `integrationId`, `storeId`, all `oneof`-gated). `platform` is the platform enum value (`SalesPlatform.SHOPIFY === 'SHOPIFY'` already matches Go's `WebhookPlatform` set). The URL is built **per topic** (each carries its own `event`), not once per platform.

4. **Shopify is the only real impl in this spec.** Other platforms throw `PLATFORM_NOT_SUPPORTED` from the factory until built ([[project_go_sync_pipeline_pattern]] — ship the Shopify reference + leave the rest unregistered). Webhook registration applies only to platforms that emit order/product/transaction webhooks (SALES_CHANNEL / CHECKOUT / PAYMENT_GATEWAY); **marketing platforms (Meta / Google Ads / Tiktok) are excluded** — they have no order webhooks. The handler resolves the register via `factory.get(...)`; if the platform has no register (marketing, or unbuilt sales platforms), the factory throws and the handler treats it as a no-op skip rather than a failure (see Decision 7).

5. **`registerWebhooks` is idempotent.** The Shopify impl GETs the store's existing webhooks first and POSTs only the topics not already present, so an outbox retry never creates duplicates. (The legacy reference registered unconditionally; this spec improves on it.)

5a. **Each provider topic maps to a canonical `event`, carried in the registered address** — the same shape as the legacy reference's per-platform `Record<topic, WebhookType>`. The Go intake controller requires the `event` query param (`oneof=sync.external_order_updated sync.external_product_updated sync.external_product_variant_updated sync.external_transaction_updated`), so each registered webhook address must declare which canonical event it carries. The Shopify topic→event map:
   - `orders/create` → `sync.external_order_updated`
   - `orders/updated` → `sync.external_order_updated`
   - `products/create` → `sync.external_product_updated`
   - `products/update` → `sync.external_product_updated`
   - `order_transactions/create` → `sync.external_transaction_updated`

   The canonical event names are lifted into shared contracts as a `SyncEventName` TypeSpec enum (`packages/contracts/wire/enums/sync-event-name.tsp`) — the single source both languages generate from. The TS register imports the generated `SyncEventName` from `@template/contracts-typescript/wire/enums`; Go's hand-written `internal/sync/enums/event_name.go` is **deleted** and its ~27 consumers substituted to reference the generated `wire.SyncEventName` directly (no alias shim). The TypeSpec enum carries **all** of Go's current `EventName` values (the 4 webhook-relevant + the 6 marketing ones), not just the webhook subset, so every existing consumer has a generated constant to point at.

6. **Target URL goes to a new public env, not the internal worker URL.** `GO_WORKER_BASE_URL` defaults to `http://localhost:3032` (internal, for TS→Go command calls) — a provider on the public internet can't reach that. Add `GO_WEBHOOK_PUBLIC_URL` to `Config.env`, defaulting to `GO_WORKER_BASE_URL` for local dev. The URL carries `platform`, `event`, `integrationId` (= the StoreIntegration id), and `storeId` — the four params Go's intake controller validates.

7. **Failure semantics: throw → outbox retry.** When the provider register API fails (provider down, missing scope, network error), the handler throws `WEBHOOK_REGISTRATION_FAILED` and the outbox dispatcher retries on its normal schedule until success or max-attempts. Activation itself is never gated on registration (the integration is already active). A *`PLATFORM_NOT_SUPPORTED`* from the factory (marketing / unbuilt platform) is a graceful skip — the handler returns without throwing, so non-sales activations don't spin the outbox.

8. **Out of scope.** Webhook *ingest* (Go receiving + mapping — already exists). Disconnect-time webhook teardown (`deleteWebhooks` is on the contract but no Disconnect handler calls it yet — follow-up). Per-platform follow-up handlers like Shopify→Store-timezone (separate Spec B). A `webhooksRegistered` flag/column on `StoreIntegration` and any "re-register" UI/command (would add a migration + entity field; deferred). Non-Shopify register impls.

## User Stories

- **Store owner connects Shopify.** As a store owner, I want my Shopify webhooks registered automatically when I connect, so that order and product changes flow into the app in real time without me configuring anything.
  - Given a `StoreIntegration` for `(SALES_CHANNEL, SHOPIFY)` activates, when `RegisterIntegrationWebhooksHandler` runs, then the Shopify webhook API receives POSTs for each missing topic (`orders/create`, `orders/updated`, `products/create`, `products/update`, `order_transactions/create`) with `address = ${GO_WEBHOOK_PUBLIC_URL}/webhooks/shopify?storeIntegrationId=<id>`.
  - Given some of those topics are already registered on the store, when the handler runs (e.g. an outbox retry), then only the missing topics are POSTed — no duplicates.

- **Provider API is down at activation time.** Given the Shopify webhook API returns a 5xx or is unreachable, when the handler runs, then it throws `WEBHOOK_REGISTRATION_FAILED` and the outbox retries later; the integration remains active throughout.

- **A marketing or not-yet-supported platform activates.** Given a `StoreIntegration` for `(MARKETING_PLATFORM, META)` (no webhook register) activates, when the handler runs, then it resolves no register and returns without error — no provider call, no retry.

- **Developer adds a new platform's webhooks.** As a developer, I want to add one `WebhookRegister` impl + one factory table entry to support a new platform, so the activation handler picks it up with no handler changes — same ergonomics as the existing `(type, platform)` factories.

## Acceptance Criteria

- [ ] AC-1: `WebhookRegisterFactory.get({ type, platform })` returns the registered impl for `(SALES_CHANNEL, SHOPIFY)` and throws `PLATFORM_NOT_SUPPORTED` for any `(type, platform)` without a registered impl.
- [ ] AC-2: `ShopifyWebhookRegister.registerWebhooks(...)` POSTs each of the five canonical Shopify topics (`orders/create`, `orders/updated`, `products/create`, `products/update`, `order_transactions/create`) to `https://{shopDomain}/admin/api/2024-07/webhooks.json` with the `X-Shopify-Access-Token` header and an `address` equal to `${GO_WEBHOOK_PUBLIC_URL}/webhooks?platform=SHOPIFY&event=<mapped-event>&integrationId=<id>&storeId=<id>`, where `<mapped-event>` is the topic's canonical event per Decision 5a (e.g. `orders/create` → `sync.external_order_updated`, `order_transactions/create` → `sync.external_transaction_updated`). (Verified via injected `fetchFn` stub, like `ShopifyHandshaker`/`ShopifyOAuthCodeExchanger`.)
- [ ] AC-3: When the store already has some of those topics registered (GET returns them), `registerWebhooks` POSTs only the missing ones — idempotent on retry.
- [ ] AC-4: A non-2xx response or network error from the provider causes `registerWebhooks` to throw `WEBHOOK_REGISTRATION_FAILED`.
- [ ] AC-5: `RegisterIntegrationWebhooksHandler` subscribes to `IntegrationActivatedEvent`; on a `(SALES_CHANNEL, SHOPIFY)` activation it loads the `StoreIntegration`, opens its `IntegrationCredentialSecret` via the vault, and calls `register.registerWebhooks(...)` with the opened credentials + the StoreIntegration's id (`integrationId`) + its `storeId`.
- [ ] AC-6: When the handler resolves no register for the platform (factory throws `PLATFORM_NOT_SUPPORTED`, e.g. `(MARKETING_PLATFORM, META)`), it returns without throwing and makes no provider call.
- [ ] AC-7: When `registerWebhooks` throws, the handler propagates the error (so the outbox retries); the existing `IntegrationActivatedHandler` (Go bridge) is unaffected because it is a separate subscriber.
- [ ] AC-8: `GO_WEBHOOK_PUBLIC_URL` is read from `Config.env`, defaulting to `Config.env.GO_WORKER_BASE_URL` when unset; `WebhookRegister.buildIngestUrl(...)` produces a URL whose `platform`/`event`/`integrationId`/`storeId` params satisfy the Go intake controller's `oneof` validation.
- [ ] AC-9: `SyncEventName` exists as a generated enum in both `@template/contracts-typescript/wire/enums` (TS) and `template/contracts-go/wire` (Go), carrying all 10 current `sync.EventName` values; the hand-written `internal/sync/enums/event_name.go` is deleted and its consumers reference `wire.SyncEventName` directly (Go `build` + sync/webhooks suites stay green); the Shopify topic→event map references `SyncEventName` members, not string literals.

## Risks & Migration

- **Public reachability.** `GO_WEBHOOK_PUBLIC_URL` must be a publicly-resolvable URL in any environment where real provider webhooks fire; the `localhost` default only works for local dev where no real provider calls back. Document in `.env.example`.
- **Scope coupling to OAuth scopes.** Registering Shopify webhooks requires the access token to carry the right scopes; a token missing `read_orders`/`read_products` will fail registration (surfaced as `WEBHOOK_REGISTRATION_FAILED`). The OAuth scopes already enforced at handshake (`ShopifyOAuthScopes`) cover these, so this is consistent, not a new constraint.
- **Retry storms.** A permanently-failing provider retries until outbox max-attempts. Acceptable for v1; a `webhooksRegistered` flag + dead-letter visibility is the deferred follow-up.

## Open Questions

- Handler naming/organization: this spec adds `RegisterIntegrationWebhooksHandler` as a sibling flat-file handler subscribing to the same event as `IntegrationActivatedHandler`. If the project prefers the `<EventName>Handler` folder + sub-handler convention ([[feedback_handler_per_event_name]]), the two could be colocated under `handlers/IntegrationActivatedHandler/`. Left as a `/plan`-time detail since both register identically via the `internal.ts` barrel.
