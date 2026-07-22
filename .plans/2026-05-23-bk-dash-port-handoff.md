# BK Dash Port — Handoff (v3 loop, conversation iters 302–348)

**Branch:** `feat/bk-dash-polyglot`
**Last commit at handoff:** `58f1c4ff` (iter 347)
**Loop file (source of truth):** `.plans/2026-05-22-bk-dash-finish-ralph-prompt.md`
**Test state:** 1098 pass / 0 fail / 2549 expect across 181 files. `bun tsc`, `bun sdk`, `nx run-many -t tsc --exclude=app-react,e2e` (7/7), `go build` + `go test` all green.

---

## 1. What this is

This document hands off the work shipped between iters **302–348** of the v3 finishing loop. The conversation took the BK Dash port from "all Phase B/C/D BCs landed but ~6 Mock-only repos remained + Phase A SDK regen broken" to "all 14 Mock-only repos closed, all 4 cross-BC service ports real-wired, 30/30 Drizzle adapter dedicated tests, Phase G scoped reviews across 9 BCs, only Phase F E2E (user-deferred per iter 258) blocking the completion promise."

The loop itself runs against `.plans/2026-05-22-bk-dash-finish-ralph-prompt.md` — read that file for protocol rules. This handoff is the **post-state snapshot + the knowledge that wouldn't be obvious from git log or progress.md alone**.

---

## 2. Spec reference

| Doc | Path | What lives there |
|---|---|---|
| Domain spec | `.specs/2026-05-21-ddd-modeling-bk-dash.md` | BC1–BC11 definitions, C01–C57 commands, T01–T39 reads, § 5 context relationships, integration-event catalogue |
| Architecture | `CLAUDE.md`, `docs/BACKEND.md` | DDD + Clean Arch + CQRS + event-driven invariants, first-class citizen vocabulary |
| Loop protocol | `.plans/2026-05-22-bk-dash-finish-ralph-prompt.md` | v3 ralph-loop prompt body (supersedes v1) |
| Master plan | `.plans/2026-05-21-bk-dash-port.md` | Phase 0–G break-down |
| **Live progress log** | `.plans/2026-05-21-bk-dash-port.progress.md` | Iters 324–348 (iter 348 archived earlier entries) |
| **Archived log** | `.plans/2026-05-21-bk-dash-port.progress.archive.md` | Iters 1–323 |
| **Known gaps + catalogue** | `.plans/2026-05-22-bk-dash-known-gaps.md` | Divergence-blocked entries, catalogued false-positives (§ 5 + § 6 + § 8) |
| **This handoff** | `.plans/2026-05-23-bk-dash-port-handoff.md` | What you're reading |

### Per-BC implementation coverage at handoff

| BC | Aggregates | Drizzle repo | Dedicated test | Phase G reviewed |
|---|---|---|---|---|
| BC1 Identity (Auth) | User, Account, UserProfile, UserPreferences, FcmRegistrationToken | ✅ all | ✅ (User/Account intentionally skipped — BetterAuth-managed) | iter 347 (1 cross-BC port) |
| BC2 Tenancy | Store, StoreMembership, StoreInvitation | ✅ all (pre-302) | ✅ (pre-302) | — (3 cross-BC ports reviewed iter 345/347) |
| BC3 Billing | Subscription | ✅ (iter 97) | ✅ (pre-302) | iter 345 |
| BC4 Integration | StoreIntegration, IntegrationCredentialSecret | ✅ (iters 314/315) | ✅ (iters 330/337) | iter 343 |
| BC5 Catalog | Product (Go-owned), ProductCost | ✅ (iters 310/320) | ✅ (iters 334/335) | iter 344 |
| BC6 Sales | Order (Go-owned), OrderOverride, CartProjection, OrderProjection | ✅ (pre-302 + iter 318 cross-BC port) | ✅ (iter 339) | iter 329 |
| BC7 Marketing | Campaign (Go-owned read), CampaignProductBinding, AdSpend | ✅ (iters 311/312/322) | ✅ (iters 328/333) | iters 332 + 346 |
| BC8 Finance | Taxes, FxRate, WarrantyReserve, OperationalCost, FeesConfiguration | ✅ (iters 302/303/305/306/307) | ✅ (iters 330/331) | iter 345 (5/5 CLEAN) |
| BC9 Tracking | (pixel_events via Go) | ✅ (pre-302 dedupe index) | — | — |
| BC10 Notifications | BkdashNotification, BkdashNotificationDelivery, SubscriptionRead | ✅ (iter 313 schema rebuild) | ✅ (iters 336/338) | iter 342 |
| BC11 Analytics | Goal | ✅ (iter 301) | ✅ (iter 332) | iter 341 |
| UI (ports + projections) | VideoFeedProjection | ✅ (pre-302) | ✅ (iter 340) | — |

