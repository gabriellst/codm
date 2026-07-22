# Marketing Canonical Aggregates — Go Write-Side (Spec β.1) — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Bounded Context:** `sync` (Go) + `sync` Drizzle schema
**Kind:** feature (Spec β.1 — Go-side canonical aggregates)
**Story Points:** 8 — 6 new Go aggregates (entities + repos + Drizzle migration + idempotent UPSERT) + 6 internal events + handlers + storage drains. Single bounded context (`sync` Go); 1 Drizzle migration with no backfill; cross-service integration events already locked (Spec α). Rubric tier-up applied for new aggregate set across one BC.

## Context

Spec α (Phase 0 contract lock, committed: c0e853c97 / 33b045f9c / 17af6d869) locked the marketing wire-event contract. The Go `sync` BC under `packages/api/go/internal/sync/` is the canonical write-authority for provider-synced entities — existing aggregates: `entities/order.go`, `entities/product.go`, `entities/product_variant.go`, `entities/transaction.go`. Each follows the same shape: private fields + separate `XInput` normalizer struct + `NewXFromProviderPayload` constructor for idempotent UPSERT via `Id.fromSeed(BK_DASH_NAMESPACE, platform, externalId, …)` PK. Drizzle migrations land under `packages/contracts/db/schema/sync.ts`. Internal events under `events/external_*_updated.go`; handlers under `handlers/*_updated_handler.go`; storage drains under `storage/<aggregate>/`.

This spec (β.1) extends that shape to the marketing hierarchy. TS-side concerns (link table, AdSpend rename, Campaign decommission) are deferred to Spec β.2.

## Problem

No Go-side marketing aggregates exist yet. The contract surface is locked (Spec α), but there are no entities/repos/migrations/handlers to receive a Facebook/Google/TikTok pipeline's normalized output. Spec γ+ (pipelines) can't ship without the write-side substrate.

## Goal

Land the canonical Go-write-side aggregate model for marketing (BusinessAccount → AdAccount → Campaign → AdSet → Ad + AdSpend buckets) so Spec γ+ (Facebook/Google/TikTok pipelines) can be authored against a working persistence layer that mirrors the existing Order/Product/Variant/Transaction pattern.

## Decisions

1. **6 Go aggregates in `packages/api/go/internal/sync/entities/`**, one file each:
   - `business_account.go` — `id`, `platform: wire.MarketingPlatform`, `externalId`, `name`, `status: wire.BusinessAccountStatus`, `externalCreatedAt`, standard timestamps.
   - `ad_account.go` — `id`, `platform`, `externalId`, `businessAccountExternalId`, `name`, `currency: wire.CurrencyCode`, `timezone: string` (IANA), `status: wire.AdAccountStatus`, `externalCreatedAt`.
   - `campaign.go` — `id`, `platform`, `externalId`, `adAccountExternalId`, `name`, `status: wire.CampaignStatus`, `externalCreatedAt`.
   - `ad_set.go` — `id`, `platform`, `externalId`, `campaignExternalId`, `adAccountExternalId`, `name`, `status: wire.CampaignStatus`, `externalCreatedAt`.
   - `ad.go` — `id`, `platform`, `externalId`, `adSetExternalId`, `campaignExternalId`, `adAccountExternalId`, `name`, `status: wire.CampaignStatus`, `externalCreatedAt`.
   - `ad_spend.go` — `id`, `platform`, `adAccountExternalId`, `campaignExternalId`, `currency: wire.CurrencyCode`, `startDate`, `endDate`, `groupBy: wire.AdSpendGroupBy`, `spendCents: int64`. PK seed: `Id.fromSeed(BK_DASH_NAMESPACE, platform, adAccountExternalId, campaignExternalId, startDate.Format(time.RFC3339), endDate.Format(time.RFC3339), groupBy)`.

   Each follows the existing Order pattern (private fields, `XInput` normalizer struct, `NewXFromProviderPayload(input XInput) (*X, error)` constructor that computes the deterministic id, getter methods for read access).

2. **Drizzle migration adds 6 tables under `packages/contracts/db/schema/sync.ts`**: `syncBusinessAccounts`, `syncAdAccounts`, `syncCampaigns`, `syncAdSets`, `syncAds`, `syncAdSpends`. Schema-qualified under `sync` (pgSchema). Each: deterministic `id uuid` PK, standard `createdAt` / `updatedAt`. Migration is additive — no backfill.

3. **6 Go repository folders in `packages/api/go/internal/sync/repositories/`**, one per aggregate: `businessaccount/`, `adaccount/`, `campaign/`, `adset/`, `ad/`, `adspend/`. Each has `<X>_repository.go` (interface) + `<X>_pg.go` (pgx impl with idempotent INSERT...ON CONFLICT DO UPDATE on PK). Methods: `Find(ctx, id) (*X, error)` (returns nil if not found, no error), `Save(ctx, x) error`. Mirror the existing `syncjob/syncjob_pg.go` shape.

4. **6 internal Go events in `packages/api/go/internal/sync/events/`**: `external_business_account_updated.go`, `external_ad_account_updated.go`, `external_campaign_updated.go`, `external_ad_set_updated.go`, `external_ad_updated.go`, `external_ad_spend_recorded.go`. Each is a Go-internal domain event carrying the corresponding `XInput`. Mirror existing `events/external_order_updated.go`.

5. **6 Go internal handlers in `packages/api/go/internal/sync/handlers/`**: one per `External*Updated` event. Each handler constructs the aggregate via `entities.NewXFromProviderPayload(event.Input)`, then enqueues to the storage drain. Mirror existing `handlers/order_updated_handler.go`.

