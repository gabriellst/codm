# Fees, Taxes & Product-Cost Timeline Model — Design Spec

**Date:** 2026-06-02
**Status:** Draft
**Bounded Context:** cross-context: finance (BC8), catalog, shared (core), contracts
**Kind:** chore (modeling correctness) + feature (typed fee config)
**Story Points:** 13 — cross-context (finance + catalog + core + contracts), enum rename + dropped enum across wire bindings, schema-shape migration (forward recreate), two integration-event payload changes, SDK regen, and frontend fee/tax form rewiring. Likely two PRs even if planned as one (see "Can this be split?").

## Context

Finance (BC8, `packages/api/typescript/src/finance`) owns the merchant-side configuration that turns provider-reported amounts into profit margins. Two of its aggregates are currently under-modeled:

- **`FeesConfiguration`** (`finance/entities/FeesConfiguration.ts`) is one aggregate per store carrying three children — `gatewayFees`, `checkoutFees`, `shippingFee` — but **all three are typed `z.unknown()`** (the entity comment defers them to "a follow-up iter"). The aggregate versions the *whole bundle* with a single row-level `startDate`/`endDate`: changing one gateway fee opens a new row that re-snapshots every other fee. Persisted as jsonb in `fees_configuration` (`packages/contracts/db/schema/finance.ts`), with the row-level dates as columns.
- **`Taxes`** (`finance/entities/Taxes.ts`) is a flat aggregate — `type`, `deductionType`, `rate`, `revenueTaxMultiplier`, and a `marketingTaxRatePerPlatform` jsonb map keyed by `MarketingPlatform` — also versioned by a single row-level `startDate`/`endDate`. Revenue-tax and marketing-tax concerns are conflated into one row.

Both use an identical hand-rolled time-effective pattern: `supersede(at)` stamps the active row's `endDate`, `findActiveByStoreId` reads `WHERE endDate IS NULL`. The use cases `UpdateFeesConfiguration` / `UpdateGatewayFees` / `UpdateCheckoutFees` / `UpdateShippingFees` / `UpdateTaxes` (in `finance/usecases/`) and their controllers drive this; the fee controllers' `InputSchema`s are partly Phase-0 contract-lock stubs (e.g. `UpdateGatewayFeesController` takes `fee: z.record(GatewayFeeKind, z.number())`, which **cannot hold a currency on the fixed part**).

Catalog already solved the per-entry timeline problem the *right* way but in isolation: `catalog/objects/ProductCostOption.ts` carries its own `startDate`/`endDate` (as `z.iso.date()` strings) per cost option, with a `startDate <= endDate` refine. There is **no shared time-window abstraction** — `ProductCostOption`, `FeesConfiguration`, and `Taxes` each re-implement the same idea three different ways.

The project's custom `z` (`core/src/utils/schema/index.ts`) is standard Zod augmented via `Object.assign` with `ZodTransforms` + `ExtraSchemaTypes` (`core/src/utils/schema/ExtraTypes.ts` — `domainEvent`, `integrationEvent`, `instance`, `paginatedQuery`…). The shared `MonetaryAmount` VO lives at `shared/objects/MonetaryAmount.ts`. Relevant wire enums live in `packages/contracts/wire/enums/` (`shipping-cost-type.tsp`, `gateway-fee-kind.tsp`, `payment-gateway.tsp`, `payment-method.tsp`, `checkout-platform.tsp`, `marketing-platform.tsp`, `tax-type.tsp`, `tax-deduction-type.tsp`). No seed/fixture data exists for `fees_configuration` or `taxes`; latest migration is `0046`.

## Problem

1. **Fee shapes are untyped.** `gatewayFees`/`checkoutFees`/`shippingFee` are `z.unknown()` — no validation, no SDK types, the fixed gateway-fee part can't carry a currency.
2. **Versioning is at the wrong altitude.** A single row-level `startDate`/`endDate` versions the entire fee bundle (and the entire tax row) at once. Fees change independently over time; today changing one fee rewrites the whole snapshot's history.
3. **`GatewayFeeKind` mis-models reality.** It treats FIXED/VARIABLE as mutually exclusive, but a (platform, paymentMethod) fee has **both** a fixed and a variable component simultaneously.
4. **Checkout is a multi-platform array** but the business rule is one checkout platform + one rate at a time.
5. **Shipping mode enum is wrong/undefined.** `ShippingCostType` names don't match the intended `ShippingCostMode`, and its value union is unmodeled.
6. **Revenue and marketing taxes are conflated** into one flat row with a multiplier + a per-platform map, with no independent timelines.
7. **The timeline idea is duplicated three ways** (ProductCostOption / FeesConfiguration / Taxes) with no shared abstraction.

