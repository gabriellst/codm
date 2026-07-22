# BK Dash port — known gaps + continuation tickets

Captured at iter 300 of the v3 loop close.

This file enumerates structural gaps the loop discovered but couldn't ship within the iter budget. Each entry is a paired vertical slice (when the prerequisite infra lands, the deferred item lands with it).

---

## 1. Mock-only repository bindings (Drizzle adapter + migration needed)

The following abstract repositories are bound to their `Mock*` impl across **all three** envs (`mock`, `integration`, `real`). Production deployments will UPSERT to in-memory stores that vanish on process restart.

### Done (iter 301-303)

| Repository | BC | Iter | Notes |
|---|---|---|---|
| `GoalRepository` | analytics | 301 | Added `user_id uuid not null` column (migration 0020). |
| `TaxesRepository` | finance | 302 | Drizzle adapter + registry swap. No schema delta. |
| `FxRateRepository` | finance | 303 | Drizzle adapter + fixed `rate` column `doublePrecision`→`text` (migration 0021) to preserve provider-side decimal precision. |
| `SubscriptionRepository` | billing | (was already done iter 97) | Audit corrected — known-gap §1 row was wrong; this was already Drizzle-bound. |

### Aligned and shippable (recommended next pass)

None remaining among the audited repos — every remaining Mock-only repository has either a deep schema/entity divergence requiring a design call, or the DB table doesn't exist yet, or it depends on another deferred adapter via FK.

### Resolved in iters 305-307 (finance BC fully Drizzle-backed)

- ✅ `WarrantyReserveRepository` (iter 305) — schema migration 0022: renamed start_date/end_date→effective_from/effective_to + added deleted_at.
- ✅ `OperationalCostRepository` (iter 306) — schema migration 0023: renamed label→description + dropped payment_method + dropped active.
- ✅ `FeesConfigurationRepository` (iter 307) — schema migration 0024: renamed shipping_fees→shipping_fee (singular) + DROP NOT NULL.

**Finance BC: fully Drizzle-backed for production envs.**

### Deferred — schema/entity divergence requires a design call

These repos cannot get a Drizzle adapter until the entity OR the schema is brought into agreement. Each carries an open `# QUESTION:` — picking the answer needs spec re-read + a stakeholder decision.

| Repository | BC | Divergence | Open question |
|---|---|---|---|
| `StoreIntegrationRepository` | integration | Entity carries `displayName` / `credentialSecretId` / `active` / `valid` / `lastHandshakeAt` / `connectedAt` / `disconnectedAt` / `ownerId` — none present in DB. Largest divergence in the codebase. | Should the DB grow these 8 columns (entity wins) or should the entity drop them (DB wins)? Affects credential-vault FK chain. |
| `AdSpendRepository` | marketing | Entity `spend: MonetaryAmount` VO vs DB flat `amountCents`+`currency`; entity `bindings: array` vs DB `manualBinding: jsonb` (singular); entity `startDate`+`endDate` vs DB `bucketStart`+`occurredAt` (different temporal models for AUTOMATIC vs MANUAL); entity uses `campaignExternalId` vs DB `campaignId` FK; entity has `name`/`conversions`/`createdByUserId`/`disabledAt` not in DB; DB has `storeIntegrationId`/`adId`/`adExternalId` not in entity; entity `adSpendType` vs DB `type` rename. | The entity and DB are modeling two conceptually different shapes — AUTOMATIC rows speak the provider vocabulary while the entity flattens both into one ManualMarketingExpense shape. Resolution requires re-reading spec to decide which is the canonical AdSpend write-model. |
| `ProductCostRepository` | catalog | Parent-child aggregate (productCosts + productCostOptions). Entity has options[] inline; DB splits into parent + child cascade. Entity adds `storeIntegrationId` + `displayName` + `deletedAt` not in DB; renames `costType`↔`type`. `list` returns a summary projection, not the entity. | Cascade write/read implementation is substantial (clear+insert child rows on update); plus the missing entity fields need column additions. Single biggest aggregate mapping in the codebase. |

### Deferred — DB table doesn't exist

| Repository | BC | Missing table |
|---|---|---|
| `BkdashNotificationRepository` | notifications | `notifications` schema has only `push_devices` + `push_log`; no `notifications` table for in-app notification rows. |
| `BkdashNotificationDeliveryRepository` | notifications | Same — no `notification_deliveries` table. |

### Deferred — depends on another deferred adapter via FK

| Repository | BC | Blocker |
|---|---|---|
| `IntegrationCredentialSecretRepository` | integration | DB row has FK to `store_integrations.id`. Even though schema/entity nearly align (only missing `rotated_at` column — small migration), tests need a real `StoreIntegration` row first, which can't be Drizzle-seeded until the StoreIntegration divergence (above) is resolved. |
| `CredentialVault` | integration | Service-layer wrapper around the credential secret repo. Same blocker. |

### Deferred — BetterAuth-managed

| Repository | BC | Note |
|---|---|---|
| `UserRepository` | auth | BetterAuth owns the table — Drizzle adapter likely lives on the BetterAuth side. Verify before re-implementing. |
| `AccountRepository` | auth | Same. |

**Standard recipe for each Mock-only binding (when schema/entity align):**
1. Verify entity field set vs Drizzle column set; add missing columns to the schema + run `drizzle-kit generate` to produce the migration.
2. Implement `Drizzle{Repository}Repository.ts` alongside the Mock with `toDomain` / `toPersistence` / `save` (UPSERT + `incrementVersion`) / `findById` / domain-specific finders.
3. Add `Drizzle{Repository}Repository.test.ts` covering save+findById round-trip + each domain-specific finder.
4. Update the BC's `registry.ts` — `integration` + `real` swap Mock for Drizzle; `mock` env keeps Mock.
5. Update existing use-case tests that cast to `Mock{X}Repository` — drop the cast + the `repo.clear()` call (PGlite `testBed.reset()` truncates tables). If the test uses Mock-only `repo.seed(entity)` to fixture rows, replace with `await repo.save(entity)` and `await` the helper at call sites.

