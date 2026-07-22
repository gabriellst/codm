# Marketing Canonical Aggregates — Phase 0 Contract Lock — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Bounded Context:** `contracts` (TypeSpec wire events) + cosmetic comment-only update in TS `marketing` BC
**Kind:** chore (contract lock / Phase 0)
**Story Points:** 5 — 2 wire events (1 new + 1 revised) + 6 wire events deleted + 2 new enums (`BusinessAccountStatus`, `AdAccountStatus`) + index.tsp + main.tsp updates, plus SDK regen across both languages. Single bounded context (`contracts`) but cross-service integration events consumed Go↔TS (rubric tie-breaker: cross-service contract → +1 tier).

## Context

The polyglot port currently has marketing wire events authored speculatively for a richer integration-anchored projection model than the redirected design requires. On disk in `packages/contracts/wire/events/`: `campaign-updated.tsp`, `campaign-status-changed.tsp`, `ad-set-updated.tsp`, `ad-updated.tsp`, `ad-spend-recorded.tsp`, `marketing-reconciliation-completed.tsp`, `marketing-ad-account-discovered.tsp` — all carry `storeIntegrationExternalId` and were sized to feed TS-side projections of every node in the Campaign → AdSet → Ad → AdSpend hierarchy.

Audit (chat 2026-05-28, verified by grep across `packages/api/typescript/src/` and `packages/api/go/internal/`): **none of these 6 `*Updated`/`*Recorded`/`*Completed` events have any TS or Go consumer code today.** `packages/api/typescript/src/marketing/handlers/external.ts` is effectively empty (`export {}`) with deferred-handler comments explicitly noting *"OnMarketingReconciliationCompleted → no real v1 consumer; the cache-invalidation use case was dropped per memory `no-speculative-cache-layer`"*. The only real consumer in the marketing-event space is `packages/api/typescript/src/integration/entities/MarketingAdAccount.ts` consuming `MarketingAdAccountDiscoveredEvent`.

The redirection captured in chat 2026-05-28: the Go-side `sync` BC becomes the canonical write home for the full marketing provider hierarchy — `BusinessAccount`, `AdAccount`, `Campaign`, `AdSet`, `Ad`, `AdSpend` — all pure `(platform, externalId)`-keyed via `Id.fromSeed(BK_DASH_NAMESPACE, platform, externalId, …)` per memory `feedback_id_fromseed_unified`, no `integrationId` in aggregate state. Aggregates are **upserted by pipelines** (same pattern as the existing Shopify orders/products pipelines: `packages/api/go/internal/sync/services/pipelines/shopify/orders.go` → emits internal `ExternalOrderUpdated` → `packages/api/go/internal/sync/handlers/order_updated_handler.go` builds the aggregate and enqueues to the storage drain). No Go-side event-sourced projections.

The user's literal rule (chat 2026-05-28): *"the events should only update the link table on TS side."* TS reads all provider-synced data (Campaign list, AdSpend buckets, etc.) via the SDK Client back to Go (`Client.go.<...>()` per memory `project_sdk_client_singleton`). The only TS-side use of Go→TS wire events is to maintain the polymorphic `store_integration_marketing_access` link table that records which `StoreIntegration` (the OAuth profile login on TS) has access to which BusinessAccount and AdAccount externalIds. Existing per-integration concerns on TS that stay TS-side: `CampaignProductBinding` (manual user binding), MANUAL `AdSpend` (renamed `AdSpendManual` in Spec β).

This spec is the **Phase 0 contract lock** (per CLAUDE.md "Modeling from another system": *"Author and freeze all cross-boundary enums + integration events in `packages/contracts` (TypeSpec) before implementing any BC. Once frozen, treat them as immutable."*). It is intentionally narrow: TypeSpec authoring + regen + a tiny comment-only TS cleanup. No aggregate code, no migrations, no real handler edits.

## Problem

The wire-event surface is overbuilt for the redirected model:

1. **Six wire events have zero consumers and no role under the redirected rule.** `CampaignUpdated`, `CampaignStatusChanged`, `AdSetUpdated`, `AdUpdated`, `AdSpendRecorded`, `MarketingReconciliationCompleted` were authored for TS-side projections that — per the literal rule — won't exist. Keeping them on the contract surface invites future developers to misread the model and start projecting on TS side again.
2. **No wire event for `BusinessAccount` discovery.** TS link table can't record `(integration, BM)` access pairs because no event tells the TS handler the integration just unlocked a BM. Only `MarketingAdAccountDiscovered` exists today.
3. **`marketing-ad-account-discovered.tsp` lacks `businessAccountExternalId`.** TS link table needs to denormalize the parent BM externalId on the link row so queries can group ad-accounts by BM without a cross-BC SDK roundtrip.
4. **No canonical `BusinessAccountStatus` enum.** BM lifecycle (ACTIVE / DISABLED / UNKNOWN) needs a dedicated enum rather than reusing `CampaignStatus` (which carries ACTIVE / PAUSED / ARCHIVED — wrong vocabulary for businesses).