## Goal

Merchants can configure each gateway fee (per platform × payment method), the single checkout fee, the shipping fee, the revenue tax, and each platform's marketing tax **independently over time** — each carrying its own effective window — with fully typed, SDK-exposed shapes. A single time-window abstraction (`z.historical` + `Timeline<T>`) backs all of them and is reused by catalog's product-cost options, so the codebase has exactly one way to express "this value was effective during this window."

## Decisions

1. **`z.historical(...)` is a first-class custom Zod extension**, registered in `core/src/utils/schema/ExtraTypes.ts` (`ExtraSchemaTypes`) and exposed on the project `z` — **not** a standalone `withTimeWindow` function in `shared/`. It mirrors the `z.domainEvent` / `z.integrationEvent` overload style.
2. **`z.historical` adds the time window** `{ startDate: z.date(), endDate: z.date().nullable().default(null) }` (`endDate: null` = active/open-ended) plus `.refine(endDate === null || startDate < endDate, 'INVALID_DATE_RANGE')`. Accepts a **raw shape or a `ZodObject`** (→ `.extend`) **or a discriminated union** (→ apply the window **per-variant** so the discriminator stays narrowable and every variant carries the window).
3. **`Timeline<T>` value object** lives in `shared/objects/Timeline.ts`. It owns the collection invariant — entries sorted by `startDate`, **always non-overlapping** — and behaves as a **last-write-wins interval paint**, not an append-supersede. Its core operation is an immutable `place(value, startDate, endDate = null): Timeline<T>` (`endDate: null` = open-ended / +∞). `place` overwrites exactly the span `[startDate, endDate)` and trims/splits/removes whatever it overlaps:
   - For each existing entry `[a, b)`, keep only the parts **not covered** by the new span — left remainder `[a, startDate)` when `a < startDate`, right remainder `[endDate, b)` when `endDate < b` — each **retaining the old value**.
   - Entries fully covered by `[startDate, endDate)` are removed.
   - Then the new entry `[startDate, endDate)` is inserted.

   Worked example: `[0,11)=X`, `place(Y, 4, 8)` → `[0,4)=X`, `[4,8)=Y`, `[8,11)=X`. The legacy row-level `supersede(at)` is just the special case `place(value, at)` (open-ended paint over the current open entry). Reads: `activeAt(date): T | undefined` (entry whose half-open window contains `date`), `current(): T | undefined` (the unique open-ended entry, if any). This replaces the row-level `supersede()` on `FeesConfiguration`/`Taxes` — **versioning moves from per-row to per-entry**. The paint is **scoped per logical series**: each (platform, paymentMethod) gateway key and each `MarketingPlatform` marketing key is its own `Timeline` instance, so placing into one key never cuts another key's entries.
4. **Typed gateway fee — keys structural, only the value is historical.** Identity/naming fields stay outside the window; only the changing value (`{ variable, fixed }`) is wrapped, as a **leaf timeline**:
   ```
   GatewayFeeRate = z.historical({ variable: number(0..1), fixed: MonetaryAmountSchema })
   GatewayFee     = z.object({ platform: PaymentGateway,
                               methods: z.record(PaymentMethod, z.array(GatewayFeeRate)) })
   ```
   A store's `gatewayFees` is `GatewayFee[]` (one container per platform); each `methods[method]` is a `Timeline<GatewayFeeRate>` painted independently. Fixed + variable coexist in each leaf value. The **`GatewayFeeKind` enum is dropped** (contracts + Go + TS bindings).
