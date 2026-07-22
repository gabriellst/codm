# Marketing OAuth Health, Ad-Account Activation & Campaign Reads — Design Spec (W4)

**Date:** 2026-06-01
**Status:** Draft
**Bounded Context:** cross-context: marketing, integration, go/sync
**Kind:** feature
**Story Points:** 13 — artifact count (7 deliverables) elevated by: cross-service contract (new `StoreIntegrationStatus` enum in `packages/contracts` + generated bindings in both TS + Go), migration-with-backfill (backfill `ACTIVE` for existing live integrations), and new projection-adjacent Go cron jobs registering into W2's scheduler
**Part of:** .specs/2026-06-01-bk-dash-crucial-gaps-closure-roadmap-design.md (master roadmap)
**Depends on:** W2 (go-recurring-sync-scheduler — cron job registry must exist before token-renewal jobs can register)

---

## Context

The marketing integration stack has three connected failure modes that make the dashboard unreliable for merchants. First, Meta long-lived tokens last roughly 60 days and TikTok access tokens last 24 hours; neither is currently renewed — after expiry, every call to these APIs silently returns 401s and the platform never signals the merchant. The exchangers at `/packages/api/typescript/src/integration/services/meta/MetaOAuthCodeExchanger.ts` and `/packages/api/typescript/src/integration/services/tiktok/TiktokOAuthCodeExchanger.ts` perform only the initial code exchange; there is no renewal path. By contrast, the Google Ads Go client at `/packages/api/go/internal/sync/services/google/client.go` (line 74–93) manages per-request token refresh internally and is unaffected.

