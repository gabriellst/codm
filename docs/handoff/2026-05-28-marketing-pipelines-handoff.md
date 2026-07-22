# Marketing Pipelines Port — Handoff (2026-05-28)

## What landed this session

**Spec α — Phase 0 contract lock** (3 commits): `c0e853c97`, `33b045f9c`, `17af6d869`
- Deleted 6 over-built marketing wire events (`CampaignUpdated`, `CampaignStatusChanged`, `AdSetUpdated`, `AdUpdated`, `AdSpendRecorded`, `MarketingReconciliationCompleted`)
- Added `MarketingBusinessAccountDiscoveredEvent` (new) + `businessAccountExternalId` to `MarketingAdAccountDiscoveredEvent`
- Added `BusinessAccountStatus` + `AdAccountStatus` enums
- Regenerated Go + TS wire bindings
- Spec: `.specs/2026-05-28-marketing-canonical-aggregates-phase-0-contract-lock-design.md`
- Plan: `.plans/2026-05-28-marketing-canonical-aggregates-phase-0-contract-lock.md`

**Spec β.1 — Go-side canonical aggregates** (4 commits): `b6f799eb2`, `5cfcb544b`, `8bc321f42`, `c663f3378`
- Drizzle migration 0038 for 6 new `sync.*` tables (business_accounts, ad_accounts, campaigns, ad_sets, ads, ad_spends)
- 6 Go entities in `packages/api/go/internal/sync/entities/` mirroring the Order pattern (private fields, XInput normalizer, NewXFromProviderPayload constructor, deterministic Id.fromSeed PK, getters) + 24 tests (4 per aggregate: valid, missing-fields, idempotency, golden-id)
- 6 Go repositories in `packages/api/go/internal/sync/repositories/<x>/` (interface + pgx impl with INSERT...ON CONFLICT DO UPDATE) + 18 integration tests against a migrated DB
- 6 internal events + 6 handlers + 6 storage drains in events/handlers/storage/ + fx wiring in module.go. api-go boots cleanly with 10 (4 existing + 6 new) drain goroutines.
- Spec: `.specs/2026-05-28-marketing-canonical-aggregates-go-write-side-design.md`
- Plan: `.plans/2026-05-28-marketing-canonical-aggregates-go-write-side.md`

**Spec γ — Marketing concurrency runtime** (1 commit + setup): runtime commit at HEAD
- `packages/api/go/internal/sync/services/runtime/` — DayWorkerPool (workers consume days from a buffered channel, first-error-wins) + ProgressPublisher (atomic counter + CAS-guarded 5%-step gate + TerminalComplete idempotency) + RateLimiter port + NoopRateLimiter impl
- `pipelines.RunInput` extended with `Mediator`, `JobID`, `Platform` fields. Existing Shopify pipelines compile + test pass.
- 8 unit tests pass; full `go test ./...` green.
- Spec: `.specs/2026-05-28-marketing-concurrency-runtime-design.md`
- Plan: `.plans/2026-05-28-marketing-concurrency-runtime.md`

**Parallel work** (3 commits — from another agent session): `d35823a08`, `714429876`, `5a0ff5b3a`
- OAuth authorize URL + callback + AuthorizeIntegrationController feature completed by another session running in parallel. Resolved a pre-existing tsc blocker that my work surfaced.

## What's still TO DO

### Spec β.2 — TS link table + AdSpend rename + decommissions (4-6 pts)

The TS-side counterpart of Spec β. Decisions captured in:
- `.specs/2026-05-28-marketing-canonical-aggregates-go-write-side-ts-link-table-design.md` (combined β spec — covers both β.1 and β.2)

Concrete work remaining:
1. **TS Drizzle migration**: add `storeIntegrationMarketingAccess` polymorphic table to `packages/contracts/db/schema/marketing.ts` with columns `(id, storeIntegrationId, accessType, platform, externalId, name, parentExternalId, active, validFrom, validTo, timestamps)` + composite unique on `(storeIntegrationId, accessType, platform, externalId)`.
2. **TS entity + repo**: `marketing.StoreIntegrationMarketingAccess` aggregate in `packages/api/typescript/src/marketing/entities/` with `activate()` / `deactivate()` / `setValidityWindow()` methods + Drizzle repo + Mock.
3. **2 TS handlers** in `packages/api/typescript/src/marketing/handlers/external.ts`: `OnMarketingBusinessAccountDiscovered` + `OnMarketingAdAccountDiscovered` (polymorphic upsert into the link table).
4. **AdSpend → AdSpendManual rename** across `packages/api/typescript/src/marketing/`: rename `entities/AdSpend.ts` → `AdSpendManual.ts`; rename class; remove `adSpendType` discriminator; update repos/use-cases/events/tests. Delete `packages/contracts/wire/enums/ad-spend-type.tsp`. Regen SDK.
5. **Decommission `marketing.Campaign`** + `CampaignRepository/` + `GetCampaignsList` use case + controller. `BindCampaignToProduct` / `UnbindCampaignFromProduct` stay (they only need `campaignExternalId` strings).
6. **Drop `integration.MarketingAdAccount`** aggregate + test + IntegrationActivatedHandler / TriggerReintegration references.

### Spec γ.1 — Facebook pipelines (13-21 pts)

4 pipelines: BUSINESS_ACCOUNTS, AD_ACCOUNTS, CAMPAIGNS (does Campaign+AdSet+Ad via tree query), MARKETING_METRICS (3 variants: basic / concurrent / two-phase).