5. **Typed checkout fee:** `CheckoutFee = z.historical({ platform: CheckoutPlatform, rate: number(0..1) })`, modeled as a **single timeline** (one platform at a time). The `FeesConfiguration` field `checkoutFees` is renamed to **`checkoutFee`**.
6. **Typed shipping fee:** `ShippingFee = z.historical(discriminatedUnion('mode', [...]))`. The enum **`ShippingCostType` is renamed to `ShippingCostMode`** with values `{ NONE, AVERAGE_PER_SALE, PAID_BY_CUSTOMER_AT_CHECKOUT, BY_PRODUCT_QUANTITY }`. Variants: `NONE` and `PAID_BY_CUSTOMER_AT_CHECKOUT` carry no value; `AVERAGE_PER_SALE` and `BY_PRODUCT_QUANTITY` each carry `value: z.instance(MonetaryAmount)`. Calc semantics (documented on the VO, applied by downstream cost calculators — not implemented in this spec): `AVERAGE_PER_SALE` = flat value once per order; `BY_PRODUCT_QUANTITY` = value × total item quantity; `PAID_BY_CUSTOMER_AT_CHECKOUT` reads `order.shippingTotal` (informational, no new field); `NONE` = nothing.
7. **`TaxConfiguration` aggregate replaces `Taxes`.** One row per store, two embedded structures (same keys-structural principle as gateway):
   - **`revenueTax`** — no sub-key, the whole value changes → a single **whole-value timeline**: `revenueTax = z.array(RevenueTax)` where `RevenueTax = z.historical({ type: TaxType, deductionType: TaxDeductionType, rate: number(0..1), multiplier: number })`.
   - **`marketingTax`** — keyed by platform, only `{ rate }` is historical: `MarketingTaxRate = z.historical({ rate: number(0..1) })`; `MarketingTax = z.object({ platform: MarketingPlatform, rates: z.array(MarketingTaxRate) })`; `marketingTax = z.array(MarketingTax)` (one container per platform, each `rates` a `Timeline<MarketingTaxRate>`).

   This replaces `revenueTaxMultiplier` + `marketingTaxRatePerPlatform`.
8. **Storage stays one-row-per-store.** `FeesConfiguration` and `TaxConfiguration` keep a single row per store; the timelines live embedded in jsonb. **The row-level `startDate`/`endDate` columns are dropped** from `fees_configuration` and the taxes table.
9. **Migration `0047` is a forward recreate, no backfill** — drops the obsolete columns and reshapes/truncates the jsonb-bearing tables. Valid because no seed/production data exists. The taxes table is renamed/reshaped to back `TaxConfiguration` (`revenueTax` + `marketingTax` jsonb, no `type`/`rate`/`multiplier`/map columns at row level).
10. **`ProductCostOption` follows the same keys-structural principle.** The identity is `(currency, country)`; only `{ shipping, items }` changes over time → a leaf timeline:
    ```
    ProductCostOptionValue = z.historical({ shipping, items })   // coerced z.date() window
    ProductCostOption      = z.object({ id, currency, country?, values: z.array(ProductCostOptionValue) })
    ```
    `values` is a `Timeline<ProductCostOptionValue>`. This replaces the old per-option `startDate`/`endDate` (`z.iso.date()` strings + `<=` refine); the window is strict `<` and `z.coerce.date()` (jsonb round-trip). The aggregate's overlap invariant moves from "(currency,country) date ranges don't overlap across options" to "each option's `values` timeline is non-overlapping" (enforced by `Timeline`).
11. **Integration events keep a single `effectiveAt`.** `FeesConfigurationUpdated` and `TaxesUpdated` (`packages/contracts/wire/events/`) carry `effectiveAt` = the `effectiveFrom` of the applied change. Consumers re-read the full config; no per-fee event fan-out.

## User Stories

- **Story 1:** As a store owner, I want to set a gateway fee's fixed part in a specific currency plus a variable rate for a given platform + payment method, so that profit calculations use the real fee structure.
  - Given a store with no gateway fee for (STRIPE, CREDIT_CARD), when I submit `{ platform: STRIPE, paymentMethod: CREDIT_CARD, variable: 0.029, fixed: { amountCents: 30, currency: USD }, effectiveFrom: T }`, then a `GatewayFee` entry is created on that key's timeline with `endDate: null`.
  - Given an active (open-ended) gateway fee for (STRIPE, CREDIT_CARD) starting at `T1`, when I place a new one effective `[T2, ∞)` with `T2 > T1`, then the previous entry is trimmed to `[T1, T2)` and the new entry `[T2, ∞)` becomes active — and **other keys' timelines are untouched**.
  - Given a (STRIPE, CREDIT_CARD) fee spanning `[0,11)`, when I place a different fee for the same key over `[4,8)`, then that key's timeline becomes `[0,4)`(old), `[4,8)`(new), `[8,11)`(old) — three entries.

- **Story 2:** As a store owner, I want to change my checkout platform/rate over time, so that historical orders price against the rate that was effective then.
  - Given an active `CheckoutFee`, when I place a new platform+rate effective at `T2`, then the `checkoutFee` timeline paints it in (the prior open entry is trimmed to end at `T2`; one active entry at a time).

- **Story 3:** As a store owner, I want to pick a shipping cost mode with the right value shape, so that shipping cost is computed correctly.
  - Given mode `BY_PRODUCT_QUANTITY` with `value`, when I submit it, then the discriminated variant validates and requires `value`.
  - Given mode `PAID_BY_CUSTOMER_AT_CHECKOUT`, when I submit it without a value, then it validates (no value field on that variant).

