# AdditionalPlatformHandler — Post-Activation Dispatch Consolidation — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Bounded Context:** integration
**Kind:** chore (refactor — behavior-preserving)
**Story Points:** 5 — one new per-`(type, platform)` service family (`AdditionalPlatformHandler` abstract + factory + mock + 2 concrete handlers) replacing the `WebhookRegister` dispatch layer; the standalone fan-out handler + the `WebhookRegister` abstract/factory/mock are retired; the 2 concrete registers are re-typed and `buildIngestUrl` relocates. Single bounded context, no migration, no new contract, no behavior change.

## Context

Post-activation work in the `integration` BC is driven off `IntegrationActivatedEvent` by independent fan-out subscribers (`packages/api/typescript/src/integration/handlers/internal.ts`): `IntegrationActivatedHandler` bridges to the Go worker, and `RegisterIntegrationWebhooksHandler` (`handlers/RegisterIntegrationWebhooksHandler.ts`) resolves `WebhookRegisterFactory.get(platform)` and calls `registerWebhooks(...)`. Webhook registration is the only platform-specific post-activation step today, shipped for Shopify (`services/shopify/ShopifyWebhookRegister.ts`) and NuvemShop (`services/nuvemshop/NuvemShopWebhookRegister.ts`) behind a `(type, platform)` factory (`services/WebhookRegister/WebhookRegisterFactory.ts`) over the `WebhookRegister` abstract (`services/WebhookRegister/WebhookRegister.ts`), with a shared `MockWebhookRegister`.

That worked for a single concern, but the next increment (Spec B2 — fetch the Shopify store timezone on activation) adds a *second* platform-specific step. Scattering one fan-out subscriber + one factory per concern doesn't scale: each concern reintroduces the same `(type, platform)` dispatch, the same "load integration → open credentials → resolve by platform" preamble, and the same `Record<string, string>` credential plumbing. The webhook registers also take `credentials: Record<string, string>` and re-parse internally against their `*Description.outputTokens` (`ShopifyWebhookRegister.ts:44`) — losing type safety at the call boundary even though the opened credentials have a known per-platform shape.

This refactor introduces a single per-platform umbrella — `AdditionalPlatformHandler` — that owns *all* of a platform's post-activation work and is the one thing the activation flow dispatches. It is purely structural: after it lands, Shopify and NuvemShop still register exactly the same webhooks on activation, with the same idempotent behavior and target URLs.

## Problem

1. Each new platform-specific post-activation concern (webhooks now, timezone next) currently means another standalone fan-out subscriber + another `(type, platform)` factory + another copy of the load/open/resolve preamble. There's no single per-platform home for "everything this platform does after activation."
2. The webhook registers accept `credentials: Record<string, string>` and re-parse internally; the opened credentials have a known per-platform shape, so the call boundary should be typed.

## Goal

