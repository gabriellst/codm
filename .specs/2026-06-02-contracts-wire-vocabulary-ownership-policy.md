# Contracts Wire Vocabulary — Ownership Policy & Query-Enum Extraction

**Date:** 2026-06-02
**Status:** Draft — policy decided (see §Decision). Actionable work: extract 3–4 **query enums** out of contracts (§6); everything else stays. W5 stands.
**Scope:** `packages/contracts/wire/{enums,events}` → query enums into `packages/api/typescript/src/{analytics,shared,integration}`
**Kind:** policy decision + targeted query-enum extraction
**Branch context:** `feat/ecommerce-fork-polyglot`

---

## Context

`packages/contracts` is the source of truth for cross-boundary artifacts — the vocabulary that must mean the same thing on both sides of the Go↔TS wire. Codegen fans every `wire/` artifact to **both** `@template/contracts-typescript` and `template/contracts-go`, unconditionally.

The question this spec answers: **what belongs in that shared vocabulary, and what leaked in that shouldn't be there.**

## Decision

> **`contracts/wire` is the single canonical home for the cross-service *domain* vocabulary:**
> - **all domain/entity enums** — closed value sets that are a *state, type, category, or config* of a business entity (paired with a `pgEnum` and/or carried on an entity / domain service), regardless of how many backends reference them today (forward-looking single-backend domain enums are fine);
> - **all integration events** — the `wire/events` envelope set, including TS-published events with no Go consumer *yet* (forward-looking cross-service contracts; this is the W5 stance, unchanged).
>
> **Query / presentation enums do NOT belong in contracts.** A closed set that only parameterizes a *read* — sort direction, bucket cadence, chart-shape discriminator, form-field-type for rendering — is a BFF/query-layer concern owned by the backend that serves the query, not shared domain vocabulary. These move to the TS api.

### Why this boundary (and why it's stable)

- **Domain enums are pinned to contracts by the events that reference them.** A TypeSpec event payload can only reference a TypeSpec enum; since all integration events stay, any enum used in a payload is locked to contracts (e.g. `Role`←`store-member-invited`, `PlanTier`←`subscription-quota-updated`, `FxRateSource`←`fx-rate-captured`). Domain enums and events therefore share one home by construction.
- **Query enums are never in an event payload and never on an entity** — nothing pins them to contracts, and they carry no cross-service meaning. Keeping them in `wire/` only ships a dead Go type and misrepresents a read-DTO param as shared domain truth.
- **`pgEnum` colocation:** domain enums back columns defined in `contracts/db/schema/*`; keeping the enum source in `contracts` keeps it adjacent to its column. Query enums have no `pgEnum`, so nothing is split by moving them out.
- **Frontend/SDK unaffected** either way — query enums still reach the SDK through the TS api's OpenAPI once registered there.

**Net effect:** ~45 of 49 enums and all 40 events **stay put** (the wire vocabulary is already correctly centralized). The only movement is extracting the handful of query enums below.

---

## §4. Enum classification

49 enums. Signature used: `pgEnum` in `contracts/db/schema` (**pg**), referenced on an `entities/`/`objects/` file (**ent**), referenced by Go (**go**), referenced only in `Get*`/report/chart read use-cases & controllers (**qry-only**).

### STAY in `contracts/wire/enums` — domain/entity vocabulary (45)

**Bilateral today (Go + TS), 20:** `SalesPlatform`, `CheckoutPlatform`*, `PaymentGatewayPlatform`*, `InfoproductPlatform`*, `MarketingPlatform`, `CurrencyCode`, `PaymentStatus`, `PaymentMethod`, `PaymentGateway`, `TransactionKind`, `TransactionStatus`, `OrderTransactionFeeType`, `ProductStatus`, `PixelEventType`, `CampaignStatus`, `AdAccountStatus`, `AdSpendGroupBy`, `BusinessAccountStatus`, `StoreIntegrationType`, `SyncEventName`. (`*` = via `Platform` union `Valid()`.)

