# P7-MARKETING — BK Dash Marketing BC — Implementation Plan (Polyglot Layout)

> **For agentic workers:** Execute via `/build`. This sub-plan is the iter 43
> re-emit against the polyglot layout (`feat/bk-dash-polyglot`). The TS BC
> home is `packages/api/typescript/src/marketing/`, framework primitives come
> from `@template/core-typescript`, wire enums + integration events from
> `@template/contracts-typescript/wire`, Drizzle schema from
> `@template/contracts/db`. The Go side already owns `campaigns / ad_sets /
> ads` canonical UPSERTs and AUTOMATIC `ad_spends` rows under
> `packages/api/go/internal/sync/`. PG-GO-WORKER also exposes
> `POST /marketing/reconcile/<platform>`. This sub-plan ports BC6 Marketing
> end-to-end into TS only: write-side `RecordManualAdSpend` + update + delete
> on `ad_spends` (MANUAL rows), write-side `CampaignProductBinding` aggregate,
> read-side projectors that mirror Go's canonical writes for cache + per-Store
> denormalization, 9 controllers (3 manual-AdSpend + 2 binding + 1 reconcile +
> 3 queries), and external handlers for `StoreIntegrationDataWipeRequested`
> cascade + `MarketingReconciliationCompletedEvent` chaining.

**Goal:** Land BC6 Marketing per spec §4 BC6 and §7.6 — `Campaign` / `AdSet` /
`Ad` canonical projections kept fresh from Go-published events
(`integration.shared.campaign.updated`, `campaign.status_changed`,
`ad_set.updated`, `ad.updated`); unified `AdSpend` aggregate split by
ownership (`type = "AUTOMATIC"` projected from `integration.shared.ad_spend.recorded`,
`type = "MANUAL"` written by TS through `RecordManualAdSpend` carrying
`ManualMarketingExpenseBinding` payload); `CampaignProductBinding` merchant
aggregate (TS-owned); C33–C38 commands; T20–T22 reads. Author three TS-side
integration events for Analytics consumption: `marketing.ad_spend.recorded`
(MANUAL variant), `marketing.campaign_product_binding.created`,
`marketing.campaign_product_binding.removed`.

**Architecture:** Four read-side projections fed by Go-published events
(`CampaignProjection`, `AdSetProjection`, `AdProjection`,
`AdSpendProjection` — AUTOMATIC only). Two TS write-side aggregates
(`AdSpend` MANUAL with `RecordManualAdSpend` / `UpdateManualAdSpend` /
`DeleteManualAdSpend` use cases, and `CampaignProductBinding` with
`BindCampaignToProduct` / `UnbindCampaignFromProduct`). One service +
`ReconcileMarketingAccounts` use case that triggers
`POST {GO_WORKER_URL}/marketing/reconcile/<platform>` via a thin
`GoWorkerMarketingClient`, debounced 300s/integration through a Redis
`SETNX` lock. Two external handlers: cascade-clean canonical rows on
`StoreIntegrationDataWipeRequested` (preserves MANUAL `ad_spends`); no-op
hook for `MarketingReconciliationCompletedEvent` so Analytics later observes
the chain. One internal handler re-publishes MANUAL `AdSpendRecorded` as the
new TS-authored integration event for Analytics ROAS recompute.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod, Redis
(`SETNX` for C38 debounce), HTTP fetch (TS → Go worker). Tests on
`bun:test` with PGlite via `@template/core-typescript` `PGliteDriver` (driven
by `BoundedContext.create` per-env registry).