- **Story 4:** As a store owner, I want revenue tax and per-platform marketing tax versioned independently, so that a marketing-tax change doesn't rewrite my revenue-tax history.
  - Given a `TaxConfiguration` with an active `revenueTax` and a `marketingTax` entry for META, when I place only META's marketing rate effective at `T2`, then META's marketing timeline paints it in while `revenueTax` and other platforms' marketing timelines are unchanged.

- **Story 5:** As a developer modeling a time-effective value anywhere in the codebase, I want one `z.historical(...)` + `Timeline<T>` abstraction, so that product-cost options, fees, and taxes share a single tested implementation.
  - Given `ProductCostOption`, when it's refactored onto `z.historical`, then its dates are `z.date()` and its window invariants come from the shared helper.

## Acceptance Criteria

- [ ] AC-1: `z.historical(shape)` returns a schema that parses `{ ...shape, startDate: Date, endDate: Date | null }`, defaults `endDate` to `null`, and rejects `endDate !== null && startDate >= endDate` with `INVALID_DATE_RANGE`.
- [ ] AC-2: `z.historical(discriminatedUnion)` yields a union where **every variant** carries the window and the discriminator still narrows.
- [ ] AC-3: `Timeline<T>.place(value, startDate, endDate?)` is an immutable last-write-wins interval paint that keeps the series sorted and non-overlapping: it trims partially-overlapped entries to their uncovered remainder(s) (retaining their old value), removes fully-covered entries, splits an entry the new span falls strictly inside into two, and inserts the new entry. Unit tests assert all four examples in Decision 3 (including `[0,11)` + `place(Y,4,8)` → 3 entries `[0,4),[4,8),[8,11)`, and `endDate: null` = open-ended). `activeAt(date)` returns the entry whose half-open window contains `date` (or `undefined`); `current()` returns the unique open-ended entry (or `undefined`).
- [ ] AC-4: `finance/objects/` exports, with no `z.unknown()` on `FeesConfiguration`: **keyed containers** `GatewayFee` (`{ platform, methods: record<PaymentMethod, GatewayFeeRate[]> }`) and `MarketingTax` (`{ platform, rates: MarketingTaxRate[] }`) whose **leaf** values `GatewayFeeRate = z.historical({ variable, fixed })` / `MarketingTaxRate = z.historical({ rate })` carry the window; and **whole-value** historical schemas `CheckoutFee = z.historical({ platform, rate })`, `ShippingFee = z.historical(union)`, `RevenueTax = z.historical({ type, deductionType, rate, multiplier })` (used as arrays). Identity fields (platform/method) are never inside a window.
- [ ] AC-5: `FeesConfiguration` exposes `gatewayFees: GatewayFee[]` (per-platform container, each `methods[method]` a `Timeline<GatewayFeeRate>`), `checkoutFee: CheckoutFee[]` (single whole-value timeline), `shippingFee: ShippingFee[]` (single whole-value timeline); the entity no longer has row-level `startDate`/`endDate` or `supersede()`.
- [ ] AC-6: `GatewayFeeKind` enum is removed from `packages/contracts/wire/enums/` and all generated TS/Go bindings; no code references it.
- [ ] AC-7: `ShippingCostType` is renamed to `ShippingCostMode` with values `{ NONE, AVERAGE_PER_SALE, PAID_BY_CUSTOMER_AT_CHECKOUT, BY_PRODUCT_QUANTITY }` across contracts + bindings; no reference to the old name remains.
- [ ] AC-8: `TaxConfiguration` aggregate replaces `Taxes`, with `revenueTax: RevenueTax[]` (single whole-value timeline) and `marketingTax: MarketingTax[]` (per-platform container, each `rates` a `Timeline<MarketingTaxRate>`); `revenueTaxMultiplier` and `marketingTaxRatePerPlatform` no longer exist as flat fields.
- [ ] AC-9: Migration `0047` applies cleanly on a fresh DB (PGlite test harness + Postgres): `fees_configuration` and the taxes table have no row-level `startDate`/`endDate`, and hold the new jsonb shapes. No backfill logic.
- [ ] AC-10: `ProductCostOption` uses `z.historical`; its dates are `z.date()`; existing catalog tests pass after the refactor.
- [ ] AC-11: `UpdateFeesConfiguration` (sole fee writer, `UpdateFeesConfigurationController` `/fees-configuration`) and `UpdateTaxes` (`UpdateTaxesController` `/taxes-settings`) accept the new typed shapes and apply changes via the per-entry `Timeline.place(...)`: `UpdateFeesConfiguration` places each supplied gateway (per platform×method) / checkout / shipping entry; `UpdateTaxes` places revenue + per-platform marketing entries. Controller `InputSchema` keys remain only `body`/`query`/`params`/`ctx`. (The per-tab mock writers `UpdateGatewayFees`/`UpdateCheckoutFees`/`UpdateShippingFees` + `UpdateTaxesBff` were deleted by the intervening "conform mocked BFF controllers" refactor — there is no per-tab write surface to make real.)
- [ ] AC-12: `FeesConfigurationUpdated` and `TaxesUpdated` integration events carry a single `effectiveAt` = the change's `effectiveFrom`.
- [ ] AC-13: `bun sdk` regenerates with the new fee/tax schemas; `bun tsc` is clean across workspaces; frontend fee/tax forms compile against the regenerated SDK.
- [ ] AC-14: Use-case tests cover `UpdateFeesConfiguration` placing gateway fees per (platform,method) key (asserting sibling keys untouched) + single-timeline checkout/shipping, and `UpdateTaxes` placing revenue (single) + marketing per-platform (asserting sibling platforms/revenueTax untouched).
- [ ] AC-15: `Timeline<T>` has a dedicated unit-test suite (`shared/objects/Timeline.test.ts`) that is the definitive proof of the interval-paint semantics, covering at minimum: (a) paint over the front of an entry → trims to right remainder (`[0,10)` + `place(_,0,5)` → `[0,5)`,`[5,10)`); (b) paint covering all entries → removes them (`place(_,0,11)` → single entry); (c) paint strictly inside an entry → 3-way split (`[0,11)` + `place(Y,4,8)` → `[0,4),[4,8),[8,11)`); (d) open-ended paint trims the prior open entry; (e) non-overlapping paint leaves a gap (no entry at uncovered instants); (f) exact-boundary adjacency produces no empty/zero-length entries; (g) immutability — the source `Timeline` is unchanged after `place`. `z.historical` likewise has tests asserting the window default, the `INVALID_DATE_RANGE` refine, and per-variant application on a discriminated union.