A single, pluggable per-`(type, platform)` `AdditionalPlatformHandler` is the one post-activation dispatch point: the activation flow resolves the platform's handler and runs it; each handler owns that platform's steps (today: webhook registration) calling the concrete registers directly with typed credentials. Adding a new platform-specific step (B2's timezone fetch) becomes "add a line inside that platform's handler," not "wire a new factory + subscriber." No observable behavior changes in this spec.

## Decisions

1. **New `AdditionalPlatformHandler` abstract + `AdditionalPlatformHandlerFactory`** keyed by `(type, platform)`, mirroring the existing factory shape (`HandshakeServiceFactory` / `OAuthCodeExchangerFactory` / `AuthorizeUrlBuilderFactory`): constructor-injected concrete handlers, nested record keyed by the platform enum, `.get()` throws `PLATFORM_NOT_SUPPORTED`, no `.has()`. The abstract method is `run(input: { storeIntegrationId: string; storeId: string; externalId: string; credentials: Record<string, string> }): Promise<void>` — the opened (vault-decrypted) credentials are passed in; the handler parses them to its typed shape.

2. **One activation subscriber drives it.** Replace `RegisterIntegrationWebhooksHandler` with `RunAdditionalPlatformHandler` (subscribes to `IntegrationActivatedEvent`): load the `StoreIntegration` (graceful return if gone), resolve `AdditionalPlatformHandlerFactory.get({type, platform})` (skip silently on `PLATFORM_NOT_SUPPORTED` — marketing/unbuilt platforms), load the `IntegrationCredentialSecret` (graceful return if absent), `vault.open` it, and call `handler.run({ storeIntegrationId, storeId, externalId, credentials })`. Errors propagate (outbox retries). This keeps the generic load/open/dispatch preamble in one place; the existing `IntegrationActivatedHandler` (Go bridge) stays a separate, untouched subscriber.

3. **Concrete per-platform handlers**: `ShopifyAdditionalPlatformHandler`, `NuvemShopAdditionalPlatformHandler`. Each parses the opened credentials against its platform's `*Description.outputTokens` (Shopify → `ShopifyCredentialsDescriptionSchema`, NuvemShop → `NuvemShopOAuthDescriptionSchema`), then calls its concrete webhook register **directly** (no factory/abstract indirection) with the typed credentials. A parse failure throws `WEBHOOK_REGISTRATION_FAILED` (the existing behavior, just moved up to the handler). In this spec each handler's only step is webhook registration; B2 adds the Shopify timezone step inside `ShopifyAdditionalPlatformHandler`.

4. **Re-type the concrete registers.** `ShopifyWebhookRegister` / `NuvemShopWebhookRegister` stop extending the `WebhookRegister` abstract and become plain classes; their `registerWebhooks` (and `deleteWebhooks`) take the **typed** credential shape (`z.infer` of the platform's `outputTokens`) instead of `Record<string, string>`, and no longer parse internally (the calling handler parsed). They keep `fetchFn` injection, idempotency, target-URL building, and error handling unchanged.

5. **Retire the `WebhookRegister` dispatch layer.** Delete `services/WebhookRegister/WebhookRegister.ts` (abstract), `WebhookRegisterFactory.ts`, `MockWebhookRegister.ts`, and the standalone `RegisterIntegrationWebhooksHandler.ts`. The static `WebhookRegister.buildIngestUrl(...)` relocates to a standalone helper `services/WebhookRegister/buildWebhookIngestUrl.ts` (a plain exported function) that both concrete registers import — same signature/behavior. Drop the `WebhookRegisterFactory` + register tokens from `registry.ts`; add the new `AdditionalPlatformHandler` bindings (concrete handlers + factory; mock instances for mock/integration, real `useFactory` for real).

6. **Behavior is preserved exactly.** Same platforms register the same topics to the same target URLs on activation; idempotency, failure→retry, and the marketing/unbuilt-platform skip all unchanged. The migrated tests assert the same outcomes through the new dispatch path.

7. **Out of scope.** The Shopify timezone fetch + the cross-context enrichment event + the tenancy handler (all Spec B2). Disconnect-time teardown (still no caller; `deleteWebhooks` carried along re-typed). Any platform beyond Shopify/NuvemShop.

## User Stories

- **Developer adds a platform-specific post-activation step.** As a developer, I want one per-platform handler that owns everything a platform does after activation, so a new step (e.g. fetch timezone) is a line inside that handler — not a new factory + subscriber.
  - Given a `(SALES_CHANNEL, SHOPIFY)` integration activates, when `RunAdditionalPlatformHandler` runs, then it resolves `ShopifyAdditionalPlatformHandler` and that handler registers the same Shopify webhooks that shipped today.
  - Given a `(SALES_CHANNEL, NUVEM_SHOP)` integration activates, then `NuvemShopAdditionalPlatformHandler` registers the same NuvemShop webhooks.
  - Given a platform with no handler (e.g. `(MARKETING_PLATFORM, META)`), then `RunAdditionalPlatformHandler` resolves nothing and returns without error (no provider calls).

- **Webhook registration keeps its guarantees.** Given a register call fails (provider down / malformed creds), then the error propagates so the outbox retries; the integration stays active.

## Acceptance Criteria

- [ ] AC-1: `AdditionalPlatformHandlerFactory.get({ type, platform })` returns the registered handler for `(SALES_CHANNEL, SHOPIFY)` and `(SALES_CHANNEL, NUVEM_SHOP)`, and throws `PLATFORM_NOT_SUPPORTED` for any pair without one (e.g. `(MARKETING_PLATFORM, META)`).
- [ ] AC-2: `ShopifyAdditionalPlatformHandler.run(...)` parses the opened credentials to the typed Shopify shape and calls `ShopifyWebhookRegister` directly, registering the same five Shopify topics to the same `${GO_WEBHOOK_PUBLIC_URL}/webhooks?...` URLs as before (verified via injected `fetchFn`). Malformed credentials throw `WEBHOOK_REGISTRATION_FAILED`.
- [ ] AC-3: `NuvemShopAdditionalPlatformHandler.run(...)` does the same for the nine NuvemShop topics against the Tiendanube endpoint.
- [ ] AC-4: `RunAdditionalPlatformHandler` subscribes to `IntegrationActivatedEvent`; on a Shopify activation it loads the integration, opens the sealed credentials via the vault, resolves `ShopifyAdditionalPlatformHandler`, and runs it (verified by a handler test asserting the register received the call). A `PLATFORM_NOT_SUPPORTED` platform is a silent skip; a vanished integration / absent secret is a graceful no-op; a handler error propagates.
- [ ] AC-5: `ShopifyWebhookRegister` / `NuvemShopWebhookRegister` `registerWebhooks` signatures take the typed credential shape (not `Record<string, string>`) and no longer extend `WebhookRegister`; `buildWebhookIngestUrl` is a standalone helper both import producing the identical URL.
- [ ] AC-6: The `WebhookRegister` abstract, `WebhookRegisterFactory`, `MockWebhookRegister`, and `RegisterIntegrationWebhooksHandler` are deleted; no references remain; `bun tsc` + the integration suite stay green (same webhook behavior through the new path).

## Risks & Migration

- **Pure refactor of just-shipped code.** The webhook-register feature shipped minutes ago; this reorganizes its dispatch. The safety net is the existing webhook tests, migrated to assert identical outcomes through `AdditionalPlatformHandler`. If any assertion can't be preserved 1:1, that's a signal the refactor changed behavior — stop and reconcile.
- **Mock strategy.** With the `WebhookRegister` abstract gone, the activation-handler test uses a `MockAdditionalPlatformHandler` (records `lastRunInput`, optional `nextErrorReason`) resolved via the factory — mirroring how the old test used `MockWebhookRegister`. The concrete register tests keep using injected `fetchFn` directly.