Without contract lock + cleanup, downstream specs (Spec β = Go aggregates + Drizzle migration + TS polymorphic link table + `AdSpend` → `AdSpendManual` rename; Spec γ+ = Facebook pipelines) can't proceed in parallel — the contract surface either misrepresents the model or lacks the discovery surface the link table needs.

## Goal

Lock the marketing wire-event contract so Spec β and Spec γ+ can be brainstormed and built in parallel against a clean, accurate, minimal contract surface. The post-lock contract carries exactly the events the redirected model requires (two discoveries + the BM status enum) and nothing the redirected rule forbids.

## Decisions

1. **Delete `packages/contracts/wire/events/campaign-updated.tsp`.** No TS/Go consumer. TS reads campaigns via SDK to Go.
2. **Delete `packages/contracts/wire/events/campaign-status-changed.tsp`.** No consumer. Status changes flow through the canonical Go aggregate; TS reads via SDK.
3. **Delete `packages/contracts/wire/events/ad-set-updated.tsp`.** No consumer.
4. **Delete `packages/contracts/wire/events/ad-updated.tsp`.** No consumer.
5. **Delete `packages/contracts/wire/events/ad-spend-recorded.tsp`.** No consumer (TS `AdSpend` aggregate is MANUAL-only and uses internal `ManualAdSpendRecordedEvent`, never the wire event). The dashboard query that will surface AUTOMATIC spend reads via SDK to Go.
6. **Delete `packages/contracts/wire/events/marketing-reconciliation-completed.tsp`.** No consumer (explicitly noted as deferred in `marketing/handlers/external.ts` comments).
7. **Revise `packages/contracts/wire/events/marketing-ad-account-discovered.tsp`** — add field `businessAccountExternalId: string` (denormalized parent BM externalId for the link row). Keep all existing fields (`platform`, `adAccountExternalId`, `accountName`, `storeIntegrationExternalId`, `currency`). Doc string updated to mention the BM parent.
8. **Add `packages/contracts/wire/events/marketing-business-account-discovered.tsp`** — new discovery event mirroring `marketing-ad-account-discovered.tsp`. Fields: `platform: MarketingPlatform`, `businessAccountExternalId: string`, `accountName: string`, `storeIntegrationExternalId: string`. Doc string: *"Published by go-worker during a MarketingPlatform handshake when a BusinessAccount becomes visible to BK Dash through the given StoreIntegration. TS Marketing upserts a row in `store_integration_marketing_access` with `accessType=BUSINESS_ACCOUNT`."*
9. **Add `packages/contracts/wire/enums/business-account-status.tsp`** — new enum. Initial values: `ACTIVE`, `DISABLED`, `UNKNOWN`. Minimal future-extensible set; the Facebook spec can broaden once we know which provider BM statuses we actually surface. Doc string: *"BusinessAccount lifecycle status as BK Dash derived from the provider's native state (Meta business_status, Google MCC status, TikTok BC status)."*
9.1. **Add `packages/contracts/wire/enums/ad-account-status.tsp`** — new enum. Initial values: `ACTIVE`, `DISABLED`, `UNKNOWN` (mirror of BusinessAccountStatus). Minimal future-extensible set; the Facebook spec can broaden to cover Meta's richer surface (`PENDING_RISK_REVIEW`, `IN_GRACE_PERIOD`, `PENDING_CLOSURE`, `CLOSED`, etc.) once the normalizer needs them. Doc string: *"AdAccount lifecycle status as BK Dash derived from the provider's native state (Meta account_status int, Google AccountStatus, TikTok advertiser status)."*
9.2. **Reuse existing `CampaignStatus` enum for Campaign, AdSet, AND Ad aggregates.** Meta/Google/TikTok all use the same `ACTIVE`/`PAUSED`/`ARCHIVED` vocabulary across the campaign hierarchy; one enum, three users. No new enum files for AdSet or Ad. The existing `packages/contracts/wire/enums/campaign-status.tsp` (values `ACTIVE`, `PAUSED`, `ARCHIVED`) stays as-is.
10. **Update `packages/contracts/wire/events/index.tsp`** — remove the 6 deleted imports under the `// BK Dash Marketing events (iter 41c Group C ...)` block; add `marketing-business-account-discovered.tsp` import alongside `marketing-ad-account-discovered.tsp`. Update the section comment to reflect the redirected model (e.g., *"BK Dash Marketing discovery events (Phase 0 contract lock 2026-05-28 — only discovery events; aggregate state reads via SDK)"*).
11. **Update `packages/contracts/wire/main.tsp`** — register both `business-account-status.tsp` AND `ad-account-status.tsp` under the `// Marketing` enum import group alongside `campaign-status.tsp`.
12. **Update `packages/api/typescript/src/marketing/handlers/external.ts`** — remove the deferred-handler comment block referring to `OnMarketingReconciliationCompleted` (the event itself no longer exists; keep the `export {}` so the module stays importable). Leave the `OnStoreIntegrationDataWipeRequested` deferred comment untouched (different concern, different lifecycle).
13. **Run `bun emit-openapi` + `bun sdk`** so generated Go (`packages/contracts/generated/go/wire/events.go`) and TS (`packages/contracts/generated/typescript/src/wire/events/*`) bindings drop the deleted event types and gain the new ones. Spec β and Spec γ+ consume the regenerated bindings.
14. **`timezone` does NOT appear on any wire event.** Under the user's rule (Decision 0: events only feed link table), the link row has no timezone; AdAccount timezone is fetched by the Go pipeline as needed (cached via the AdAccount aggregate in Go DB). The TS side never sees timezone on the wire.