## Risks & Migration

- **Destructive migration.** `0047` truncates/reshapes `fees_configuration` and the taxes table. Safe only because there is no seed/production data (verified: no fixtures, latest migration `0046`). If that changes before merge, this decision must be revisited.
- **Enum rename ripple.** Dropping `GatewayFeeKind` and renaming `ShippingCostType` touches generated TS + Go bindings; `bun sdk` / contracts codegen must run and the Go sync package must compile (it references shipping/payment enums for provider mapping).
- **Discriminated-union + window interplay.** Applying `z.historical` per-variant is the load-bearing tricky bit; AC-2 pins it. If Zod v4's discriminated-union introspection makes per-variant extension awkward, fallback is an explicit per-variant `z.historical` at the union definition site (still one helper, applied N times).
- **Write surface narrowed by an intervening refactor (2026-06-02, HEAD `b637d550`).** The "conform mocked BFF controllers to real conventions" refactor deleted the per-tab mock writers (`UpdateGatewayFees`/`UpdateCheckoutFees`/`UpdateShippingFees`) + their controllers, `UpdateTaxesBff`, and `GetTaxFeeConfig`. The surviving real write surface is `UpdateFeesConfiguration` (`/fees-configuration`) + `UpdateTaxes` (`/taxes-settings`), both with `[AuthAccountMiddleware, RequireStoreMember]` (+ `RequireStoreRole` for taxes) and `z.stringToDate()` controller dates. `GatewayFeeKind`'s only remaining consumer is analytics `FeesBreakdownSchema`; `ShippingCostType` has no TS consumer. AC-11/AC-14 were updated accordingly.

## Can this be split? (13-pt sanity)

Yes, cleanly into two PRs if desired:
- **PR-A (foundation):** `z.historical` + `Timeline<T>` + unit tests + `ProductCostOption` refactor (catalog). Self-contained, no contract changes, no migration.
- **PR-B (finance):** typed fee VOs, `TaxConfiguration`, enum rename/drop, migration `0047`, use cases/controllers, integration events, SDK regen, frontend forms.

Recommend planning as one spec but landing as PR-A → PR-B so the shared abstraction is proven before the finance rewrite consumes it.

## Open Questions

- None blocking. `effectiveAt` semantics resolved by Decision 11 (single date = change's `effectiveFrom`).
