# NuvemShop Webhook Registration — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Bounded Context:** integration
**Kind:** feature (+ rider bug-fix)
**Story Points:** 5 — one new `WebhookRegister` impl (NuvemShop) mirroring the just-shipped Shopify one + factory/registry wiring, PLUS a rider fix to `NuvemShopOAuthCodeExchanger` (source the store id from the token response's `user_id`) and its description `outputTokens`. Single bounded context, no migration, no new contract enum, no UI.

## Context

The webhook-registration framework shipped for Shopify only (`.specs/2026-05-28-integration-webhook-register-design.md`): a per-`(type, platform)` `WebhookRegister` family (`packages/api/typescript/src/integration/services/WebhookRegister/`) + `ShopifyWebhookRegister` (`services/shopify/ShopifyWebhookRegister.ts`), driven by `RegisterIntegrationWebhooksHandler` on `IntegrationActivatedEvent`. The factory throws `PLATFORM_NOT_SUPPORTED` for every platform without an impl — including NuvemShop, the other OAuth sales channel. The reference monolith has a working NuvemShop register at `/Users/gabrielaraujo/Desktop/Projetos/bk-company/bk-dash-backend/backend-old/src/modules/internalEvents/handlers/SyncIntegrationtSetEvent/webhookRegisters/NuvemShopWebhookRegister.ts`: it POSTs each provider topic (`order/*`, `product/*`) to `https://api.nuvemshop.com.br/v1/{storeId}/webhooks` with `Authentication: bearer {accessToken}` and body `{ event, url }`.

In our codebase the NuvemShop API host is `api.tiendanube.com/v1/{storeId}` (the canonical host the existing `NuvemShopOAuthCodeExchanger` already uses for its `/store` enrichment call). The NuvemShop store id is the integration's canonical identifier: `NuvemShopOAuthCodeExchanger` sets `identifier: storeId` and `ConnectIntegration` persists it as `StoreIntegration.externalId`.

A latent defect blocks this: the OAuth-authorize work (`.specs/2026-05-28-integration-oauth-authorize-callback-design.md`) cleared `NuvemShopOAuthDescriptionSchema.inputTokens` to `z.object({})` (the identifier is discovered post-token, not user-supplied). But `NuvemShopOAuthCodeExchanger` still derives the store id from `input.credentials.storeId ?? ''` (`NuvemShopOAuthCodeExchanger.ts:72`) — which is now always `''`. NuvemShop's actual token-exchange response carries the store id as `user_id`, but `NuvemShopTokenResponseSchema` (`:6`) only parses `{ access_token, scope }`, dropping it. So today a NuvemShop OAuth connection resolves an empty `identifier`/`externalId`. The webhook register needs that store id, so this spec fixes the sourcing as a rider.

## Problem

1. NuvemShop integrations register no provider webhooks — `WebhookRegisterFactory.get` throws `PLATFORM_NOT_SUPPORTED` for `(SALES_CHANNEL, NUVEM_SHOP)`, so an activated NuvemShop store produces no real-time order/product events (polling only).
2. NuvemShop's OAuth `identifier`/`externalId` is empty: the exchanger reads the store id from now-empty `inputTokens` instead of the token response's `user_id`. Any feature keyed on the NuvemShop store id (webhook registration, the `/store` enrichment, future sync) is broken.

## Goal

When a NuvemShop sales-channel integration activates, its `order/*` + `product/*` webhooks are registered against our public Go ingest URL — same automatic, idempotent, retry-on-failure path Shopify already has. The NuvemShop store id is sourced correctly from the OAuth token response and available wherever the integration's externalId / sealed credentials are used.

## Decisions

1. **Source the NuvemShop store id from the token response `user_id`.** Add `user_id` to `NuvemShopTokenResponseSchema` and use it (stringified) as the exchanger's `identifier`. Drop the dead `input.credentials.storeId` read. This makes `StoreIntegration.externalId` the real NuvemShop store id again.

2. **Carry the store id in the sealed credentials via `outputTokens`** (the chosen approach over extending the `registerWebhooks` signature). Add `storeId: z.string().min(1)` to `NuvemShopOAuthDescriptionSchema.outputTokens`, and have the exchanger include `storeId` in the returned `tokens` (so the vault seals it). The webhook register then reads it from parsed credentials — no change to the `WebhookRegister.registerWebhooks({ credentials, storeIntegrationId, storeId })` contract (the `storeId` param there stays our tenancy Store id for the `?storeId=` ingest param; the NuvemShop store id rides inside `credentials`).

3. **`NuvemShopWebhookRegister` mirrors `ShopifyWebhookRegister`**, differing only in provider specifics:
   - Parse opened credentials against `NuvemShopOAuthDescriptionSchema.shape.outputTokens` (`{ accessToken, scope, storeId }`); parse failure → `WEBHOOK_REGISTRATION_FAILED`.
   - Topic → canonical `SyncEventName` map: `order/cancelled`, `order/created`, `order/edited`, `order/fulfilled`, `order/packed`, `order/paid`, `order/updated` → `EXTERNAL_ORDER_UPDATED`; `product/created`, `product/updated` → `EXTERNAL_PRODUCT_UPDATED`.
   - API base `https://api.tiendanube.com/v1/{storeId}/webhooks` (the host the codebase already uses, NOT the reference's `nuvemshop.com.br`); header `Authentication: bearer {accessToken}`; register body `{ event: <topic>, url: <ingest address> }`; register success `201`, list success `200` (GET returns the webhook array directly).
   - Idempotent: GET existing webhooks, POST only the topics whose `event` isn't already registered.
   - Each registered `url` = `WebhookRegister.buildIngestUrl({ platform: NUVEM_SHOP, event, integrationId: storeIntegrationId, storeId })` — the existing helper; `event` is the canonical `SyncEventName`.
   - `deleteWebhooks`: GET + DELETE each (defined for symmetry; no caller yet, same as Shopify).
   - `fetchFn` constructor-injected for tests.

4. **Wire NuvemShop into the factory + registry.** `WebhookRegisterFactory` gains a `NuvemShopWebhookRegister` constructor param + a `[SALES_CHANNEL][NUVEM_SHOP]` table entry. `integration/registry.ts` binds it: a shared `MockWebhookRegister` instance for mock/integration, `useFactory: () => new NuvemShopWebhookRegister()` for real.

5. **No handler change.** `RegisterIntegrationWebhooksHandler` is unchanged — it already resolves the register by `(type, platform)` and passes `{ credentials, storeIntegrationId, storeId }`. NuvemShop just stops being a `PLATFORM_NOT_SUPPORTED` skip and registers like Shopify.

6. **Out of scope.** Disconnect-time teardown wiring (`deleteWebhooks` has no caller — deferred, same as Shopify). Non-OAuth NuvemShop modes (none exist). Backfilling `externalId` on NuvemShop integrations connected before this fix (none in any real environment yet).

## User Stories

- **Store owner connects NuvemShop.** As a NuvemShop merchant, I want my order/product webhooks registered automatically on connect, so changes flow in real-time without configuration.
  - Given a `(SALES_CHANNEL, NUVEM_SHOP)` integration activates, when `RegisterIntegrationWebhooksHandler` runs, then NuvemShop's `/v1/{storeId}/webhooks` API receives POSTs for each missing topic with `Authentication: bearer` and body `{ event, url }`, where `url = ${GO_WEBHOOK_PUBLIC_URL}/webhooks?platform=NUVEM_SHOP&event=<mapped>&integrationId=<id>&storeId=<id>`.
  - Given some topics are already registered, when the handler runs (outbox retry), then only the missing topics are POSTed.

- **NuvemShop OAuth resolves the real store id.** As the platform, I want the NuvemShop OAuth exchange to set the integration's externalId to the store's `user_id` from the token response, so the store id is correct for webhook registration and sync.
  - Given a NuvemShop OAuth token response `{ access_token, scope, user_id }`, when the exchanger runs, then `identifier` equals `String(user_id)` and the sealed `tokens` include `storeId`.

- **Provider API failure retries.** Given the NuvemShop webhook API returns non-2xx or is unreachable, when the register runs, then it throws `WEBHOOK_REGISTRATION_FAILED` and the outbox retries; the integration stays active.

## Acceptance Criteria

- [ ] AC-1: `NuvemShopTokenResponseSchema` parses `user_id`; `NuvemShopOAuthCodeExchanger.exchange` returns `identifier === String(user_id)` and `tokens.storeId === String(user_id)` (no longer reads `input.credentials.storeId`).
- [ ] AC-2: `NuvemShopOAuthDescriptionSchema.outputTokens` includes `storeId` (string, min 1) alongside `accessToken` + optional `scope`.
- [ ] AC-3: `WebhookRegisterFactory.get({ type: SALES_CHANNEL, platform: NUVEM_SHOP })` returns the `NuvemShopWebhookRegister`; an unregistered pair (e.g. a CHECKOUT platform) still throws `PLATFORM_NOT_SUPPORTED`.
- [ ] AC-4: `NuvemShopWebhookRegister.registerWebhooks` POSTs each of the 9 canonical topics (`order/{cancelled,created,edited,fulfilled,packed,paid,updated}`, `product/{created,updated}`) to `https://api.tiendanube.com/v1/{storeId}/webhooks` with `Authentication: bearer {accessToken}` and body `{ event: <topic>, url: <ingest url carrying the mapped SyncEventName> }`. (Verified via injected `fetchFn`.)
- [ ] AC-5: When the store already has some topics registered (GET returns them), only the missing topics are POSTed (idempotent).
- [ ] AC-6: A non-2xx register response or network error throws `WEBHOOK_REGISTRATION_FAILED`; malformed credentials (failing the `outputTokens` parse, e.g. missing `storeId`) also throw `WEBHOOK_REGISTRATION_FAILED`.
- [ ] AC-7: Activating a NuvemShop integration drives the register end-to-end through the unchanged `RegisterIntegrationWebhooksHandler` (resolves `NuvemShopWebhookRegister`, opens creds, calls `registerWebhooks`) — verified by a handler test asserting the mock register received the call with the NuvemShop creds.

## Risks & Migration

- **Sealed-credential shape change.** Adding `storeId` to `outputTokens` means NuvemShop integrations connected before this change have sealed credentials without `storeId` — the register's parse would reject them. No real NuvemShop integrations exist yet (OAuth identifier was broken), so there's nothing to migrate; noted for completeness.
- **`api.tiendanube.com` vs `nuvemshop.com.br`.** We deliberately use the Tiendanube host (matches the existing exchanger). If a NuvemShop-BR-specific host is ever required, it's localized to this one register.