**Commands C01–C57:** 54 explicit + 3 BetterAuth pass-through (C02 SignUp / C03–C04 SignIn-SignOut / C05–C07 password flows). Verified via grep, iter 324.

**Reads T01–T39:** 35 TS-API + 3 frontend pages (T02/T03/T04 on app/react) + T34 GoalsList (relabeled iter 324; was mislabeled T32 in code). Verified via grep, iter 324.

**Go worker spec § Outbound Commands endpoints:** All 3 served — `/integrations/handshake` (iter 325, new), `/sync`, `/marketing/reconcile`. Plus 9 inbound webhook controllers (Shopify/CartPanda/GoogleAds/Kiwify/Meta/NuvemShop/Stripe/TikTok/Yampi).

---

## 3. Production artifacts shipped (iter 302–322)

### 14 Drizzle repository adapters

These are all bound for `integration` + `real` envs in their BC's `registry.ts`. `mock` env keeps the Mock impl (used by `flow`-style tests + fast unit harnesses).

| Iter | Adapter | BC | Notes |
|---|---|---|---|
| 301 | DrizzleGoalRepository | analytics | Required schema migration 0020 (added `user_id` column — entity had it; DB didn't) |
| 302 | DrizzleTaxesRepository | finance | UPSERT keyed by deterministic id, `incrementVersion` bump |
| 303 | DrizzleFxRateRepository | finance | Required migration 0021 — `rate` column `doublePrecision`→`text` to preserve provider-side decimal precision (`'5.10'` must NOT become `5.1`) |
| 305 | DrizzleWarrantyReserveRepository | finance | Required migration 0022 — rename `start_date`/`end_date`→`effective_from`/`effective_to` + add `deleted_at` (entity carries soft-delete dimension distinct from supersession window) |
| 306 | DrizzleOperationalCostRepository | finance | Required migration 0023 — rename `label`→`description`, drop `payment_method` + `active` (entity uses `deletedAt` alone) |
| 307 | DrizzleFeesConfigurationRepository | finance | Required migration 0024 — rename `shipping_fees`→`shipping_fee` (singular per spec) + DROP NOT NULL |
| 310 | DrizzleProductRepository | catalog | Narrow tag-mutation surface only (spec § BC5 — rest of `catalog.products` is Go-owned); RMW with `sql\`${products.version} + 1\`` |
| 311 | DrizzleCampaignRepository | marketing | Read-only (TS never writes — Go is single writer); returns T20 projection (campaign list + adAccountExternalId + lifetimeSpendCents + currency added iter 324) |
| 312 | DrizzleCampaignProductBindingRepository | marketing | Batch bindMany (`ON CONFLICT DO NOTHING`) + unbindMany (DELETE WHERE) + listByStore (`array_agg(DISTINCT) FILTER (WHERE ... IS NOT NULL)`) |
| 313 | DrizzleBkdashNotification + Delivery | notifications | Required migration 0025 — BC10 schema realignment: dropped iter-12 recipient-bound shape; rebuilt as creator-bound (one notification, N delivery rows fan-out). |
| 314 | DrizzleStoreIntegrationRepository | integration | Required migration 0026 — 8 ADD COLUMN (displayName, credentialSecretId, valid, lastHandshakeAt, connectedAt, disconnectedAt, ownerId) + rename `is_active`→`active`. Largest schema delta of the conversation. |
| 315 | DrizzleIntegrationCredentialSecretRepository | integration | Required migration 0027 — added `rotated_at` column. Unblocked iter 309's "FK-blocked" status now that iter 314's StoreIntegration has a real table. |
| 320 | DrizzleProductCostRepository | catalog | Required migration 0028 — **DROP TABLE `product_cost_options`** + ADD `options jsonb` (inlined, 6 ADD COLUMN + 1 partial UNIQUE INDEX). Aggregates always read as complete docs; child table was pure complexity tax. |
| 322 | DrizzleAdSpendRepository | marketing | 8-col realignment (most complex of conversation — adds entity-shape columns while preserving Go-owned legacy `bucketStart` + `manualBinding` so AUTOMATIC writes from Go pipelines continue working). |

### 4 cross-BC service-port adapters (Tenancy needs them — implementing BC owns the adapter, registered via load-order override)

| Iter | Adapter | Implementing BC | Token (from tenancy) |
|---|---|---|---|
| 316 | BillingSubscriptionQueryService | billing | SubscriptionQueryService |
| 317 | AuthUserDirectoryService | auth | UserDirectoryService |
| 318 | SalesOrderSamplingService | sales | OrderSamplingService |
| 319 | AesCredentialVault (env-driven) | integration | CredentialVault |

Load order: tenancy registers first; the providing BC's later entry wins via the `INSTANCE_REGISTRY` array order in `packages/api/typescript/src/shared/registry.ts`. Tests use `mock` env which keeps tenancy's Mock; production envs get the real impl.

### Other notable changes

| Iter | What | Why |
|---|---|---|
| 308 | `packages/contracts/codegen/emit-wire-rs.ts` — added `RUST_RESERVED_KEYWORDS` Set; `snake(name)` now wraps with `r#` for raw-identifier escape | `IntegrationActivatedIntegrationEvent.type` was generating unparseable Rust source (`type` is reserved). Unblocked `bun sdk` end-to-end. |
| 321 | `core/src/utils/Config.ts` — added `GO_WORKER_BASE_URL` env var | HttpGoSyncWorkerClient needed a binding for the Go base URL. Default `http://localhost:3032` matches docker-compose. |
| 324 | `analytics/usecases/GetGoals.ts` doc comment T32→T34 | Mislabel from earlier iter; T34 is spec's `GoalsList`, T32 is `ProductPerformanceReport` |
| 324 | `marketing/repositories/CampaignRepository.ts` doc T18→T20 + `CampaignListRow` extended with `adAccountExternalId` / `lifetimeSpendCents` / `currency` per spec T20 | Was previously mislabeled + missing 3 spec-T20 fields |
| 325 | `packages/api/go/internal/sync/controllers/integrations_handshake.go` — new POST `/integrations/handshake` controller | Required by spec § Outbound Commands; was missing |
| 327 | `bun sdk` regen — 21 files (Kubb + progenitor + oapi-codegen cascade) | Iter 324's T20 schema widening rippled through SDK |
| 348 | `progress.md` rolling archive | Per v3 § Step 4 PROGRESS LOG DISCIPLINE; iters 1–323 moved to archive |

---

## 4. Schema migrations 0020–0028 — the design-call rationale

This conversation shipped 9 schema migrations. Each was a **design call** about whether to adjust the entity to fit the DB, or adjust the DB to fit the entity. The recurring decision rule we landed on:

> **Schema follows entity, not the other way around.** The entity contract embodies the business invariants (often paired with typed `BaseError<DomainErrors>` throws asserted in tests + mapped to HTTP statuses). The DB schema is an implementation detail. When the two diverge, change the DB unless that breaks Go-side writes (in which case keep both column sets).

| Migration | What it does | Why |
|---|---|---|
| 0020 `goals` | ADD COLUMN `user_id uuid not null` | C52 `DuplicateLastGoal` needs `findLastByUserAndStore(userId, storeId)`; user dimension is required because two members of the same store can have independent goal-history streams |
| 0021 `fx_rates` | `rate` `doublePrecision`→`text` | Provider returns `'5.10'`; double silently coerces to `5.1`. Queries sort by `start_date` (not `rate`), so giving up numeric semantics is fine |
| 0022 `warranty_reserves` | rename `start_date`/`end_date`→`effective_from`/`effective_to` + ADD `deleted_at` | Spec separates supersession-window from soft-delete-stamp; conflating them under `start_date`/`end_date` (like Taxes does because Taxes has no soft-delete) would lose audit semantics |
| 0023 `operational_costs` | rename `label`→`description`, drop `payment_method` + `active` | Entity uses `description`; spec aspired to `paymentMethod` + `active` columns but the aggregate never grew up to need them. `deletedAt` alone is the canonical "non-active" signal |
| 0024 `fees_configuration` | rename `shipping_fees`→`shipping_fee` (singular) + DROP NOT NULL | Spec + entity model a single shipping fee per row; iter-12 schema mistakenly went plural to mirror `gateway_fees`/`checkout_fees` arrays |
| 0025 `notify` schema | DROP iter-12 recipient-bound tables + CREATE creator-bound tables matching BC10 entity contract | Schema was modeling notifications as RECIPIENT-bound with single `contentHash`; entity is CREATOR-bound with separate per-recipient delivery rows. Pure rebuild — no production code referenced the old tables |
| 0026 `store_integrations` | ADD `display_name`/`credential_secret_id`/`valid`/`last_handshake_at`/`connected_at`/`disconnected_at`/`owner_id`; rename `is_active`→`active` | Biggest delta: entity had 14 fields, DB only had 6. Grew DB to match entity; defaults backfill safely (active false, valid false, connectedAt now()) |
| 0027 `integration_credentials` | ADD `rotated_at timestamp` | Entity tracks `rotatedAt` for "last credential rotation" audit; column was missing |
| 0028 `product_costs` | DROP TABLE `product_cost_options` + ADD `options jsonb` + 5 ADD COLUMN + partial UNIQUE INDEX `(storeId, productId) WHERE deletedAt IS NULL` | Inlined options jsonb (replacing child table — pure complexity tax for an aggregate always read as complete doc); partial unique allows soft-delete-aware re-creation |
| (none) `ad_spends` (iter 322) | Schema additions side-by-side with existing Go-owned columns (NOT a rewrite) | Go pipelines write to `bucketStart` + `manualBinding`; TS adds `startDate`/`endDate`/`name`/`bindings`/`createdByUserId`/`disabledAt`/etc and uses only those. Future cleanup: drop legacy once Go updated to write both |

---

## 5. The Catalogue — non-actionable Phase G classes (don't fix these)

These appear repeatedly in `bun review` output. They are **project-pattern-correct** per established memory or known-gaps doc — do NOT "fix" them when you see them flagged in future reviews. Documented in `.plans/2026-05-22-bk-dash-known-gaps.md` § 5 + § 6 + § 8.

### Class A — Zod-as-shape (§ 5)
Read-side cross-BC ports and patch shapes are typed via **Zod schemas**, not instantiated **VO classes**. Rule violations:
- `VO-02` (Class extends BaseValueObject)
- `VO-03` (Static schema override)
- `VO-04` (equals + toString)

**Where seen:** `readmodels/objects/{MonetaryAmount,PostalAddress,UtmTags}.ts` (sales) + `objects/OrderOverrideFields.ts` (sales) + likely many similar in catalog.
**Memory:** `feedback_query_service_naming_and_zod.md`.

### Class B — Projection-vs-aggregate classifier (§ 5)
Projection repositories don't extend `AggregateRoot` and don't carry `version`. Rule violations:
- `REPOI-05` / `REPO-P05` (save with upsert + incrementVersion)

**Where seen:** `DrizzleOrderProjectionRepository`, `DrizzleVideoFeedProjectionRepository`.
**Reason:** projections are free-record classes per CLAUDE.md First-Class Citizens.

### Class C — Drizzle text/jsonb→type cast (§ 8)
Drizzle's `text('foo')` column type returns `string`, not the enum. Mappers must cast: `row.platform as MarketingPlatform`. Same for `jsonb('payload')` → `as Record<string, unknown>`. Rule violation:
- `cc-bp-04` (Type casting `as` / `as any`)

Also catches the Drizzle client + tx widening cast pattern `const dbc = (tx ?? this.db) as DrizzleClient` and `(dbc as any).insert(...)` (Drizzle's type narrowing breaks when `tx` is provided).

**Reason:** Drizzle 0.45.2 doesn't expose `.$type<EnumType>()` for the chained API consistently; would require cross-package import + per-column annotation across every schema file (broader migration than Phase G window justifies).

### Class D — Typed BaseError vs `.refine()` (§ 6)
Entities throw typed `BaseError<DomainErrors>('TYPED_CODE')` for invariants instead of Zod `.refine()` because:
- Tests assert on `(caught as BaseError).name === 'TYPED_CODE'`
- `GlobalErrorMapper` maps the typed code to a specific HTTP status (422 vs 400)
- `.refine()` would lose both signals

Rule violations:
- `bp-04` (Using if-checks in create() instead of Zod schema)
- `ENT-C06` (Multi-field invariant)

**Where seen:** `OrderOverride`, `Goal`, `ProductCost`, `AdSpend`, `Taxes.supersede()`, `WarrantyReserve`, `OperationalCost.update()`.
**Memory:** `feedback_canonical_entity_shape_from_spec_not_wire.md` (related context).

### Class E — Query use case withTransaction (§ 5)
Read-only BFF query use cases explicitly skip `withTransaction` and tx passthrough. Rule violation:
- `UC-06` / `UC-P14`

**Where seen:** `GetAdminStoreSnapshot`, `GetDashboardOverview`, `GetProfitMarginReport`, `GetGoals`, every analytics query.

---

## 6. Phase G real bugs caught + fixed (the FOUR)

These are the only HIGH findings across 30 files / 9 BCs reviewed that weren't catalogued false-positives. Each is a one-line fix.

| Iter | File | Bug | Fix |
|---|---|---|---|
| 332 | `marketing/entities/AdSpend.ts` create() + updateManual() | 5 `as never` / `as MarketingPlatform | 'MANUAL'` escape hatches in the factory + `(input.currency ?? entity.currency) as string` in caller | Type input as `CurrencyCode` (not `string`); use `AdSpendGroupBy.DAILY` enum value; drop all casts. Cascaded fix into `UpdateManualAdSpend.ts`. |
| 333 | `contracts/db/schema/marketing.ts` `campaign_product_bindings_unq` | Comment claimed "NULL-vs-NULL counts as equal in Postgres unique indexes" — FALSE; PG default treats NULL as distinct (the `UNIQUE NULLS NOT DISTINCT` keyword is the explicit opt-in, PG 15+) | drizzle-orm 0.45.2 doesn't expose `.nullsNotDistinct()`. Rewrote schema comment to describe actual PG behavior + document that single-binding semantics are enforced at app layer (`CreateCampaignProductBinding` read-check-write). The index is defense-in-depth for fully-populated triples only. **Caveat: Mock-mode tests assume Set-style dedupe; Drizzle-mode tests assert PG's distinct-NULL behavior.** |
| 341 | `analytics/usecases/GetProfitMarginReport.ts` `bucketUnit()` | switch enum→string lookup | Replaced with `BUCKET_UNIT: Record<AnalyticsFrequency, string>` lookup. Exhaustiveness via the Record type. |
| 344 | `catalog/entities/ProductCost.ts` lines 149 + 182 | `throw new BaseError<CatalogDomainErrors>('PRODUCT_COST_NOT_FOUND' as never)` — `as never` masking typed-error union mismatch | `PRODUCT_COST_NOT_FOUND` lives in `CatalogApplicationErrors` (not Domain). Imported the right type; both throws now properly-typed `BaseError<CatalogApplicationErrors>('PRODUCT_COST_NOT_FOUND')` |

---

## 7. Difficulties + workarounds

### 7.1 Mock-only tests masking real schema bugs (iter 333)

The Mock `CampaignProductBindingRepository` did Set-style JS dedupe where `NULL === NULL` holds. The Drizzle adapter's PG unique index doesn't (PG default treats NULLs as distinct). **The Mock tests passed; the Drizzle tests caught the divergence.**

**Lesson:** Dedicated Drizzle integration tests catch schema-vs-Mock divergences that unit-mock-only tests miss. The iter 328+ dedicated-test sweep was where most schema-comment-vs-reality bugs surfaced.

### 7.2 drizzle-kit interactive prompts on rename detection

`drizzle-kit generate` asks "is column X a new column or renamed from Y?" interactively whenever it detects similar-named columns. The ralph-loop can't answer those interactively. Workaround:

```bash
# Use `expect` to drive the prompts. Loop until "migration file" appears.
expect -c '
set timeout 60
spawn bun run drizzle:generate
expect {
  "rename column" { send -- "\033\[B\r"; sleep 0.3; exp_continue }  # arrow-down, Enter
  "Is " { send -- "\r"; sleep 0.3; exp_continue }                    # accept first option
  "migration file" {}
  eof {}
  timeout {}
}
expect eof
'
```

When the prompts get column-renames wrong (e.g., iter 305 generated `RENAME start_date→effective_from` correctly but iter 313 generated `RENAME status→user_id` nonsense), **hand-write the migration SQL**, delete the bogus snapshot, and let drizzle-kit pick up from the corrected state on the next run.

### 7.3 Bun review (`bun scripts/review.ts`) socket-close mid-batch

Long-running parallel reviews die with `socket connection was closed unexpectedly` after ~8 minutes (transient API error from the agent runtime). Mitigation:
- Use `--parallel 1` for stability (slower but reliable).
- Scope reviews narrow — 2–6 files per run, not a full BC.
- For background runs, use `run_in_background: true` + wait via `until [ ... ]; do sleep 10; done; echo DONE` pattern.
- If a run dies mid-batch, the files completed before the failure are still written to the output directory and usable.

### 7.4 Bun test cwd matters for reflect-metadata preload

`bun test` from the project root doesn't auto-load `packages/api/typescript/tests/setup.ts` (which `import 'reflect-metadata'`). Result: `TypeError: TypeInfo not known for "XClass"` when DI tries to resolve `@injectable()` classes.

Always run TS tests from `packages/api/typescript/`:
```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript && bun test
```

When using nested `bun test` calls via `cd` chains, **don't** chain `cd packages/api/typescript && ...` after previous chained `cd` — the shell state doesn't persist between Bash tool calls.

### 7.5 BetterAuth-managed repos are outside the standard dedicated-test scope

`UserRepository` + `AccountRepository` have Drizzle impls but no dedicated tests in our suite. BetterAuth's plugin owns the test coverage for these. Don't write integration tests pretending to cover BetterAuth's logic — write integration tests against the **abstract** `UserRepository` API (e.g., `AuthUserDirectoryService` test indirectly exercises `users` table via the cross-BC port).

### 7.6 nullish-coalescing collapsing intentional null defaults

Test helpers like `productId: opts.productId ?? PRODUCT_A` collapse both `undefined` and `null` to the default. The kit-scoped ProductCost path needs `null` to survive. Use `'productId' in opts ? (opts.productId ?? null) : PRODUCT_A` when distinguishing "not supplied" from "explicit null" matters.

### 7.7 Go pipeline schema coexistence with TS-side rewrites

For tables Go writes (orders, ad_spends, store_integrations), schema changes can't simply rewrite columns. iter 322 AdSpend added entity-shape columns side-by-side with the Go-owned legacy ones (`bucketStart`, `manualBinding`); Go keeps writing the old ones, TS reads/writes only the new ones. **Future cleanup ticket**: drop legacy columns once Go is updated to write the entity-shape names too.

---

## 8. Breakthroughs / patterns established

### 8.1 The Vertical-Slice Recipe (v3 § Step 1)

For each Mock-only repo:
1. Verify entity field set vs Drizzle column set; add missing columns to schema; run drizzle-kit generate.
2. Implement `Drizzle{X}Repository.ts` alongside Mock with `toDomain`/`toPersistence`/`save` (UPSERT + incrementVersion)/`findById`/domain-specific finders.
3. Update barrel `index.ts` to export the Drizzle impl.
4. Bind in BC's `registry.ts` — `integration` + `real` swap Mock for Drizzle; `mock` keeps Mock.
5. Fix existing use-case tests that cast to `Mock{X}Repository`:
   - Drop the cast + `repo.clear()` call (PGlite `testBed.reset()` truncates tables).
   - If the test uses Mock-only `repo.seed(entity)`, replace with `await repo.save(entity)` and `await` call sites.

This recipe shipped 14 adapters across iters 302–322.

### 8.2 The "Phase G with catalogue" pattern

Full `bun review` runs are expensive and timeout-prone. Scoped reviews on the actual files an iter touched + the catalogue of non-actionable patterns let us declare `bun review HIGH=0` satisfied per-BC without running an end-to-end pass.

Workflow:
1. Pick the 2–6 files touched by recent iters in a BC.
2. Run `bun scripts/review.ts <files> --output /tmp/review-X --parallel 1` (run_in_background: true).
3. Wait via `until ... do sleep 10; done` loop.
4. For each finding, map against the catalogue:
   - Catalogued false-positive (Classes A–E above) → document the classification in progress.md.
   - Real bug → fix inline, re-run tests, commit.
5. Doc-only progress entry tabulating findings + classifications.

5 BCs reviewed this way: sales/AdSpend module/analytics/notifications/integration/catalog/finance/marketing/tenancy ports — **30 files / 9 BCs / 4 real fixes / 54 catalogued classifications**. Finance BC was the showcase: **5/5 Drizzle adapters CLEAN** (zero findings).

### 8.3 The "implementing BC owns the cross-BC adapter" pattern

Tenancy depends on 3 cross-BC ports (SubscriptionQueryService, UserDirectoryService, OrderSamplingService). Pattern:
- Abstract lives in tenancy (the consuming BC).
- Real impl lives in the implementing BC (billing/auth/sales).
- Bound in implementing BC's `registry.ts` — load order means tenancy registers first (Mock), then the implementing BC overrides.

3 ports shipped this way iters 316–318.

### 8.4 Test pattern: seed parent FK rows via real repos, not raw inserts

For FK chains (e.g., IntegrationCredentialSecret → StoreIntegration), the test seeds the parent via its **own real Drizzle repo** (`await storeIntegrationRepo.save(parent)`) rather than direct INSERT. This:
- Verifies the FK actually resolves in real PGlite.
- Catches any schema-vs-entity divergence in the parent too.
- Keeps tests insulated from raw SQL drift.

iter 337's IntegrationCredentialSecret test demonstrates this.

### 8.5 Migration discipline

When generating a migration:
- If drizzle-kit's interactive rename detection produces sensible SQL → use it.
- If it produces nonsense (column-rename confusion) → hand-write the SQL, delete the bogus snapshot via `rm packages/contracts/db/migrations/{0xxx_*.sql,meta/0xxx_snapshot.json}` AND remove the corresponding entry from `_journal.json`, regenerate.
- Always check the snapshot diff (`packages/contracts/db/migrations/meta/0xxx_snapshot.json`) — drizzle uses it to compute the NEXT migration. Bogus snapshots cascade.

---

## 9. Active blockers (what's NOT done)

### Hard blocker — completion-promise level

- **Phase F E2E** (user-deferred per iter 258). 6 canonical Playwright flows at `packages/e2e/tests/0[1-6]-*.spec.ts` are `test.fixme()` stubs. Needs `tests/_support/{given,db,webhooks}.ts` helpers + a decision on docker-compose vs ephemeral test DB. See known-gaps § 4.

### Soft blockers — formally deferred per v3 § Guardrails escape hatch

- **`bun review HIGH=0` end-to-end pass** — never run for the full branch. Scoped reviews across 9 BCs satisfy the spirit, but not the literal pass. The catalogue (§ 5 above) tells you which findings to ignore in a future end-to-end run.
- **Deferred external.ts handlers** (known-gaps § 3) — `OnStoreIntegrationDataWipeRequested` (sales + marketing), `OnFcmTokenRegistered`, `OnUserPreferencesUpdated`, etc. Most still depend on additional prerequisites (routing-table service, email transport, MarketingAdAccount aggregate, SSE/WS channel). Don't ship the handler until its prerequisite lands — would create dead code (iter 267 cache-handler rollback lesson).
- **AdSpend Go legacy columns coexistence** — iter 322's design call kept `ad_spends.bucketStart` + `manualBinding` for Go. Drop once Go is updated to write both old + new column names.

### Documented but not blockers

- **Drizzle text columns lacking `.$type<>()`** — see known-gaps § 8. Broader migration than Phase G window justifies.
- **`SyncResponse` semantic mismatch** — Go's `/sync` returns synchronous `{succeeded, rowsTouched, perPipeline}`; TS abstract synthesizes async `{jobId, ETA}`. Use case consumers don't depend on jobId's actual value, so the synthesis works. When Go grows real async enqueue mode, swap in provider's job id without changing the TS port (iter 321 designed for this).

---

## 10. Where to look (key paths)

### Read these first

| Path | What for |
|---|---|
| `.plans/2026-05-21-bk-dash-port.progress.md` | Live progress tail (iters 324+) |
| `.plans/2026-05-21-bk-dash-port.progress.archive.md` | Iters 1–323 archive |
| `.plans/2026-05-22-bk-dash-known-gaps.md` | Continuation tickets, catalogued false-positives |
| `.plans/2026-05-22-bk-dash-finish-ralph-prompt.md` | v3 loop protocol |
| `.specs/2026-05-21-ddd-modeling-bk-dash.md` | Domain spec |
| `CLAUDE.md` | First-class citizens, conventions, Quality Gates |
| `docs/BACKEND.md` | Backend architecture deep-dive |

### When modifying a BC

| Path | What lives there |
|---|---|
| `packages/api/typescript/src/<bc>/registry.ts` | Mock/integration/real DI bindings |
| `packages/api/typescript/src/<bc>/entities/` | Aggregates with typed `BaseError<DomainErrors>` throws |
| `packages/api/typescript/src/<bc>/repositories/<X>Repository/{abstract,Mock,Drizzle}{X}Repository.ts` | Standard 3-file shape (+ optional `.test.ts` siblings) |
| `packages/api/typescript/src/<bc>/usecases/<C##|T##><Name>.ts` | One per command/read |
| `packages/api/typescript/src/<bc>/handlers/{internal,external}.ts` | In-BC + cross-BC event handlers |
| `packages/api/typescript/src/shared/registry.ts` | Composes all BC registries (load-order = override priority) |

### Schema + migrations

| Path | What for |
|---|---|
| `packages/contracts/db/schema/<bc>.ts` | Drizzle table definitions |
| `packages/contracts/db/migrations/<NNNN>_*.sql` | Generated migrations |
| `packages/contracts/db/migrations/meta/<NNNN>_snapshot.json` | Drizzle's diff state (don't hand-edit unless necessary) |
| `packages/contracts/db/migrations/meta/_journal.json` | Tracks applied migrations |

### Codegen

| Path | What for |
|---|---|
| `packages/contracts/codegen/emit-wire-{ts,rs,go}.ts` | Wire-event emitters (iter 308 fixed Rust's reserved-keyword escape) |
| `packages/contracts/generated/{typescript,rust,go}/src/wire/` | Generated output (don't hand-edit) |

### Tests

| Path | Pattern |
|---|---|
| `packages/api/typescript/src/<bc>/repositories/<X>Repository/Drizzle<X>Repository.test.ts` | Integration-mode dedicated tests (30 total this conversation) |
| `packages/api/typescript/src/<bc>/usecases/<X>.test.ts` | Use-case tests (integration env exercises Drizzle adapters transitively) |
| `packages/api/typescript/tests/setup.ts` | `import 'reflect-metadata'` preload (only auto-loaded from packages/api/typescript cwd) |
| `packages/api/typescript/tests/support/TestBed.ts` | Per-suite child container + reset() that truncates PGlite tables |

---

## 11. Reproducing the working state

```bash
# From repo root:
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack

# Verify TS workspace
cd packages/api/typescript
bun tsc          # → clean
bun test         # → 1098 pass / 0 fail / 2549 expect / 181 files

# Verify Go workspace
cd ../go
go build ./...   # → 0 errors
go test ./...    # → all green

# Verify SDK regen
cd ../../..
bun sdk          # → end-to-end clean

# Verify nx graph
bun x nx run-many -t tsc --exclude=app-react,e2e  # → 7/7 green
```

---

## 12. Final per-conversation stats

| Metric | Value |
|---|---|
| Commits this conversation | 47 (302–347) + iter 348 (uncommitted log archive) |
| Tests added | +163 (941 → 1098 at handoff) |
| Test files added | +18 |
| Production Drizzle adapters added | 14 |
| Cross-BC service-port adapters added | 4 |
| Dedicated Drizzle adapter tests added | 24 (6→30 — only BetterAuth-managed User/Account remain out of scope) |
| Schema migrations | 9 (0020–0028) |
| Phase A blockers cleared | 1 (Rust codegen reserved-keyword fix) |
| New Go endpoints | 1 (`/integrations/handshake`) |
| SDK regenerations | 2 (iter 308 unblock + iter 327 T20 cascade) |
| Phase G files reviewed | 30 across 9 BCs |
| Phase G real bugs caught + fixed | 4 |
| Phase G catalogued classifications | 54+ |

---

**End of handoff.** The loop sits at iter 348/200 — 152 iters of budget remain if anyone wants to continue. The natural next step is committing iter 348 (the progress.md archive split — currently uncommitted), then either lifting Phase F E2E or pivoting to whichever soft-blocker the user prioritizes.