**Important — `Goal` entity caveat:** the `Goal.test.ts` `INVALID_DATE_RANGE` assertion needs to survive the iter-292 entity-schema-vs-typed-error trade-off — keep the manual `BaseError` throw in `create()`.

---

## 2. Speculative-cache handlers (deferred per memory `no-speculative-cache-layer`)

The iter-272 audit closure identified ~12 "cache invalidation" external handlers across Analytics + the Tenancy quota cache. None of these land until a real read-cache layer exists. The cache + the invalidation handler ship together as a single vertical slice.

---

## 3. External integration handlers blocked on prerequisite infra (per iter 272 closure)

| Handler | Blocker |
|---|---|
| `OnStoreIntegrationDataWipeRequested` (sales) | Aggregate-erasing repo surface (`OrderRepository.deleteByStoreIntegration` etc) |
| `OnStoreIntegrationDataWipeRequested` (marketing) | Same — CampaignRepository erase method |
| `OnMarketingReconciliationCompleted` | No real v1 consumer (cache-invalidation was the original purpose; dropped) |
| `OnStoreMemberInvited` (notifications) | `UserQueryService.findByEmail` port + email transport service |
| `OnFcmTokenRegistered` (notifications) | Routing-table service |
| `OnUserPreferencesUpdated` (notifications) | Routing-table service |
| `OnMarketingAdAccountDiscovered` (integration) | `MarketingAdAccount` aggregate in Marketing BC |
| `OnIntegrationProgressUpdated` (integration) | Frontend SSE/WS channel |

Each handler lands paired with its prerequisite. Adding the handler ahead of the prereq would create dead code (the iter-267 cache-handler rollback already demonstrated this anti-pattern).

---

## 4. Phase F (e2e flow tests) — deferred per user direction at iter 258

User explicitly preferred backend flow tests over Playwright e2e. The 6 canonical-flow Playwright specs sit as `test.fixme()` scaffolds at `packages/e2e/tests/0[1-6]-*.spec.ts`. Each requires:
- `tests/_support/given.ts` — signup helper, store-with-owner helper, integration-connect helper
- `tests/_support/db.ts` — Drizzle direct asserter for end-state verification
- `tests/_support/webhooks.ts` — POST to `/webhooks/<platform>` with HMAC-signed bodies matching the Go-worker verifier specs

Decision needed before authoring: local docker-compose vs ephemeral test DB.

Backend flow tests under `packages/api/typescript/tests/flows/` (iter 258 shipped 1) are the replacement path.

---

## 5. Phase G review classifier limitations (non-actionable critical findings)

The `bun review` agent surfaces critical findings that aren't real bugs but classifier or context-window limitations:

- **Read-side schemas flagged as "missing VO class"** (12+ findings in `sales/readmodels/objects/*` + `catalog/readmodels/objects/*`) — user-directed Zod-only pattern per memory `query-service-naming-and-zod`. Not bugs.
- **Query use cases flagged "missing withTransaction"** (5+ in analytics — GetAdminStoreSnapshot/GetAdminUserLookup/GetChart/GetGoals/GetProductPerformanceReport) — read-only BFF queries explicitly skip transactions per the query skill. Misclassified as use cases.
- **GET controllers flagged "POST body wrap missing"** — project framework flattens body fields at top level (verified across billing/marketing/etc controllers). Skill from different framework.
- **Barrel-export "not confirmed"** — agent's context window doesn't include the index file; verified all exports are present.
- **PRJTR-06 "wire-string vs Class.name"** — wire event classes use `static override readonly name = '...' as const`; `EventClass.name` IS the wire string. False positive.

These should be filtered out of any literal "drive HIGH to zero" pass. A future review-script enhancement could (a) load BC's barrel files into the agent context, (b) detect read-only queries vs write use cases by tx-usage pattern, (c) skip the VO checklist on files matching `readmodels/`.

---

## 6. Entity `safeParse + typed BaseError` vs schema `.refine()` (intentional divergence)

The skill's entity rules want all invariants in the schema via `.refine()`. The project pattern (4+ entities: `OrderOverride`, `Goal`, `ProductCost`, `AdSpend`) does a manual `safeParse + throw new BaseError<DomainErrors>('TYPED_CODE')` to preserve typed error codes that:
- Tests assert on via `(caught as BaseError).name === 'TYPED_CODE'`
- Map to specific HTTP statuses (422 vs 400) via `registerErrorCodes`

The skill rule would have all of these throw a generic `BaseError('INVALID_ENTITY', '<refine message>')`, losing both the test assertion + the typed status mapping. Existing pattern is intentional.

**Future amendment option:** patch `BaseEntity.constructor` to detect a typed-code message in a refine and rethrow as that typed BaseError name. Or wire the entity to use a `safeParse + tryCatch + rethrow` shape via a small core helper.

---

## 7. `return undefined as never` in non-EventHandler use cases (iter 296 framework fix complete)

Closed — Handler base widened to `Promise<this['output'] | void>`. All 37 occurrences eliminated codebase-wide.

---

## 8. Drizzle text columns lacking `$type<EnumType>()` (iter 298 documented)

8 remaining `as <Enum>` casts in repos + BFF queries are legitimate — Drizzle's `text` column doesn't know enum subtypes. Fix would require adding `$type<EnumType>()` to every relevant text column in `packages/contracts/db/schema/*.ts` + cross-importing `@template/contracts-typescript`. Broader migration than Phase G window justifies.