## User Stories

- **Story 1 — clean contract surface for Spec β authoring.** As a developer about to author Spec β (Go-side 6 aggregates + TS-side polymorphic link table), I want the wire-event contract to carry **only** the two discovery events the redirected model uses, so I design the Go event emission + TS link-table handler against a contract that matches the rule instead of one that suggests projections we explicitly don't want. *(AC-1, AC-2, AC-3, AC-4, AC-5)*
  - Given Spec α is shipped, when I `ls packages/contracts/wire/events/`, the deleted events are gone and the new `marketing-business-account-discovered.tsp` is present.
  - Given the discovery events, when I write the TS handler, I import `MarketingBusinessAccountDiscoveredEvent` and `MarketingAdAccountDiscoveredEvent` (now with `businessAccountExternalId`) and upsert link rows polymorphically.

- **Story 2 — Phase 0 pure-aggregate principle is encoded in the contract.** As a future developer reading the wire-event index, I want it to be obvious that aggregate state (Campaign / AdSet / Ad / AdSpend) is **not** mirrored on TS via wire events — so I don't accidentally re-introduce a TS projection that has to be maintained in lockstep with Go. *(AC-6)*
  - Given Spec α is shipped, when I read `packages/contracts/wire/events/index.tsp`, the comment block reflects the redirected model and no `*Updated`/`*Recorded` event for Campaign / AdSet / Ad / AdSpend is registered.

- **Story 3 — BM status has its own vocabulary.** As a developer about to model the `BusinessAccount` aggregate in Spec β, I want a dedicated `BusinessAccountStatus` enum (ACTIVE / DISABLED / UNKNOWN) rather than reusing `CampaignStatus` (which carries irrelevant `PAUSED` / `ARCHIVED` values for businesses). *(AC-7)*

## Acceptance Criteria

- [ ] AC-1: `packages/contracts/wire/events/campaign-updated.tsp`, `campaign-status-changed.tsp`, `ad-set-updated.tsp`, `ad-updated.tsp`, `ad-spend-recorded.tsp`, `marketing-reconciliation-completed.tsp` are all removed from disk.
- [ ] AC-2: `packages/contracts/wire/events/marketing-business-account-discovered.tsp` exists with fields `platform: MarketingPlatform`, `businessAccountExternalId: string`, `accountName: string`, `storeIntegrationExternalId: string`.
- [ ] AC-3: `packages/contracts/wire/events/marketing-ad-account-discovered.tsp` retains existing fields (`platform`, `adAccountExternalId`, `accountName`, `storeIntegrationExternalId`, `currency`) AND adds `businessAccountExternalId: string`.
- [ ] AC-4: `packages/contracts/wire/events/index.tsp` no longer imports any of the 6 deleted events; imports `marketing-business-account-discovered.tsp`; the section comment reflects the redirected model.
- [ ] AC-5: `bun emit-openapi` succeeds — TypeSpec compiles with no errors; emitted `openapi.json` excludes the 6 deleted event schemas and includes the new `MarketingBusinessAccountDiscoveredEvent` schema.
- [ ] AC-6: `bun sdk` succeeds; `packages/contracts/generated/go/wire/events.go` exports `MarketingBusinessAccountDiscoveredEvent` and no longer exports the 6 deleted types; `packages/contracts/generated/typescript/src/wire/events/` mirror.
- [ ] AC-7: `packages/contracts/wire/enums/business-account-status.tsp` exists with values `ACTIVE`, `DISABLED`, `UNKNOWN` AND `packages/contracts/wire/enums/ad-account-status.tsp` exists with values `ACTIVE`, `DISABLED`, `UNKNOWN`; both are imported in `packages/contracts/wire/main.tsp` under the `// Marketing` group.
- [ ] AC-8: `packages/api/typescript/src/marketing/handlers/external.ts` no longer mentions `OnMarketingReconciliationCompleted` (the comment block referencing the deleted event is removed); the `export {}` and unrelated deferred comments are preserved.
- [ ] AC-9: `bun tsc` passes across all TS workspaces — no consumer broken because no consumer existed (verified by the grep audit in Context).
- [ ] AC-10: `bun run test` passes (Go suite + TS suite) — no existing test asserts on the deleted event types.