**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md` §4 BC6 (Marketing),
§7.6 (Marketing TS API), §7.13 (Published Language + outbound HTTP block),
§7.14 (`MarketingErrors`).
**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan P7-MARKETING).
**Polyglot rebase addendum:** master plan §"Polyglot rebase addendum (iteration 39)".

**Depends on sub-plans:**
- **Iter 41 (contracts/wire)** — already shipped. The following are pre-authored
  and importable:
  - Enums: `MarketingPlatform`, `CampaignStatus`, `AdSpendType`, `AdSpendGroupBy`
    (`packages/contracts/wire/enums/*`, emitted under
    `packages/contracts/generated/typescript/src/wire/enums/`).
  - Go-published integration events:
    `CampaignUpdatedEvent`, `CampaignStatusChangedEvent`, `AdSetUpdatedEvent`,
    `AdUpdatedEvent`, `AdSpendRecordedEvent`,
    `MarketingReconciliationCompletedEvent`
    (`packages/contracts/wire/events/*`, emitted under
    `packages/contracts/generated/typescript/src/wire/events/`).
- **Iter 42 (contracts/db/schema)** — already shipped. The five marketing
  tables (`campaigns`, `ad_sets`, `ads`, `ad_spends`, `campaign_product_bindings`)
  exist in `packages/contracts/db/schema/marketing.ts`; the SQL migration is in
  `packages/contracts/db/migrations/`. **No table additions are needed.**
- **P2-TENANCY** — `stores` table for FK target (no FK in schema; soft refs);
  `requireRole(['OWNER','ADMIN','MEMBER'])` middleware factory; `givenStore` /
  `givenStoreMembership` helpers in `packages/api/typescript/tests/support/given/`.
- **P3-BILLING (soft dep)** — not required at code level for P7.
- **P4-INTEGRATION** — `StoreIntegration` aggregate + repository
  (`storeIntegrationRepository.findById`,
  `findByStoreIdAndType(storeId, 'MARKETING_PLATFORM', { active: true })`);
  `IntegrationCredentialSecret` reader so C38 can pass plaintext credentials to
  Go; `StoreIntegrationDataWipeRequestedEvent` published as an integration event
  in `packages/contracts/wire/events/` (P4 ships the .tsp during its sub-plan).
- **P5-CATALOG** — `ProductRepository.findById`, `VariantRepository.findById`
  for binding validation (`PRODUCT_NOT_FOUND` / `VARIANT_NOT_FOUND`); cross-
  context join from `campaign_product_bindings` to `catalog.products` for T22
  product titles.
- **PG-GO-WORKER** — `packages/api/go/internal/sync/` BC publishes the five
  marketing topics and exposes `POST /marketing/reconcile/<platform>` (per Task 2
  contract lock). PG-GO-WORKER reads `packages/contracts/db/schema/marketing.ts`
  for canonical UPSERTs.

**Tasks:** 28
**Estimated minutes:** ~480

---

## Convention reference (absorbed during planning, NOT to be re-read by /build)

- **Folder root:** `packages/api/typescript/src/marketing/`. Sibling references
  for shape: `packages/api/typescript/src/auth/` (full TS BC — entities,
  repositories with abstract base + Drizzle + Mock + `index.ts` re-export,
  controllers using `Controller<typeof Input, typeof Output>` from
  `@template/core-typescript`, `handlers/internal.ts` + `handlers/external.ts`,
  `errors/index.ts` with `registerErrorCodes({...})` side-effect, `events/`
  per-class file + `index.ts`, `registry.ts` with `INSTANCE_REGISTRY`,
  `index.ts` calling `BoundedContext.create(...)`, `repositories/<X>Repository/`
  with `<X>Repository.ts` abstract + `Drizzle<X>Repository.ts` + `Mock<X>Repository.ts`
  + `index.ts`). Secondary reference: `packages/api/typescript/src/notifications/`
  (external-handler-heavy BC).
- **Framework imports:** `@template/core-typescript` (everything: `Handler`,
  `Controller`, `Projector`, `EventHandler`, `Repository`, `BaseDomainEvent`,
  `BaseIntegrationEvent`, `BoundedContext`, `BaseError`, `HttpStatusCode`,
  `z` (Zod re-export with `.domainEvent` / `.integrationEvent` helpers),
  error code base unions, `registerErrorCodes`, `Config`, `Transaction`).
- **Contracts imports:**
  - Enums: `@template/contracts-typescript/wire/enums` (`MarketingPlatform`,
    `MarketingPlatformSchema`, `CampaignStatus`, `CampaignStatusSchema`,
    `AdSpendType`, `AdSpendTypeSchema`, `AdSpendGroupBy`,
    `AdSpendGroupBySchema`, `CurrencyCode`, `CurrencyCodeSchema`).
  - Integration events: `@template/contracts-typescript/wire` (or the per-event
    sub-path emitted by `emit-wire-ts.ts` — verify export shape at Task 4 via
    `packages/contracts/generated/typescript/src/wire/index.ts`).
  - Drizzle schema: `import { marketingSchema, campaigns, adSets, ads, adSpends, campaignProductBindings } from '@template/contracts/db'`
    (or the namespaced path the polyglot pipeline exposes — confirm at Task 3).
- **Projection citizen** (`.claude/skills/projection/typescript/SKILL.md`):
  free record class, no base, schema-driven flat shape via `z.object({...})`,
  `<Name>ProjectionEvent` union exported from the same file, `static create(event)`
  overloaded per creating event, `applyEvent(event)` overloaded per mutating
  event. Lives at `marketing/projections/<Name>Projection.ts`.
- **Projector citizen** (`.claude/skills/projector/typescript/SKILL.md`):
  `extends Projector<E>` (from `@template/core-typescript`), plain
  `switch (event.name)` with `default: const _: never = event`, single
  `<Name>ProjectionRepository` dependency, canonical
  `find → applyEvent → save` flow. Lives at
  `marketing/projections/projectors/<Name>Projector.ts`. Registered with
  `BoundedContext.create({ projectors: { CampaignProjector, ... } })` — the
  framework's `registerProjectors` walks `projector.events[]` and registers
  each name on `InternalMediator`. Integration events from Redis Streams arrive
  on `ExternalMediator` and are re-broadcast to `InternalMediator` per the
  polyglot Mediator pattern — verify at Task 4.
- **Repository shape** (`packages/api/typescript/src/auth/repositories/UserRepository/`):
  abstract base `extends Repository<Entity>` from `@template/core-typescript`;
  Drizzle impl + Mock impl as siblings; `index.ts` re-exports all three.
  `INSTANCE_REGISTRY` binds tokens per env (`mock` / `integration` / `real`).
- **Integration-event shape** is already authored in `packages/contracts/wire/events/`
  — TS-side classes are emitted to
  `packages/contracts/generated/typescript/src/wire/events/<name>.ts` via
  `bun run codegen:wire`. **This sub-plan adds three new .tsp files** for the
  TS-published events Analytics consumes (Task 4); the emitter regenerates the
  TS classes automatically.
- **Domain-event shape** (`packages/api/typescript/src/auth/events/UserRegisteredEvent.ts`):
  `BaseDomainEvent<typeof Schema>` + `static override readonly name = '<context>.<noun>' as const`
  + `static readonly schema = z.domainEvent({...})`. Domain events are
  authored locally in the BC (NOT in contracts/wire — contracts hold only
  cross-language integration events).
- **Error glossary shape** (`packages/api/typescript/src/auth/errors/index.ts`):
  typed unions per layer + side-effect `registerErrorCodes({...})` mapping each
  code → HTTP status.
- **Controller shape** (`packages/api/typescript/src/auth/controllers/GetSession.ts`):
  `@injectable()` class `extends Controller<typeof Input, typeof Output>`,
  declares `path`, `method`, `description`, `inputSchema`, `outputSchema`;
  schemas use `.example([...])` for OpenAPI; `handle(request)` returns
  `{ status: HttpStatusCode.X, data }` or `{ status, data, cookie }`.
- **Use-case shape** (`packages/api/typescript/src/auth/usecases/RegisterUser.ts`):
  `@injectable() class extends Handler<typeof InputSchema, typeof OutputSchema>`;
  `readonly name = '<snake>' as const`, `inputSchema`, `outputSchema`;
  body wraps `this.withTransaction(tx, async tx => ...)`; events persist via
  `this.domainEventRepository.save(event, tx)` (lazy getter from base).
- **Test placement** (`packages/api/typescript/tests/support/` for shared
  helpers; colocated `<Name>.test.ts` next to source): `bun:test` runner;
  entity / value-object tests via plain instantiation; repository / use-case /
  handler / projector tests use the TestBed pattern (created in P1; verify
  module path at Task 4 — likely
  `packages/api/typescript/tests/support/TestBed.ts`).
- **CLI scaffolders are medscall-only** in this repo. Polyglot does not ship
  `bun cli`. All new files in this sub-plan are written by hand from the
  sibling templates above.
- **No `# QUESTION:` lines in this rewrite** unless a dependency truly hasn't
  shipped — answer each open question by reading the polyglot file before
  writing the task. The only legitimate `# QUESTION:` left is on P9-FINANCE's
  `FxRateRepository.findEffectiveOn` (Task 22 / Task 23) since P9 is not yet
  on `feat/bk-dash-polyglot`.

---

## Cross-cutting design decisions (locked before Task 1)

1. **One `ad_spends` table, two writers, one discriminator.** Per
   `packages/contracts/db/schema/marketing.ts`, `ad_spends` is dual-owned —
   AUTOMATIC rows are Go-written via `internal/sync/<platform>/` pipelines and
   carry `(ad_id, bucket_start, group_by)`; MANUAL rows are TS-written by C33
   and carry `(occurred_at, manual_binding jsonb)` with `ad_id NULL`. The
   `type` column (`AdSpendType`) splits them at read time. AUTOMATIC PK is
   `UUIDv5(BK_DASH_NAMESPACE, platform + adAccountExternalId + adExternalId + bucketStart + groupBy)`
   computed by Go; MANUAL PK is `defaultRandom()` (the Drizzle column default
   is `uuid().defaultRandom()`, so TS-side `RecordManualAdSpend` does NOT
   compute the id — it lets the DB assign).
2. **`AdSpend` is an AggregateRoot only for the MANUAL branch.** AUTOMATIC
   rows are a pure projection — no entity class, no `findById` returns them
   for mutation. The repository exposes:
   - `findManualById(id, tx) → AdSpend | undefined` — returns only rows where
     `type = 'MANUAL'`; `undefined` for AUTOMATIC ids and missing ids.
   - `loadGuard(id, tx) → { found: boolean; type: 'AUTOMATIC' | 'MANUAL' | null }`
     — single roundtrip used by C34/C35 to throw `AD_SPEND_NOT_FOUND` vs
     `CANNOT_MUTATE_AUTOMATIC_AD_SPEND`.
   - `save(entity, tx)` — uses optimistic-lock via `version` column.
   - `deleteManual(id, tx)` — hard `DELETE WHERE id = $1 AND type = 'MANUAL'`;
     spec §7.6 C35 Output is `void` and lists no "soft-delete" requirement.
3. **Entity invariants on `AdSpend` (MANUAL branch only):**
   - `static record({ storeId, name, description?, currency, startDate, endDate, spend, bindings?, platform? })`
     constructs a fresh row with `type: 'MANUAL'`, `adId: null`,
     `adAccountExternalId: null`, `campaignExternalId: null`, `groupBy: 'DAILY'`,
     `bucketStart: null`, `occurredAt: startDate`. Validates `endDate >= startDate`
     else `INVALID_DATE_RANGE`. `bindings` carries the spec's
     `ManualMarketingExpenseBinding[]` shape:
     `{ productId?: string; variantId?: string }[]` (exactly one of each per
     element — enforced at the use-case boundary via a Zod refinement; the
     entity stores the array as-is).
   - `update({ name?, description?, startDate?, endDate?, spend?, bindings? })`
     — re-validates date range; defensive `if (this.type !== 'MANUAL') throw CANNOT_MUTATE_AUTOMATIC_AD_SPEND`.
   - `disable()` — not used (C35 hard-deletes); omit the method.
   - `version` increments via `Repository.save` optimistic lock — entity
     does not bump it manually.
4. **AUTOMATIC `AdSpend` is idempotent by the database unique index**
   `ad_spends_automatic_bucket_unq` on
   `(store_id, ad_account_external_id, ad_external_id, bucket_start, group_by)`.
   `AdSpendProjector.insertIfNew` translates to
   `INSERT ... ON CONFLICT ON CONSTRAINT ad_spends_automatic_bucket_unq DO UPDATE SET amount_cents = EXCLUDED.amount_cents, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks, updated_at = NOW(), version = version + 1`
   — re-deliveries refresh the latest values rather than creating duplicates.
5. **MonetaryByCurrency at query time.** T21 (`AdSpendBreakdown`) aggregates
   `amount_cents` grouped by `currency` into a
   `Partial<Record<CurrencyCode, number>>` per bucket. Conversion to the
   Store's `reportingCurrency` happens via P9-FINANCE's
   `FxRateRepository.findEffectiveOn(date, from, to)`. P9 is not yet on
   `feat/bk-dash-polyglot` — Task 23 ships a stub `FxRateLookupService`
   under `marketing/services/FxRateLookupService.ts` that returns `1.0`
   and is replaced with a re-export from `@finance` when P9 lands. (Single
   `# QUESTION:` retained on this line in Task 23.)
6. **C38 dual trigger.** Spec §7.6 C38 + §7.13 (B): trigger A is the Go
   cron (autonomous); trigger B is a dashboard query that fires TS's
   `ReconcileMarketingAccounts`. TS:
   - Looks up the integration (or all active MARKETING_PLATFORM integrations
     for the Store) via P4's `StoreIntegrationRepository`.
   - Reads plaintext credentials via P4's `IntegrationCredentialSecret`
     reader.
   - For each integration: `await debouncer.tryAcquire(integrationId)` — on
     true (newly acquired), fires `POST {GO_WORKER_URL}/marketing/reconcile/<platform>`
     with `{ credentials, adAccountId: integration.externalId, dateRange: { startDate, endDate } }`,
     increments `triggered`. On false (lock held), skips.
   - Returns `{ triggered }` with HTTP 202.
   - The actual `MarketingReconciliationCompletedEvent` is published by Go on
     completion; TS consumes it via the no-op handler in Task 25 (only the
     subscription wiring; no projection write).
7. **`StoreIntegrationDataWipeRequested` cascade.** Per spec §4 BC6: cascade
   `campaigns`, `ad_sets`, `ads`, and `ad_spends WHERE type = 'AUTOMATIC'`
   for the wiped `storeIntegrationId`. MANUAL `ad_spends` and
   `campaign_product_bindings` are preserved. All four canonical tables in
   `packages/contracts/db/schema/marketing.ts` carry `store_integration_id`
   (uuid) — the cascade query is a straight
   `DELETE FROM <table> WHERE store_integration_id = $1` (and for
   `ad_spends`, additionally `AND type = 'AUTOMATIC'`).
8. **`CampaignProductBinding` cardinality.** Per the existing schema
   (`campaign_product_bindings` table), each row carries `campaign_id` plus
   exactly one of `product_id` / `variant_id` (the other is `NULL`). The
   spec §4 BC6 line `productIds: string[], variantIds: string[]` is the
   **API shape**; the schema decomposes it to one row per bind. C36 inserts
   `productIds.length + variantIds.length` rows in a single
   `UnitOfWork`; C37 deletes one row by `bindingId`. The
   `campaign_product_bindings_unq` unique index on
   `(campaign_id, product_id, variant_id)` enforces dedup; on conflict, the
   use case throws `BINDING_ALREADY_EXISTS`.
9. **TS-published integration events.** Three new `.tsp` files land in
   `packages/contracts/wire/events/` (authored at Task 4):
   - `ad-spend-recorded-manual.tsp` →
     `integration.marketing.ad_spend.recorded_manual` — Analytics consumes for
     MANUAL ROAS.
   - `campaign-product-binding-created.tsp` →
     `integration.marketing.campaign_product_binding.created`.
   - `campaign-product-binding-removed.tsp` →
     `integration.marketing.campaign_product_binding.removed`.
   The `marketing.*` topic namespace (rather than `shared.*`) signals these
   are TS-published, not Go-published. After authoring the .tsp, run
   `bun run codegen:wire` to emit TS/Go/Rust classes; the TS class is
   importable from `@template/contracts-typescript/wire`.
10. **No SDK regen inside per-task commits** — the trailing `bun sdk` +
    `bun emit-openapi` happens in Task 28 (Final Validation) once every
    controller is registered.

---

## File Structure

```
packages/api/typescript/src/marketing/
├── index.ts                                          # BoundedContext.create({ name: 'marketing', ... }) — see auth/index.ts
├── registry.ts                                       # INSTANCE_REGISTRY: mock / integration / real
├── enums/
│   └── index.ts                                      # re-exports MarketingPlatform, CampaignStatus, AdSpendType, AdSpendGroupBy from @template/contracts-typescript/wire/enums
├── errors/
│   └── index.ts                                      # MarketingDomainErrors | MarketingApplicationErrors | MarketingInfrastructureErrors + registerErrorCodes
├── entities/
│   ├── AdSpend.ts                                    # MANUAL-only AggregateRoot (record/update; type guard)
│   ├── AdSpend.test.ts
│   ├── CampaignProductBinding.ts                     # one-row-per-bind AggregateRoot
│   ├── CampaignProductBinding.test.ts
│   └── index.ts
├── events/                                           # LOCAL domain events (NOT cross-language wire events)
│   ├── AdSpendRecordedEvent.ts                       # 'marketing.ad_spend.recorded' — payload carries adSpendType: 'MANUAL'
│   ├── AdSpendUpdatedEvent.ts                        # 'marketing.ad_spend.updated'
│   ├── AdSpendDeletedEvent.ts                        # 'marketing.ad_spend.deleted'
│   ├── CampaignProductBindingCreatedEvent.ts         # 'marketing.campaign_product_binding.created'
│   ├── CampaignProductBindingRemovedEvent.ts         # 'marketing.campaign_product_binding.removed'
│   └── index.ts
├── repositories/
│   ├── AdSpendRepository/
│   │   ├── AdSpendRepository.ts                      # abstract — findManualById, loadGuard, save, deleteManual
│   │   ├── DrizzleAdSpendRepository.ts
│   │   ├── MockAdSpendRepository.ts
│   │   ├── DrizzleAdSpendRepository.test.ts
│   │   └── index.ts
│   ├── CampaignProductBindingRepository/
│   │   ├── CampaignProductBindingRepository.ts       # findById, findExistingBind, findByStoreId, saveMany, delete
│   │   ├── DrizzleCampaignProductBindingRepository.ts
│   │   ├── MockCampaignProductBindingRepository.ts
│   │   ├── DrizzleCampaignProductBindingRepository.test.ts
│   │   └── index.ts
│   └── index.ts
├── projections/
│   ├── CampaignProjection.ts                         # free record + CampaignProjectionEvent union
│   ├── CampaignProjection.test.ts
│   ├── AdSetProjection.ts
│   ├── AdSetProjection.test.ts
│   ├── AdProjection.ts
│   ├── AdProjection.test.ts
│   ├── AdSpendProjection.ts                          # carries AUTOMATIC rows only
│   ├── AdSpendProjection.test.ts
│   ├── projectors/
│   │   ├── CampaignProjector.ts                      # listens campaign.updated + campaign.status_changed
│   │   ├── CampaignProjector.test.ts
│   │   ├── AdSetProjector.ts                         # listens ad_set.updated
│   │   ├── AdSetProjector.test.ts
│   │   ├── AdProjector.ts                            # listens ad.updated
│   │   ├── AdProjector.test.ts
│   │   ├── AdSpendProjector.ts                       # listens ad_spend.recorded; gates on payload-derived type
│   │   ├── AdSpendProjector.test.ts
│   │   └── index.ts
│   └── repositories/
│       ├── CampaignProjectionRepository/
│       │   ├── CampaignProjectionRepository.ts       # findByPlatformExternalId, save, insertIfNew, deleteByStoreIntegrationId
│       │   ├── DrizzleCampaignProjectionRepository.ts
│       │   └── index.ts
│       ├── AdSetProjectionRepository/                # …same shape
│       ├── AdProjectionRepository/                   # …same shape
│       ├── AdSpendProjectionRepository/              # …same shape; deleteByStoreIntegrationId filters type='AUTOMATIC' only
│       └── index.ts
├── services/
│   ├── GoWorkerMarketingClient.ts                    # POST {GO_WORKER_URL}/marketing/reconcile/<platform>
│   ├── GoWorkerMarketingClient.test.ts
│   ├── ReconcileDebouncer.ts                         # Redis SETNX with 300s TTL per integration
│   ├── ReconcileDebouncer.test.ts
│   └── FxRateLookupService.ts                        # stub returning 1.0 until P9-FINANCE lands; isolated for one-line swap
├── handlers/
│   ├── internal.ts                                   # exports: AdSpendRecordedManualHandler, CampaignProductBindingCreatedHandler, CampaignProductBindingRemovedHandler
│   ├── external.ts                                   # exports: 4 projectors + StoreIntegrationDataWipeHandler + MarketingReconciliationCompletedHandler
│   ├── AdSpendRecordedManualHandler.ts               # republishes AdSpendRecordedManualEvent (TS integration) for Analytics
│   ├── CampaignProductBindingCreatedHandler.ts       # republishes integration event for Analytics
│   ├── CampaignProductBindingRemovedHandler.ts       # republishes integration event for Analytics
│   ├── StoreIntegrationDataWipeHandler.ts            # cascade-clean canonical rows; preserves MANUAL ad_spends
│   └── MarketingReconciliationCompletedHandler.ts    # no-op (subscription wiring only)
├── middlewares/
│   └── index.ts                                      # re-uses requireRole(['OWNER','ADMIN','MEMBER']) from @tenancy/middlewares
├── controllers/
│   ├── RecordManualAdSpend.ts                        # C33 — POST /v1/stores/:storeId/marketing/manual-ad-spend
│   ├── UpdateManualAdSpend.ts                        # C34 — PATCH /v1/stores/:storeId/marketing/manual-ad-spend/:adSpendId
│   ├── DeleteManualAdSpend.ts                        # C35 — DELETE /v1/stores/:storeId/marketing/manual-ad-spend/:adSpendId
│   ├── BindCampaignToProduct.ts                      # C36 — POST /v1/stores/:storeId/marketing/campaign-bindings
│   ├── UnbindCampaignFromProduct.ts                  # C37 — DELETE /v1/stores/:storeId/marketing/campaign-bindings/:bindingId
│   ├── ReconcileMarketingAccounts.ts                 # C38 — POST /v1/stores/:storeId/marketing/reconcile
│   ├── ListMarketingCampaigns.ts                     # T20 — GET /v1/stores/:storeId/marketing/campaigns
│   ├── ListAdSpendBreakdown.ts                       # T21 — GET /v1/stores/:storeId/marketing/ad-spend
│   ├── ListCampaignProductBindings.ts                # T22 — GET /v1/stores/:storeId/marketing/campaign-bindings
│   └── index.ts                                      # barrel for BoundedContext.create
└── usecases/
    ├── RecordManualAdSpend.ts                        # C33 — validates bindings against Catalog; persists AdSpend(MANUAL); raises AdSpendRecordedEvent
    ├── RecordManualAdSpend.test.ts
    ├── UpdateManualAdSpend.ts                        # C34 — loadGuard → findManualById → update → AdSpendUpdatedEvent
    ├── UpdateManualAdSpend.test.ts
    ├── DeleteManualAdSpend.ts                        # C35 — loadGuard → deleteManual → AdSpendDeletedEvent
    ├── DeleteManualAdSpend.test.ts
    ├── BindCampaignToProduct.ts                      # C36 — validate campaign + products + variants; saveMany; raise CampaignProductBindingCreatedEvent (one per row)
    ├── BindCampaignToProduct.test.ts
    ├── UnbindCampaignFromProduct.ts                  # C37 — findById → delete → CampaignProductBindingRemovedEvent
    ├── UnbindCampaignFromProduct.test.ts
    ├── ReconcileMarketingAccounts.ts                 # C38 — orchestrates Redis lock + GoWorker HTTP call
    ├── ReconcileMarketingAccounts.test.ts
    ├── ListMarketingCampaigns.ts                     # T20 — Drizzle direct (joins campaigns × ad_spends sum × campaign_product_bindings count); BFF-style
    ├── ListMarketingCampaigns.test.ts
    ├── ListAdSpendBreakdown.ts                       # T21 — Drizzle direct (per-bucket MonetaryByCurrency); FX-convert via FxRateLookupService
    ├── ListAdSpendBreakdown.test.ts
    ├── ListCampaignProductBindings.ts                # T22 — Drizzle direct (joins campaigns × catalog.products); BFF-style
    ├── ListCampaignProductBindings.test.ts
    └── index.ts

packages/contracts/wire/events/
├── ad-spend-recorded-manual.tsp                      # NEW — Task 4
├── campaign-product-binding-created.tsp              # NEW — Task 4
└── campaign-product-binding-removed.tsp              # NEW — Task 4

packages/api/typescript/tests/support/given/
├── givenCampaignProjection.ts                        # inserts a CampaignProjection row directly via the projection repo
├── givenAdSpend.ts                                   # MANUAL by default; AUTOMATIC opt-in via overrides
└── givenCampaignProductBinding.ts

packages/api/typescript/src/shared/registry.ts        # MODIFIED — append marketingRegistry to ALL_REGISTRIES
packages/api/typescript/src/index.ts                  # MODIFIED — import + spread MarketingRouter into routers[]
.specs/contracts/2026-05-21-marketing-reconcile.md # NEW — Task 2 contract doc
```

**Total files created:** ~55 (incl. tests + 3 .tsp + 1 contract doc).
**Files modified:** 2 (`packages/api/typescript/src/index.ts`,
`packages/api/typescript/src/shared/registry.ts`).

---

## Task ordering & phases (per task-breakdown overlay)

This sub-plan crosses 1 bounded context + introduces 4 projections + 9
controllers + 3 new wire events (≥10 artifacts) → `/task-breakdown` overlay
applies.

- **Phase 0 (Contract Lock)** — Tasks 1–4. Drizzle schema is already in
  contracts so Task 1 only re-verifies; Task 2 locks the Go HTTP contract;
  Task 3 verifies generated TS imports for wire enums + Go-published events;
  Task 4 authors the 3 new TS-published wire events. Everything else imports
  from this layer.
- **Phase 1 (Behavior Slices)** — Tasks 5–23. Sequence within Phase 1 is
  `errors → projections → projectors → write-side entities → domain events →
  use cases → controllers → service layer → ui queries`. AdSpend slice and
  CampaignProductBinding slice are independent and parallelizable.
- **Phase 2 (Integration/QA)** — Tasks 24–28. Handlers wiring → BoundedContext
  registration → given helpers → Final Validation (SDK + ACs + commit).

| Phase | Wave | Task | Classification |
|---|---|---|---|
| 0 | A | 1 — Verify `packages/contracts/db/schema/marketing.ts` + apply pending migrations | serial |
| 0 | A | 2 — Contract lock doc for `POST /marketing/reconcile/<platform>` | parallel-now (with 1, 3) |
| 0 | A | 3 — Verify wire-events imports + regen if dirty (`bun run codegen:wire`) | serial-after-2 |
| 0 | A | 4 — Author 3 new `.tsp` files (`ad-spend-recorded-manual`, `campaign_product_binding.created`/`removed`) + emit | serial-after-3 |
| 1 | B | 5 — `MarketingErrors` + `enums/index.ts` re-exports | parallel-after-contract |
| 1 | B | 6 — `CampaignProjection` + `CampaignProjectionRepository` | parallel-after-contract |
| 1 | B | 7 — `AdSetProjection` + repo | parallel-after-contract |
| 1 | B | 8 — `AdProjection` + repo | parallel-after-contract |
| 1 | B | 9 — `AdSpendProjection` + repo (AUTOMATIC only) | parallel-after-contract |
| 1 | C | 10 — `CampaignProjector` (listens `campaign.updated` + `campaign.status_changed`) | parallel-after-wave-B |
| 1 | C | 11 — `AdSetProjector` | parallel-after-wave-B |
| 1 | C | 12 — `AdProjector` | parallel-after-wave-B |
| 1 | C | 13 — `AdSpendProjector` (AUTOMATIC-only insert/refresh) | parallel-after-wave-B |
| 1 | D | 14 — `AdSpend` (MANUAL) entity + `AdSpendRepository` | parallel-after-contract |
| 1 | D | 15 — `CampaignProductBinding` entity + repo | parallel-after-contract |
| 1 | E | 16 — Local domain events (5 files) | parallel-after-wave-D |
| 1 | F | 17 — `RecordManualAdSpend` use case + controller (C33) | parallel-after-wave-E |
| 1 | F | 18 — `UpdateManualAdSpend` use case + controller (C34) | parallel-after-wave-E |
| 1 | F | 19 — `DeleteManualAdSpend` use case + controller (C35) | parallel-after-wave-E |
| 1 | F | 20 — `BindCampaignToProduct` use case + controller (C36) | parallel-after-wave-E |
| 1 | F | 21 — `UnbindCampaignFromProduct` use case + controller (C37) | parallel-after-wave-E |
| 1 | G | 22 — `GoWorkerMarketingClient` + `ReconcileDebouncer` + `ReconcileMarketingAccounts` use case + controller (C38) | depends-15,16 |
| 1 | H | 23 — `ListMarketingCampaigns` (T20) + `ListAdSpendBreakdown` (T21) + `ListCampaignProductBindings` (T22) BFF use cases + controllers | parallel-after-wave-F |
| 2 | I | 24 — Internal handlers (3): AdSpendRecordedManual, CampaignProductBindingCreated, CampaignProductBindingRemoved | serial |
| 2 | I | 25 — External handlers (2): StoreIntegrationDataWipeHandler + MarketingReconciliationCompletedHandler | serial |
| 2 | J | 26 — `BoundedContext` wiring (`index.ts` + `registry.ts` + mount router in `packages/api/typescript/src/index.ts` + extend `shared/registry.ts ALL_REGISTRIES`) | serial |
| 2 | J | 27 — Given helpers (`givenCampaignProjection`, `givenAdSpend`, `givenCampaignProductBinding`) | parallel-with-26 |
| 2 | K | 28 — Final Validation (`bun tsc && bun lint && bun run test && bun sdk && bun emit-openapi` + AC mapping table + progress log) | serial |

---

## Task 1 — Verify Drizzle marketing schema + apply pending migrations

**Files:**
- Read-only: `packages/contracts/db/schema/marketing.ts`
- Read-only: `packages/contracts/db/migrations/` (most recent migration)
- Run only: `bun migrate:dev` (or polyglot-equivalent — verify script name from `package.json` root)

**Phase:** 0 — Contract Lock. **Classification:** serial.
**Skills:** `/migrate`, `/db-modelling`.

The five marketing tables and indexes are already authored in
`packages/contracts/db/schema/marketing.ts` (see "What changed in the layout"
in the master plan addendum). **Do not modify the schema.** The discriminator
column, AUTOMATIC unique index, MANUAL nullable columns, and binding shape
are all per design decisions §1, §4, §8 above.

- [ ] **Step 1: Re-read the schema** — confirm columns match spec §4 BC6:
  `campaigns`, `ad_sets`, `ads`, `ad_spends` (with `type` discriminator +
  `automaticBucketUnq` + `manualBinding` jsonb + `occurredAt`),
  `campaign_product_bindings` (with `productId` / `variantId` nullable +
  `bindingUnq`).
- [ ] **Step 2: Confirm a pending migration exists OR is already applied.**
  Run `bun migrate:dev` (resolve the actual root script if `migrate:dev` is
  renamed in polyglot's `package.json`). Expected: no schema-drift errors,
  marketing tables exist in the dev DB.
- [ ] **Step 3: Sanity-check the unique index** by manual SQL via
  `bun x drizzle-kit studio` (or `psql` if studio isn't wired): confirm
  `INSERT INTO marketing.ad_spends (...) VALUES (...) ON CONFLICT ON CONSTRAINT ad_spends_automatic_bucket_unq DO UPDATE SET amount_cents = EXCLUDED.amount_cents`
  upserts in place.
- [ ] **Step 4: `bun tsc`** at the repo root — expected 0 errors (no source
  files were changed).

**Commit:** none (read-only task). If `bun migrate:dev` produced a new file in
`packages/contracts/db/migrations/`, commit it as:
`chore(contracts): apply pending marketing migration (P7 Task 1)`.

**AC trace:** Spec §4 BC6 aggregates — all 5 tables present; spec §1.3
deterministic IDs — AUTOMATIC uniqueness via `ad_spends_automatic_bucket_unq`.

---

## Task 2 — Contract lock for `POST /marketing/reconcile/<platform>`

**Files:**
- Create: `.specs/contracts/2026-05-21-marketing-reconcile.md`
- Read-only: `packages/api/go/internal/sync/` (locate the controller folder
  for the reconcile endpoint; if absent, the PG-GO-WORKER sub-plan will add
  it against this contract).

**Phase:** 0. **Classification:** parallel-now with Tasks 1 + 3.
**Skills:** `/spec-review` on the contract doc.

- [ ] **Step 1: Author the doc** — markdown only, no code. Capture:
  - Method + path: `POST /marketing/reconcile/<platform>` where
    `<platform> ∈ { "META", "GOOGLE_ADS", "TIKTOK" }` (matches
    `MarketingPlatform` enum).
  - Request body shape:
    `{ credentials: object, adAccountId: string, dateRange: { startDate: string (ISO date), endDate: string (ISO date) } }`.
    Credentials are provider-specific JSON the TS Integration BC stored on
    `IntegrationCredentialSecret`.
  - Response: `202 Accepted` with `{ accepted: true, reconcileJobId: string }`.
    Errors: `400 INVALID_PLATFORM | INVALID_DATE_RANGE`,
    `404 STORE_INTEGRATION_NOT_FOUND`.
  - Post-completion: Go publishes `integration.shared.marketing_reconciliation.completed`
    on the Redis Stream the polyglot framework uses for cross-language events
    (the event was already authored in `packages/contracts/wire/events/marketing-reconciliation-completed.tsp`
    and emits the payload `{ platform, storeIntegrationExternalId, adAccountExternalId, rangeStart, rangeEnd, rowsTouched, succeeded }`).
  - Authentication: shared HMAC header `X-Worker-Auth: <BK_DASH_GO_WORKER_TOKEN>`
    (env-supplied; per P4 handshake convention).
  - Idempotency: Go dedupes within a 60s window per
    `(storeIntegrationExternalId, adAccountId, startDate, endDate)`.
- [ ] **Step 2: Quote spec §7.6 C38 + §7.13 outbound block** as blockquotes
  inside the doc so divergences are obvious.
- [ ] **Step 3: Commit**

```bash
git add .specs/contracts/2026-05-21-marketing-reconcile.md
git commit -m "spec(marketing): contract lock for /marketing/reconcile/<platform> (P7 Task 2)"
```

**AC trace:** Spec §7.13 (B) outbound block; spec §7.6 C38 note "implemented
as TS-to-go-worker HTTP call".

---

## Task 3 — Verify generated wire imports

**Files:**
- Read-only: `packages/contracts/generated/typescript/src/wire/events/campaign-updated.ts`,
  `campaign-status-changed.ts`, `ad-set-updated.ts`, `ad-updated.ts`,
  `ad-spend-recorded.ts`, `marketing-reconciliation-completed.ts`.
- Read-only: `packages/contracts/generated/typescript/src/wire/index.ts` (verify
  re-exports include all six event classes + the four enums).
- Run only: `bun run codegen:wire` (if any verification reveals dirt).

**Phase:** 0. **Classification:** serial after Task 2.

- [ ] **Step 1: Skim each generated event file** — confirm static `name`
  matches spec §7.13 (`integration.shared.<topic>` namespace) and payload
  shapes match the .tsp source.
- [ ] **Step 2: Confirm import path** — open
  `packages/contracts/generated/typescript/src/wire/index.ts`; the projector
  task files will import from `@template/contracts-typescript/wire` (or
  whatever package name the polyglot publish step uses). If the path differs,
  record the actual path here so Tasks 10–13 reference it correctly:
  - Expected: `import { CampaignUpdatedEvent, CampaignStatusChangedEvent } from '@template/contracts-typescript/wire'`.
- [ ] **Step 3: `bun tsc`** — 0 errors. (Sanity that the generated TS still
  compiles after any pending merge.)
- [ ] **Step 4: No commit** unless regen produced a diff. If so:
  `chore(contracts): regen wire (P7 Task 3)`.

**AC trace:** Spec §7.13 (A) — five Go-published topics observable via
generated TS classes.

---

## Task 4 — Author 3 new TS-published wire events

**Files:**
- Create: `packages/contracts/wire/events/ad-spend-recorded-manual.tsp`
- Create: `packages/contracts/wire/events/campaign-product-binding-created.tsp`
- Create: `packages/contracts/wire/events/campaign-product-binding-removed.tsp`
- Modify: `packages/contracts/wire/events/index.tsp` (append 3 imports)
- Run: `bun run codegen:wire` (regenerates TS/Go/Rust)
- Test: `packages/contracts/generated/typescript/tests/marketing-ts-published-events.test.ts` (or
  per the contracts package's own test conventions — verify by reading the
  existing `tests/` folder under `packages/contracts/generated/typescript/`).

**Phase:** 0. **Classification:** serial after Task 3.
**Skills:** `/event` (TS-side intent), TypeSpec authoring conventions are
shown in `packages/contracts/wire/events/_base.tsp`.

- [ ] **Step 1: Sketch payload shapes** per spec §7.6 (under each command's
  "Domain Events:" comment + Analytics's read needs):
  - `AdSpendRecordedManualEvent` — `{ adSpendId: string, storeId: string, platform: MarketingPlatform?, currency: CurrencyCode, amountCents: int64, startDate: utcDateTime, endDate: utcDateTime, bindings: { productId?: string, variantId?: string }[] }`.
    `name: "integration.marketing.ad_spend.recorded_manual"`.
  - `CampaignProductBindingCreatedEvent` — `{ bindingId: string, storeId: string, campaignId: string, productId?: string, variantId?: string }`.
    `name: "integration.marketing.campaign_product_binding.created"`.
  - `CampaignProductBindingRemovedEvent` — `{ bindingId: string, storeId: string, campaignId: string }`.
    `name: "integration.marketing.campaign_product_binding.removed"`.
- [ ] **Step 2: Write each `.tsp`** copying the shape of
  `packages/contracts/wire/events/marketing-reconciliation-completed.tsp`
  (already on disk — `import "./_base.tsp"; namespace TemplateContracts;
  model <Name>Event extends IntegrationEvent { name: "..."; <fields> }`).
- [ ] **Step 3: Modify `index.tsp`** — append three lines re-exporting the new
  models so the emitter picks them up.
- [ ] **Step 4: Run `bun run codegen:wire`** — confirm three new files land
  under `packages/contracts/generated/typescript/src/wire/events/` and at
  least one (`ad-spend-recorded-manual.ts`) carries a class extending
  `BaseIntegrationEvent` with the expected static `name`. Also confirm Go +
  Rust emissions look sensible (spot-check: file landed, exports the type).
- [ ] **Step 5: Write a single round-trip test** in the contracts test folder
  (matching whatever pattern exists for `marketing-reconciliation-completed`)
  that constructs each event, serializes, deserializes, and asserts payload
  parity.
- [ ] **Step 6: `bun tsc && bun lint`** — 0 errors.
- [ ] **Step 7: Commit**

```bash
git add packages/contracts/wire/events/ad-spend-recorded-manual.tsp \
        packages/contracts/wire/events/campaign-product-binding-created.tsp \
        packages/contracts/wire/events/campaign-product-binding-removed.tsp \
        packages/contracts/wire/events/index.tsp \
        packages/contracts/generated/
git commit -m "feat(contracts): TS-published marketing integration events for Analytics (P7 Task 4)"
```

**AC trace:** Spec §7.13 (C) intra-API line `Marketing → Analytics : AdSpendRecorded (MANUAL), CampaignProductBindingCreated/Removed`.

---

## Task 5 — `MarketingErrors` glossary + `enums/index.ts` re-exports

**Files:**
- Create: `packages/api/typescript/src/marketing/errors/index.ts`
- Create: `packages/api/typescript/src/marketing/enums/index.ts`

**Phase:** 1B. **Classification:** parallel-after-contract.
**Skills:** `/errors`, `/enum`.

- [ ] **Step 1: Write `errors/index.ts`** (sibling: `auth/errors/index.ts`):

```typescript
import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type {
  BaseDomainErrors,
  BaseApplicationErrors,
  BaseInterfaceErrors,
  BaseInfrastructureErrors,
} from '@template/core-typescript'

export type MarketingDomainErrors =
  | 'CANNOT_MUTATE_AUTOMATIC_AD_SPEND'
  | 'INVALID_DATE_RANGE'
  | 'INVALID_AD_SPEND_FOR_TYPE'
export type DomainErrors = BaseDomainErrors | MarketingDomainErrors

export type MarketingApplicationErrors =
  | 'CAMPAIGN_NOT_FOUND'
  | 'AD_SPEND_NOT_FOUND'
  | 'BINDING_NOT_FOUND'
  | 'BINDING_ALREADY_EXISTS'
  | 'PRODUCT_NOT_FOUND'
  | 'VARIANT_NOT_FOUND'
  | 'STORE_INTEGRATION_NOT_FOUND'
export type ApplicationErrors = BaseApplicationErrors | MarketingApplicationErrors

export type MarketingInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | MarketingInterfaceErrors

export type MarketingInfrastructureErrors = 'GO_WORKER_UNAVAILABLE'
export type InfrastructureErrors = BaseInfrastructureErrors | MarketingInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
  CANNOT_MUTATE_AUTOMATIC_AD_SPEND: HttpStatusCode.CONFLICT,
  INVALID_DATE_RANGE: HttpStatusCode.BAD_REQUEST,
  INVALID_AD_SPEND_FOR_TYPE: HttpStatusCode.BAD_REQUEST,
  CAMPAIGN_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  AD_SPEND_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  BINDING_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  BINDING_ALREADY_EXISTS: HttpStatusCode.CONFLICT,
  PRODUCT_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  VARIANT_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  STORE_INTEGRATION_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  GO_WORKER_UNAVAILABLE: HttpStatusCode.BAD_GATEWAY,
})
```

- [ ] **Step 2: Write `enums/index.ts`** — pure re-exports:

```typescript
export { MarketingPlatform, MarketingPlatformSchema } from '@template/contracts-typescript/wire/enums'
export { CampaignStatus, CampaignStatusSchema } from '@template/contracts-typescript/wire/enums'
export { AdSpendType, AdSpendTypeSchema } from '@template/contracts-typescript/wire/enums'
export { AdSpendGroupBy, AdSpendGroupBySchema } from '@template/contracts-typescript/wire/enums'
```

(If the exposed module path differs from the convention above, adopt what
`packages/api/typescript/src/auth/` actually imports — check via
`grep -r '@template/contracts' packages/api/typescript/src/auth/`.)

- [ ] **Step 3: Verify** `bun tsc && bun lint` — 0 errors.
- [ ] **Step 4: Commit**

```bash
git add packages/api/typescript/src/marketing/errors/ \
        packages/api/typescript/src/marketing/enums/
git commit -m "feat(marketing): error glossary + enum re-exports (P7 Task 5)"
```

**AC trace:** Spec §7.14 `MarketingErrors` covered 1:1 plus three Domain-layer
extras for invariant enforcement; `PRODUCT_NOT_FOUND` / `VARIANT_NOT_FOUND` /
`STORE_INTEGRATION_NOT_FOUND` re-stated as Application errors per spec C33 /
C36 / C38.

---

## Task 6 — `CampaignProjection` + `CampaignProjectionRepository`

**Files:**
- Create: `marketing/projections/CampaignProjection.ts` + `.test.ts`
- Create: `marketing/projections/repositories/CampaignProjectionRepository/{CampaignProjectionRepository,DrizzleCampaignProjectionRepository,index}.ts`
- Create: `marketing/projections/repositories/CampaignProjectionRepository/DrizzleCampaignProjectionRepository.test.ts`

**Phase:** 1B. **Classification:** parallel-after-contract.
**Skills:** `/projection`, `/repository`.

- [ ] **Step 1: Write the projection failing test** — covers `create()` from
  `CampaignUpdatedEvent` (constructs row with id derived from
  `UUIDv5(platform + externalId)`), `applyEvent()` from a second
  `CampaignUpdatedEvent` (status flip), `applyEvent()` from
  `CampaignStatusChangedEvent` (status flip via the dedicated event).
- [ ] **Step 2: Implement `CampaignProjection.ts`** per
  `.claude/skills/projection/typescript/SKILL.md`:

```typescript
import { z } from '@template/core-typescript'
import { MarketingPlatformSchema, CampaignStatusSchema } from '@template/contracts-typescript/wire/enums'
import { CampaignUpdatedEvent, CampaignStatusChangedEvent } from '@template/contracts-typescript/wire'

export const CampaignProjectionSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  storeIntegrationId: z.string().uuid(),
  storeIntegrationExternalId: z.string(),
  platform: MarketingPlatformSchema,
  externalId: z.string(),
  adAccountExternalId: z.string(),
  name: z.string(),
  status: CampaignStatusSchema,
  externalCreatedAt: z.coerce.date(),
})
export type CampaignProjectionProps = z.infer<typeof CampaignProjectionSchema>

export type CampaignProjectionEvent = CampaignUpdatedEvent | CampaignStatusChangedEvent

export class CampaignProjection {
  constructor(public props: CampaignProjectionProps) {}

  static create(event: CampaignUpdatedEvent): CampaignProjection {
    // Resolves storeId + storeIntegrationId via lookup in the projector
    // (CampaignProjector.handle injects them into props before calling create()
    //  through the repo's insertIfNew wrapper). Free-record so we accept the
    //  fully-formed props.
    const p = event.payload
    return new CampaignProjection({
      id: deriveCampaignId(p.platform, p.externalId),
      storeId: p.storeId,
      storeIntegrationId: p.storeIntegrationId,
      storeIntegrationExternalId: p.storeIntegrationExternalId,
      platform: p.platform,
      externalId: p.externalId,
      adAccountExternalId: p.adAccountExternalId,
      name: p.name ?? '(unknown)',
      status: p.status,
      externalCreatedAt: new Date(p.externalCreatedAt ?? Date.now()),
    })
  }

  applyEvent(event: CampaignUpdatedEvent): void
  applyEvent(event: CampaignStatusChangedEvent): void
  applyEvent(event: CampaignProjectionEvent): void {
    switch (event.name) {
      case CampaignUpdatedEvent.name:
        this.props.status = event.payload.status
        // Other fields immutable per spec (adAccountExternalId fixed at create).
        return
      case CampaignStatusChangedEvent.name:
        this.props.status = event.payload.status
        return
    }
  }
}
```

  > **Note on `storeId` / `storeIntegrationId` resolution.** The wire event
  > carries `storeIntegrationExternalId` only — the projector resolves
  > `storeIntegrationId` + `storeId` by joining against
  > `integration.store_integrations.externalId` (P4) before calling
  > `CampaignProjection.create()`. If the integration is not yet known (event
  > arrived before P4 handshake completed — exceptional), the projector
  > drops the event with a warning log and lets Go's retry re-deliver later.

- [ ] **Step 3: Implement `CampaignProjectionRepository.ts`** (abstract base):

```typescript
import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { CampaignProjection } from '../../CampaignProjection'

export abstract class CampaignProjectionRepository extends Repository<CampaignProjection> {
  abstract findByPlatformExternalId(platform: string, externalId: string, tx?: Transaction): Promise<CampaignProjection | undefined>
  abstract findById(id: string, tx?: Transaction): Promise<CampaignProjection | undefined>
  abstract insertIfNew(projection: CampaignProjection, tx?: Transaction): Promise<void>
  abstract save(projection: CampaignProjection, tx?: Transaction): Promise<void>
  abstract deleteByStoreIntegrationId(storeIntegrationId: string, tx?: Transaction): Promise<void>
}
```

- [ ] **Step 4: Implement `DrizzleCampaignProjectionRepository.ts`** — uses
  `campaigns` table from `@template/contracts/db`. `insertIfNew` uses
  `.onConflictDoNothing({ target: campaigns.id })`. `save` uses optimistic
  lock via `version` (`UPDATE ... WHERE version = $oldVersion`).
  `deleteByStoreIntegrationId` does a straight `DELETE WHERE store_integration_id = $1`.
- [ ] **Step 5: Repository test** (TestBed integration mode): covers
  `insertIfNew + idempotency`, `findById`, `findByPlatformExternalId`, `save +
  version bump`, `deleteByStoreIntegrationId`.
- [ ] **Step 6: Verify**

```bash
bun test packages/api/typescript/src/marketing/projections/
bun tsc && bun lint
```

- [ ] **Step 7: Commit**

```bash
git add packages/api/typescript/src/marketing/projections/CampaignProjection.ts \
        packages/api/typescript/src/marketing/projections/CampaignProjection.test.ts \
        packages/api/typescript/src/marketing/projections/repositories/CampaignProjectionRepository/
git commit -m "feat(marketing): CampaignProjection + repository (P7 Task 6)"
```

**AC trace:** Spec §4 BC6 Campaign aggregate fields.

---

## Task 7 — `AdSetProjection` + `AdSetProjectionRepository`

Identical structure to Task 6 — swap fields per spec §4 BC6 `AdSet` and the
`ad_sets` table. Listens to `AdSetUpdatedEvent`. Same repo shape
(`findByPlatformExternalId`, `findById`, `insertIfNew`, `save`,
`deleteByStoreIntegrationId`). Carries `campaignId`, `campaignExternalId`,
`storeIntegrationId`, etc. per the existing `ad_sets` schema columns.

**Commit:** `feat(marketing): AdSetProjection + repository (P7 Task 7)`.

**AC trace:** Spec §4 BC6 AdSet aggregate.

---

## Task 8 — `AdProjection` + `AdProjectionRepository`

Identical structure to Task 6 — swap fields per spec §4 BC6 `Ad` and the
`ads` table. Listens to `AdUpdatedEvent`. Carries `adSetId`, `campaignId`,
`adSetExternalId`, `campaignExternalId`.

**Commit:** `feat(marketing): AdProjection + repository (P7 Task 8)`.

**AC trace:** Spec §4 BC6 Ad aggregate.

---

## Task 9 — `AdSpendProjection` + `AdSpendProjectionRepository` (AUTOMATIC mirror)

**Files:**
- Create: `marketing/projections/AdSpendProjection.ts` + `.test.ts`
- Create: `marketing/projections/repositories/AdSpendProjectionRepository/{AdSpendProjectionRepository,DrizzleAdSpendProjectionRepository,index}.ts` + Drizzle test

**Phase:** 1B. **Classification:** parallel-after-contract.

Per design decisions §1 + §4: AUTOMATIC rows are projection-only; MANUAL
rows are AggregateRoot. This projection covers AUTOMATIC. The same Drizzle
table backs both — the projection's `create()` only accepts AUTOMATIC events;
its repo's `deleteByStoreIntegrationId` filters `type = 'AUTOMATIC'`.

- [ ] **Projection schema** (Zod) mirrors every AUTOMATIC field of the
  `ad_spends` table: `id, storeId, storeIntegrationId, storeIntegrationExternalId,
  type ('AUTOMATIC' literal), platform, adId, campaignId, adAccountExternalId,
  adExternalId, groupBy, bucketStart, amountCents, currency, impressions, clicks`.
- [ ] **Event union:** `AdSpendProjectionEvent = AdSpendRecordedEvent` (the
  Go-published wire event). `create(event)` builds the row;
  `applyEvent(event)` updates `amountCents`, `impressions`, `clicks` and
  `updatedAt`. (Re-emission of the same bucket overwrites the totals — Go is
  the canonical source.)
- [ ] **Repository extras:**
  - `findByAutomaticKey({ storeId, adAccountExternalId, adExternalId, bucketStart, groupBy }, tx)` —
    used by the projector to locate the row when re-emission lands.
  - `upsertAutomatic(projection, tx)` — single SQL hitting
    `ad_spends_automatic_bucket_unq` (see design decision §4). Combines
    `insertIfNew` + `applyEvent + save` into one round-trip — this is an
    **atomic-op edge case** per `/projector` skill (hot-row + first-insert
    detection via `xmax`).
  - `deleteByStoreIntegrationId(storeIntegrationId, tx)` — `DELETE WHERE
    store_integration_id = $1 AND type = 'AUTOMATIC'`.
  - `aggregateForBreakdown(filters, tx)` — used by T21. SELECT
    `bucketKey, currency, SUM(amountCents) AS spendCents, SUM(impressions),
    SUM(clicks), type` GROUP BY (bucketKey computed per `groupBy` input).
- [ ] **Tests:** AUTOMATIC create + applyEvent merge + upsertAutomatic
  idempotency (insert then re-insert → one row, amountCents reflects latest);
  `deleteByStoreIntegrationId` skips MANUAL rows;
  `aggregateForBreakdown` groups correctly by `DAY` and by `CAMPAIGN`.

**Commit:** `feat(marketing): AdSpendProjection + repository with atomic upsert + breakdown (P7 Task 9)`.

**AC trace:** Spec §4 BC6 AdSpend AUTOMATIC branch + §7.6 T21 query shape.

---

## Task 10 — `CampaignProjector`

**Files:**
- Create: `marketing/projections/projectors/CampaignProjector.ts` + `.test.ts`

**Phase:** 1C. **Classification:** parallel-after-wave-B.
**Skills:** `/projector`.

- [ ] **Step 1: Implement** per the canonical pattern in
  `.claude/skills/projector/typescript/SKILL.md`:

```typescript
import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { Projector } from '@template/core-typescript'
import { CampaignUpdatedEvent, CampaignStatusChangedEvent } from '@template/contracts-typescript/wire'
import { CampaignProjection, type CampaignProjectionEvent } from '../CampaignProjection'
import { CampaignProjectionRepository } from '../repositories/CampaignProjectionRepository'
import { StoreIntegrationRepository } from '@integration/repositories'  // P4

@injectable()
export class CampaignProjector extends Projector<CampaignProjectionEvent> {
  readonly events = [CampaignUpdatedEvent.name, CampaignStatusChangedEvent.name] as const

  constructor(
    private repo: CampaignProjectionRepository,
    private storeIntegrationRepo: StoreIntegrationRepository,
  ) {
    super()
  }

  async handle(event: CampaignProjectionEvent, tx?: Transaction): Promise<void> {
    switch (event.name) {
      case CampaignUpdatedEvent.name: {
        if (event.payload.isNew) {
          const enriched = await this.enrich(event)
          if (!enriched) return
          await this.repo.insertIfNew(CampaignProjection.create(enriched), tx)
          return
        }
        const existing = await this.repo.findByPlatformExternalId(event.payload.platform, event.payload.externalId, tx)
        if (!existing) {
          // Out-of-order delivery: treat as new.
          const enriched = await this.enrich(event)
          if (!enriched) return
          await this.repo.insertIfNew(CampaignProjection.create(enriched), tx)
          return
        }
        existing.applyEvent(event)
        await this.repo.save(existing, tx)
        return
      }
      case CampaignStatusChangedEvent.name: {
        const existing = await this.repo.findByPlatformExternalId(event.payload.platform, event.payload.externalId, tx)
        if (!existing) return  // Status-change for a campaign we never saw — drop; Go's UPSERT will eventually emit campaign.updated.
        existing.applyEvent(event)
        await this.repo.save(existing, tx)
        return
      }
      default: {
        const _: never = event
        return _
      }
    }
  }

  private async enrich(event: CampaignUpdatedEvent): Promise<CampaignUpdatedEvent | undefined> {
    const integration = await this.storeIntegrationRepo.findByExternalId(event.payload.storeIntegrationExternalId)
    if (!integration) return undefined
    // Pass through with storeId + storeIntegrationId attached (the projection's create() reads them off the payload).
    return Object.assign(event, { payload: { ...event.payload, storeId: integration.storeId, storeIntegrationId: integration.id } })
  }
}
```

- [ ] **Step 2: Test** (TestBed integration):
  - `isNew=true` event creates a row.
  - Second `isNew=true` event same `(platform, externalId)` → still one row
    (idempotent `insertIfNew`).
  - `isNew=false` event with no prior row → out-of-order fallback inserts.
  - `CampaignStatusChangedEvent` flips status when prior row exists, drops
    when not.
  - Event for unknown `storeIntegrationExternalId` → no row (handler-level
    skip).

**Commit:** `feat(marketing): CampaignProjector with idempotent insert + status branch (P7 Task 10)`.

**AC trace:** Spec §4 BC6 published events `CampaignUpdated`, `CampaignStatusChanged`.

---

## Task 11 — `AdSetProjector`

Same shape as Task 10 — single event `AdSetUpdatedEvent`, dispatch
`AdSetProjection.create/applyEvent`. Uses the same `enrich(storeIntegrationExternalId)`
trick to attach `storeId` + `storeIntegrationId` + `campaignId` (derived from
`(platform, campaignExternalId)` via `CampaignProjectionRepository.findByPlatformExternalId`).

**Commit:** `feat(marketing): AdSetProjector (P7 Task 11)`.

**AC trace:** Spec §4 BC6 published event `AdSetUpdated`.

---

## Task 12 — `AdProjector`

Same shape as Task 11 — single event `AdUpdatedEvent`. Derives `adSetId` via
`AdSetProjectionRepository.findByPlatformExternalId(platform, adSetExternalId)`
and `campaignId` via `CampaignProjectionRepository.findByPlatformExternalId(platform, campaignExternalId)`.

**Commit:** `feat(marketing): AdProjector (P7 Task 12)`.

**AC trace:** Spec §4 BC6 published event `AdUpdated`.

---

## Task 13 — `AdSpendProjector` (AUTOMATIC-only)

**Files:**
- Create: `marketing/projections/projectors/AdSpendProjector.ts` + `.test.ts`

**Phase:** 1C. **Classification:** parallel-after-wave-B.

```typescript
@injectable()
export class AdSpendProjector extends Projector<AdSpendRecordedEvent> {
  readonly events = [AdSpendRecordedEvent.name] as const

  constructor(
    private repo: AdSpendProjectionRepository,
    private storeIntegrationRepo: StoreIntegrationRepository,
    private adRepo: AdProjectionRepository,
    private campaignRepo: CampaignProjectionRepository,
  ) {
    super()
  }

  async handle(event: AdSpendRecordedEvent, tx?: Transaction): Promise<void> {
    const integration = await this.storeIntegrationRepo.findByExternalId(event.payload.storeIntegrationExternalId)
    if (!integration) return  // unknown integration — drop, Go will retry on next reconcile cycle
    const ad = await this.adRepo.findByPlatformExternalId(event.payload.platform, event.payload.adExternalId)
    const campaign = await this.campaignRepo.findByPlatformExternalId(event.payload.platform, event.payload.campaignExternalId)
    if (!ad || !campaign) return  // hierarchy not yet projected — drop, ad.updated / campaign.updated will land first on the next ingest

    const projection = AdSpendProjection.create({
      ...event,
      payload: {
        ...event.payload,
        storeId: integration.storeId,
        storeIntegrationId: integration.id,
        adId: ad.props.id,
        campaignId: campaign.props.id,
        type: 'AUTOMATIC',
      },
    } as any)

    // Atomic upsert keyed on ad_spends_automatic_bucket_unq.
    await this.repo.upsertAutomatic(projection, tx)
  }
}
```

- [ ] **Test:** AUTOMATIC event with known integration + hierarchy → row
  inserted; duplicate AUTOMATIC event → still one row, amountCents reflects
  latest (`upsertAutomatic` semantics); event with unknown integration → no
  row; event with unknown ad/campaign → no row.

**Commit:** `feat(marketing): AdSpendProjector — atomic AUTOMATIC upsert (P7 Task 13)`.

**AC trace:** Spec §4 BC6 published event `AdSpendRecorded` (AUTOMATIC).

---

## Task 14 — `AdSpend` (MANUAL write-side) entity + `AdSpendRepository`

**Files:**
- Create: `marketing/entities/AdSpend.ts` + `.test.ts`
- Create: `marketing/entities/index.ts`
- Create: `marketing/repositories/AdSpendRepository/{AdSpendRepository,DrizzleAdSpendRepository,MockAdSpendRepository,index}.ts` + Drizzle test

**Phase:** 1D. **Classification:** parallel-after-contract.
**Skills:** `/entity`, `/repository`.

- [ ] **Entity invariants** (per design decisions §2, §3):
  - `static record({ storeId, name, description?, currency, startDate, endDate, spend: { amountCents, currency }, bindings?: ManualMarketingExpenseBinding[], platform? })`
    constructs a fresh `AdSpend` with `type: 'MANUAL'`, `adId: null`,
    `adAccountExternalId: null`, `campaignExternalId: null`, `groupBy: 'DAILY'`,
    `bucketStart: null`, `occurredAt: startDate`. Throws `INVALID_DATE_RANGE`
    if `endDate < startDate`. **Does not pre-assign `id`** — the Drizzle
    column's `defaultRandom()` handles it on insert; `Repository.save` reads
    the id back via `RETURNING`.
  - `update({ name?, description?, startDate?, endDate?, spend?, bindings? })`
    — re-validates date range; defensive
    `if (this.type !== 'MANUAL') throw CANNOT_MUTATE_AUTOMATIC_AD_SPEND`.
  - `bindings` stored as-is — the entity carries the discriminated optional
    `{ productId?: string; variantId?: string }[]` shape verbatim. Schema-level
    validation (exactly-one-of) runs in the use case via a Zod
    `.superRefine()` before calling `AdSpend.record(...)`.
- [ ] **Entity test:** invalid date range → `INVALID_DATE_RANGE`; MANUAL
  guard on `update` (synthetic AUTOMATIC entity → throws); defaults applied
  (`adId: null`, `groupBy: 'DAILY'`, etc.); `update({ bindings: [...] })`
  replaces the array (does not concat).
- [ ] **Repository abstract base** (`AdSpendRepository.ts`):

```typescript
export abstract class AdSpendRepository extends Repository<AdSpend> {
  abstract findManualById(id: string, tx?: Transaction): Promise<AdSpend | undefined>
  abstract loadGuard(id: string, tx?: Transaction): Promise<{ found: boolean; type: AdSpendType | null }>
  abstract save(entity: AdSpend, tx?: Transaction): Promise<void>
  abstract deleteManual(id: string, tx?: Transaction): Promise<void>
}
```

- [ ] **Drizzle impl:** uses `adSpends` table; `findManualById` filters
  `WHERE id = $1 AND type = 'MANUAL'`; `loadGuard` is a single `SELECT type
  FROM ad_spends WHERE id = $1`; `save` uses optimistic lock via `version`;
  `deleteManual` `DELETE WHERE id = $1 AND type = 'MANUAL'` (returns
  rowCount; the use case translates `rowCount = 0` to `AD_SPEND_NOT_FOUND`
  if `loadGuard` would have caught it — defense-in-depth).
- [ ] **Mock impl:** in-memory `Map<id, AdSpend>` for unit-level harness.
- [ ] **Drizzle repo test** (TestBed integration): seeds MANUAL row +
  AUTOMATIC row (via direct insert into `ad_spends`); confirms
  `findManualById` returns MANUAL only; confirms `loadGuard` reports `type`
  correctly for both; `save` bumps version; `deleteManual` no-ops on
  AUTOMATIC ids.

**Commit:** `feat(marketing): AdSpend MANUAL entity + repository with type guard (P7 Task 14)`.

**AC trace:** Spec §4 BC6 AdSpend `type=MANUAL` branch; spec §7.6 C33–C35
errors `CANNOT_MUTATE_AUTOMATIC_AD_SPEND`, `INVALID_DATE_RANGE`.

---

## Task 15 — `CampaignProductBinding` entity + repository

**Files:**
- Create: `marketing/entities/CampaignProductBinding.ts` + `.test.ts`
- Create: `marketing/repositories/CampaignProductBindingRepository/*` + Drizzle test

**Phase:** 1D. **Classification:** parallel-after-contract.

- [ ] **Entity invariants:**
  - `static bind({ storeId, campaignId, productId?, variantId? })` — asserts
    exactly one of `productId` / `variantId` is set (else `VALIDATION_ERROR`);
    constructs a new binding.
  - No `update` method — bindings are immutable; remove + re-bind.
- [ ] **Repository abstract base:**

```typescript
export abstract class CampaignProductBindingRepository extends Repository<CampaignProductBinding> {
  abstract findById(id: string, tx?: Transaction): Promise<CampaignProductBinding | undefined>
  abstract findExisting(campaignId: string, productId: string | null, variantId: string | null, tx?: Transaction): Promise<CampaignProductBinding | undefined>
  abstract findByStoreId(storeId: string, filter: { campaignId?: string; productId?: string }, pagination: { page: number; limit: number }, tx?: Transaction): Promise<{ items: CampaignProductBinding[]; total: number }>
  abstract saveMany(entities: CampaignProductBinding[], tx?: Transaction): Promise<void>
  abstract delete(id: string, tx?: Transaction): Promise<void>
}
```

- [ ] **Drizzle impl:** `findExisting` queries `WHERE campaign_id = $1 AND
  product_id IS NOT DISTINCT FROM $2 AND variant_id IS NOT DISTINCT FROM $3`
  (handles NULL-vs-NULL equality per the schema's unique-index semantics).
  `saveMany` inserts all rows in one statement; on conflict via
  `campaign_product_bindings_unq`, lets the error propagate so the use case
  can re-throw as `BINDING_ALREADY_EXISTS`.
- [ ] **Tests:** entity invariants; repository
  insert/findExisting/findByStoreId pagination/delete.

**Commit:** `feat(marketing): CampaignProductBinding entity + repository (P7 Task 15)`.

**AC trace:** Spec §4 BC6 CampaignProductBinding aggregate; spec §7.6 C36
`BINDING_ALREADY_EXISTS`.

---

## Task 16 — Local domain events (5 files)

**Files:**
- Create: `marketing/events/AdSpendRecordedEvent.ts` — `'marketing.ad_spend.recorded'`,
  payload `{ adSpendId, storeId, type: 'MANUAL', platform?: MarketingPlatform, currency: CurrencyCode, amountCents: number, startDate: Date, endDate: Date, bindings: { productId?: string; variantId?: string }[] }`.
- Create: `marketing/events/AdSpendUpdatedEvent.ts` — `'marketing.ad_spend.updated'`,
  payload `{ adSpendId, storeId, type: 'MANUAL', changedFields: string[] }`.
- Create: `marketing/events/AdSpendDeletedEvent.ts` — `'marketing.ad_spend.deleted'`,
  payload `{ adSpendId, storeId, type: 'MANUAL' }`.
- Create: `marketing/events/CampaignProductBindingCreatedEvent.ts` —
  `'marketing.campaign_product_binding.created'`, payload `{ bindingId, storeId, campaignId, productId?: string, variantId?: string }`.
- Create: `marketing/events/CampaignProductBindingRemovedEvent.ts` —
  `'marketing.campaign_product_binding.removed'`, payload `{ bindingId, storeId, campaignId }`.
- Create: `marketing/events/index.ts` — re-export all five.
- Test: `marketing/events/marketing-events.test.ts` — name + parse-trip per event.

**Phase:** 1E. **Classification:** parallel-after-wave-D.
**Skills:** `/event` (TypeScript variant).

Each event extends `BaseDomainEvent<typeof Schema>` from
`@template/core-typescript`, with `static override readonly name = '<topic>' as const`
and `static readonly schema = z.domainEvent({...})`. Shape per
`packages/api/typescript/src/auth/events/UserRegisteredEvent.ts`.

**Commit:** `feat(marketing): local domain events for AdSpend + CampaignProductBinding write-side (P7 Task 16)`.

**AC trace:** Spec §7.6 C33–C37 "Domain Events:" lines.

---

## Task 17 — `RecordManualAdSpend` use case + controller (C33)

**Files:**
- Create: `marketing/usecases/RecordManualAdSpend.ts` + `.test.ts`
- Create: `marketing/controllers/RecordManualAdSpend.ts`

**Phase:** 1F. **Classification:** parallel-after-wave-E.
**Skills:** `/usecase`, `/controller`, `/schema`.

- [ ] **Use case** (sibling: `auth/usecases/RegisterUser.ts`):
  - `InputSchema`: `z.object({ storeId, platform: MarketingPlatformSchema.optional(), name: z.string().min(1), description: z.string().optional(), currency: CurrencyCodeSchema, startDate: z.coerce.date(), endDate: z.coerce.date(), spend: z.object({ amountCents: z.number().int().nonnegative(), currency: CurrencyCodeSchema }), bindings: z.array(ManualMarketingExpenseBindingSchema).optional(), actorId: z.string() })`
    where `ManualMarketingExpenseBindingSchema = z.object({ productId: z.string().optional(), variantId: z.string().optional() }).superRefine((b, ctx) => { if (!!b.productId === !!b.variantId) ctx.addIssue({ code: 'custom', message: 'exactly one of productId / variantId' }) })`.
  - `OutputSchema`: `z.object({ adSpendId: z.string() })`.
  - Behavior, inside `this.withTransaction(tx, async tx => ...)`:
    1. For each binding with `productId`: `productRepository.findById(productId, tx)`
       — `PRODUCT_NOT_FOUND` if absent.
    2. For each binding with `variantId`: `variantRepository.findById(variantId, tx)`
       — `VARIANT_NOT_FOUND` if absent.
    3. `const adSpend = AdSpend.record({...})` — throws `INVALID_DATE_RANGE`
       on bad dates.
    4. `await this.adSpendRepository.save(adSpend, tx)` — fills `adSpend.id`
       via `RETURNING`.
    5. `await this.domainEventRepository.save(new AdSpendRecordedEvent({
       entityId: adSpend.id, ownerId: input.storeId,
       payload: { adSpendId: adSpend.id, storeId: input.storeId, type: 'MANUAL', platform: input.platform, currency: input.currency, amountCents: input.spend.amountCents, startDate: input.startDate, endDate: input.endDate, bindings: input.bindings ?? [] }, }), tx)`.
    6. Return `{ adSpendId: adSpend.id }`.
  - Dependencies: `private adSpendRepository: AdSpendRepository`,
    `private productRepository: ProductRepository`,
    `private variantRepository: VariantRepository` (the last two are P5;
    paths `@catalog/repositories`).
- [ ] **Use case test** (TestBed integration): seeds
  `givenStoreWithOwner` + `givenProduct` (from P2 + P5 helpers); covers happy
  path, `INVALID_DATE_RANGE`, `PRODUCT_NOT_FOUND`, `VARIANT_NOT_FOUND`, and
  `AdSpendRecordedEvent` lands in the outbox.
- [ ] **Controller** (sibling: `auth/controllers/GetSession.ts`):
  - `path = '/manual-ad-spend' as const`, `method = 'post' as const`.
  - Mounted as a child of `/v1/stores/:storeId/marketing/manual-ad-spend`
    via `BoundedContext.create({ name: 'stores/:storeId/marketing' })` —
    confirm at Task 26 whether `BoundedContext.create` accepts a parametric
    `name` or if the prefix is applied at `MainRouter` level.
  - `inputSchema = z.object({ body: <Input minus storeId, actorId>, params: z.object({ storeId: z.string() }), ctx: z.object({ user: z.object({ id: z.string() }) }) })`.
  - `outputSchema = z.object({ adSpendId: z.string() })`.
  - `middlewares: [requireRole(['OWNER','ADMIN','MEMBER'])]` (from `@tenancy/middlewares`).
  - Handler: composes `storeId` + `actorId` from path + ctx, delegates to
    `this.useCase.execute({...})`, returns `{ status: HttpStatusCode.CREATED, data: { adSpendId } }`.
  - `errors: ['INVALID_DATE_RANGE', 'PRODUCT_NOT_FOUND', 'VARIANT_NOT_FOUND', 'UNAUTHORIZED', 'FORBIDDEN', 'SESSION_EXPIRED']`.

**Commit:** `feat(marketing): C33 RecordManualAdSpend use case + controller (P7 Task 17)`.

**AC trace:** Spec §7.6 C33 (input / output / errors / event).

---

## Task 18 — `UpdateManualAdSpend` use case + controller (C34)

Same shape as Task 17.

- [ ] **Input:** `{ adSpendId, name?, description?, startDate?, endDate?, spend?, bindings? }`.
- [ ] **Use case body:**
  1. `const guard = await this.adSpendRepository.loadGuard(adSpendId, tx)`;
     if `!guard.found` → `AD_SPEND_NOT_FOUND`; if
     `guard.type !== 'MANUAL'` → `CANNOT_MUTATE_AUTOMATIC_AD_SPEND`.
  2. `const adSpend = await this.adSpendRepository.findManualById(adSpendId, tx)`
     (asserted non-null after guard).
  3. Re-validate bindings against Catalog (as in Task 17) — only for
     bindings newly added in this update.
  4. `adSpend.update({...})` — throws `INVALID_DATE_RANGE` on bad dates.
  5. `await this.adSpendRepository.save(adSpend, tx)`.
  6. Raise `AdSpendUpdatedEvent { adSpendId, storeId, type: 'MANUAL', changedFields }`.
- [ ] **Controller:** `path = '/manual-ad-spend/:adSpendId'`,
  `method = 'patch'`, `204 No Content`.

**Commit:** `feat(marketing): C34 UpdateManualAdSpend use case + controller (P7 Task 18)`.

**AC trace:** Spec §7.6 C34.

---

## Task 19 — `DeleteManualAdSpend` use case + controller (C35)

- [ ] **Use case body:** same `loadGuard` pattern as Task 18. On guard pass
  → `await this.adSpendRepository.deleteManual(adSpendId, tx)`. Raise
  `AdSpendDeletedEvent { adSpendId, storeId, type: 'MANUAL' }`.
- [ ] **Controller:** `path = '/manual-ad-spend/:adSpendId'`,
  `method = 'delete'`, `204 No Content`.

**Commit:** `feat(marketing): C35 DeleteManualAdSpend use case + controller (P7 Task 19)`.

**AC trace:** Spec §7.6 C35.

---

## Task 20 — `BindCampaignToProduct` use case + controller (C36)

- [ ] **Input:** `{ storeId, campaignId, productIds: string[], variantIds: string[], actorId }`.
  Use case enforces `productIds.length + variantIds.length > 0` else
  `VALIDATION_ERROR`.
- [ ] **Use case body:**
  1. `const campaign = await this.campaignProjectionRepo.findById(campaignId, tx)`
     → `CAMPAIGN_NOT_FOUND` if absent.
  2. For each `productId`: `productRepository.findById(productId, tx)`
     → `PRODUCT_NOT_FOUND` if absent.
  3. For each `variantId`: `variantRepository.findById(variantId, tx)`
     → `VARIANT_NOT_FOUND` if absent.
  4. For each `productId`:
     `const existing = await this.bindingRepo.findExisting(campaignId, productId, null, tx)`
     → `BINDING_ALREADY_EXISTS` if found. Else build
     `CampaignProductBinding.bind({ storeId, campaignId, productId })`.
  5. Same pattern for each `variantId` (`findExisting(campaignId, null, variantId, tx)`).
  6. `await this.bindingRepo.saveMany(newBindings, tx)`.
  7. For each new binding: raise `CampaignProductBindingCreatedEvent({
     entityId: binding.id, ownerId: storeId, payload: { bindingId, storeId, campaignId, productId, variantId } })`.
  8. Return `{ bindingIds: newBindings.map(b => b.id) }`. Spec §7.6 C36 says
     `Output = { bindingId: string }` — this is the schema-vs-spec gap when
     multiple bindings created in one call. Per spec: **one row per call** is
     the intended semantic, so the use case **rejects with
     `VALIDATION_ERROR` when `productIds.length + variantIds.length > 1`**
     to match the documented Output shape. Document this constraint in the
     controller description.
- [ ] **Controller:** `path = '/campaign-bindings'`, `method = 'post'`,
  `201 Created` with `{ bindingId }` (the single id).

**Commit:** `feat(marketing): C36 BindCampaignToProduct use case + controller (P7 Task 20)`.

**AC trace:** Spec §7.6 C36 incl. `BINDING_ALREADY_EXISTS`.

---

## Task 21 — `UnbindCampaignFromProduct` use case + controller (C37)

- [ ] **Use case body:** `findById(bindingId)` → `BINDING_NOT_FOUND`;
  `delete`; raise `CampaignProductBindingRemovedEvent`.
- [ ] **Controller:** `path = '/campaign-bindings/:bindingId'`,
  `method = 'delete'`, `204 No Content`.

**Commit:** `feat(marketing): C37 UnbindCampaignFromProduct use case + controller (P7 Task 21)`.

**AC trace:** Spec §7.6 C37.

---

## Task 22 — `GoWorkerMarketingClient` + `ReconcileDebouncer` + C38

**Files:**
- Create: `marketing/services/GoWorkerMarketingClient.ts` + `.test.ts`
- Create: `marketing/services/ReconcileDebouncer.ts` + `.test.ts`
- Create: `marketing/usecases/ReconcileMarketingAccounts.ts` + `.test.ts`
- Create: `marketing/controllers/ReconcileMarketingAccounts.ts`

**Phase:** 1G. **Classification:** depends on Tasks 15 + 16.
**Skills:** `/service`, `/usecase`, `/controller`.

### 22a — `GoWorkerMarketingClient`

`@injectable()` class with method
`async reconcile({ platform, credentials, adAccountId, startDate, endDate }): Promise<{ accepted: true, reconcileJobId: string }>`.
Reads `Config.env.GO_WORKER_URL` + `Config.env.BK_DASH_GO_WORKER_TOKEN`.
`POST ${GO_WORKER_URL}/marketing/reconcile/${platform}` with header
`X-Worker-Auth: <token>` and `Content-Type: application/json`. On non-2xx →
`throw new BaseError<MarketingInfrastructureErrors>('GO_WORKER_UNAVAILABLE')`.
Test uses `mock.module('node:fetch', ...)` or Bun's built-in fetch stub.

### 22b — `ReconcileDebouncer`

`@injectable()` class with method
`async tryAcquire(storeIntegrationId: string): Promise<boolean>`.
Backed by Redis `SET key NX EX 300` where key is
`marketing:reconcile:debounce:${storeIntegrationId}`. Returns `true` on
newly acquired (caller should fire); `false` if lock held. Depends on
`RedisClient` from `@template/core-typescript`'s shared services (verify
import path at scaffold time — the `RedisExternalMediator` already uses
Redis, so the client is available). Test uses an in-memory Redis stub
(`ioredis-mock` or hand-rolled `Map<string, { value, expiresAt }>` shim).

### 22c — `ReconcileMarketingAccounts` use case

`@injectable()` + `extends Handler<typeof Input, typeof Output>`.
- `InputSchema`: `z.object({ storeId, storeIntegrationId: z.string().optional(), windowDays: z.number().int().positive(), actorId: z.string() })`.
- `OutputSchema`: `z.object({ triggered: z.number().int().nonnegative() })`.
- Body:
  1. Resolve the integration set:
     - If `storeIntegrationId` provided →
       `const integration = await this.storeIntegrationRepo.findById(storeIntegrationId)`;
       `STORE_INTEGRATION_NOT_FOUND` if absent; `[integration]`.
     - Else →
       `await this.storeIntegrationRepo.findByStoreIdAndType(storeId, 'MARKETING_PLATFORM', { active: true })`.
  2. `let triggered = 0; const endDate = new Date(); const startDate = new Date(endDate.getTime() - input.windowDays * 86400000)`.
  3. For each integration:
     - `if (!(await this.debouncer.tryAcquire(integration.id))) continue;`
     - `const credentials = await this.credentialSecret.read(integration.id);`
     - `await this.goWorker.reconcile({ platform: integration.platform as MarketingPlatform, credentials, adAccountId: integration.externalId, startDate: startDate.toISOString().slice(0, 10), endDate: endDate.toISOString().slice(0, 10) });`
     - `triggered++;`
  4. Return `{ triggered }`.

- [ ] **Test** (TestBed integration): mocks `GoWorkerMarketingClient` +
  `ReconcileDebouncer` + `IntegrationCredentialSecret`; seeds an integration;
  asserts: single-integration trigger, batch trigger across multiple,
  debounce-skip path returns `triggered: 0` when all locks held,
  `STORE_INTEGRATION_NOT_FOUND` on missing id, `GO_WORKER_UNAVAILABLE`
  bubbles from `reconcile()`.

### 22d — Controller

- `path = '/reconcile' as const`, `method = 'post' as const`.
- `202 Accepted` with `{ triggered }`.
- Mounted under `/v1/stores/:storeId/marketing/reconcile`.
- `errors: ['STORE_INTEGRATION_NOT_FOUND', 'VALIDATION_ERROR', 'GO_WORKER_UNAVAILABLE']`.

**Commit:** `feat(marketing): C38 ReconcileMarketingAccounts + GoWorker client + Redis debouncer (P7 Task 22)`.

**AC trace:** Spec §7.6 C38 input / output / errors; spec §7.13 (B) outbound
HTTP block; design decision §6.

---

## Task 23 — T20 + T21 + T22 BFF query use cases + controllers

**Files:**
- Create: `marketing/usecases/ListMarketingCampaigns.ts` + `.test.ts` +
  `marketing/controllers/ListMarketingCampaigns.ts`
- Create: `marketing/usecases/ListAdSpendBreakdown.ts` + `.test.ts` +
  `marketing/controllers/ListAdSpendBreakdown.ts`
- Create: `marketing/usecases/ListCampaignProductBindings.ts` + `.test.ts` +
  `marketing/controllers/ListCampaignProductBindings.ts`
- Create: `marketing/services/FxRateLookupService.ts` (stub returning 1.0).

**Phase:** 1H. **Classification:** parallel-after-wave-F.
**Skills:** `/query`, `/controller`.

These three are **BFF-style** query use cases: they own their Drizzle queries
directly (no entity rehydration), since the read shapes diverge from any
aggregate. They live in the marketing context (not under `ui/`) because they
read from this BC's own tables + minimal Catalog joins; cross-context joins
to Catalog products are tolerable here as a Drizzle `INNER JOIN catalog.products`
because no merchant write-side decision is being taken.

### 23a — `ListMarketingCampaigns` (T20)

- **Input:** `{ storeIds: string[], storeIntegrationIds?: string[], platforms?: MarketingPlatform[], statuses?: CampaignStatus[], search?: string, page: number, limit: number }`.
- **Query:**
  ```
  SELECT c.id, c.ad_account_external_id, NULL AS business_account_external_id, c.external_id,
         c.name, c.platform, c.status,
         COALESCE(s.amount_cents, 0) AS total_spend_cents, c.currency,
         COALESCE(b.bound_product_count, 0) AS bound_product_count,
         c.external_created_at
  FROM marketing.campaigns c
  LEFT JOIN (SELECT campaign_id, SUM(amount_cents) AS amount_cents
             FROM marketing.ad_spends GROUP BY campaign_id) s ON s.campaign_id = c.id
  LEFT JOIN (SELECT campaign_id, COUNT(*) AS bound_product_count
             FROM marketing.campaign_product_bindings GROUP BY campaign_id) b ON b.campaign_id = c.id
  WHERE c.store_id = ANY ($1) [+ filter clauses]
  ORDER BY c.external_created_at DESC
  LIMIT $page * $limit OFFSET ($page - 1) * $limit
  ```
- **Output shaping:** wrap `total_spend_cents` in
  `{ amountCents, currency }`; `totalSpendInReportingCurrency` is converted
  via `FxRateLookupService.convert(today, fromCurrency, store.reportingCurrency, amountCents)` —
  stub returns input unchanged until P9-FINANCE lands.
- **Controller:** `path = '/campaigns'`, `method = 'get'`.

### 23b — `ListAdSpendBreakdown` (T21)

- **Input:** `{ dateRange: { startDate: string; endDate: string }, storeIds: string[], platforms?: MarketingPlatform[], campaignExternalIds?: string[], adAccountExternalIds?: string[], adSpendType?: AdSpendType, groupBy: 'DAY' | 'HOUR' | 'CAMPAIGN' | 'AD_ACCOUNT' | 'PLATFORM' }`.
- **Query:** uses `AdSpendProjectionRepository.aggregateForBreakdown(...)`
  from Task 9. For each output bucket: build
  `spend: Partial<Record<CurrencyCode, number>>` from the per-currency
  totals, then `spendInReportingCurrency = sum over currencies of fx.convert(bucketDate, currency, reportingCurrency, amountCents)`.
  `roas` left `undefined` here — defer to Analytics BC when revenue side is
  computable.
- **Controller:** `path = '/ad-spend'`, `method = 'get'`.

### 23c — `ListCampaignProductBindings` (T22)

- **Input:** `{ storeIds: string[], campaignId?: string, productId?: string, page: number, limit: number }`.
- **Query:**
  ```
  SELECT b.id AS binding_id, b.store_id, b.campaign_id, c.name AS campaign_name, c.platform,
         b.product_id, b.variant_id, p.title AS product_title, b.created_at
  FROM marketing.campaign_product_bindings b
  INNER JOIN marketing.campaigns c ON c.id = b.campaign_id
  LEFT JOIN catalog.products p ON p.id = b.product_id
  WHERE b.store_id = ANY ($1) [+ filters]
  ORDER BY b.created_at DESC
  LIMIT … OFFSET …
  ```
- **Output shaping:** collapse rows by `binding_id` into the spec's
  `{ bindingId, storeId, campaignId, campaignName, platform, productIds: string[], productTitles: string[], variantIds: string[], boundAt }`
  shape (group by `binding_id` and aggregate `product_id` / `variant_id` /
  `product_title` into arrays — even though schema is one-row-per-bind, the
  output shape is per-campaign group; do the grouping in the use case after
  the SQL returns).
- **Controller:** `path = '/campaign-bindings'`, `method = 'get'`.

> # QUESTION: P9-FINANCE `FxRateRepository.findEffectiveOn(date, from, to) → number` — the stub `FxRateLookupService` returns `1.0` and is one swap away from a real implementation. Confirm the contract name when P9-FINANCE lands; remove the stub.

**Commit:** `feat(marketing): T20 + T21 + T22 query use cases + controllers (P7 Task 23)`.

**AC trace:** Spec §7.6 T20 / T21 / T22 (input / output / errors); design
decision §5 (MonetaryByCurrency).

---

## Task 24 — Internal handlers (3) — re-publish for Analytics

**Files:**
- Create: `marketing/handlers/AdSpendRecordedManualHandler.ts`
- Create: `marketing/handlers/CampaignProductBindingCreatedHandler.ts`
- Create: `marketing/handlers/CampaignProductBindingRemovedHandler.ts`
- Modify: `marketing/handlers/internal.ts` (re-export all three).

**Phase:** 2I. **Classification:** serial (shared file edit).
**Skills:** `/handler`.

Each handler `extends EventHandler<typeof <LocalEvent>>`, calls
`this.externalMediator.publish(new <TsPublishedIntegrationEvent>({...}))`
with the matching wire-event class from
`@template/contracts-typescript/wire` (the 3 events authored in Task 4).
Pattern sibling: `notifications/handlers/NotifySubscribersHandler.ts`.

Tests (`integration` mode): dispatch each local event via outbox; assert
`MockExternalMediator.published` contains the corresponding wire event with
the correct `name` and payload.

**Commit:** `feat(marketing): internal handlers re-publish MANUAL AdSpend + binding events for Analytics (P7 Task 24)`.

**AC trace:** Spec §7.13 (C) intra-API `Marketing → Analytics`.

---

## Task 25 — External handlers (2) — wipe cascade + reconcile chain

**Files:**
- Create: `marketing/handlers/StoreIntegrationDataWipeHandler.ts`
- Create: `marketing/handlers/MarketingReconciliationCompletedHandler.ts`
- Modify: `marketing/handlers/external.ts` (re-export both).

**Phase:** 2I. **Classification:** serial.

### `StoreIntegrationDataWipeHandler`

`extends EventHandler<typeof StoreIntegrationDataWipeRequestedEvent>`
(from `@template/contracts-typescript/wire` — authored in P4). Deletes
canonical rows scoped to the wiped `storeIntegrationId` across all four
projection repositories. MANUAL `ad_spends` and `campaign_product_bindings`
are NOT touched (per design decision §7).

```typescript
async handle(event: this['input']): Promise<this['output']> {
  const { storeIntegrationId } = event.payload
  await this.unitOfWorkFactory.run(async tx => {
    await this.campaignRepo.deleteByStoreIntegrationId(storeIntegrationId, tx)
    await this.adSetRepo.deleteByStoreIntegrationId(storeIntegrationId, tx)
    await this.adRepo.deleteByStoreIntegrationId(storeIntegrationId, tx)
    await this.adSpendRepo.deleteByStoreIntegrationId(storeIntegrationId, tx)  // filters type='AUTOMATIC' internally
  })
}
```

Test: seed 1 Campaign + 1 AUTOMATIC ad_spend + 1 MANUAL ad_spend + 1
binding for a known integration; dispatch event; assert Campaign +
AUTOMATIC ad_spend deleted; MANUAL ad_spend + binding preserved.

### `MarketingReconciliationCompletedHandler`

No-op chain hook. Subscription exists so the event is routed to this BC
(future projector / cache invalidator can take over without changing wire
routing). Body returns immediately.

```typescript
async handle(): Promise<void> { return }
```

Test: trivial; asserts `this.event === MarketingReconciliationCompletedEvent`.

**Commit:** `feat(marketing): external handlers — cascade wipe + reconciliation chain hook (P7 Task 25)`.

**AC trace:** Spec §4 BC6 line "MANUAL AdSpend, ManualMarketingExpense,
CampaignProductBindings NOT cascade-deleted"; spec §7.13 (A) `marketing_reconciliation.completed → Marketing, Analytics`.

---

## Task 26 — BoundedContext wiring + router mount + ALL_REGISTRIES

**Files:**
- Create: `marketing/index.ts`
- Create: `marketing/registry.ts`
- Create: `marketing/middlewares/index.ts`
- Modify: `packages/api/typescript/src/index.ts` (import + spread
  `MarketingRouter` into `routers[]`).
- Modify: `packages/api/typescript/src/shared/registry.ts` (import
  `marketingRegistry` + spread into `ALL_REGISTRIES.mock / integration / real`).

**Phase:** 2J. **Classification:** serial.
**Skills:** `/bounded-context`.

- [ ] **`index.ts`** (sibling: `auth/index.ts`):

```typescript
import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import * as projectors from './projections/projectors'

const ctx = await BoundedContext.create({
  name: 'marketing',  // verify whether MainRouter prepends 'marketing/' or whether path is taken from controllers
  controllers,
  internalHandlers,
  externalHandlers,
  projectors,
  registry: INSTANCE_REGISTRY,
})

export default ctx.router
```

- [ ] **`registry.ts`** (sibling: `auth/registry.ts`):

```typescript
import './errors'  // side-effect: registers error codes with the framework runtime registry
import type { InstanceRegistry } from '@template/core-typescript'
import { AdSpendRepository } from './repositories/AdSpendRepository/AdSpendRepository'
import { DrizzleAdSpendRepository } from './repositories/AdSpendRepository/DrizzleAdSpendRepository'
import { MockAdSpendRepository } from './repositories/AdSpendRepository/MockAdSpendRepository'
import { CampaignProductBindingRepository } from './repositories/CampaignProductBindingRepository/CampaignProductBindingRepository'
import { DrizzleCampaignProductBindingRepository } from './repositories/CampaignProductBindingRepository/DrizzleCampaignProductBindingRepository'
import { MockCampaignProductBindingRepository } from './repositories/CampaignProductBindingRepository/MockCampaignProductBindingRepository'
import { CampaignProjectionRepository } from './projections/repositories/CampaignProjectionRepository/CampaignProjectionRepository'
import { DrizzleCampaignProjectionRepository } from './projections/repositories/CampaignProjectionRepository/DrizzleCampaignProjectionRepository'
import { AdSetProjectionRepository } from './projections/repositories/AdSetProjectionRepository/AdSetProjectionRepository'
import { DrizzleAdSetProjectionRepository } from './projections/repositories/AdSetProjectionRepository/DrizzleAdSetProjectionRepository'
import { AdProjectionRepository } from './projections/repositories/AdProjectionRepository/AdProjectionRepository'
import { DrizzleAdProjectionRepository } from './projections/repositories/AdProjectionRepository/DrizzleAdProjectionRepository'
import { AdSpendProjectionRepository } from './projections/repositories/AdSpendProjectionRepository/AdSpendProjectionRepository'
import { DrizzleAdSpendProjectionRepository } from './projections/repositories/AdSpendProjectionRepository/DrizzleAdSpendProjectionRepository'
import { GoWorkerMarketingClient } from './services/GoWorkerMarketingClient'
import { ReconcileDebouncer } from './services/ReconcileDebouncer'
import { FxRateLookupService } from './services/FxRateLookupService'

export const INSTANCE_REGISTRY: InstanceRegistry = {
  mock: [
    { token: AdSpendRepository, instance: MockAdSpendRepository },
    { token: CampaignProductBindingRepository, instance: MockCampaignProductBindingRepository },
    { token: CampaignProjectionRepository, instance: DrizzleCampaignProjectionRepository },
    { token: AdSetProjectionRepository, instance: DrizzleAdSetProjectionRepository },
    { token: AdProjectionRepository, instance: DrizzleAdProjectionRepository },
    { token: AdSpendProjectionRepository, instance: DrizzleAdSpendProjectionRepository },
    { token: GoWorkerMarketingClient, instance: GoWorkerMarketingClient },
    { token: ReconcileDebouncer, instance: ReconcileDebouncer },
    { token: FxRateLookupService, instance: FxRateLookupService },
  ],
  integration: [
    { token: AdSpendRepository, instance: DrizzleAdSpendRepository },
    { token: CampaignProductBindingRepository, instance: DrizzleCampaignProductBindingRepository },
    { token: CampaignProjectionRepository, instance: DrizzleCampaignProjectionRepository },
    { token: AdSetProjectionRepository, instance: DrizzleAdSetProjectionRepository },
    { token: AdProjectionRepository, instance: DrizzleAdProjectionRepository },
    { token: AdSpendProjectionRepository, instance: DrizzleAdSpendProjectionRepository },
    { token: GoWorkerMarketingClient, instance: GoWorkerMarketingClient },
    { token: ReconcileDebouncer, instance: ReconcileDebouncer },
    { token: FxRateLookupService, instance: FxRateLookupService },
  ],
  real: [
    { token: AdSpendRepository, instance: DrizzleAdSpendRepository },
    { token: CampaignProductBindingRepository, instance: DrizzleCampaignProductBindingRepository },
    { token: CampaignProjectionRepository, instance: DrizzleCampaignProjectionRepository },
    { token: AdSetProjectionRepository, instance: DrizzleAdSetProjectionRepository },
    { token: AdProjectionRepository, instance: DrizzleAdProjectionRepository },
    { token: AdSpendProjectionRepository, instance: DrizzleAdSpendProjectionRepository },
    { token: GoWorkerMarketingClient, instance: GoWorkerMarketingClient },
    { token: ReconcileDebouncer, instance: ReconcileDebouncer },
    { token: FxRateLookupService, instance: FxRateLookupService },
  ],
}
```

- [ ] **`middlewares/index.ts`:**

```typescript
import { requireRole } from '@tenancy/middlewares'
export default [requireRole(['OWNER', 'ADMIN', 'MEMBER'])]
```

(If P2-TENANCY ships `requireRole` under a different path, follow that
export. If P2 is not yet present on the branch, ship a temporary
no-op middleware here and TODO-link to P2.)

- [ ] **Modify `packages/api/typescript/src/index.ts`:** import
  `MarketingRouter from '@marketing/index'`; append to `const routers = [SharedRouter, AuthRouter, NotificationsRouter, UIRouter, MarketingRouter]`.
- [ ] **Modify `packages/api/typescript/src/shared/registry.ts`:** import
  `INSTANCE_REGISTRY as marketingRegistry from '@marketing/registry'`; spread
  into the three `ALL_REGISTRIES` arrays alongside `authRegistry`,
  `notificationsRegistry`, `uiRegistry`.
- [ ] **Verify `bun tsc && bun lint && bun run test`** — 0 errors, no
  regressions.

**Commit:** `feat(marketing): BoundedContext wiring + INSTANCE_REGISTRY + router mount (P7 Task 26)`.

**AC trace:** All Task-resolved tokens reachable through ALL_REGISTRIES;
HTTP routes mounted.

---

## Task 27 — Given helpers

**Files:**
- Create: `packages/api/typescript/tests/support/given/givenCampaignProjection.ts`
- Create: `packages/api/typescript/tests/support/given/givenAdSpend.ts`
- Create: `packages/api/typescript/tests/support/given/givenCampaignProductBinding.ts`

**Phase:** 2J. **Classification:** parallel-with-26.

Each helper takes the TestBed instance + an `overrides` object, builds the
shape via the matching repository (`save` / `insertIfNew`), and returns the
created record. `givenAdSpend` defaults `type: 'MANUAL'` with sensible
defaults for `storeId`, `amountCents`, `currency`, `startDate`, `endDate`,
`bindings: []`; passing `{ type: 'AUTOMATIC' }` switches the helper to insert
through the projection repository instead. Sibling pattern for layout +
naming: any existing `given*.ts` under `packages/api/typescript/tests/support/given/`
(verify there's at least one already there from P1).

**Commit:** `test(marketing): given helpers for projection + AdSpend + binding (P7 Task 27)`.

**AC trace:** Test support — enables all per-task tests to seed state without
calling use cases.

---

## Task 28 — Final Validation + SDK regen + AC mapping + progress log

**Files:**
- Modify: `packages/client/` (auto via `bun sdk`).
- Modify: `packages/api/typescript/public/docs/openapi.json` (auto via
  `bun emit-openapi`).
- Modify: `.plans/2026-05-21-bk-dash-port.progress.md` (append).

**Phase:** 2K. **Classification:** serial.

- [ ] **Step 1: Quality gates**

```bash
bun tsc                       # 0 errors
bun lint                      # 0 errors
bun run test                  # 0 failed
```

If any gate fails, stop and fix in a follow-up task in this sub-plan; do
not declare complete.

- [ ] **Step 2: SDK + OpenAPI**

```bash
bun emit-openapi              # regenerates packages/api/typescript/public/docs/openapi.json
bun sdk                       # rebuilds packages/client/
bun tsc                       # confirm app side still compiles after SDK change
```

- [ ] **Step 3: AC mapping** — verify every row has a passing test:

| Spec ID | Where covered | Test file |
|---|---|---|
| C33 RecordManualAdSpend | Task 17 use case + controller | `marketing/usecases/RecordManualAdSpend.test.ts` |
| C34 UpdateManualAdSpend | Task 18 | `marketing/usecases/UpdateManualAdSpend.test.ts` |
| C35 DeleteManualAdSpend | Task 19 | `marketing/usecases/DeleteManualAdSpend.test.ts` |
| C36 BindCampaignToProduct | Task 20 | `marketing/usecases/BindCampaignToProduct.test.ts` |
| C37 UnbindCampaignFromProduct | Task 21 | `marketing/usecases/UnbindCampaignFromProduct.test.ts` |
| C38 ReconcileMarketingAccounts | Task 22 (+ debouncer + GoWorker client tests) | `marketing/usecases/ReconcileMarketingAccounts.test.ts` |
| T20 MarketingCampaignsList | Task 23 | `marketing/usecases/ListMarketingCampaigns.test.ts` |
| T21 AdSpendBreakdown | Task 23 | `marketing/usecases/ListAdSpendBreakdown.test.ts` |
| T22 CampaignProductBindings | Task 23 | `marketing/usecases/ListCampaignProductBindings.test.ts` |
| `integration.shared.campaign.updated` consumed | Task 10 | `marketing/projections/projectors/CampaignProjector.test.ts` |
| `integration.shared.campaign.status_changed` consumed | Task 10 | same |
| `integration.shared.ad_set.updated` consumed | Task 11 | `marketing/projections/projectors/AdSetProjector.test.ts` |
| `integration.shared.ad.updated` consumed | Task 12 | `marketing/projections/projectors/AdProjector.test.ts` |
| `integration.shared.ad_spend.recorded` (AUTOMATIC) consumed | Task 13 | `marketing/projections/projectors/AdSpendProjector.test.ts` |
| `integration.shared.marketing_reconciliation.completed` consumed | Task 25 | `marketing/handlers/MarketingReconciliationCompletedHandler.test.ts` |
| `integration.shared.store_integration.data_wipe_requested` cascade | Task 25 | `marketing/handlers/StoreIntegrationDataWipeHandler.test.ts` |
| `integration.marketing.ad_spend.recorded_manual` published | Task 24 | `marketing/handlers/AdSpendRecordedManualHandler.test.ts` |
| `integration.marketing.campaign_product_binding.created` published | Task 24 | `marketing/handlers/CampaignProductBindingCreatedHandler.test.ts` |
| `integration.marketing.campaign_product_binding.removed` published | Task 24 | `marketing/handlers/CampaignProductBindingRemovedHandler.test.ts` |
| `MarketingErrors` ⊂ spec §7.14 | Task 5 | declarative — `grep -r 'MarketingErrors' packages/api/typescript/src/marketing/` |
| `MonetaryByCurrency` aggregation | Task 23 (T21) | `marketing/usecases/ListAdSpendBreakdown.test.ts` |
| `ManualMarketingExpenseBinding` discriminated union preserved | Task 14 + Task 17 | `marketing/entities/AdSpend.test.ts`, `marketing/usecases/RecordManualAdSpend.test.ts` |
| `/marketing/reconcile/<platform>` Go contract | Task 2 | markdown contract doc (no test) |

- [ ] **Step 4: Append to progress log**

```markdown
- 2026-05-XX P7-MARKETING complete: 28 tasks, BC6 fully ported to polyglot
  layout (4 projections + 4 projectors + 2 write-side aggregates + 9
  controllers + 3 BFF queries + 3 internal handlers + 2 external handlers).
- bun tsc / lint / test: green; bun sdk regenerated; openapi.json updated.
- Blocked: none. Open soft dep: P9-FINANCE `FxRateRepository` — stub
  `FxRateLookupService` in place; one-line swap when P9 lands.
- Next iteration: any of the remaining sub-plans whose deps are satisfied
  (typically P8-TRACKING or P11-ANALYTICS).
```

- [ ] **Step 5: Commit & PR-ready check**

```bash
git status                   # clean
git add packages/client/ packages/api/typescript/public/docs/openapi.json \
        .plans/2026-05-21-bk-dash-port.progress.md
git commit -m "feat(marketing): finalize P7 — SDK regen + AC mapping + progress log (P7 Task 28)"
```

**AC trace:** Every spec C33–C38 / T20–T22 / event row above ties to a green
test.

---

## Final Validation

- [ ] `bun tsc` → 0 errors
- [ ] `bun lint` → 0 errors
- [ ] `bun run test` → 0 failed (counts every new colocated test under
  `packages/api/typescript/src/marketing/` + every existing suite still
  green)
- [ ] `bun emit-openapi && bun sdk` → produces a non-empty diff in
  `packages/api/typescript/public/docs/openapi.json` and `packages/client/`;
  both committed
- [ ] `git status` clean on `v1.8`
- [ ] AC mapping table (Task 28 Step 3) — every row green
- [ ] Only `# QUESTION:` line is on `FxRateRepository` (P9 soft dep);
  documented in the progress log

---

## Dependencies (footer)

**Hard dependencies (must be done first):**
1. **Iter 41 (contracts/wire)** — pre-authored marketing enums + Go-published
   integration events (`Campaign{Updated,StatusChanged}Event`,
   `AdSetUpdatedEvent`, `AdUpdatedEvent`, `AdSpendRecordedEvent`,
   `MarketingReconciliationCompletedEvent`). This sub-plan extends with
   3 new TS-published events in Task 4.
2. **Iter 42 (contracts/db/schema)** — pre-authored marketing tables
   (`campaigns`, `ad_sets`, `ads`, `ad_spends`, `campaign_product_bindings`).
3. **P2-TENANCY** — `stores` table, `requireRole` middleware,
   `givenStore` / `givenStoreWithOwner` helpers.
4. **P4-INTEGRATION** — `StoreIntegrationRepository` (used by all four
   projectors + C38 use case) and `IntegrationCredentialSecret` reader (C38
   credentials lookup) and `StoreIntegrationDataWipeRequestedEvent`
   (consumed by Task 25).
5. **P5-CATALOG** — `ProductRepository` + `VariantRepository` (binding
   validation in C33/C36); `catalog.products` table joined by T22.
6. **PG-GO-WORKER** — publishes the 5 Go-side marketing topics on Redis
   Streams + exposes `POST /marketing/reconcile/<platform>` per the contract
   doc landed in Task 2. Reads `packages/contracts/db/schema/marketing.ts`
   for canonical UPSERTs.

**Soft dependencies (cited via `# QUESTION:`):**
- **P9-FINANCE** — `FxRateRepository.findEffectiveOn` used by T20 + T21
  reporting-currency conversion. Stub `FxRateLookupService` in Task 23
  returns input unchanged; one-line swap when P9 ships.
- **P11-ANALYTICS** — consumes the 3 TS-published events from Task 4 plus
  `marketing_reconciliation.completed` (chained through Task 25). Analytics
  doesn't need to be present for P7 to be complete — handlers publish and
  subscribe by name; Analytics binds later.

**Parallelizable internal waves** (per task-breakdown table):
- Tasks 6, 7, 8, 9 (Wave B — projections) — each on a separate agent.
- Tasks 10, 11, 12, 13 (Wave C — projectors) — likewise after their Wave-B
  counterpart lands.
- Tasks 14, 15 (Wave D — write-side entities) — parallel-after-contract.
- Tasks 17–21 (Wave F — manual ad-spend + binding use cases / controllers) —
  parallel-after Wave E.
- Task 22 (C38) needs Tasks 15 + 16 to have landed.
- Task 23 (T20 + T21 + T22) parallel-after Wave F.
- Tasks 24 + 25 (handlers) serial because both edit
  `handlers/internal.ts` / `handlers/external.ts` respectively (one editor
  at a time avoids merge conflicts in the re-export barrels).

**Total:** 28 Tasks, ~480 minutes, ~55 new files + 2 modified +
3 new .tsp + 1 new contract doc.

---

## Notes for future iterations

- After this sub-plan, **P8-TRACKING** can land in parallel with
  **P9-FINANCE** (neither depends on the other beyond shared P2 / P4).
- The single `# QUESTION:` on `FxRateRepository` should be the only
  hand-off when this sub-plan finishes — enumerate it in the progress log so
  P9-FINANCE picks up the contract.
- The `marketing.ad_spends` table is the only table in this BC that contains
  **rows owned by two different writers** (Go for AUTOMATIC, TS for MANUAL).
  This design is per spec §4 BC6 and reflected in the existing Drizzle
  schema — do **not** split it. If a future iteration proposes splitting
  (e.g., `ad_spends` + `manual_ad_spends`), require a spec revision before
  proceeding.
- The TS-published events authored in Task 4 use the `integration.marketing.*`
  namespace (not `integration.shared.*`) to signal TS ownership. Keep the
  namespace convention when extending.
- Cross-platform skill versions: this sub-plan uses
  `.claude/skills/{projection,projector,test,handler,event,entity,errors,schema,repository,usecase,controller,sdk,migrate}/typescript/SKILL.md`
  (where they exist) — defer to the dispatch root SKILL.md when a TS-specific
  child is absent.