Reference: `/Users/gabrielaraujo/Desktop/Projetos/bk-company/go-worker-monorepo/api/internal/sync/services/facebook/` ships the full per-platform stack (client.go, hour_chunks.go, rate_limit_headers.go, rate_limiter.go, sync_orchestrator.go, two_phase_sync.go, marketing_metric_normalizer.go, marketing_metric_receiver.go, campaign_client.go, campaign_normalizer.go, campaign_receiver.go).

Target structure (this repo):
- `packages/api/go/internal/sync/services/facebook/` — HTTP client + paging + auth-token use; per-API normalizers + receivers; header-adaptive AccountRateLimiter (Spec γ-deferred); 2-phase sync orchestrator.
- `packages/api/go/internal/sync/services/pipelines/facebook/` — 4 pipeline files implementing `pipelines.Pipeline`. Each pipeline:
  - Composes `runtime.NewDayWorkerPool(...)`, `runtime.NewProgressPublisher(...)`, and either `runtime.NoopRateLimiter` or the new `facebook.NewAccountRateLimiter(...)`.
  - Calls the per-API receiver/normalizer.
  - For BUSINESS_ACCOUNTS / AD_ACCOUNTS pipelines: AFTER persisting the canonical aggregate, ALSO publishes the discovery wire event via external mediator (so the TS link table from β.2 upserts).
  - For CAMPAIGNS / MARKETING_METRICS pipelines: emit internal `External*Updated` events; the existing handlers (from β.1) persist via the storage drains.

### Spec γ.2 — Google Ads pipelines (8-13 pts)

Same shape as Facebook minus the rate limiter (Google's SDK handles it; use `runtime.NoopRateLimiter`). Reference: `go-worker-monorepo/api/internal/sync/services/google/` (no rate_limit_headers.go / rate_limiter.go; has timezone.go).

### Spec γ.3 — TikTok pipelines (8-13 pts)

Same shape as Facebook minus header-adaptive rate limiter. Reference: `go-worker-monorepo/api/internal/sync/services/tiktok/`.

## Notes for the next session

1. **The contract is locked.** Don't re-litigate which wire events exist. Spec α decided; the generated bindings reflect it.
2. **Spec β.1 (Go aggregates) is the persistence layer.** Don't re-implement entities/repos/handlers — just consume them from the pipelines via the existing `events.ExternalXUpdated` constructors.
3. **Spec γ runtime is ready.** `runtime.NewDayWorkerPool`, `runtime.NewProgressPublisher`, `runtime.RateLimiter` + `runtime.NoopRateLimiter` are all there. Facebook pipelines compose them.
4. **Pipeline-matrix memory**: each platform ships 4 pipelines, NOT 6 (per `project_marketing_pipeline_matrix.md`). The CAMPAIGNS pipeline does Campaign + AdSet + Ad via the provider's tree query (one call returns the hierarchy).
5. **TS link table can be developed in parallel with Facebook pipelines.** Spec β.2 has no Go-side dependency beyond Spec α's wire events (already locked). Two workstreams.
6. **AdSpend grain is per-(adAccount, campaign, bucketStart, groupBy)** — campaign-level, not ad-level. No impressions/clicks on the wire event or the Go entity (per user's MongoDB sample). If the Facebook normalizer's Insights call is at `level=ad`, aggregate to campaign-level before constructing AdSpendInput.
7. **Discovery events from pipelines**: when authoring the Facebook BUSINESS_ACCOUNTS / AD_ACCOUNTS pipelines, ALSO publish the wire discovery event via the external mediator after upserting the canonical aggregate. This is how the TS link table gets populated (Spec β.2 handlers consume).

## Suggested resume order

1. **Spec β.2 first** (small, unblocks UI on the TS side) — 1-2 hours of focused agentic work.
2. **Spec γ.1 Facebook** (biggest, proves the runtime + aggregate model with a real provider) — split into sub-tasks: client + auth, normalizers, then 4 pipeline files + fx wiring.
3. **Spec γ.2/γ.3 Google + TikTok** (clones of Facebook with different clients) — pattern is settled after Facebook lands.

## Commits this session (in order)

```
c0e853c97 feat(contracts): reshape marketing wire-event surface (Task T1)
33b045f9c feat(contracts): add BusinessAccountStatus + AdAccountStatus enums (Task T2)
17af6d869 chore(sdk): regenerate openapi+sdk for marketing contract lock (Task T3)
419948219 docs(spec): Spec β — marketing canonical aggregates (Go write-side + TS link table)
a022555de docs: Spec β.1 + plan — Go-side marketing aggregates
b6f799eb2 feat(sync): add 6 marketing aggregate tables (Task T1 of Spec β.1)
5cfcb544b feat(sync): add 6 marketing aggregate entities (Task T2 of Spec β.1)
8bc321f42 feat(sync): add 6 marketing aggregate repositories (Task T3 of Spec β.1)
c663f3378 feat(sync): wire 6 marketing aggregates end-to-end (Task T4 of Spec β.1)
<docs commit for Spec γ>
<runtime commit for Spec γ T1>
<handoff doc commit>
```

Plus parallel-agent commits: `d35823a08`, `714429876`, `5a0ff5b3a` (OAuth authorize + callback feature; resolved a pre-existing tsc blocker that my Spec α work surfaced).

## State at handoff

- All committed work compiles (`bun tsc`) and tests pass (`bun run test` — 1112+ pass).
- `bun migrate:dev` is current (migration 0038 applied).
- Working tree clean.
- 56+ commits ahead of `origin/feat/bk-dash-polyglot`.
