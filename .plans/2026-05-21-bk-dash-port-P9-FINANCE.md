# P9-FINANCE — BK Dash BC8 Finance — Implementation Plan (polyglot rebase, iter 43)

> **For agentic workers:** Execute via `/build`. Each Task wraps one observable
> behavior in a bite-sized RED → GREEN → verify → commit cycle, per `/plan`
> conventions. Files land under `packages/api/typescript/src/finance/` (the
> polyglot template's BC convention — siblings live at
> `packages/api/typescript/src/{auth,notifications,ui}/`). NO code outside the
> `finance/` folder, the contracts `wire/events/` additions, and the polyglot
> root bootstrap (`packages/api/typescript/src/index.ts`).

**Goal:** Land BC8 Finance — four merchant aggregates (`Taxes`,
`FeesConfiguration`, `OperationalCost`, `WarrantyReserve`), one append-only
canonical projection (`FxRate`), 5 reads (T25–T29), 10 commands (C39–C48), 10
domain events, 10 Finance integration events (authored in
`packages/contracts/wire/events/`), and the hourly `CaptureFxRates` cron — so
every downstream BC (Sales, Marketing, Tracking, Notifications, Analytics) can
query an effective-date FX rate via the canonical `FxRateService.findEffectiveAt`
and read merchant-configurable financial parameters.