Second, when a merchant deauthorizes the Meta app (from Meta's app settings), Meta fires a `signed_request` deauthorization webhook. There is no mapper for it in `/packages/api/go/internal/webhooks/mappers/` (the factory at that path would return `WEBHOOK_MAPPER_PENDING`), and `/packages/api/typescript/src/integration/handlers/external.ts` has an empty export with a comment noting "no deauth handler." The `StoreIntegration` entity at `/packages/api/typescript/src/integration/entities/StoreIntegration.ts` tracks an `active` boolean and a `disconnectedAt` timestamp, but there is no `status` field that distinguishes a user-initiated disconnect from a token expiry — which matters because the cron can only renew integrations with `TOKEN_EXPIRED` status, not those the merchant manually disconnected.

Third, ad-accounts discovered by Go pipelines are written to `marketing.store_integration_marketing_access` via the handler at `/packages/api/typescript/src/marketing/handlers/OnMarketingAdAccountDiscoveredHandler.ts` with `active: false`, but the `activate()` / `deactivate()` methods on `StoreIntegrationMarketingAccess` at `/packages/api/typescript/src/marketing/entities/StoreIntegrationMarketingAccess.ts` are never called by any use case or controller. The `DrizzleStoreIntegrationMarketingAccessRepository` at `/packages/api/typescript/src/marketing/repositories/StoreIntegrationMarketingAccessRepository/DrizzleStoreIntegrationMarketingAccessRepository.ts` has `listByStoreIntegration()` but there is no read endpoint. Campaign data is stored in `sync.campaigns` by the Go worker (confirmed in `/packages/api/go/internal/sync/repositories/campaign/campaign_pg.go`) but no TS BFF endpoint queries it. Finally, `ReconcileMarketingAccounts` at `/packages/api/typescript/src/marketing/usecases/ReconcileMarketingAccounts.ts` calls `client.go.sync()` unconditionally — every "Refresh data" click dispatches a Go sync with no guard against concurrent calls.

---

## Problem

1. **Meta and TikTok tokens expire without renewal.** No weekly cron renews them, so integrations go stale silently. Google is not affected.
2. **Meta deauthorization goes unhandled.** A merchant revoking the Meta app in Meta's UI fires a `signed_request` webhook that drops on the floor — the integration stays visually `active` in the dashboard.
3. **No status vocabulary distinguishes expiry from disconnect.** The `StoreIntegration` entity has `active: boolean` + `disconnectedAt` but no `StoreIntegrationStatus` enum. Token expiry and user-initiated disconnect look identical to the cron, making selective renewal impossible.
4. **Ad-account rows are never activated.** Discovered ad-accounts land with `active: false` and stay there — merchants cannot designate which accounts feed their dashboard.
5. **No endpoint lists discovered marketing access rows.** The data exists in the DB but is unreachable via the API.
6. **Campaigns have no TS read surface.** Go writes `sync.campaigns` but there is no BFF query or controller to list them for the dashboard.
7. **ROAS/CPA spans MANUAL-only ad-spend.** `GetAdSpendBreakdown` (`/packages/api/typescript/src/marketing/usecases/GetAdSpendBreakdown.ts`) serves MANUAL rows only; the merged AUTOMATIC + MANUAL endpoint that reads Go-owned `sync.ad_spends` does not exist.
8. **ReconcileMarketingAccounts has no concurrency guard.** Concurrent "Refresh data" clicks each fire a full Go sync; SETNX debounce with TTL=300s is absent.

---

## Goal

After this workstream ships: Meta and TikTok tokens renew weekly via Go cron jobs registered into the W2 scheduler; a `StoreIntegrationStatus` enum (`ACTIVE` / `TOKEN_EXPIRED` / `DISCONNECTED`) is the single signal for both the renewal cron and the deauth webhook; Meta deauthorization sets the status to `DISCONNECTED` via a new Go webhook mapper and TS integration handler; merchants can activate and deactivate discovered ad-accounts via dedicated use cases and read the full list; the dashboard can list campaigns from `sync.campaigns`; a merged AUTOMATIC+MANUAL ROAS/CPA endpoint exists; and `ReconcileMarketingAccounts` is protected by a Redis SETNX debounce.

---

## Decisions

1. **`StoreIntegrationStatus` enum lives in `packages/contracts/wire/enums/` as a new TypeSpec enum** (`ACTIVE`, `TOKEN_EXPIRED`, `DISCONNECTED`). It is generated into both `@template/contracts-typescript` and `template/contracts-go` via `bun sdk`. The `StoreIntegration` entity gains a `status: StoreIntegrationStatus` field replacing the semantics currently split across `active: boolean` + `disconnectedAt`; the existing `active` boolean is kept as a derived shortcut (`active = status === ACTIVE`) so existing callers do not break in this workstream. A Drizzle migration adds a `status` column with a backfill that sets `ACTIVE` for rows where `disconnectedAt IS NULL` and `active = true`, and `DISCONNECTED` for the rest. The old `valid` boolean is NOT resurrected. (Source: master spec Decision 5; brief § cross-cutting decisions.)
2. **FB long-lived token renewal runs as a weekly Go cron job registered into W2's scheduler.** It calls `GET https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=…&client_secret=…&fb_exchange_token=<current_token>`. On success it updates the stored credential via the TS credential endpoint. (Source: brief § scope item 1.)
3. **TikTok access token renewal runs as a weekly Go cron job registered into W2's scheduler.** It calls `POST https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/` with `{ app_id, secret, refresh_token }`. (Source: brief § scope item 1.)
4. **The Meta deauthorization webhook is handled in Go** with a new `meta/deauth_mapper.go` under `/packages/api/go/internal/webhooks/mappers/meta/` that parses the `signed_request` payload using HMAC-SHA256 (reusing the existing `MetaVerifier` at `/packages/api/go/internal/webhooks/services/meta_verifier.go`) and emits a new `integration.shared.integration.token_expired` integration event into the contracts (`packages/contracts/wire/events/`). The TS integration context registers a handler in `integration/handlers/external.ts` that consumes this event and calls `integration.markTokenExpired()` → sets `status = TOKEN_EXPIRED`, `active = false`. (Source: brief § scope item 3.)
5. **`ActivateMarketingAdAccount` and `DeactivateMarketingAdAccount` are new TS use cases** in `marketing/usecases/`. They call `access.activate()` / `access.deactivate()` on the `StoreIntegrationMarketingAccess` entity and save. Controllers are `POST /marketing/ad-accounts/:id/activate` and `POST /marketing/ad-accounts/:id/deactivate`. (Source: brief § scope item 4.)
6. **`GetMarketingAccessList` is a new TS controller + use case** at `GET /marketing/access` that calls `accessRepo.listByStoreIntegration()` and returns the list with `accessType`, `platform`, `externalId`, `name`, `active` per row. (Source: brief § scope item 4.)
7. **`ListMarketingCampaigns` is a new TS query use case** that issues a direct Drizzle read over `sync.campaigns` (cross-schema read, read-only). Controller at `GET /marketing/campaigns`. (Source: brief § scope item 5.)
8. **The merged ROAS/CPA endpoint is a new `GetMarketingRoasCpa` TS query use case** that uniones MANUAL rows from `marketing.ad_spend_manual` and AUTOMATIC rows from `sync.ad_spends`, grouped by `storeIntegrationId` + date window, computing `roas = revenue / spend` and `cpa = spend / conversions`. Controller at `GET /marketing/roas-cpa`. (Source: brief § scope item 6.)
9. **`ReconcileMarketingAccounts` acquires a Redis SETNX guard** (key `reconcile:marketing:<storeIntegrationId>`, TTL 300 s) before calling `client.go.sync()`. If the key is already set, the use case returns the current `jobId` from the key value without re-triggering Go. Uses `IORedis` following the existing pattern at `/packages/api/typescript/src/integration/services/CredentialHandleStore/RedisCredentialHandleStore.ts`. (Source: brief § scope item 7.)
10. **Layer-boundary rules apply at authoring time throughout.** `z.instance(Id)` only on entity/VO schemas; integration events and use case schemas keep `z.uuid()`/`z.string()`; `z.enum(StoreIntegrationStatus)` for the new status field on use-case/controller layers; controller `InputSchema` top-level keys are only `body`/`query`/`params`/`ctx`. (Source: master spec Decision 8.)
11. **Google/TikTok campaign pipelines emit campaign-level only** — no AdSet or Ad tree-walk. This is a known limitation documented in the Out of Scope section; AdSet/Ad hierarchy reads are deferred.

---

## User Stories

**Story 1 — Token renewal**

Given a merchant has an active Meta integration with a long-lived token stored in the credential vault,
when the weekly FB token-renewal cron runs in Go,
then the stored access token is exchanged via `fb_exchange_token` and the credential secret is updated; the `StoreIntegration.status` remains `ACTIVE`.

**Story 2 — Token expiry visible to merchant**

Given a Meta integration whose token has expired (Go renewal fails, or Meta fires the deauth webhook),
when the Go webhook mapper parses the `signed_request` deauth payload and emits `integration.shared.integration.token_expired`,
then the TS integration handler sets `status = TOKEN_EXPIRED` and `active = false`; the dashboard can render a "Reconnect" prompt.

**Story 3 — Activate a discovered ad-account**

Given a merchant with discovered ad-accounts listed under their Meta integration (all `active: false` post-discovery),
when the merchant calls `POST /marketing/ad-accounts/:id/activate`,
then `StoreIntegrationMarketingAccess.activate()` is called, the row is saved with `active: true`, and subsequent reconcile jobs include this ad-account.

**Story 4 — Read discovered access rows**

Given ad-account and business-account rows have been discovered and persisted,
when the merchant calls `GET /marketing/access?storeIntegrationId=<id>`,
then the endpoint returns the list with `accessType`, `platform`, `externalId`, `name`, `active` per row.

**Story 5 — List campaigns**

Given the Go worker has synced campaign data into `sync.campaigns` for a store's ad-accounts,
when the merchant calls `GET /marketing/campaigns?storeIntegrationId=<id>`,
then the TS BFF returns a paginated list of campaigns with `platform`, `externalId`, `name`, `status`, `adAccountExternalId`.

**Story 6 — ROAS/CPA merged view**

Given a store has both MANUAL ad-spend entries and AUTOMATIC ad-spend rows from Go sync,
when the merchant calls `GET /marketing/roas-cpa?from=…&to=…&storeIntegrationIds=…`,
then the endpoint returns per-integration ROAS and CPA computed from the merged MANUAL + AUTOMATIC ad-spend.

**Story 7 — Reconcile debounce**

Given a merchant rapidly clicks "Refresh data" twice within 300 seconds,
when `ReconcileMarketingAccounts` executes the second call,
then the Redis SETNX key is already set and no duplicate Go sync is dispatched; the use case returns the existing `jobId`.

---

## Acceptance Criteria

1. A `StoreIntegrationStatus` TypeSpec enum (`ACTIVE` | `TOKEN_EXPIRED` | `DISCONNECTED`) is added to `packages/contracts/wire/enums/` and generated into `@template/contracts-typescript` and `template/contracts-go`. `bun tsc` passes.
2. A Drizzle migration adds `status store_integration_status NOT NULL DEFAULT 'ACTIVE'` to `store_integrations`; the backfill sets `ACTIVE` for rows with `disconnectedAt IS NULL AND active = true`, `DISCONNECTED` otherwise. `bun migrate:dev` applies cleanly.
3. `StoreIntegration.markTokenExpired()` sets `status = TOKEN_EXPIRED` and `active = false`; existing `disconnect()` sets `status = DISCONNECTED`. Entity unit tests cover both transitions and assert the invariant that `DISCONNECTED` is terminal (cannot call `markTokenExpired` on an already-disconnected integration — raises `STORE_INTEGRATION_ALREADY_DISCONNECTED`).
4. A Go weekly cron job `marketing:fb-token-renewal` is registered into W2's scheduler and calls `graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token` for every `StoreIntegration` where `platform = META AND status = ACTIVE`; on HTTP 4xx the job sets `status = TOKEN_EXPIRED` via the TS API.
5. A Go weekly cron job `marketing:tiktok-token-renewal` is registered into W2's scheduler and calls `business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/` for every `StoreIntegration` where `platform = TIKTOK AND status = ACTIVE`; on failure sets `status = TOKEN_EXPIRED`.
6. A Go webhook mapper `meta/deauth_mapper.go` under `/packages/api/go/internal/webhooks/mappers/meta/` parses the `signed_request` body (Base64URL decode + HMAC-SHA256 verify using the existing `MetaVerifier`), and emits a new `integration.shared.integration.token_expired` integration event. A `SyncEventName` value `EXTERNAL_INTEGRATION_TOKEN_EXPIRED` is added to the contracts TypeSpec enum; `bun sdk` regenerates cleanly.
7. A TS `OnIntegrationTokenExpiredHandler` in `integration/handlers/external.ts` consumes `integration.shared.integration.token_expired`, loads the `StoreIntegration` by `providerExternalId`, calls `integration.markTokenExpired()`, and saves.
8. `ActivateMarketingAdAccount` use case and `POST /marketing/ad-accounts/:id/activate` controller exist; a use case test confirms `access.active === true` after execution.
9. `DeactivateMarketingAdAccount` use case and `POST /marketing/ad-accounts/:id/deactivate` controller exist; a use case test confirms `access.active === false` after execution.
10. `GetMarketingAccessList` use case and `GET /marketing/access` controller exist; a use case test with seeded rows confirms the list is returned filtered by `storeIntegrationId`.
11. `ListMarketingCampaigns` use case and `GET /marketing/campaigns` controller exist; the use case reads `sync.campaigns` directly via Drizzle and returns paginated rows. A repository/query test with seeded rows confirms the query.
12. `GetMarketingRoasCpa` use case and `GET /marketing/roas-cpa` controller exist; the use case unions MANUAL (`marketing.ad_spend_manual`) and AUTOMATIC (`sync.ad_spends`) rows grouped by `storeIntegrationId` within the date window. A test with mixed MANUAL and AUTOMATIC seed data confirms merged totals.
13. `ReconcileMarketingAccounts.handle()` calls `redis.set(key, jobId, 'NX', 'EX', 300)` before dispatching; a test with a pre-set key confirms `client.go.sync` is not called and the existing `jobId` is returned.
14. `bun lint && bun tsc && bun run test` (marketing + integration suites) all pass after implementation.

---

## Open Questions

1. **Which Go endpoint / SDK method does the token-renewal cron use to persist the refreshed credential back to TS?** The Go-to-TS credential write path is not yet established — the existing `credentials.Exchanger` only reads. Does W4 introduce a new `PUT /credentials/:storeIntegrationId` TS endpoint (internal-secret gated, like the billing controller in W6), or does Go write directly to the `integration_credential_secrets` table? This must be settled before the cron can be implemented.
2. **`integration.shared.integration.token_expired` event name vs. reusing `integration.shared.integration.handshake_failed`.** The existing `IntegrationHandshakeFailedEvent` at `/packages/contracts/wire/events/integration-handshake-failed.tsp` carries `errorCode + errorMessage + attemptedAt`. Could the deauth case reuse this event with `errorCode = "DEAUTHORIZED"`, saving a new contract entry? Or is a distinct `TokenExpiredEvent` with `reason: "DEAUTH" | "RENEWAL_FAILURE"` cleaner for the TS handler to discriminate?
3. **`sync.ad_spends` schema for the AUTOMATIC ROAS/CPA query.** The Go ad-spend table is written by the Go worker but has no TS Drizzle schema declaration. W4 needs a read-only Drizzle table definition for `sync.ad_spends` (cross-schema Drizzle reference) or must proxy through the Go API. Confirm the column names (`store_integration_id`, `ad_account_external_id`, `spend_cents`, `impressions`, `clicks`, `conversions`, `date`) before implementing `GetMarketingRoasCpa`.

---

## Risks & Migration

**Backfill safety.** The `status` column backfill touches every row in `store_integrations`. The migration sets a safe default (`DEFAULT 'ACTIVE'`) so new inserts during deployment are correct even before the column is populated. The backfill UPDATE is a single statement and is idempotent; running `migrate:dev` twice is safe.

**Meta deauth `signed_request` format.** Meta's `signed_request` is a `.`-separated Base64URL envelope; the existing `MetaVerifier` verifies the HMAC over the raw body — but deauth webhooks arrive as `application/x-www-form-urlencoded` (not JSON), which differs from the sync webhook path. The Go mapper must read `r.FormValue("signed_request")` and decode it separately from the JSON-body webhook pipeline. This is a correctness risk; the mapper test must cover the form-encoded path.

**`sync.ad_spends` is Go-owned.** Cross-schema Drizzle reads require the TS migration to never alter the `sync` schema. The `ListMarketingCampaigns` and `GetMarketingRoasCpa` implementations must use read-only Drizzle table references (`pgTable` with `{ schema: 'sync' }`), never include them in Drizzle push/generate targets, and document this constraint inline.

---

## Out of Scope

- Google Ads token renewal (handled internally per-request by `/packages/api/go/internal/sync/services/google/client.go`).
- AdSet / Ad hierarchy reads from `sync.ad_sets` / `sync.ads` (campaign-level only per known limitation).
- CartPanda / Yampi / Kiwify deauthorization webhooks.
- Real email transport for "Integration disconnected" notification (stays `ConsoleMailSender`).
- `BillingPlatform.HOTMART` or any other billing webhook.
- Non-Shopify / non-NuvemShop credential exchangers.