## Forward Scope — Spec β preview (out of scope here, captured to seed the next brainstorm)

Spec β (next brainstorm) will land the consumer side of this contract:

- **Go-side `sync` BC**: 6 new aggregates (`BusinessAccount`, `AdAccount`, `Campaign`, `AdSet`, `Ad`, `AdSpend`), each with a Drizzle table, each with a repository whose `Save` does idempotent UPSERT on the deterministic `Id.fromSeed(BK_DASH_NAMESPACE, platform, externalId, …)` PK. Each aggregate is **upserted by its pipeline via an internal Go event + handler** (same pattern as `packages/api/go/internal/sync/handlers/order_updated_handler.go`). The two surviving wire events are published from the pipelines that establish access (discovery), not from every aggregate update.
- **TS-side `marketing` BC**: polymorphic `store_integration_marketing_access` table with columns `(storeIntegrationId, platform, accessType: 'BUSINESS_ACCOUNT'|'AD_ACCOUNT', externalId, name, active: bool, validFrom: date, validTo: date)` per user note 2026-05-28 — `active` is the merchant toggle, `validFrom`/`validTo` is the query-validity window, `name` is denormalized from the discovery event. Two handler branches consume `MarketingBusinessAccountDiscoveredEvent` + `MarketingAdAccountDiscoveredEvent` and upsert link rows polymorphically (initial `active=false`, validity window defaults TBD in Spec β).
- **Existing `integration.MarketingAdAccount` aggregate** gets relocated/redesigned into the polymorphic link table — `isSelected` becomes the new `active` field; `accountName`/`currency` become row columns; the standalone aggregate file is deleted.
- **TS-side `marketing.AdSpend` → `AdSpendManual` rename** (user instruction 2026-05-28). The MANUAL flow stays TS-write-side; the AUTOMATIC branch is removed (it never had a wire-event handler; the rename clarifies the remaining scope).
- **TS-side `marketing.Campaign` aggregate fate**: review during Spec β. Campaign reads will route via SDK to Go after Spec β; the existing `marketing.Campaign` entity + `CampaignRepository` + `GetCampaignsList`/`BindCampaignToProduct` flows either (a) keep the local aggregate as a denormalized cache of frequently-bound campaigns, or (b) drop the local aggregate and route all reads via SDK. Decision: Spec β.
- **TS-side dashboards reading AUTOMATIC spend**: `GetAdSpendBreakdown.ts` rewrites to call SDK (`client.go.getAdSpendBreakdown(...)` or similar). Concrete query shape decided in Spec β based on what the dashboard actually needs.
- **`MarketingReconciliationCompleted` re-evaluation**: if a future cache layer ships and reconciliation needs cross-side notification, the event can be re-added then — not now (per memory `no-speculative-cache-layer`).
- **Per-marketing-platform pipeline matrix** (user note 2026-05-28): each of Facebook / Google / TikTok will ship four pipelines — `BUSINESS_ACCOUNTS` (syncs BusinessAccount aggregates), `AD_ACCOUNTS` (syncs AdAccount aggregates), `CAMPAIGNS` (single pipeline that syncs the full Campaign + AdSet + Ad hierarchy via the provider's tree query), plus the AdSpend / MarketingMetrics variants (`MARKETING_METRICS` / `MARKETING_METRICS_CONCURRENT` / `MARKETING_METRICS_TWO_PHASE` already in the enum). Spec β will extend `packages/api/go/internal/sync/enums/sync_pipeline_name.go` to add `BUSINESS_ACCOUNTS` and `AD_ACCOUNTS`; the Campaigns pipeline name (`CAMPAIGNS`) already exists in the enum.

## Open Questions

None — all prior open questions resolved on 2026-05-28:

1. ~~`impressions`/`clicks`/`conversions` on `AdSpend`~~ — **resolved: drop entirely** (Decision 5 deletes the wire event; Spec β decides whether to drop them from the TS-side `AdSpend` aggregate too).
2. ~~`BusinessAccountStatus` enum~~ — **resolved: new dedicated enum** (Decision 9). Initial values `ACTIVE`, `DISABLED`, `UNKNOWN`.
3. ~~`timezone` representation on `AdAccountUpdated`~~ — **resolved: no `AdAccountUpdated` event exists**. Timezone lives in the Go-side `AdAccount` aggregate; the Go pipeline reads it from there. TS never sees timezone on the wire (Decision 14).