**Architecture:** Standard polyglot BC topology — mirrors
`packages/api/typescript/src/auth/`: `entities/`, `enums/` (re-exports only —
primitives live in `@template/contracts-typescript/wire`), `errors/` (side-effect
`registerErrorCodes` call), `events/`, `usecases/` (commands + queries),
`services/` (`FxRateService` + `FxProvider`), `controllers/`,
`handlers/{internal,external}.ts`,
`repositories/<Aggregate>Repository/<Interface|Drizzle|Mock>.ts`, plus a
`registry.ts` wiring DI per environment (`mock` / `integration` / `real`) and an
`index.ts` that calls `BoundedContext.create({...})`. Time-effective aggregates
(`Taxes`, `FeesConfiguration`, `WarrantyReserve`) follow the close-and-insert
pattern (set existing row's `endDate = newStartDate`, insert a new row).
`OperationalCost` is a soft-deleted ledger with append-only
`OperationalCostStatusEntry[]` in a `jsonb` column. **`FxRate` is an
append-only projection** (free record class — no `applyEvent`, no
`AggregateRoot` base class) — its canonical query is
`SELECT * FROM finance.fx_rates WHERE from_currency = ? AND to_currency = ? AND
start_date <= ? ORDER BY start_date DESC LIMIT 1`. The composite index
`(from_currency, to_currency, start_date)` already exists in the Drizzle schema
(`packages/contracts/db/schema/finance.ts` — `fx_rates_pair_start_date_idx`).
`FxRateService` exposes `findEffectiveAt(fromCurrency, toCurrency, at)` for
every cross-BC consumer (Sales/Marketing/Notifications/Analytics) to call at
query time.

**Tech Stack:** TypeScript, Bun, Drizzle (schemas in
`packages/contracts/db/schema/`), tsyringe-neo, Zod, PGlite (tests),
`@template/core-typescript` framework primitives (`Handler`, `Controller`,
`AggregateRoot`, `Repository`, `BaseDomainEvent`, `BaseIntegrationEvent`,
`EventHandler`, `BoundedContext`, `BaseError`, `registerErrorCodes`,
`InstanceRegistry`).
**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md` (§4 BC8 Finance, §7.0
Currency + FxRate, §7.8 Finance reads/commands, §7.13 Finance → Analytics
intra-API flow, §7.14 FinanceErrors).
**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan P9-FINANCE,
polyglot rebase addendum).
**Depends on:**
- **Iter 41** — TypeSpec wire/ contracts (enums: `tax-type`,
  `tax-deduction-type`, `operational-cost-category`,
  `operational-cost-recurrency`, `operational-cost-payment-status`,
  `shipping-cost-type`, `fx-rate-source`, `payment-gateway`, `payment-method`,
  `checkout-platform`, `currency-code`, `marketing-platform` — all authored
  and emitting to `@template/contracts-typescript/wire`).
- **Iter 42** — Drizzle schema (`packages/contracts/db/schema/finance.ts` —
  `taxes` 10c/2ix, `fees_configuration` 8c/1ix, `operational_costs` 13c/3ix,
  `warranty_reserves` 8c/1ix, `fx_rates` 7c/2ix append-only).
- **P2-TENANCY** — `Store` aggregate + `stores` table for `storeId` foreign
  key; ownership/role guard middleware (consumed by controllers).
- **P0/iter-41 value-types** — `MonetaryAmount`, `GatewayFee`, `CheckoutFee`,
  `ShippingFee`, `ShippingCostValue` (discriminated union, inlined in
  `fees_configuration.shipping_fees` jsonb), `OperationalCostStatusEntry`.
**Downstream consumers** (read-only contracts this sub-plan locks): **P6-SALES**,
**P7-MARKETING**, **P10-NOTIFICATIONS**, **P11-ANALYTICS** — all import
`FxRateService.findEffectiveAt(...)` for native→reporting-currency conversion;
Analytics also subscribes to all 10 Finance integration events for cache
invalidation.
**Tasks:** 22
**Estimated minutes:** ~330

---

## Convention reference (absorbed during planning, NOT re-read by /build)

- **Sibling BC for shape:** `packages/api/typescript/src/auth/` — owns
  `entities/`, `enums/`, `errors/`, `events/`, `handlers/`, `repositories/`,
  `usecases/`, `controllers/`, `registry.ts`, `index.ts`. Mirror this layout
  exactly.
- **BC bootstrap (`index.ts`):** `await BoundedContext.create({ name: '',
  controllers, internalHandlers, externalHandlers, registry: INSTANCE_REGISTRY
  })` then `export default ctx.router`. `name` is empty so controller `path`
  values are mounted as-authored under the version prefix.
- **DI wiring (`registry.ts`):** export `INSTANCE_REGISTRY: InstanceRegistry`
  with `{ mock, integration, real }` arrays of `{ token, instance }`. The
  registry is **applied locally** by `BoundedContext.create` — there is NO
  `ALL_REGISTRIES` aggregator in polyglot (the medscall pattern was dropped).
- **Side-effect error registration:** `errors/index.ts` ends with a
  `registerErrorCodes({ CODE: HttpStatusCode.X, ... })` block; the registry
  import in `registry.ts` (`import './errors'`) triggers it at boot.
- **Entity shape:** `extends AggregateRoot<typeof Schema>` with `static override
  schema = Schema`, `static create({...})`, mutator methods that re-`validate()`.
  The interface-merge trick `export interface Foo extends FooProps {}` exposes
  schema fields as properties.
- **Repository interface:** `extends Repository<Entity>`, declares `findById` +
  domain-specific finders + `save` (polyglot's `DrizzleUserRepository` shows
  the optimistic-lock-free upsert path; aggregate-with-version uses
  `entity.incrementVersion()` then a manual `onConflictDoUpdate` keyed on
  `version`).
- **Drizzle imports:** `import { taxes, feesConfiguration, operationalCosts,
  warrantyReserves, fxRates } from '@template/contracts/db'`. `tryCatchAsync`
  for boundary; `toDomain` / `toPersistence` private helpers.
- **Mock repository:** in-memory `Map<string, Entity>`; mirrors
  `MockUserRepository`.
- **Use case shape:** `extends Handler<typeof InputSchema, typeof
  OutputSchema>`, `readonly name = 'snake_case_verb' as const`, `readonly
  inputSchema`, `readonly outputSchema`, `protected async handle(input, tx?)`
  wrapped in `this.withTransaction`. Save domain events via
  `await this.domainEventRepository.save(event, tx)` (the `Handler` base
  injects `domainEventRepository`).
- **Controller:** `extends Controller<typeof InputSchema, typeof OutputSchema>`
  with `readonly path: \`/${string}\``, `readonly method`, `readonly
  description`, `InputSchema = z.object({ body?, params?, query?, headers? })`.
  Output schemas carry `.example([...])` for OpenAPI examples (polyglot
  pattern — see `GetSessionController`).
- **Domain event:** `class Foo extends BaseDomainEvent<typeof FooSchema>` with
  `static override readonly name = 'finance.<aggregate>.<verb>' as const` and
  `static readonly schema = z.domainEvent({...})`.
- **Integration event (cross-language):** authored as TypeSpec under
  `packages/contracts/wire/events/<event-name>.tsp`, extending
  `IntegrationEvent` from `_base.tsp`, with `name: "integration.shared.finance.<aggregate>.<verb>"`.
  Emitted via `bun run codegen:wire` into
  `packages/contracts/generated/typescript/wire/` and consumed at runtime via
  `import { FxRateCapturedEvent } from '@template/contracts-typescript/wire'`.
- **Internal handler:** `extends EventHandler<typeof DomainEvent>` with
  `readonly event = DomainEvent`. Resolves `ExternalMediator` and publishes
  the corresponding `*IntegrationEvent` instance. Exported via
  `handlers/internal.ts` (named-export barrel).
- **External handler:** `handlers/external.ts` — empty barrel for Finance
  (this BC publishes integration events but does not consume any from other
  services).
- **Drizzle schema:** **already authored** at
  `packages/contracts/db/schema/finance.ts` (read-only for this sub-plan; do
  NOT modify). Tables and indexes match the spec — see §"Drizzle facts" in
  Task 1.
- **Migration:** the generator runs over `packages/contracts/db/schema/` via
  `bun --filter @template/contracts drizzle:generate`. P9 does NOT author a
  new SQL migration — iter 42 covers it. P9 only runs `bun migrate:dev`
  during local verification.
- **Schema helper import:** `import { z } from '@template/core-typescript'` (NOT
  plain `zod`).
- **Tests:** colocated `<File>.test.ts` using `bun:test`. Integration tests
  build a child container and resolve repositories per env. See
  `packages/api/typescript/src/auth/repositories/UserRepository/DrizzleUserRepository.test.ts`
  for the polyglot pattern.
- **MEMORY rule (verbatim):** *givenEvent is for cross-process boundaries.* For
  in-process handler tests, instantiate the event class and call
  `handler.handle(event)` directly — do NOT seed `shared.events`.

---

## File Structure (target)

```
packages/api/typescript/src/finance/
  index.ts                                       # BoundedContext.create({...}) → export default router
  registry.ts                                    # INSTANCE_REGISTRY (mock/integration/real) + side-effect `import './errors'`
  enums/
    index.ts                                     # re-export from @template/contracts-typescript/wire — no new enums in this BC
  errors/
    index.ts                                     # FinanceDomain/Application/Interface/Infrastructure error unions + registerErrorCodes(...)
  entities/
    Taxes.ts                                     # Aggregate: revenue tax + marketing per-platform map + time-effective
    Taxes.test.ts
    FeesConfiguration.ts                         # Aggregate: parent over GatewayFee[] / CheckoutFee[] / ShippingFee
    FeesConfiguration.test.ts
    OperationalCost.ts                           # Aggregate: ledger row with statusEntries[]
    OperationalCost.test.ts
    WarrantyReserve.ts                           # Aggregate: rate (0..1) with time-effective period
    WarrantyReserve.test.ts
    FxRate.ts                                    # Canonical projection (free record class, append-only, NO base class invariants)
    FxRate.test.ts
    index.ts                                     # barrel (5 entities)
  events/
    TaxesUpdatedEvent.ts                         # finance.taxes.updated
    FeesConfigurationUpdatedEvent.ts             # finance.fees_configuration.updated
    OperationalCostRecordedEvent.ts              # finance.operational_cost.recorded
    OperationalCostUpdatedEvent.ts               # finance.operational_cost.updated
    OperationalCostDeletedEvent.ts               # finance.operational_cost.deleted
    OperationalCostStatusToggledEvent.ts         # finance.operational_cost.status_toggled
    WarrantyReserveCreatedEvent.ts               # finance.warranty_reserve.created
    WarrantyReserveUpdatedEvent.ts               # finance.warranty_reserve.updated
    WarrantyReserveDeletedEvent.ts               # finance.warranty_reserve.deleted
    FxRateCapturedEvent.ts                       # finance.fx_rate.captured
    index.ts                                     # barrel
    index.test.ts                                # asserts all 10 names + payload safeParse
  services/
    FxRateService/
      FxRateService.ts                           # canonical cross-BC API: findEffectiveAt(from, to, at), findManyEffectiveAt(pairs, at)
      DrizzleFxRateService.ts                    # real
      MockFxRateService.ts                       # mock (in-memory table)
      FxRateService.test.ts                      # integration test (PGlite) covers canonical query semantics
      index.ts
    FxProvider/
      FxProvider.ts                              # interface — fetchRates(pairs) → FxRateFetched[]
      CurrencyApiFxProvider.ts                   # real — calls Currency API (provider TBD; see QUESTION in Task 11)
      MockFxProvider.ts                          # test — deterministic table
      CurrencyApiFxProvider.test.ts              # stubs global fetch; asserts mapping + error path
      index.ts
    CaptureFxRatesScheduler/
      CaptureFxRatesScheduler.ts                 # hourly setInterval → resolves CaptureFxRates use case
      CaptureFxRatesScheduler.test.ts            # fake timers (bun:test mock.useFakeTimers)
      index.ts
    index.ts                                     # services barrel
  repositories/
    TaxesRepository/
      TaxesRepository.ts                         # interface (extends Repository<Taxes>)
      DrizzleTaxesRepository.ts
      MockTaxesRepository.ts
      DrizzleTaxesRepository.test.ts
      index.ts
    FeesConfigurationRepository/                 # same triple
    OperationalCostRepository/                   # same triple
    WarrantyReserveRepository/                   # same triple
    FxRateRepository/                            # special: append-only — interface declares insertIfNew + findEffectiveAt, NOT save
      FxRateRepository.ts
      DrizzleFxRateRepository.ts
      MockFxRateRepository.ts
      DrizzleFxRateRepository.test.ts
      index.ts
    index.ts                                     # barrel
  usecases/
    UpdateTaxes.ts                               # C39
    UpdateTaxes.test.ts
    UpdateFeesConfiguration.ts                   # C40
    UpdateFeesConfiguration.test.ts
    CreateOperationalCost.ts                     # C41
    CreateOperationalCost.test.ts
    UpdateOperationalCost.ts                     # C42
    UpdateOperationalCost.test.ts
    DeleteOperationalCost.ts                     # C43
    DeleteOperationalCost.test.ts
    ToggleOperationalCostStatus.ts               # C44
    ToggleOperationalCostStatus.test.ts
    CreateWarrantyReserve.ts                     # C45
    CreateWarrantyReserve.test.ts
    UpdateWarrantyReserve.ts                     # C46
    UpdateWarrantyReserve.test.ts
    DeleteWarrantyReserve.ts                     # C47
    DeleteWarrantyReserve.test.ts
    CaptureFxRates.ts                            # C48 (also driven by CaptureFxRatesScheduler at boot)
    CaptureFxRates.test.ts
    GetTaxesSettings.ts                          # T25 query use case
    GetTaxesSettings.test.ts
    GetFeesConfigurationSettings.ts              # T26
    GetFeesConfigurationSettings.test.ts
    ListOperationalCosts.ts                      # T27 (depends on FxRateService for amountInReportingCurrency)
    ListOperationalCosts.test.ts
    ListWarrantyReserves.ts                      # T28
    ListWarrantyReserves.test.ts
    AdminListFxRates.ts                          # T29 (admin-only — controller-side header guard)
    AdminListFxRates.test.ts
    index.ts                                     # barrel
  controllers/
    UpdateTaxesController.ts                     # PATCH  /finance/taxes
    UpdateFeesConfigurationController.ts         # PATCH  /finance/fees-configuration
    CreateOperationalCostController.ts           # POST   /finance/operational-costs
    UpdateOperationalCostController.ts           # PATCH  /finance/operational-costs/:operationalCostId
    DeleteOperationalCostController.ts           # DELETE /finance/operational-costs/:operationalCostId
    ToggleOperationalCostStatusController.ts     # POST   /finance/operational-costs/:operationalCostId/status
    CreateWarrantyReserveController.ts           # POST   /finance/warranty-reserves
    UpdateWarrantyReserveController.ts           # PATCH  /finance/warranty-reserves/:warrantyReserveId
    DeleteWarrantyReserveController.ts           # DELETE /finance/warranty-reserves/:warrantyReserveId
    CaptureFxRatesController.ts                  # POST   /finance/fx-rates/capture (admin trigger; cron also calls use case directly)
    GetTaxesSettingsController.ts                # GET    /finance/taxes
    GetFeesConfigurationSettingsController.ts    # GET    /finance/fees-configuration
    ListOperationalCostsController.ts            # GET    /finance/operational-costs
    ListWarrantyReservesController.ts            # GET    /finance/warranty-reserves
    AdminListFxRatesController.ts                # GET    /finance/admin/fx-rates  (admin-only)
    index.ts                                     # barrel (named-exports — picked up by BoundedContext.create)
  handlers/
    TaxesUpdatedHandler.ts                       # → integration.shared.finance.taxes.updated
    FeesConfigurationUpdatedHandler.ts
    OperationalCostRecordedHandler.ts
    OperationalCostUpdatedHandler.ts
    OperationalCostDeletedHandler.ts
    OperationalCostStatusToggledHandler.ts
    WarrantyReserveCreatedHandler.ts
    WarrantyReserveUpdatedHandler.ts
    WarrantyReserveDeletedHandler.ts
    FxRateCapturedHandler.ts
    TaxesUpdatedHandler.test.ts                  # representative test; remaining 9 follow same shape
    internal.ts                                  # named-export barrel — registers with InternalMediator
    external.ts                                  # empty `export {}` — Finance consumes no cross-BC integration events

packages/contracts/wire/events/                  # AUTHORED HERE (cross-language, code-generated)
  taxes-updated.tsp                              # integration.shared.finance.taxes.updated
  fees-configuration-updated.tsp                 # integration.shared.finance.fees_configuration.updated
  operational-cost-recorded.tsp                  # integration.shared.finance.operational_cost.recorded
  operational-cost-updated.tsp                   # integration.shared.finance.operational_cost.updated
  operational-cost-deleted.tsp                   # integration.shared.finance.operational_cost.deleted
  operational-cost-status-toggled.tsp            # integration.shared.finance.operational_cost.status_toggled
  warranty-reserve-created.tsp                   # integration.shared.finance.warranty_reserve.created
  warranty-reserve-updated.tsp                   # integration.shared.finance.warranty_reserve.updated
  warranty-reserve-deleted.tsp                   # integration.shared.finance.warranty_reserve.deleted
  fx-rate-captured.tsp                           # integration.shared.finance.fx_rate.captured
  index.tsp                                      # MODIFY: append the 10 new `import "./<event>.tsp"` lines

packages/api/typescript/src/index.ts             # MODIFY: import `FinanceRouter from '@finance/index'`; append to `routers` array
packages/api/typescript/tsconfig.json            # MODIFY (if needed): add `@finance/*` path alias mirroring `@auth/*`
```

> **# QUESTION (Currency API provider):** Iter 42's Drizzle schema fixes the
> `FxRateSource` enum at `CURRENCY_API | MANUAL | PROVIDER_REPORTED` (already
> emitted via TypeSpec). The hourly provider implementation is TBD — top
> candidates are `currencyapi.com` (paid; baseline + 170 currencies),
> `exchangerate.host` (free tier; lower SLA), and `openexchangerates.org`. The
> **decision is deferred to Task 11**; this plan documents the abstract
> interface (`FxProvider.fetchRates(pairs)`), env-var contract
> (`CURRENCY_API_KEY`, `CURRENCY_API_BASE_URL`), and stub-the-fetch test
> pattern so the provider can swap behind the same interface. **Resolution
> rule for /build:** pick `currencyapi.com` for the real impl
> (`https://api.currencyapi.com/v3/latest?apikey=...&base_currency=<from>&currencies=<to,…>`)
> unless a higher-priority constraint surfaces; the env-var contract above
> stays.

> **# QUESTION (StoreRepository for T27 conversion):** T27 needs
> `Store.reportingCurrency` to compute `amountInReportingCurrency`. P2-TENANCY
> is expected to export a `StoreRepository` consumable from `@tenancy/...`.
> If P2-TENANCY has not landed when P9 runs (or doesn't expose the repo),
> fall back to `amountInReportingCurrency = item.amount` (native-only) and
> file a follow-up under the master plan progress log. Decision logged in
> Task 17 below.

> **# QUESTION (ResolveActiveStoreMiddleware):** Controllers need a way to
> resolve `storeId` from session. P2-TENANCY is expected to provide a
> `ResolveActiveStoreMiddleware`. If absent, controllers accept `storeId` as a
> path/header param and inline-guard against `ctx.user`. Decision logged in
> Task 18 below.

---

## Task 1: Schema audit + path alias + contracts barrel sanity (Contract Lock — read-only schema)

**Files:**
- Read-only: `packages/contracts/db/schema/finance.ts` — already authored by iter 42; ASSERT structure matches the table inventory used downstream.
- Modify (if missing): `packages/api/typescript/tsconfig.json` — add `"@finance/*": ["./src/finance/*"]` path alias mirroring `@auth/*`, `@notifications/*`, `@ui/*`.
- Verify: `bun --filter @template/contracts drizzle:generate` produces no new diff (iter 42 should already have committed the SQL).
- Verify: `bun migrate:dev` is a no-op locally.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /db-modelling, /migrate
**Depends on:** iter 41 (wire enums), iter 42 (Drizzle schema), P2-TENANCY (stores table)

**Drizzle facts (from `packages/contracts/db/schema/finance.ts`, locked by iter 42 + extended by iter-43.6b migration `0014_chilly_mystique.sql`):**
- `taxes` (13 cols / 2 indexes): `id uuid PK`, `storeId uuid`, `type text` (TaxType), `deductionType text` (TaxDeductionType), `rate double`, **`revenueTaxMultiplier double` (NOT NULL default 1.0)**, **`marketingTaxRatePerPlatform jsonb` (NOT NULL default `'{}'::jsonb`)**, `startDate tstz`, `endDate tstz?`, **`updatedByUserId text?` (audit pointer, no FK)**, `createdAt`, `updatedAt`, `version`. Indexes: `taxes_store_id_idx`, `taxes_store_start_date_idx`. **Schema now matches spec §4 BC8 + T25** — entity reads/writes `revenueTaxMultiplier` and `marketingTaxRatePerPlatform` as first-class fields.
- `fees_configuration` (11 cols / 1 index): `id`, `storeId uuid`, `gatewayFees jsonb` (GatewayFee[]), `checkoutFees jsonb` (CheckoutFee[]), `shippingFees jsonb` (ShippingFee[]), **`startDate tstz` (NOT NULL default `now()`)**, **`endDate tstz?`**, **`updatedByUserId text?`**, `createdAt`, `updatedAt`, `version`. Index: **`fees_configuration_store_start_date_idx`** (replaces the previous `(storeId) UNIQUE`; multi-row time-effective semantics now match `taxes`). **NOTE:** schema still has `shippingFees` as **array** (plural); spec has singleton `shippingFee`. **Treat as schema choice** — the entity stores `shippingFee` (singleton) but the persistence layer wraps as `[shippingFee]` (array of one) for jsonb round-trip. **C40 reverts to "close-and-insert" (the spec-canonical pattern)** — bumps the previous active row's `endDate` to the new row's `startDate` and inserts.
- `operational_costs` (16 cols / 4 indexes): `id`, `storeId uuid`, `label text`, `category text` (OperationalCostCategory), `recurrency text` (OperationalCostRecurrency), `amountCents bigint`, `currency text` (CurrencyCode), `startDate`, `endDate?`, `statusEntries jsonb`, **`paymentMethod text?`** (PaymentMethod enum-as-text), **`active boolean` (NOT NULL default true)**, **`deletedAt tstz?`**, `createdAt`, `updatedAt`, `version`. Indexes: `operational_costs_store_id_idx`, `operational_costs_category_idx`, `operational_costs_start_date_idx`, **`operational_costs_store_active_idx`** (T27 `active?` filter). **NOTE:** schema still uses `label` (free-form text, NOT NULL) for what the spec calls `description?` (optional). The entity maps `description?` → `label` (falling back to `category` when description is empty) — kept as-is (small workaround, not load-bearing). Soft-delete is now DB-backed: C43 sets `deletedAt = now()` AND `active = false`; T27's `active?` filter pushes into the WHERE clause.
- `warranty_reserves` (8 cols / 1 index): `id`, `storeId uuid`, `rate double`, `startDate`, `endDate?`, `createdAt`, `updatedAt`, `version`. Index: `warranty_reserves_store_start_date_idx`. **Matches spec exactly minus `deletedAt`** — soft-delete handled in-domain.
- `fx_rates` (7 cols / 2 indexes): `id`, `fromCurrency text`, `toCurrency text`, `rate double`, `source text` (FxRateSource), `startDate`, `createdAt`. Indexes: `fx_rates_pair_start_date_idx` (canonical lookup), `fx_rates_source_idx`. **Append-only by convention** (no UNIQUE constraint on `(from, to, startDate)` — the repo handles idempotency via `ON CONFLICT DO NOTHING` over `pair_start_date_idx` if needed; otherwise duplicates are tolerated and `LIMIT 1` chooses one).

- [ ] **Step 1: Run the verification chain**

```bash
bun --filter @template/contracts drizzle:generate   # → no new diff
bun migrate:dev                                      # → no-op (idempotent)
bun --filter @template/contracts test                # → contracts tests green
bun tsc                                              # → 0 errors
```

- [ ] **Step 2: Confirm iter-43.6b migration is wired**
  - Iter-43.6b shipped migration `0014_chilly_mystique.sql` which lands the three previously-flagged divergences as ADD-COLUMN:
    - `taxes`: `revenue_tax_multiplier` (double NOT NULL default 1.0) + `marketing_tax_rate_per_platform` (jsonb NOT NULL default `'{}'`) + `updated_by_user_id` (text nullable).
    - `fees_configuration`: `start_date` (tstz NOT NULL default `now()`) + `end_date` (tstz nullable) + `updated_by_user_id` (text nullable); previous `(storeId) UNIQUE` index dropped in favor of `(storeId, startDate)` composite.
    - `operational_costs`: `payment_method` (text nullable) + `active` (boolean NOT NULL default true) + `deleted_at` (tstz nullable); new `(storeId, active)` composite index.
  - Confirm the migration applied via `bun migrate:dev` — no manual schema work required by P9 itself.
  - Only remaining schema workaround: `operational_costs.label` (NOT NULL) maps to spec `description?` (optional) — the entity falls back to `category` when description is empty. Kept as-is (small, self-contained, not on the read path for any AC).

- [ ] **Step 3: Add path alias if missing**
  - Inspect `packages/api/typescript/tsconfig.json`; if `paths` lacks `@finance/*`, add it next to `@auth/*`.
  - Sanity: `bun tsc` still 0 errors after the alias add (no consumer code yet).

- [ ] **Step 4: Commit**

```bash
git add packages/api/typescript/tsconfig.json 2>/dev/null || true
git commit -m "chore(finance): path alias + schema audit (P9 Task 1)" --allow-empty
```

---

## Task 2: Taxes aggregate — entity + invariants

**Files:**
- Create: `packages/api/typescript/src/finance/entities/Taxes.ts`
- Create: `packages/api/typescript/src/finance/entities/Taxes.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 1

- [ ] **Step 1: Failing test asserts**
  - `Taxes.create({ storeId, revenueTaxType, revenueTaxDeductionType, revenueTaxRate, revenueTaxMultiplier, marketingTaxRatePerPlatform, startDate })` returns an entity with `endDate = undefined`.
  - `taxes.close(newStartDate)` sets `endDate = newStartDate`; throws `INVALID_START_DATE` if `newStartDate <= startDate`.
  - Negative `revenueTaxRate` → `INVALID_RATE`; rate > 1 → `INVALID_RATE`.
  - Each value of `marketingTaxRatePerPlatform` out of `[0, 1]` → `INVALID_RATE`.
  - Mutating `revenueTaxType` to `NONE` zeroes `revenueTaxRate` (invariant: `NONE ⇒ rate must be 0`).

- [ ] **Step 2: Implement**
  - Schema uses `TaxType` / `TaxDeductionType` / `MarketingPlatform` from `@template/contracts-typescript/wire` (re-exported via `enums/index.ts`).
  - `marketingTaxRatePerPlatform: z.record(MarketingPlatformSchema, z.number().min(0, { error: 'INVALID_RATE' as DomainErrors }).max(1, { error: 'INVALID_RATE' as DomainErrors }))`.
  - `static create({...})` returns `new Taxes({...})`.
  - `close(newStartDate: Date)` — guard against `<=` then `this.endDate = newStartDate; this.validate()`.

- [ ] **Step 3: Verify** — `bun test packages/api/typescript/src/finance/entities/Taxes.test.ts && bun tsc && bun lint`.

- [ ] **Step 4: Commit** — `feat(finance): Taxes aggregate with time-effective invariants (P9 Task 2)`.

---

## Task 3: FeesConfiguration aggregate — typed sub-fees

**Files:**
- Create: `packages/api/typescript/src/finance/entities/FeesConfiguration.ts`
- Create: `packages/api/typescript/src/finance/entities/FeesConfiguration.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /value-object
**Depends on:** Task 1

- [ ] **Step 1: Failing test asserts**
  - `FeesConfiguration.create({ storeId, gatewayFees: [], checkoutFees: [], shippingFee: { type: 'NONE', value: { type: 'NONE' } } })` succeeds.
  - Duplicate `(platform, paymentMethod)` in `gatewayFees[]` → `INVALID_RATE` (uniqueness invariant — `superRefine`).
  - Duplicate `platform` in `checkoutFees[]` → `INVALID_RATE`.
  - `shippingFee.type === 'AVERAGE_PER_ORDER'` requires `value.type === 'AVERAGE_PER_ORDER' && perOrder: MonetaryAmount`; type mismatch → `INVALID_RATE`. (Discriminated union from contracts wire/.)
  - `applyPatch({ gatewayFees?, checkoutFees?, shippingFee? })` mutates fields then `validate()`.

- [ ] **Step 2: Implement**
  - Reuse `GatewayFeeSchema` / `CheckoutFeeSchema` / `ShippingFeeSchema` from `@template/contracts-typescript/wire` (DO NOT redefine).
  - Composite schema attaches typed errors via `{ error: 'INVALID_RATE' as DomainErrors }` on `superRefine` for the uniqueness checks and the discriminator coherence check.

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): FeesConfiguration aggregate with typed sub-fees (P9 Task 3)`.

---

## Task 4: OperationalCost aggregate — ledger + status entries

**Files:**
- Create: `packages/api/typescript/src/finance/entities/OperationalCost.ts`
- Create: `packages/api/typescript/src/finance/entities/OperationalCost.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 1

- [ ] **Step 1: Failing test asserts**
  - `OperationalCost.create({ storeId, category, amount, recurrency, startDate, description?, paymentMethod? })` defaults `active = true`, `statusEntries = []`, `deletedAt = null`.
  - `endDate <= startDate` → `INVALID_DATE_RANGE`.
  - `amount.amountCents <= 0` → `VALIDATION_ERROR` (Zod min(1) on amountCents).
  - `softDelete()` sets `deletedAt = new Date()` and `active = false`.
  - `appendStatusEntry({ date, status })` pushes onto `statusEntries[]`; idempotent on identical `(date, status)` (no duplicate).
  - `applyPatch({ category?, description?, amount?, paymentMethod?, startDate?, endDate?, recurrency? })` re-validates.

- [ ] **Step 2: Implement** — Uses `MonetaryAmountSchema`, `OperationalCostStatusEntrySchema`, `OperationalCostCategorySchema`, `OperationalCostRecurrencySchema`, `OperationalCostPaymentStatusSchema`, `PaymentMethodSchema` from `@template/contracts-typescript/wire`.

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): OperationalCost aggregate with status entries (P9 Task 4)`.

---

## Task 5: WarrantyReserve aggregate

**Files:**
- Create: `packages/api/typescript/src/finance/entities/WarrantyReserve.ts`
- Create: `packages/api/typescript/src/finance/entities/WarrantyReserve.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 1

- [ ] **Step 1: Failing test asserts**
  - `rate` out of `[0, 1]` → `INVALID_RATE`.
  - `endDate <= startDate` → `INVALID_DATE_RANGE`.
  - `softDelete()` sets `deletedAt`.
  - `setRate(newRate)` re-validates.

- [ ] **Step 2: Implement.**

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): WarrantyReserve aggregate (P9 Task 5)`.

---

## Task 6: FxRate projection — free record class, append-only

**Files:**
- Create: `packages/api/typescript/src/finance/entities/FxRate.ts`
- Create: `packages/api/typescript/src/finance/entities/FxRate.test.ts`
- Create: `packages/api/typescript/src/finance/entities/index.ts` — barrel for all 5 entities

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /projection
**Depends on:** Task 1, iter 41 (CurrencyCode + FxRateSource wire enums)

- [ ] **Step 1: Failing test asserts**
  - `FxRate` is a **free record class** (NO `AggregateRoot` base; mirrors the `/projection` skill): `new FxRate({ id, fromCurrency, toCurrency, rate, source, startDate, createdAt })`.
  - Schema = `FxRateProjectionSchema` carrying `id`, `fromCurrency: CurrencyCodeSchema`, `toCurrency: CurrencyCodeSchema`, `rate: z.number().positive()`, `source: FxRateSourceSchema`, `startDate: z.date()`, `createdAt: z.date()`.
  - **Overloaded `static create(event)`** — one signature per creating event (today: only `FxRateCapturedEvent`). Constructs the row.
  - **NO `applyEvent`** — the projection is append-only; rows are never mutated after insert.

- [ ] **Step 2: Implement**

```typescript
import { z } from '@template/core-typescript'
import { CurrencyCodeSchema, FxRateSourceSchema } from '@template/contracts-typescript/wire'
import type { FxRateCapturedEvent } from '@finance/events'

export const FxRateProjectionSchema = z.object({
  id: z.string(),
  fromCurrency: CurrencyCodeSchema,
  toCurrency: CurrencyCodeSchema,
  rate: z.number().positive(),
  source: FxRateSourceSchema,
  startDate: z.date(),
  createdAt: z.date(),
})

export type FxRateProjectionProps = z.infer<typeof FxRateProjectionSchema>

export class FxRate {
  constructor(public props: FxRateProjectionProps) {
    FxRateProjectionSchema.parse(props)
  }

  static create(event: FxRateCapturedEvent): FxRate {
    const { fromCurrency, toCurrency, rate, source, startDate } = event.payload
    return new FxRate({
      id: `fx_${fromCurrency}_${toCurrency}_${new Date(startDate).toISOString()}`,
      fromCurrency, toCurrency, rate, source,
      startDate: new Date(startDate),
      createdAt: new Date(),
    })
  }
}
```

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): FxRate append-only projection (P9 Task 6)`.

---

## Task 7: Finance domain events (10)

**Files:**
- Create: `packages/api/typescript/src/finance/events/TaxesUpdatedEvent.ts`
- Create: `packages/api/typescript/src/finance/events/FeesConfigurationUpdatedEvent.ts`
- Create: `packages/api/typescript/src/finance/events/OperationalCostRecordedEvent.ts`
- Create: `packages/api/typescript/src/finance/events/OperationalCostUpdatedEvent.ts`
- Create: `packages/api/typescript/src/finance/events/OperationalCostDeletedEvent.ts`
- Create: `packages/api/typescript/src/finance/events/OperationalCostStatusToggledEvent.ts`
- Create: `packages/api/typescript/src/finance/events/WarrantyReserveCreatedEvent.ts`
- Create: `packages/api/typescript/src/finance/events/WarrantyReserveUpdatedEvent.ts`
- Create: `packages/api/typescript/src/finance/events/WarrantyReserveDeletedEvent.ts`
- Create: `packages/api/typescript/src/finance/events/FxRateCapturedEvent.ts`
- Create: `packages/api/typescript/src/finance/events/index.ts` (barrel)
- Create: `packages/api/typescript/src/finance/events/index.test.ts` (asserts all 10 names + payload safeParse)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event
**Depends on:** Tasks 2–6

- [ ] **Step 1: Failing test** — asserts each event's `name` constant:
  - `finance.taxes.updated`
  - `finance.fees_configuration.updated`
  - `finance.operational_cost.recorded` / `.updated` / `.deleted` / `.status_toggled`
  - `finance.warranty_reserve.created` / `.updated` / `.deleted`
  - `finance.fx_rate.captured`

  Plus payload `safeParse` for each per spec §4 BC8 "Published Events" + §7.8 command "Domain Events".

- [ ] **Step 2: Implement** — Each event is a `class extends BaseDomainEvent<typeof Schema>` with `static override readonly name as const` + `static readonly schema = z.domainEvent({...})`. Payloads:
  - `TaxesUpdatedEvent` — `{ storeId, taxesId, changedFields: string[], effectiveStartDate: string }`
  - `FeesConfigurationUpdatedEvent` — `{ storeId, feesConfigurationId, changedFeeCategories: ('GATEWAY'|'CHECKOUT'|'SHIPPING')[], effectiveStartDate: string }`
  - `OperationalCostRecordedEvent` — `{ operationalCostId, storeId, category: OperationalCostCategory, amount: MonetaryAmount }`
  - `OperationalCostUpdatedEvent` — `{ operationalCostId, storeId, changedFields: string[] }`
  - `OperationalCostDeletedEvent` — `{ operationalCostId, storeId }`
  - `OperationalCostStatusToggledEvent` — `{ operationalCostId, storeId, status: OperationalCostPaymentStatus, date: string }`
  - `WarrantyReserveCreatedEvent` — `{ warrantyReserveId, storeId, rate: number }`
  - `WarrantyReserveUpdatedEvent` — `{ warrantyReserveId, storeId, changedFields: string[] }`
  - `WarrantyReserveDeletedEvent` — `{ warrantyReserveId, storeId }`
  - `FxRateCapturedEvent` — `{ fromCurrency: CurrencyCode, toCurrency: CurrencyCode, rate: number, source: FxRateSource, startDate: string }`

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): 10 domain events (P9 Task 7)`.

---

## Task 8: Finance errors index + side-effect registerErrorCodes

**Files:**
- Create: `packages/api/typescript/src/finance/errors/index.ts`
- Create: `packages/api/typescript/src/finance/errors/index.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /errors
**Depends on:** none (mirrors `auth/errors/index.ts`)

- [ ] **Step 1: Failing test asserts**
  - `BaseError<DomainErrors>('INVALID_RATE')` compiles (typed string literal narrows correctly).
  - `BaseError<ApplicationErrors>('OPERATIONAL_COST_NOT_FOUND')` compiles.
  - Non-glossary codes fail `@ts-expect-error` assertion.

- [ ] **Step 2: Implement** following `auth/errors/index.ts` shape:

```typescript
import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type {
  BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors,
} from '@template/core-typescript'

export type FinanceDomainErrors = 'INVALID_RATE' | 'INVALID_START_DATE' | 'INVALID_DATE_RANGE'
export type DomainErrors = BaseDomainErrors | FinanceDomainErrors

export type FinanceApplicationErrors =
  | 'OPERATIONAL_COST_NOT_FOUND'
  | 'WARRANTY_RESERVE_NOT_FOUND'
  | 'TAXES_NOT_FOUND'
  | 'FEES_CONFIGURATION_NOT_FOUND'
  | 'FX_PROVIDER_UNAVAILABLE'
export type ApplicationErrors = BaseApplicationErrors | FinanceApplicationErrors

export type FinanceInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | FinanceInterfaceErrors

export type FinanceInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | FinanceInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

registerErrorCodes({
  INVALID_RATE: HttpStatusCode.BAD_REQUEST,
  INVALID_START_DATE: HttpStatusCode.BAD_REQUEST,
  INVALID_DATE_RANGE: HttpStatusCode.BAD_REQUEST,
  OPERATIONAL_COST_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  WARRANTY_RESERVE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  TAXES_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  FEES_CONFIGURATION_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  FX_PROVIDER_UNAVAILABLE: HttpStatusCode.SERVICE_UNAVAILABLE,
})
```

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): error glossary + registration (P9 Task 8)`.

---

## Task 9: Five Repository interfaces + Mock implementations

**Files:**
- Create: `packages/api/typescript/src/finance/repositories/TaxesRepository/{TaxesRepository,MockTaxesRepository,index}.ts`
- Create: `packages/api/typescript/src/finance/repositories/FeesConfigurationRepository/{...}` (same triple)
- Create: `packages/api/typescript/src/finance/repositories/OperationalCostRepository/{...}`
- Create: `packages/api/typescript/src/finance/repositories/WarrantyReserveRepository/{...}`
- Create: `packages/api/typescript/src/finance/repositories/FxRateRepository/{...}`
- Create: `packages/api/typescript/src/finance/repositories/index.ts` (barrel)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository
**Depends on:** Tasks 2–6, 8

- [ ] **Step 1: Failing tests** — for each interface assert the Mock implementation satisfies it (instantiate, save, find, query).

  Required interfaces:

  - `TaxesRepository extends Repository<Taxes>`
    - `findById(id, tx?)`
    - `findActiveByStoreId(storeId, tx?)` — returns row where `endDate IS NULL`.
    - `findEffectiveAt(storeId, at, tx?)` — returns row where `startDate <= at AND (endDate IS NULL OR endDate > at)`.

  - `FeesConfigurationRepository extends Repository<FeesConfiguration>`
    - `findById`, `findByStoreId(storeId, tx?)` — returns the single config (table has UNIQUE on `storeId`).

  - `OperationalCostRepository extends Repository<OperationalCost>`
    - `findById`
    - `findByStoreId(storeId, filters: { dateRange?, categories?, active? }, pagination: { page, limit }, tx?)` — returns `{ total, items }`. `active` pushes into the WHERE clause (`active = ?` AND `deleted_at IS NULL` when true; no filter when omitted) — both columns shipped in iter-43.6b migration 0014.

  - `WarrantyReserveRepository extends Repository<WarrantyReserve>`
    - `findById`, `findByStoreId(storeId, tx?)`, `findEffectiveAt(storeId, at, tx?)`.

  - **`FxRateRepository`** — does NOT extend `Repository<FxRate>` (the projection is append-only and has no `save`). Declared as a free abstract class:
    - `insertIfNew(fxRate: FxRate, tx?): Promise<boolean>` — uses Postgres `ON CONFLICT DO NOTHING` over the existing `pair_start_date_idx`; if no UNIQUE constraint backs the index, fall back to a `SELECT ... LIMIT 1` precheck + insert (acceptable for hourly cadence). Returns `true` if inserted.
    - `findEffectiveAt(fromCurrency, toCurrency, at, tx?): Promise<FxRate | undefined>` — **canonical query** = `SELECT * FROM finance.fx_rates WHERE from_currency = ? AND to_currency = ? AND start_date <= ? ORDER BY start_date DESC LIMIT 1`.
    - `findManyEffectiveAt(pairs: { fromCurrency, toCurrency }[], at, tx?): Promise<Map<string, FxRate>>` — batched, keyed by `${from}->${to}`.
    - `findByPair(filters: { fromCurrency?, toCurrency?, dateRange? }, pagination: { page, limit }, tx?)` — admin listing T29.

- [ ] **Step 2: Implement Mock variants** — in-memory `Map`s; `findEffectiveAt` sorts by `startDate` descending and returns the first row with `startDate <= at`.

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): 5 repository interfaces + mocks (P9 Task 9)`.

---

## Task 10: Drizzle implementations of the 5 repositories + integration tests

**Files:**
- Create: `packages/api/typescript/src/finance/repositories/TaxesRepository/DrizzleTaxesRepository.ts`
- Create: `packages/api/typescript/src/finance/repositories/TaxesRepository/DrizzleTaxesRepository.test.ts`
- (Same pair for the remaining four)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /test
**Depends on:** Task 1, Task 9

- [ ] **Step 1: Failing integration tests** — each test file resolves the Drizzle repo from a child container against PGlite. Asserts:
  - `save → findById` round-trip preserves all fields (including JSONB arrays/objects — the jsonb columns `gateway_fees` / `checkout_fees` / `shipping_fees` / `status_entries` round-trip via `tryCatchAsync`).
  - `save → findActiveByStoreId` returns only the row where `endDate IS NULL`.
  - `findEffectiveAt(storeId, '2026-06-01')` returns the row whose period covers `2026-06-01`.
  - For `FxRateRepository`: `insertIfNew` twice with same pair+startDate → second returns `false`, only one row in DB.
  - For `FxRateRepository.findEffectiveAt('BRL', 'USD', '2026-06-15')`: with rows at `2026-06-01` and `2026-06-10`, returns the `2026-06-10` row. With a row at `2026-07-01`, that row is NOT returned (`start_date > at`).
  - For `OperationalCostRepository.findByStoreId`: filters by `category`, `dateRange`, paginates correctly; `active === true` pushes `WHERE active = true AND deleted_at IS NULL` into the SQL (both columns DB-backed since iter-43.6b migration 0014). Soft-delete asserts `active = false` AND `deleted_at IS NOT NULL` on the row after `C43`.

- [ ] **Step 2: Implement** — Drizzle versions follow `DrizzleUserRepository.ts` pattern (`tryCatchAsync` boundary; manual `incrementVersion()` + `onConflictDoUpdate` keyed on `id` for aggregates with optimistic lock). For `FxRate`: plain `db.insert(fxRates).values(...).onConflictDoNothing()` over the index (or precheck + insert if no UNIQUE constraint backs it). `toDomain` / `toPersistence` private helpers per repo.

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): Drizzle repositories with integration tests (P9 Task 10)`.

---

## Task 11: FxProvider service — interface + Currency API + Mock (Contract Lock for cron)

**Files:**
- Create: `packages/api/typescript/src/finance/services/FxProvider/FxProvider.ts`
- Create: `packages/api/typescript/src/finance/services/FxProvider/CurrencyApiFxProvider.ts`
- Create: `packages/api/typescript/src/finance/services/FxProvider/MockFxProvider.ts`
- Create: `packages/api/typescript/src/finance/services/FxProvider/index.ts`
- Create: `packages/api/typescript/src/finance/services/FxProvider/CurrencyApiFxProvider.test.ts` (stubs global `fetch`)
- Modify (if needed): `packages/api/typescript/core/src/utils/Config.ts` — add `CURRENCY_API_KEY: z.string().optional()` and `CURRENCY_API_BASE_URL: z.string().url().default('https://api.currencyapi.com/v3')` to the env schema. If polyglot's `Config` lives at `@template/core-typescript`'s `Config`, modification happens there. If P9 cannot extend the shared Config, add a Finance-local `FinanceConfig` value-object reading `process.env` directly with a Zod validator.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service
**Depends on:** Task 1

- [ ] **Step 1: Failing test**
  - Interface `FxProvider` defines:
    ```typescript
    abstract fetchRates(pairs: { fromCurrency: CurrencyCode; toCurrency: CurrencyCode }[]): Promise<FxRateFetched[]>
    ```
    with `FxRateFetched = { fromCurrency, toCurrency, rate, source: 'CURRENCY_API', fetchedAt: Date }`.
  - `MockFxProvider` deterministic table: `BRL→USD = 0.20`, `USD→BRL = 5.00`, `EUR→USD = 1.07`, etc.
  - `CurrencyApiFxProvider` test stubs `globalThis.fetch` to return a canned currencyapi.com response; asserts each input pair maps to a `FxRateFetched` with `source: 'CURRENCY_API'`. Provider error (HTTP 503 / non-JSON / missing `data[currency].value`) throws `BaseError<ApplicationErrors>('FX_PROVIDER_UNAVAILABLE')`.

- [ ] **Step 2: Implement** — `CurrencyApiFxProvider` reads `CURRENCY_API_KEY` + `CURRENCY_API_BASE_URL` from the resolved Config; calls `${baseUrl}/latest?apikey=${key}&base_currency=${from}&currencies=${to,…}`. Groups input pairs by `fromCurrency` to minimize HTTP calls (one call per distinct base).

- [ ] **Step 2.a (Contract Lock — env):**
  - Add `CURRENCY_API_KEY=` and `CURRENCY_API_BASE_URL=https://api.currencyapi.com/v3` to `.env.example`.
  - Boot fails loudly if `CURRENCY_API_KEY` missing AND `NODE_ENV=production` AND `enableCrons === true`.

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): FxProvider service (real + mock) (P9 Task 11)`.

---

## Task 12: FxRateService — canonical cross-BC API

**Files:**
- Create: `packages/api/typescript/src/finance/services/FxRateService/FxRateService.ts` (abstract interface)
- Create: `packages/api/typescript/src/finance/services/FxRateService/DrizzleFxRateService.ts` (real)
- Create: `packages/api/typescript/src/finance/services/FxRateService/MockFxRateService.ts` (mock — wraps MockFxRateRepository)
- Create: `packages/api/typescript/src/finance/services/FxRateService/FxRateService.test.ts` (integration — PGlite)
- Create: `packages/api/typescript/src/finance/services/FxRateService/index.ts`
- Create: `packages/api/typescript/src/finance/services/index.ts` (barrel)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service
**Depends on:** Tasks 6, 9, 10

- [ ] **Step 1: Failing tests**
  - `FxRateService.findEffectiveAt(from, to, at)` returns `{ rate: number, source: FxRateSource, startDate: Date } | undefined`. **THIS is the canonical entry point** — every cross-BC consumer uses it.
  - With rows `BRL→USD` at `2026-01-01` (rate 0.20) and `2026-03-01` (rate 0.18), `findEffectiveAt('BRL', 'USD', '2026-02-15')` returns `{ rate: 0.20, startDate: 2026-01-01, ... }`.
  - `findEffectiveAt('BRL', 'USD', '2026-04-01')` returns the `2026-03-01` row.
  - `findEffectiveAt` returning `undefined` is the cold-start signal — callers fall back to native currency and flag.
  - `findManyEffectiveAt(pairs, at)` returns a `Map<string, EffectiveRate>` keyed by `${from}->${to}`; batched into a single SQL call per distinct `(from, to)` pair using a UNION of windowed selects or an `IN (...)` + window function.
  - **Reflexive shortcut:** `findEffectiveAt('USD', 'USD', at)` returns `{ rate: 1, source: 'CURRENCY_API', startDate: at }` without hitting the DB (identity).

- [ ] **Step 2: Implement** — `DrizzleFxRateService` delegates to `FxRateRepository.findEffectiveAt` and packs the result into the public `EffectiveRate` shape. The service exists (instead of consumers using the repo directly) so cross-BC consumers depend on a STABLE `findEffectiveAt` interface without learning Drizzle table layout.

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): FxRateService canonical cross-BC API (P9 Task 12)`.

---

## Task 13: C39 UpdateTaxes — use case + test

**Files:**
- Create: `packages/api/typescript/src/finance/usecases/UpdateTaxes.ts`
- Create: `packages/api/typescript/src/finance/usecases/UpdateTaxes.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** Tasks 2, 7, 8, 9, 10

- [ ] **Step 1: Failing tests**
  - No existing active row → creates a new one with provided `startDate`. Emits `TaxesUpdatedEvent` with `changedFields = ['<all provided keys>']`.
  - Existing active row, `input.startDate > existing.startDate` → closes existing (sets `endDate = input.startDate`), inserts new row carrying merged fields. Emits `TaxesUpdatedEvent`.
  - `input.startDate <= existing.startDate` → throws `INVALID_START_DATE`.
  - `revenueTaxRate` out of `[0, 1]` → `INVALID_RATE`.
  - Both old and new rows visible after commit; `findEffectiveAt(existing.startDate)` returns old, `findEffectiveAt(input.startDate)` returns new.

- [ ] **Step 2: Implement** — `extends Handler<typeof Input, typeof Output>`; `name = 'update_taxes' as const`; injects `TaxesRepository`. Inside `withTransaction`: `findActiveByStoreId → close existing if any → Taxes.create(merged) → save → save TaxesUpdatedEvent`.

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): UpdateTaxes use case (C39) (P9 Task 13)`.

---

## Task 14: C40 UpdateFeesConfiguration — use case + test

**Files:**
- Create: `packages/api/typescript/src/finance/usecases/UpdateFeesConfiguration.ts`
- Create: `packages/api/typescript/src/finance/usecases/UpdateFeesConfiguration.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** Tasks 3, 7, 9, 10

- [ ] **Step 1: Failing tests** — C40 uses the spec-canonical close-and-insert pattern (matching C39 Taxes), enabled by iter-43.6b migration 0014 which added `start_date`/`end_date` to `fees_configuration`:
  - No existing active row → inserts a new one with provided sub-fields (missing sub-fields default to `[]` / `{ type: 'NONE', value: { type: 'NONE' } }`) and `startDate = input.startDate ?? now()`. Emits `FeesConfigurationUpdatedEvent` with `changedFeeCategories` derived from which subset was provided + `effectiveStartDate`.
  - Existing active row, `input.startDate > existing.startDate` → sets existing row's `endDate = input.startDate`, inserts new row carrying merged sub-fields. Emits same event.
  - Existing active row, `input.startDate` missing or equal to existing → mutates active row in place + bumps `version`. Emits event with `effectiveStartDate = existing.startDate`.
  - `INVALID_RATE` from entity (uniqueness violation in gatewayFees/checkoutFees, shipping discriminator mismatch) propagates.

- [ ] **Step 2: Implement.**

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): UpdateFeesConfiguration use case (C40) (P9 Task 14)`.

---

## Task 15: C41–C44 OperationalCost use cases — Create / Update / Delete / ToggleStatus

**Files:**
- Create: `packages/api/typescript/src/finance/usecases/CreateOperationalCost.ts` + `.test.ts`
- Create: `packages/api/typescript/src/finance/usecases/UpdateOperationalCost.ts` + `.test.ts`
- Create: `packages/api/typescript/src/finance/usecases/DeleteOperationalCost.ts` + `.test.ts`
- Create: `packages/api/typescript/src/finance/usecases/ToggleOperationalCostStatus.ts` + `.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** Tasks 4, 7, 9, 10

- [ ] **Step 1: Failing tests (one suite per use case)**
  - `CreateOperationalCost` — happy path returns `{ operationalCostId }`, emits `OperationalCostRecordedEvent`. `endDate <= startDate` → `INVALID_DATE_RANGE`.
  - `UpdateOperationalCost` — partial update; missing row → `OPERATIONAL_COST_NOT_FOUND`. Emits `OperationalCostUpdatedEvent` with `changedFields`.
  - `DeleteOperationalCost` — calls `entity.softDelete()`, saves, emits `OperationalCostDeletedEvent`. Missing row → `OPERATIONAL_COST_NOT_FOUND`.
  - `ToggleOperationalCostStatus` — appends `{ date, status }` to `statusEntries[]`, idempotent. Emits `OperationalCostStatusToggledEvent`. Missing row → `OPERATIONAL_COST_NOT_FOUND`.

- [ ] **Step 2: Implement** all four following the `RegisterUser` shape.

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): OperationalCost use cases C41-C44 (P9 Task 15)`.

---

## Task 16: C45–C47 WarrantyReserve use cases — Create / Update / Delete

**Files:**
- Create: `packages/api/typescript/src/finance/usecases/CreateWarrantyReserve.ts` + `.test.ts`
- Create: `packages/api/typescript/src/finance/usecases/UpdateWarrantyReserve.ts` + `.test.ts`
- Create: `packages/api/typescript/src/finance/usecases/DeleteWarrantyReserve.ts` + `.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** Tasks 5, 7, 9, 10

- [ ] **Step 1 + 2: Tests + impl** — mirror Task 15 patterns. Missing row → `WARRANTY_RESERVE_NOT_FOUND`. `INVALID_RATE` / `INVALID_DATE_RANGE` propagate from entity.

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): WarrantyReserve use cases C45-C47 (P9 Task 16)`.

---

## Task 17: C48 CaptureFxRates — use case + test

**Files:**
- Create: `packages/api/typescript/src/finance/usecases/CaptureFxRates.ts`
- Create: `packages/api/typescript/src/finance/usecases/CaptureFxRates.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase
**Depends on:** Tasks 6, 7, 9, 10, 11

- [ ] **Step 1: Failing tests**
  - `input = { pairs: [{ fromCurrency: 'BRL', toCurrency: 'USD' }, { fromCurrency: 'USD', toCurrency: 'BRL' }] }` → calls `FxProvider.fetchRates`, gets 2 results, inserts 2 `FxRate` rows via `repo.insertIfNew`, returns `{ captured: 2, skipped: 0 }`. Emits `FxRateCapturedEvent` once per inserted row.
  - Second invocation with identical startDates → `insertIfNew` returns `false` for both → `{ captured: 0, skipped: 2 }`, **no events emitted** (idempotent).
  - `pairs` omitted → defaults to all unique ordered pairs of `[BRL, USD, EUR, GBP, ARS]` (v1 default; expand later via Config).
  - `FxProvider` throws → use case wraps as `FX_PROVIDER_UNAVAILABLE`.

- [ ] **Step 2: Implement** — `extends Handler<typeof Input, typeof Output>`; `name = 'capture_fx_rates' as const`. Wraps all inserts in **one transaction**; emits events ONLY for rows that were actually inserted (skip path emits nothing).

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): CaptureFxRates use case (C48) (P9 Task 17)`.

---

## Task 18: T25–T29 query use cases (5)

**Files:**
- Create: `packages/api/typescript/src/finance/usecases/GetTaxesSettings.ts` + `.test.ts`              # T25
- Create: `packages/api/typescript/src/finance/usecases/GetFeesConfigurationSettings.ts` + `.test.ts`  # T26
- Create: `packages/api/typescript/src/finance/usecases/ListOperationalCosts.ts` + `.test.ts`          # T27
- Create: `packages/api/typescript/src/finance/usecases/ListWarrantyReserves.ts` + `.test.ts`          # T28
- Create: `packages/api/typescript/src/finance/usecases/AdminListFxRates.ts` + `.test.ts`              # T29
- Create: `packages/api/typescript/src/finance/usecases/index.ts` (barrel for all 15 use cases)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query
**Depends on:** Tasks 9, 10, 12

- [ ] **Step 1: Failing tests** (per spec §7.8 read shapes):
  - **T25 GetTaxesSettings** — `Input { storeId, effectiveOnDate? }` → resolves via `findActiveByStoreId(storeId)` (default) or `findEffectiveAt(storeId, effectiveOnDate)`. Output matches §7.8 T25.
  - **T26 GetFeesConfigurationSettings** — analogous against `FeesConfigurationRepository.findByStoreId`.
  - **T27 ListOperationalCosts** — `{ storeId, dateRange?, categories?, active?, page, limit }` → calls `OperationalCostRepository.findByStoreId(...)`. Each item gets `amountInReportingCurrency` computed via `FxRateService.findEffectiveAt(item.amount.currency, store.reportingCurrency, item.createdAt)`. If P2-TENANCY's `StoreRepository` is unavailable at /build time → fall back to `amountInReportingCurrency = item.amount` and log the gap (see opening QUESTION).
  - **T28 ListWarrantyReserves** — `{ storeId }` → returns all rows sorted by `startDate` DESC.
  - **T29 AdminListFxRates** — `{ fromCurrency?, toCurrency?, dateRange?, page, limit }` → calls `FxRateRepository.findByPair(...)`. **Admin-only** — controller enforces `x-admin-secret`; use case trusts caller.

- [ ] **Step 2: Implement** — Each use case `extends Handler<typeof I, typeof O>`. Cross-BC dependency on `StoreRepository` injected via constructor (see opening QUESTION).

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): T25-T29 query use cases (P9 Task 18)`.

---

## Task 19: Controllers (15) — wire HTTP surface (Contract Lock)

**Files:**
- Create: `packages/api/typescript/src/finance/controllers/*Controller.ts` (15 files; see File Structure table)
- Create: `packages/api/typescript/src/finance/controllers/index.ts` (barrel — named exports of every controller class)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /schema
**Depends on:** Tasks 13–18

This is a **Contract Lock Task** — the OpenAPI surface emerges from these controllers' input/output schemas. The polyglot pipeline (`bun emit-openapi`) consumes these to update `packages/api/typescript/public/docs/openapi.json` and downstream client SDKs.

- [ ] **Step 1: Failing tests** — for each controller create a colocated `<Controller>.test.ts` that exercises the route's happy path + one validation failure + one auth failure (UNAUTHORIZED). Tests build a child container and execute the controller via `controller.handle(request)`.

- [ ] **Step 2: Implement** each controller following `GetSessionController`:
  - `InputSchema = z.object({ body?, params?, query?, headers? }).example([...])`.
  - `path` matches the File Structure table (full paths with leading `/finance`).
  - `description` mirrors the spec command/read summary.
  - Output schemas carry `.example([...])` for OpenAPI examples.
  - Controller body calls the corresponding use case with `storeId` resolved from `ResolveActiveStoreMiddleware` (see opening QUESTION — fall back to `params.storeId` + inline-guard if P2-TENANCY hasn't shipped the middleware).
  - `AdminListFxRatesController` enforces `x-admin-secret` via a controller-local middleware (or inline guard) — throws `UNAUTHORIZED` if header missing/mismatched against `Config.adminSecret`.

- [ ] **Step 3: Verify** — `bun test packages/api/typescript/src/finance/controllers && bun tsc && bun lint`.

- [ ] **Step 4: Commit** — `feat(finance): 15 controllers (T25-T29 + C39-C48) (P9 Task 19)`.

---

## Task 20: 10 Finance integration events authored in contracts/wire/ + codegen (Contract Lock)

**Files:**
- Create: `packages/contracts/wire/events/taxes-updated.tsp`
- Create: `packages/contracts/wire/events/fees-configuration-updated.tsp`
- Create: `packages/contracts/wire/events/operational-cost-recorded.tsp`
- Create: `packages/contracts/wire/events/operational-cost-updated.tsp`
- Create: `packages/contracts/wire/events/operational-cost-deleted.tsp`
- Create: `packages/contracts/wire/events/operational-cost-status-toggled.tsp`
- Create: `packages/contracts/wire/events/warranty-reserve-created.tsp`
- Create: `packages/contracts/wire/events/warranty-reserve-updated.tsp`
- Create: `packages/contracts/wire/events/warranty-reserve-deleted.tsp`
- Create: `packages/contracts/wire/events/fx-rate-captured.tsp`
- Modify: `packages/contracts/wire/events/index.tsp` — append 10 new `import "./<event>.tsp"` lines.
- Regen: `bun --filter @template/contracts codegen:wire` (writes to `packages/contracts/generated/{typescript,go,rust}/wire/`).

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event
**Depends on:** Task 7 (domain events lock the payload shapes)

This is a **Contract Lock Task** — these are the public bus contracts that Analytics (P11) and Notifications (P10) will consume. Locking now lets downstream BCs develop against a stable schema.

- [ ] **Step 1: Author each TypeSpec file** following `order-updated.tsp`:

```tsp
import "./_base.tsp";

namespace TemplateContracts;

@doc("Published by TS Finance after a Store's Taxes aggregate is updated (close-and-insert). Analytics invalidates profit-margin caches.")
model TaxesUpdatedEvent extends IntegrationEvent {
  name: "integration.shared.finance.taxes.updated";
  storeId: string;
  taxesId: string;
  changedFields: string[];
  @encode("rfc3339", string)
  effectiveStartDate: utcDateTime;
}
```

  And the analogous shape for each of the remaining 9 events. **Names** (assert in tests):
  - `integration.shared.finance.taxes.updated`
  - `integration.shared.finance.fees_configuration.updated`
  - `integration.shared.finance.operational_cost.recorded` / `.updated` / `.deleted` / `.status_toggled`
  - `integration.shared.finance.warranty_reserve.created` / `.updated` / `.deleted`
  - `integration.shared.finance.fx_rate.captured`

  `FxRateCapturedIntegrationEvent` payload: `{ fromCurrency: CurrencyCode, toCurrency: CurrencyCode, rate: float64, source: FxRateSource, startDate: utcDateTime }` — Analytics uses this to invalidate cached margin computations.

- [ ] **Step 2: Append imports + regenerate**

```bash
# 2a) modify packages/contracts/wire/events/index.tsp
# 2b) regenerate the language-specific wire shapes
bun --filter @template/contracts codegen:wire
# Verify: packages/contracts/generated/typescript/wire/ now contains TaxesUpdatedEvent.ts etc.
```

- [ ] **Step 3: Failing test (TS side)** — `packages/api/typescript/src/finance/handlers/TaxesUpdatedHandler.test.ts` imports the generated class from `@template/contracts-typescript/wire` and asserts `TaxesUpdatedEvent.name === 'integration.shared.finance.taxes.updated'`.

- [ ] **Step 4: Verify + Commit** — `bun tsc && bun lint && bun --filter @template/contracts test`; commit as `feat(contracts): 10 Finance integration events (P9 Task 20)`.

---

## Task 21: Finance internal handlers — publish 10 Finance integration events

**Files:**
- Create: `packages/api/typescript/src/finance/handlers/TaxesUpdatedHandler.ts`
- Create: `packages/api/typescript/src/finance/handlers/FeesConfigurationUpdatedHandler.ts`
- Create: `packages/api/typescript/src/finance/handlers/OperationalCostRecordedHandler.ts`
- Create: `packages/api/typescript/src/finance/handlers/OperationalCostUpdatedHandler.ts`
- Create: `packages/api/typescript/src/finance/handlers/OperationalCostDeletedHandler.ts`
- Create: `packages/api/typescript/src/finance/handlers/OperationalCostStatusToggledHandler.ts`
- Create: `packages/api/typescript/src/finance/handlers/WarrantyReserveCreatedHandler.ts`
- Create: `packages/api/typescript/src/finance/handlers/WarrantyReserveUpdatedHandler.ts`
- Create: `packages/api/typescript/src/finance/handlers/WarrantyReserveDeletedHandler.ts`
- Create: `packages/api/typescript/src/finance/handlers/FxRateCapturedHandler.ts`
- Create: `packages/api/typescript/src/finance/handlers/internal.ts` (named-export barrel of all 10)
- Create: `packages/api/typescript/src/finance/handlers/external.ts` (empty: `export {}`)
- Create: `packages/api/typescript/src/finance/handlers/TaxesUpdatedHandler.test.ts` (representative test — others mirror)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler
**Depends on:** Task 7, Task 20

- [ ] **Step 1: Failing test (representative)** — per MEMORY (`givenEvent is for cross-process boundaries`): instantiate `TaxesUpdatedHandler` with a mock `ExternalMediator`, build a `TaxesUpdatedEvent` directly (`new TaxesUpdatedEvent({...})`), call `handler.handle(event)`, assert the mediator received a `TaxesUpdatedIntegrationEvent` (from `@template/contracts-typescript/wire`) with the same payload — **do NOT seed `shared.events`**.

- [ ] **Step 2: Implement** each handler following `NotifySubscribersHandler` shape — `@injectable()` + `extends EventHandler<typeof DomainEvent>` with `readonly event = DomainEvent`, constructor injects `ExternalMediator`, `handle(event)` constructs and publishes the matching `*IntegrationEvent` from `@template/contracts-typescript/wire`. `FxRateCapturedHandler` fans out one integration event per domain event (1:1 — the CaptureFxRates use case emits one domain event per inserted row).

- [ ] **Step 3 + 4: Verify + Commit** — `feat(finance): 10 internal handlers publish integration events (P9 Task 21)`.

---

## Task 22: CaptureFxRatesScheduler + BC bootstrap + DI registry + root mount + SDK regen (Contract Lock)

**Files:**
- Create: `packages/api/typescript/src/finance/services/CaptureFxRatesScheduler/CaptureFxRatesScheduler.ts`
- Create: `packages/api/typescript/src/finance/services/CaptureFxRatesScheduler/CaptureFxRatesScheduler.test.ts`
- Create: `packages/api/typescript/src/finance/services/CaptureFxRatesScheduler/index.ts`
- Create: `packages/api/typescript/src/finance/registry.ts`
- Create: `packages/api/typescript/src/finance/index.ts`
- Create: `packages/api/typescript/src/finance/enums/index.ts` (re-export barrel for Finance-relevant wire enums)
- Modify: `packages/api/typescript/src/index.ts` — `import FinanceRouter from '@finance/index'`; append to `routers` array.
- Regen: `packages/api/typescript/public/docs/openapi.json` via `bun emit-openapi`.
- Regen: `packages/client/dist/**` via `bun sdk` (if the polyglot SDK pipeline exists; if not, document the gap).

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /bounded-context, /sdk
**Depends on:** Tasks 1–21

- [ ] **Step 1: CaptureFxRatesScheduler**
  - `start()` schedules `setInterval(cb, 60 * 60 * 1000)`.
  - `cb` resolves `CaptureFxRates` from the container and calls `.execute({ pairs: undefined })`.
  - Tests use `bun:test` `mock.useFakeTimers`; advance 1h → use case executed once; advance another 1h → twice.
  - `stop()` clears the interval.
  - Boot gate: `if (Config.env.NODE_ENV === 'production' || Config.env.ENABLE_CRONS === 'true')` resolve and start.

- [ ] **Step 2: Create `packages/api/typescript/src/finance/registry.ts`**

```typescript
import './errors' // Side-effect: registerErrorCodes
import type { InstanceRegistry } from '@template/core-typescript'
import { TaxesRepository } from './repositories/TaxesRepository/TaxesRepository'
import { DrizzleTaxesRepository } from './repositories/TaxesRepository/DrizzleTaxesRepository'
import { MockTaxesRepository } from './repositories/TaxesRepository/MockTaxesRepository'
import { FeesConfigurationRepository } from './repositories/FeesConfigurationRepository/FeesConfigurationRepository'
import { DrizzleFeesConfigurationRepository } from './repositories/FeesConfigurationRepository/DrizzleFeesConfigurationRepository'
import { MockFeesConfigurationRepository } from './repositories/FeesConfigurationRepository/MockFeesConfigurationRepository'
import { OperationalCostRepository } from './repositories/OperationalCostRepository/OperationalCostRepository'
import { DrizzleOperationalCostRepository } from './repositories/OperationalCostRepository/DrizzleOperationalCostRepository'
import { MockOperationalCostRepository } from './repositories/OperationalCostRepository/MockOperationalCostRepository'
import { WarrantyReserveRepository } from './repositories/WarrantyReserveRepository/WarrantyReserveRepository'
import { DrizzleWarrantyReserveRepository } from './repositories/WarrantyReserveRepository/DrizzleWarrantyReserveRepository'
import { MockWarrantyReserveRepository } from './repositories/WarrantyReserveRepository/MockWarrantyReserveRepository'
import { FxRateRepository } from './repositories/FxRateRepository/FxRateRepository'
import { DrizzleFxRateRepository } from './repositories/FxRateRepository/DrizzleFxRateRepository'
import { MockFxRateRepository } from './repositories/FxRateRepository/MockFxRateRepository'
import { FxProvider } from './services/FxProvider/FxProvider'
import { CurrencyApiFxProvider } from './services/FxProvider/CurrencyApiFxProvider'
import { MockFxProvider } from './services/FxProvider/MockFxProvider'
import { FxRateService } from './services/FxRateService/FxRateService'
import { DrizzleFxRateService } from './services/FxRateService/DrizzleFxRateService'
import { MockFxRateService } from './services/FxRateService/MockFxRateService'

export const INSTANCE_REGISTRY: InstanceRegistry = {
  mock: [
    { token: TaxesRepository, instance: MockTaxesRepository },
    { token: FeesConfigurationRepository, instance: MockFeesConfigurationRepository },
    { token: OperationalCostRepository, instance: MockOperationalCostRepository },
    { token: WarrantyReserveRepository, instance: MockWarrantyReserveRepository },
    { token: FxRateRepository, instance: MockFxRateRepository },
    { token: FxProvider, instance: MockFxProvider },
    { token: FxRateService, instance: MockFxRateService },
  ],
  integration: [
    { token: TaxesRepository, instance: DrizzleTaxesRepository },
    { token: FeesConfigurationRepository, instance: DrizzleFeesConfigurationRepository },
    { token: OperationalCostRepository, instance: DrizzleOperationalCostRepository },
    { token: WarrantyReserveRepository, instance: DrizzleWarrantyReserveRepository },
    { token: FxRateRepository, instance: DrizzleFxRateRepository },
    { token: FxProvider, instance: MockFxProvider },           // integration uses Mock — no live HTTP
    { token: FxRateService, instance: DrizzleFxRateService },
  ],
  real: [
    { token: TaxesRepository, instance: DrizzleTaxesRepository },
    { token: FeesConfigurationRepository, instance: DrizzleFeesConfigurationRepository },
    { token: OperationalCostRepository, instance: DrizzleOperationalCostRepository },
    { token: WarrantyReserveRepository, instance: DrizzleWarrantyReserveRepository },
    { token: FxRateRepository, instance: DrizzleFxRateRepository },
    { token: FxProvider, instance: CurrencyApiFxProvider },
    { token: FxRateService, instance: DrizzleFxRateService },
  ],
}
```

- [ ] **Step 3: Create `packages/api/typescript/src/finance/index.ts`** (mirror `auth/index.ts` exactly):

```typescript
import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'

const ctx = await BoundedContext.create({
  name: '',
  controllers,
  internalHandlers,
  externalHandlers,
  registry: INSTANCE_REGISTRY,
})

export default ctx.router
```

- [ ] **Step 4: Mount in `packages/api/typescript/src/index.ts`**
  - `import FinanceRouter from '@finance/index'`.
  - Append `FinanceRouter` to the `routers` array (alongside `SharedRouter`, `AuthRouter`, `NotificationsRouter`, `UIRouter`).

- [ ] **Step 5: SDK regen + final sweep**

```bash
bun emit-openapi
bun sdk           # if the polyglot SDK pipeline exists; otherwise log a follow-up
bun tsc           # → 0 errors
bun lint          # → 0 errors
bun run test      # → all green
git status        # → clean except expected generated files
```

- [ ] **Step 6: Commit (two commits — one for source, one for generated artifacts)**

```bash
git add packages/api/typescript/src/finance/ \
        packages/api/typescript/src/index.ts \
        packages/contracts/wire/events/ \
        packages/contracts/generated/
git commit -m "feat(finance): bounded-context bootstrap + DI registry + router mount + scheduler (P9 Task 22a)"

git add packages/api/typescript/public/docs/openapi.json packages/client/dist/ 2>/dev/null || true
git commit -m "chore(sdk): regen after Finance BC lands (P9 Task 22b)" --allow-empty
```

---

## Final Validation

- [ ] `bun tsc` — 0 errors across all workspaces
- [ ] `bun lint` — 0 errors
- [ ] `bun run test` — all green; in particular `bun test packages/api/typescript/src/finance` shows ≥1 suite per Task above.
- [ ] `bun --filter @template/contracts test` — TypeSpec events compile + emit cleanly.
- [ ] `bun migrate:dev` is idempotent (no new diff after re-run — iter 42 owns the SQL).
- [ ] `git status` clean.
- [ ] **AC mapping** (every spec §7.8 read/command → ≥1 test path):
  - **T25 TaxesSettings** → `packages/api/typescript/src/finance/usecases/GetTaxesSettings.test.ts`
  - **T26 FeesConfigurationSettings** → `packages/api/typescript/src/finance/usecases/GetFeesConfigurationSettings.test.ts`
  - **T27 OperationalCostsList** → `packages/api/typescript/src/finance/usecases/ListOperationalCosts.test.ts`
  - **T28 WarrantyReservesList** → `packages/api/typescript/src/finance/usecases/ListWarrantyReserves.test.ts`
  - **T29 FxRatesAdmin** → `packages/api/typescript/src/finance/usecases/AdminListFxRates.test.ts`
  - **C39 UpdateTaxes** → `packages/api/typescript/src/finance/usecases/UpdateTaxes.test.ts`
  - **C40 UpdateFeesConfiguration** → `packages/api/typescript/src/finance/usecases/UpdateFeesConfiguration.test.ts`
  - **C41 CreateOperationalCost** → `packages/api/typescript/src/finance/usecases/CreateOperationalCost.test.ts`
  - **C42 UpdateOperationalCost** → `packages/api/typescript/src/finance/usecases/UpdateOperationalCost.test.ts`
  - **C43 DeleteOperationalCost** → `packages/api/typescript/src/finance/usecases/DeleteOperationalCost.test.ts`
  - **C44 ToggleOperationalCostStatus** → `packages/api/typescript/src/finance/usecases/ToggleOperationalCostStatus.test.ts`
  - **C45 CreateWarrantyReserve** → `packages/api/typescript/src/finance/usecases/CreateWarrantyReserve.test.ts`
  - **C46 UpdateWarrantyReserve** → `packages/api/typescript/src/finance/usecases/UpdateWarrantyReserve.test.ts`
  - **C47 DeleteWarrantyReserve** → `packages/api/typescript/src/finance/usecases/DeleteWarrantyReserve.test.ts`
  - **C48 CaptureFxRates** → `packages/api/typescript/src/finance/usecases/CaptureFxRates.test.ts` + `packages/api/typescript/src/finance/services/CaptureFxRatesScheduler/CaptureFxRatesScheduler.test.ts`
  - **10 Domain Events** (spec §4 BC8 "Published Events") → `packages/api/typescript/src/finance/events/index.test.ts`
  - **10 Integration Events** (spec §7.13 C — Finance → Analytics) → asserted in `packages/api/typescript/src/finance/handlers/TaxesUpdatedHandler.test.ts` (representative) + the 9 other handler test mirrors.
  - **FxRate canonical effective-date lookup** (cross-BC contract used by P6/P7/P10/P11) → `packages/api/typescript/src/finance/services/FxRateService/FxRateService.test.ts` (`findEffectiveAt` covers the canonical entry point) + `packages/api/typescript/src/finance/repositories/FxRateRepository/DrizzleFxRateRepository.test.ts`.

---

## Cross-BC dependency footer

**Upstream this sub-plan depends on:**
- **Iter 41 — contracts/wire/enums**: `tax-type`, `tax-deduction-type`, `operational-cost-category`, `operational-cost-recurrency`, `operational-cost-payment-status`, `shipping-cost-type`, `fx-rate-source`, `payment-gateway`, `payment-method`, `checkout-platform`, `currency-code`, `marketing-platform`. **All authored and emitting.** Plus value-types: `MonetaryAmount`, `GatewayFee`, `CheckoutFee`, `ShippingFee` (with discriminated `ShippingCostValue` inline union), `OperationalCostStatusEntry`.
- **Iter 42 — contracts/db/schema/finance.ts**: 5 tables already shipped; this sub-plan only audits, files CONTRACT QUESTIONs for divergences (Task 1 Step 2), and consumes the tables read-only.
- **P2-TENANCY**: `Store` entity / `stores` table for `storeId` FK; `StoreRepository` for T27 reporting-currency lookup; `ResolveActiveStoreMiddleware` for controllers. Two of those are tracked as opening QUESTIONs.

**Downstream consumers (read-only contracts this sub-plan locks for them):**
- **P6-SALES** — calls `FxRateService.findEffectiveAt(order.currency, store.reportingCurrency, order.createdAt)` in order-listing queries to convert revenue to reporting currency.
- **P7-MARKETING** — calls `FxRateService.findEffectiveAt` for AdSpend conversion in the breakdown query (T21).
- **P10-NOTIFICATIONS** — calls `FxRateService.findEffectiveAt` for daily-digest currency conversion to `UserPreferences.notificationCurrency`.
- **P11-ANALYTICS** — consumes ALL 10 Finance integration events for cache invalidation; calls `findEffectiveAt` per row in `DashboardOverview` / `ProfitMarginReport` / `Chart` reads; calls `findManyEffectiveAt` for batched analytics queries.

**Parallel-safe with:** P3-BILLING (no shared files), P4-INTEGRATION (no shared files except for downstream consumption), P5-CATALOG, P8-TRACKING. Per master plan dependency graph, P9-FINANCE can run **in parallel with P3-BILLING after P2-TENANCY** lands.

---

## Notes

- **Folder convention:** polyglot's TS BCs live under `packages/api/typescript/src/<bc>/` (siblings: `auth/`, `notifications/`, `ui/`). The medscall-style `packages/api/src/contexts/<bc>/` layout is NOT used.
- **Append-only invariant for `FxRate`** is enforced at TWO levels: (a) `FxRateRepository` exposes ONLY `insertIfNew` / `findEffectiveAt` / `findManyEffectiveAt` / `findByPair` (no `save`/`update`/`delete`); (b) the canonical query is composite-indexed via `fx_rates_pair_start_date_idx`. The lack of a UNIQUE constraint in iter-42's schema means duplicate `(pair, startDate)` writes ARE possible; `insertIfNew` paths over `ON CONFLICT DO NOTHING` only protect against duplicates if a UNIQUE backing index exists — until then, the cron's hourly cadence + monotonically-increasing `fetchedAt` makes duplicates rare. Logged as a future hardening (raise iter-42 follow-up to add `UNIQUE(from_currency, to_currency, start_date)` on `fx_rates`).
- **Why `FxRate` is a free record class and not an `AggregateRoot`:** spec §4 BC8 calls it "canonical projection, system-maintained, append-only" — matches the `/projection` skill's *free record class* shape (no invariants, no methods beyond `create`, lives in `entities/` for code locality but has no aggregate semantics).
- **Why `FxRate` has no `applyEvent`:** spec says "**Never overwrites** an existing row" — there is no mutation path, so the `find → applyEvent → save` canon collapses to just `create → insertIfNew`. Canonical pattern for append-only projections per `/projection` SKILL.md.
- **Why integration events live in `packages/contracts/wire/events/` and not `finance/events/`:** the polyglot framework's source of truth for cross-language event shapes is TypeSpec — one author point emitting to TS+Go+Rust. Domain events (consumed only within this BC) stay TS-native under `finance/events/`. Integration events ARE the public bus contract and MUST be in `contracts/wire/`.
- **Why `FxRateService` exists** instead of consumers using `FxRateRepository.findEffectiveAt` directly: cross-BC consumers should depend on a stable service surface, not a Drizzle repo (which exposes broader query methods that aren't meant for cross-BC use). The service is a thin wrapper that pins the public contract.
- **`StoreScopedQueryService` vs query use case:** for v1 we use query use cases (consistent with `auth/usecases/RegisterUser`) — the BFF-style `ui/usecases/` BFF pattern from medscall is **not used** here; polyglot's pattern is one use case per read.
- **Multi-currency aggregation in T27** — only `amountInReportingCurrency` is added per spec §7.8 T27 output. The per-currency `MonetaryByCurrency` aggregation pattern lives in P11-ANALYTICS reads; T27 is a simple per-row conversion.
- **Cron infra:** polyglot has no existing cron mechanism beyond the framework's `OutboxDispatcher`. Task 22 introduces a minimal `setInterval`-based scheduler — explicitly NOT a cron daemon. Swap to `BullMQ` / `node-cron` later under the same `CaptureFxRatesScheduler.start/stop` interface.
- **# QUESTIONs raised during planning (3):**
  1. (Task 11) Currency API provider choice — **decided `currencyapi.com`** as default; env-var contract (`CURRENCY_API_KEY` + `CURRENCY_API_BASE_URL`) locked.
  2. (Task 18) Does P2-TENANCY export `StoreRepository` for T27 reporting-currency lookup? — **TODO: confirm at /build time.** If not, fall back to `amountInReportingCurrency = item.amount` (native-only) and file a follow-up.
  3. (Task 19) Does P2-TENANCY ship `ResolveActiveStoreMiddleware`? — **TODO: confirm at /build time.** If not, accept `params.storeId` and inline-guard against `ctx.user`.
- **Schema divergences resolved by iter-43.6b migration `0014_chilly_mystique.sql` (was 3 open; now 0):**
  1. `taxes`: `revenue_tax_multiplier` + `marketing_tax_rate_per_platform` + `updated_by_user_id` columns added. Entity persists all three as first-class fields; no in-domain shim.
  2. `fees_configuration`: `start_date` + `end_date` + `updated_by_user_id` columns added; previous `(storeId)` UNIQUE replaced by `(storeId, startDate)` composite. C40 reverts to spec-canonical close-and-insert.
  3. `operational_costs`: `payment_method` + `active` + `deleted_at` columns added; soft-delete is now DB-backed and T27 `active?` filter pushes into WHERE.
  - Only remaining workaround: `operational_costs.label` is NOT NULL while spec `description?` is optional — entity falls back to `category` when description is empty. Small, self-contained, kept as-is.
- **Graph CLI:** `bun scripts/graph/cli/index.ts validate-plan` may still be broken per master plan caveat #2 (post-polyglot status TBC); this sub-plan does NOT block on it.
- **Next iteration after this sub-plan lands:** master plan lists **P10-NOTIFICATIONS** and **P11-ANALYTICS** as direct consumers — they can plan in parallel once P9 lands.