**TS-led domain enums (forward-looking; pg and/or entity-backed), 25:** `BillingPlatform`, `PlanTier`, `PlanPeriod`, `PlanFeature`, `SubscriptionEventType`, `ConnectionMode`, `FcmPlatform`, `NotificationKind`, `NotificationCategory`, `NotificationChannel`, `NotificationOrigin`, `NotificationCurrencyMode`, `OperationalCostCategory`, `OperationalCostFlow`, `OperationalCostPaymentStatus`, `OperationalCostRecurrency`, `TaxType`, `TaxDeductionType`, `ShippingCostType`, `FxRateSource`, `ProductCostType`, `QuantityModifier`, `Role`, `TimezoneMode`, `GoalType`.

Notable judgment calls (name suggests query, evidence says domain → stay):
- **`AdSpendGroupBy`** — sounds like a query group-by, but it's `pg=2`, on the `AdSpendManual` entity, and used by **Go** (`ad_spend.go`). A persisted granularity field. **Domain — stay.**
- **`GoalType`** (REVENUE/PROFIT) — `pg=1`, on the `Goal` entity. **Domain — stay.**
- **`ConnectionMode`** (OAUTH/CREDENTIALS/MANUAL) — `pg=0`/`ent=0` but used across every integration platform `*Description.ts` + `ConnectIntegration`; it's how an integration authenticates. **Domain config — stay.**
- **`NotificationKind`** — `pg=0`/`ent=0` but a notification *type* used in `PushDeliveryService`. **Domain — stay.**
- **DB-bound, no app code yet** (`SubscriptionEventType`, `ShippingCostType`, `TimezoneMode`) — the `pgEnum` is a real reference. **Stay** (deleting would orphan the schema).

### MOVE OUT to the TS api — query / presentation enums (3) + 1 UI enum

No `pgEnum`, not on any entity, not in any event payload — pure read/presentation parameters.

| Enum | Evidence | New home |
|---|---|---|
| `ChartType` (`REVENUE`, `SALES_PER_WEEKDAY`, …) | pg=0, ent=0, only `GetChart` use-case + controller. A result-shape discriminator for one read endpoint. | `analytics` query layer (`analytics/schemas/` alongside `GetChart`) |
| `AnalyticsFrequency` (`HOURLY`…`YEARLY`) | pg=0, ent=0, only `GetChart` / `GetProfitMarginReport` use-cases + controllers — a bucketing-cadence query param. | `analytics` query layer |
| `SortOrder` (`ASC`/`DESC`) | pg=0, ent=0, generic pagination ordering; currently 0 refs. | `shared` query layer (`shared/schemas/` pagination) |
| `IntegrationCredentialFieldType` | pg=0, ent=0, 0 refs anywhere except generated SDK; describes credential-**form** field types — a UI/presentation concern, not domain state. | `integration` query/BFF layer **or delete** (see §6) |

None are referenced by any `wire/events/*.tsp` payload, so none are pinned — all are free to move.

---

## §5. Event classification (reference only — all 40 stay, P2)

No event moves. Integration events are the canonical cross-service vocabulary and stay in `contracts/wire/events`, forward-looking publishers included (W5 unchanged). Retained breakdown for reviewer context:

- **Bilateral today (10):** `OrderUpdated`, `ProductUpdated`, `VariantUpdated`, `PixelEventRecorded`, `MarketingAdAccountDiscovered`, `MarketingBusinessAccountDiscovered`, `IntegrationProgressUpdated`, `IntegrationActivated`(→Go), `IntegrationDeactivated`, `IntegrationHandshakeFailed`.
- **Forward-looking TS-published / W5-pending (24):** all finance (`Taxes`, `Fees`, `OperationalCost*`, `WarrantyReserve*`, `FxRateCaptured`), catalog `ProductCost*`, marketing `CampaignProductBinding*`, identity (`UserRegistered`, `FcmToken*`, `UserPreferencesUpdated`), tenancy (`StoreDisabled/Enabled`, `StoreMemberInvited`), billing `SubscriptionQuotaUpdated`, sales `OrderOverridden`/`CartLinkedToOrder`.
- **Unwired both sides — sanity-check intent, not a move (6):** `IntegrationHandshakeSucceeded`, `IntegrationLastSyncUpdated`, `OrderTransactionRecorded`, `OrderTransactionRefunded`, `CartAbandoned`, `CartLinkedToOrder`.

---

## §6. Migration mechanics (query-enum extraction)

For each of `ChartType`, `AnalyticsFrequency`, `SortOrder`:

1. **Create the TS enum** at its new home — `export enum` with values byte-identical to the wire enum:
   - `ChartType`, `AnalyticsFrequency` → `analytics/schemas/` (co-located with the `GetChart` / `GetProfitMarginReport` query schemas they parameterize). If a per-context `enums/` is preferred for plain enums, `analytics/enums/` is acceptable — but these are query-DTO params, so the schema layer is the natural fit.
   - `SortOrder` → `shared/schemas/` as the shared pagination ordering enum (it's generic and currently unused — this also "activates" it for the pagination inputs its doc-comment promises).
2. **Rewrite imports** in the analytics use-cases/controllers from `@template/contracts-typescript/wire/enums` → the new `@analytics/…` / `@shared/…` path. `tsc` enumerates every site (small: 6/3/0 files respectively).
3. **OpenAPI registration:** add the moved enums to `openapi.registerEnums({ ...wireEnums, ProductCostCsvProvider, ChartType, AnalyticsFrequency, SortOrder })` in `src/shared/index.ts` so SDK component names still resolve and the frontend keeps receiving them via the SDK unchanged.
4. **Remove from contracts:** delete `wire/enums/{chart-type,analytics-frequency,sort-order}.tsp`; drop their `import` lines from `wire/main.tsp`. **Clean** regen (`bun sdk` / contracts emit — not incremental, per the worktree kubb-cache note); confirm `generated/{ts,go}/wire/enums*` no longer emit them and `generated/go/wire/enums.go` drops the parsers.
5. **Update codegen tests:** `codegen/emit-wire-ts.test.ts`, `emit-wire-go.test.ts`, `discriminator.test.ts` if they enumerate the removed enums.
6. **Verify:** `bun tsc`, `bun run test`; `cd packages/api/go && go build ./...` + Go tests (confirm dropped Go types break nothing — they shouldn't, Go never referenced these).

**`IntegrationCredentialFieldType`** — decide with the owner: if the integration credential-form rendering endpoint is planned, relocate it to the `integration` query/BFF layer (same mechanics). If not, **delete** it outright (0 refs anywhere but generated SDK). Default: delete until first real use.

Nothing else changes. `Platform` union and `unions.{ts,go}` are untouched (no platform enum moves).

---

## §7. Make the policy discoverable

Add one line to the contracts review checklist / `packages/contracts` README and the relevant skill registry:

> *"`wire/{enums,events}` = the cross-service **domain** vocabulary. Domain/entity enums (pgEnum- or entity-backed, state/type/category/config) and integration events live here, single-backend/forward-looking included — do **not** extract them on usage grounds. **Query/presentation enums** (sort, bucket cadence, chart-shape, form-field-type) do **not** belong here — they live in the serving backend's query/BFF layer. Delete a wire artifact only when nothing — Go, TS, an event payload, or a DB column — references it."*

This is the rule that keeps both this extraction and the earlier "should we move TS-only domain enums out?" question from being re-litigated.

---

## Risks / verification

- **Small blast radius:** 3 query enums + ~9 import sites + the OpenAPI registration line. `tsc` + SDK regen + Go build cover it.
- **SDK/frontend:** moved query enums must be added to `registerEnums` (step 3) or the SDK loses their component names. Verify the SDK regenerates without `@template/*` package-name drift (worktree rule).
- **Value parity:** copy enum values verbatim; these have no `pgEnum` so no migration risk, but the SDK/frontend compare by value.
- **`IntegrationCredentialFieldType` deletion:** confirm no imminent credential-form work depends on it before deleting.
- **W5 & domain enums:** untouched and explicitly preserved.

## Out of scope

- Moving any **domain** enum or any **integration event** out of contracts (explicitly rejected by §Decision).
- `contracts/db/schema` tables and `pgEnum` definitions.
- The `OperationalCostCreatedEvent`(domain) ↔ `OperationalCostRecordedEvent`(wire) naming asymmetry.

## Appendix — evidence provenance

Counts generated 2026-06-02 from `feat/ecommerce-fork-polyglot` HEAD via `rg` over `packages/api/{go,typescript}/src` and `packages/contracts/db`. Domain-vs-query classification per enum: `pgEnum` presence, entity/object-file references, Go references (+ `Platform`-union transitivity + event-payload references in `wire/events/*.tsp`), and read-use-case-only usage. TS counts exclude same-named TS-local `BaseDomainEvent`s so wire usage isn't conflated with intra-context domain events.