6. **6 storage drain folders under `packages/api/go/internal/sync/storage/`**: `businessaccount/`, `adaccount/`, `campaign/`, `adset/`, `ad/`, `adspend/`. Each has a `Storage` struct with input channel + `Start(ctx)` goroutine that drains via `repo.Save`. Mirror existing `storage/order/`.

7. **fx wiring**: each new aggregate's pieces (entity, repo interface, repo impl, event, handler, storage) get fx providers in the sync BC module (`packages/api/go/internal/sync/module.go` if it exists, else `internal/sync/registry.go`). Follow the existing Order wiring.

8. **No pipeline implementations** in this spec — Spec γ + γ.1-3 (Facebook/Google/TikTok) own the pipeline files under `services/pipelines/<platform>/`.

9. **No wire-event publishing** in this spec — the handlers ONLY write to storage drain. Wire-event publishing (for BM/AdAccount discovery to the TS link table) happens in Spec γ pipeline implementations (the BUSINESS_ACCOUNTS and AD_ACCOUNTS pipelines explicitly call the outbox-backed external mediator after their respective enumerations).

10. **No SDK regen needed** in this spec — no controllers added; no wire-event changes.

## User Stories

- **Story 1 — Facebook BUSINESS_ACCOUNTS pipeline can persist a BusinessAccount idempotently.** As a developer authoring the Facebook BUSINESS_ACCOUNTS pipeline (Spec γ Facebook), I want `entities.NewBusinessAccountFromProviderPayload(input)` + a Save-via-handler path so the canonical BM survives idempotently across runs. *(AC-1, AC-3, AC-5)*
  - Given a clean DB, when the handler publishes `ExternalBusinessAccountUpdated` with a normalized Facebook BM, then `sync.business_accounts` has a row with the deterministic id from `Id.fromSeed`.
  - Given the same BM re-arrives, when the handler publishes again, then the row is UPDATED in place (no duplicate, no error).

- **Story 2 — Spec γ AdSpend pipeline can write campaign-bucket spend rows idempotently.** As a developer authoring the Facebook MARKETING_METRICS pipeline, I want `entities.NewAdSpendFromProviderPayload(input)` to compute a deterministic id from `(platform, adAccountExternalId, campaignExternalId, startDate, endDate, groupBy)` so the same bucket re-sync UPDATES instead of duplicating. *(AC-1, AC-3, AC-5)*

- **Story 3 — Full hierarchy is consistent.** As a developer rendering a campaign drill-down, I want `sync.ads.adAccountExternalId` to be denormalized from the AdSet's parent, so a query for "all ads on this ad-account" doesn't need a 3-table join. *(AC-1)*

## Acceptance Criteria

- [ ] AC-1: `packages/api/go/internal/sync/entities/{business_account,ad_account,campaign,ad_set,ad,ad_spend}.go` each exist with the fields per Decision 1, an `XInput` normalizer struct, and a `NewXFromProviderPayload(input XInput) (*X, error)` constructor. Each constructor computes the deterministic id via `Id.fromSeed(BK_DASH_NAMESPACE, ...)`. Each file has accompanying `*_test.go` asserting: (a) constructor returns the right id for known inputs (golden values), (b) re-running with the same input returns the same id (idempotency).
- [ ] AC-2: `packages/contracts/db/schema/sync.ts` defines the 6 new tables. Migration auto-generated via `bun migrate:create` and applied via `bun migrate:dev` runs cleanly. Each table has the deterministic `id uuid` PK + the fields per Decision 1.
- [ ] AC-3: `packages/api/go/internal/sync/repositories/{businessaccount,adaccount,campaign,adset,ad,adspend}/` each have `<x>_repository.go` + `<x>_pg.go` + `<x>_pg_test.go`. Save is idempotent (UPSERT on PK); calling Save twice with the same entity succeeds both times and the row count stays at 1.
- [ ] AC-4: `packages/api/go/internal/sync/events/external_*_updated.go` (6 files) exist following the Order event pattern.
- [ ] AC-5: `packages/api/go/internal/sync/handlers/*_updated_handler.go` (6 files) wire each event to its storage drain. Tests in `*_handler_test.go` per file: publish event → entity appears in storage drain channel → after Storage.Start drains it → DB row exists.
- [ ] AC-6: `packages/api/go/internal/sync/storage/{businessaccount,adaccount,campaign,adset,ad,adspend}/` each exist with the Order storage shape (input channel + Start goroutine).
- [ ] AC-7: Sync BC fx module (`packages/api/go/internal/sync/module.go` or `registry.go`) wires all 6 new aggregates' entity factories, repo impls, event types, handlers, storage drains. `bun dev:api:go` boots cleanly.
- [ ] AC-8: `bun tsc` passes (no TS changes here, but the workspace check stays green).
- [ ] AC-9: `bun run test` passes — Go suite includes the new entity / repo / handler tests; TS suite untouched.
- [ ] AC-10: `bun lint` passes.

## Forward Scope — Spec β.2 + γ preview

Spec β.2 (next): TS-side polymorphic `store_integration_marketing_access` link table + handlers for the 2 discovery wire events + AdSpend → AdSpendManual rename + decommission TS marketing.Campaign + delete integration.MarketingAdAccount aggregate.

Spec γ: marketing concurrency runtime (DayWorkerPool, ProgressPublisher, RateLimiter port, Mediator on RunInput).

Spec γ.1-3: Facebook / Google / TikTok pipelines (4 each: BUSINESS_ACCOUNTS, AD_ACCOUNTS, CAMPAIGNS, MARKETING_METRICS).
