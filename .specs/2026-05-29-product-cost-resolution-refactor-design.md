# Product Cost Resolution — Structural Refactor + Correctness — Design Spec

**Date:** 2026-05-29
**Status:** Approved
**Bounded Context:** cross-context: `sales` (primary), `catalog` (read-port DTO rename only)
**Kind:** chore (refactor) + bug (correctness)
**Story Points:** 8 — single-context (`sales`) multi-unit refactor (split solver into expansion/search/scoring + new `ProductCostLineAllocator` + handler rewrite) + two correctness fixes + a **comprehensive cross-context test suite** (solver/allocator unit tests, query-service timespan tests, and a creation→application flow test choreographing `catalog → sales` in mock mode). The `catalog` touch is a mechanical read-DTO rename + DI rewiring across two registries. No migration, domain/integration event, projection, SDK regen, or cross-service contract — the bump over a pure refactor is driven by test breadth and the cross-context flow, not new domain machinery.

> **Decomposition note.** This is **Spec A of four** carved from "improve the product cost algorithm." It is the behavior-preserving foundation; the follow-ups depend on it and get their own brainstorm → plan → build cycle:
> - **Spec B — Search scalability:** make the backtracking survive hundreds of overlapping rules/kits + large orders (dominated-option pruning, branch-and-bound, memoization, or min-cost-cover DP). Depends on this spec's clean units + test net.
> - **Spec C — Recompute on cost change (wire it correctly + fan-out):** today the create/delete→recompute path is **dead** (Problem 7) — the handler listens to a wire integration event nobody publishes. Spec C makes it real (publish/consume the correct event for cost create/delete) **and** replaces the all-store-orders synchronous re-solve with an affected-orders query + per-order recompute events through the outbox. Depends on this spec; independent of B.
> - **Spec D — Multi-currency normalization + country-scoped resolution:** normalize each resolved cost to the store's `reportingCurrency` (the `Store` aggregate already holds it under a `REPORTING_CURRENCY_LOCKED` invariant; the `orders` schema already intends "FX applied at query time in the consumer's reportingCurrency"). Introduce an **`FxRateService`** that checks already-stored FX rates first, falls back to an external FX API when missing, and caches the result in a **`RedisService`**; conversion is applied at resolution time and costs are summed in the reporting currency. This **replaces** Spec A's `MIXED_CURRENCY_PRODUCT_COST` guard — mixed currency becomes a conversion, not an error. Also surfaces the order's country (normalized out of the `shippingAddress` jsonb) + currency on `OrderQueryDTO` for match-time scoping. Today currency/country are dead/ignored at match time and no FX source exists (see Problem 8). New feature; depends on this spec; its own brainstorm settles the FX-source details.

## Context

The "product cost algorithm" resolves a merchant's cost of goods sold (COGS) for each order line. It is an explicit, *faithful, unchanged port* from the legacy bk-dash backend, currently spread across two bounded contexts:

- The combinatorial core is `ProductCostSolver` at `packages/api/typescript/src/catalog/services/ProductCostSolver/ProductCostSolver.ts` — a 360-line class backtracking solver that picks the optimal combination of overlapping cost rules for an order's product/variant mix. Its file header states the algorithm was ported "unchanged," with inlined es-toolkit shims (`cloneDeep`, `sum`, `rangeInclusive`, `pick`).
- It is consumed by `ProductCostApplicationHandler` at `packages/api/typescript/src/sales/handlers/ProductCostApplicationHandler/ProductCostApplicationHandler.ts` (ported under SPEC-11 / SPEC-12, `.specs/2026-05-23-refactor-batch/SPEC-11-product-cost-handler-port.md`). It pulls applicable costs via `catalog`'s `ProductCostQueryService.findApplicable` (`packages/api/typescript/src/catalog/services/ProductCostQueryService/`), runs the solver, then **distributes the solved cost across order lines inline** and writes the result onto `OrderOverride.productCostByLine` (`packages/api/typescript/src/sales/entities/OrderOverride.ts`, field schema in `packages/api/typescript/src/sales/objects/OrderOverrideFields.ts`, where `ProductCostByLineEntry.cost` is a single `MonetaryAmount`). Only the `OrderUpdated`-triggered path is live: Go sync publishes `order.updated`, the handler reacts, and a previously-created cost is applied. The handler also *subscribes* to `ProductCostCreated`/`ProductCostDeleted` and has a `recomputeAffected` branch — but that branch is **dead code** (see Problem 7), so creating a cost does not retroactively apply it to existing orders today.

The cost data itself is the `ProductCost` aggregate (`packages/api/typescript/src/catalog/entities/ProductCost.ts`) with nested `ProductCostOption` / `ProductCostOptionItem` value objects (`packages/api/typescript/src/catalog/objects/`). That aggregate, its repository, and its CRUD use cases/controllers are **not** in scope here — only the resolution pipeline that reads them.

The existing test net is thin: 5 cases in `ProductCostSolver.test.ts` (generic single, no-match, variant-specific preference, kit match, kit non-match) and 4 in `ProductCostApplicationHandler.test.ts` (resolve-and-write, no-cost, idempotency, and a structural assertion that the handler exposes `orderQuery` and no `db`). Quantity-modifier expansion, scoring tie-breaks, partial coverage, multi-currency, and the per-line rounding are all untested.

## Problem

1. **Monolithic, non-idiomatic core.** `ProductCostSolver` is one class doing four distinct jobs — option *expansion*, the backtracking *search*, *scoring/selection*, and result *shaping* — over shared mutable instance fields (`this.options`, `this.result`), with `!` non-null assertions throughout and an in-flight mutation (`option.quantity ||= 1`) inside the search loop. The inlined es-toolkit shims were never made idiomatic.
2. **Split-brain allocation.** The per-line cost distribution lives *inline in the sales handler*, not with the solving logic, so "resolve the optimal cost combo" and "spread it across the order's lines" are two halves of one operation buried in different files and contexts.
3. **Untyped event narrowing.** The handler subscribes to three wire events and narrows them via `as unknown as {…}` casts instead of the project's discriminated-union `switch (event.name)` pattern.
4. **Rounding drift.** The handler computes `Math.round(totalCost / totalUnits)` then multiplies `perUnit × lineQuantity`, so the sum of per-line costs does **not** equal the solved total when the cost doesn't divide evenly — silently corrupting COGS by cents per order.
5. **Lossy multi-currency.** The solver returns `cost: Record<currency, number>` and the handler collapses it with `Object.keys(entry.cost)[0]`, silently discarding any non-first currency.
6. **Critical paths untested.** The quantity modifiers, scoring tie-breaks, partial-coverage branch, multi-currency, and rounding are all unprotected — so any refactor (this one, and Specs B/C) has no safety net. There is no end-to-end test proving a cost *created* by a merchant actually *applies* to the right orders.
7. **The recompute-on-cost-change path is dead wiring** *(documented here; the fix moves to Spec C).* The handler subscribes to the **wire integration** events `integration.shared.catalog.product_cost_created`/`_deleted` (payload `{storeId, productCostId, variantId, storeIntegrationId}`, imported from `wire/events`), but `CreateProductCost`/`DeleteProductCost` raise the **catalog domain** events `catalog.product_cost.created`/`.deleted` (payload `{productCost}`) and **nothing publishes the wire events** (their documented consumer is Analytics, for COGS-cache invalidation). So the handler never fires on cost create/delete; `recomputeAffected` is dead code with no test, and creating a cost does not retroactively apply it to existing orders — only a later `OrderUpdated` does. Fixing this (wiring create/delete to recompute correctly, with fan-out) is **Spec C**'s job; Spec A removes the dead subscription so the handler honestly reflects its one live trigger, `OrderUpdated`.
8. **Country/currency are dead at match time** *(documented here; the fix is Spec D, not this spec).* `country` is carried on the cost DTO but never used by `findApplicable` or the solver, and the order's country lives unnormalized inside the `orders.shipping_address` jsonb (`packages/contracts/db/schema/sales.ts` — "shapes vary per provider, BK Dash doesn't normalize address into columns"); `OrderQueryDTO` doesn't surface it. Currency is similar: the order has `totalCurrency`/`presentmentCurrency` columns but `findApplicable` doesn't filter by currency. So "the cost applied for the right country/currency" is not testable today — Spec A tests only the dimensions that are actually wired (product/variant, quantity tier, date range).

## Goal

A clean, well-bounded product-cost **resolution pipeline owned entirely by `sales`**, composed of small single-purpose units behind a stable public API, with money math that is provably exact and a characterization-test suite that pins the intended behavior. After this spec, the search internals and the recompute strategy can be reworked (Specs B and C) without fear of silently changing COGS.

## Decisions

1. **Relocate the resolution pipeline to `sales`.** Move `ProductCostSolver` from `catalog/services/` to `sales/services/`. `catalog` retains the `ProductCost` aggregate, its repository, CRUD use cases/controllers, and the `ProductCostQueryService` read port. `sales` depends on that read port (dependency direction `sales → catalog` is preserved; one catalog import is removed).
2. **Split the solver into pure units behind a stable `solve()`.** `optionExpansion.ts`, `search.ts`, `scoring.ts` are pure functions taking/returning explicit data; `ProductCostSolver.ts` composes them and keeps the public `new ProductCostSolver(dto).solve(): SolvedProductCost[]` signature. No shared mutable instance state across phases; no mid-search mutation; no `!` soup.
3. **Extract `ProductCostLineAllocator` in `sales`.** A named unit mapping `SolvedProductCost[]` + order lines → `productCostByLine`. `ProductCostApplicationHandler` becomes thin orchestration: `query → solve → allocate → save`, with no inline allocation/rounding math.
3a. **Remove the dead recompute branch.** The handler subscribes only to `OrderUpdated` (its one live trigger). The `ProductCostCreated`/`ProductCostDeleted` subscription and `recomputeAffected` are deleted (dead code per Problem 7); re-wiring create/delete→recompute correctly is **Spec C**. This is safe/behavior-preserving — the branch never fired.
4. **`SolvedProductCost` carries one explicit currency per entry.** Replace `cost: Record<currency, number>` / `shipping: Record<currency, number>` with `cost: { amountCents: number; currency: CurrencyCode }` and `shipping: { amountCents: number; currency: CurrencyCode }`. This removes the "first key" bug *structurally* — there is no map to pick from.
5. **Largest-remainder allocation.** A product's solved total is distributed across its lines by flooring each line's share, then handing the leftover cents one at a time to the lines with the largest fractional remainder, tie-broken deterministically by `lineId`. Invariant: `Σ(per-line amountCents for a product) == solved total for that product`. Idempotent.
6. **Mixed-currency anomaly fails loudly (stopgap).** If a single line would resolve to costs in two different currencies, the allocator raises a typed `MIXED_CURRENCY_PRODUCT_COST` error registered in `sales/errors/index.ts` per the `/errors` convention (no silent first-key resolution). This is a deliberate fail-loud placeholder: **Spec D replaces it** with normalization to the store's `reportingCurrency` via an `FxRateService`, after which mixed currency becomes a conversion rather than an error.
7. **Type-safe single-event handler.** With only `OrderUpdated` subscribed (Decision 3a), the handler's `input` is typed directly as `OrderUpdatedEvent` — the `as unknown as {…}` payload casts are removed (no union to narrow). It retains the `orderQuery` property name (the existing structural handler test asserts `handler.orderQuery` exists and `handler.db` does not).
8. **Rename the catalog read DTO.** `ProductCostFormatted` becomes `ApplicableProductCost`, Zod-typed per the `XQueryService` convention, owned by `ProductCostQueryService` (its consumer now lives in `sales`). All call sites and the Mock/Drizzle impls are updated.
9. **Characterization tests first (TDD red).** Lock the existing 5 solver + 4 handler tests (moved with their files), then add the untested paths *before* refactoring internals, so the refactor is guarded.
10. **Behavior is preserved except where explicitly corrected.** The existing 5 solver + 4 handler tests stay green (only import paths change); the only intentional output changes are the rounding remainder (Decision 5) and multi-currency handling (Decisions 4, 6).
11. **A comprehensive, layered test suite is part of this spec**, matching the project's test taxonomy (see `## Testing`): pure **solver unit** tests (quantity modifiers, kits, precedence/non-interference, scoring, partial coverage), pure **allocator unit** tests (rounding remainder, mixed-currency), **query-service** tests (date-range/timespan matching), and a **creation→application flow test** in `packages/api/typescript/tests/flows/` (mock mode) that proves a `ProductCost` created via the catalog use case applies the right per-line values to a seeded order when processed via `OrderUpdated`, and is idempotent.
12. **Country- and currency-scoped matching are explicitly out of this spec** and become **Spec D**. The flow/query tests assert only the wired dimensions (product/variant, quantity tier, date range). The `MIXED_CURRENCY_PRODUCT_COST` guard (Decision 6) is a *defensive guard against an anomaly*, not currency *selection*.

## User Stories

- **Story 1:** As a developer extending the cost algorithm in Specs B/C, I want the solver split into pure, named units behind a stable `solve()` with a characterization-test net, so I can rework the search/fan-out without silently changing COGS.
  - Given the refactored modules, when I change the search internals, then the public `solve()` contract and the characterization tests guard the behavior (AC-1, AC-8).
  - Given the handler, when I read it, then the allocation/rounding math is in `ProductCostLineAllocator`, not inline (AC-2).
- **Story 2:** As a merchant, I want per-line COGS to sum exactly to the resolved cost, so my margin reports aren't off by stray rounding cents.
  - Given a product cost that doesn't divide evenly across its lines, when the order recomputes, then `Σ(line costs) == resolved total` (AC-5).
- **Story 3:** As a developer, I want a mixed-currency data anomaly to surface loudly instead of being silently resolved.
  - Given a line that resolves to two currencies, when allocation runs, then it raises `MIXED_CURRENCY_PRODUCT_COST` (AC-6).
- **Story 4:** As a merchant, I want a cost I create to apply to my orders with the right values, only within its date range, correctly for quantity tiers and kits, and without rules cannibalizing each other, so my COGS is trustworthy.
  - Given a `ProductCost` created via `CreateProductCost` and an order whose date falls in its range, when the order is processed (`OrderUpdated`), then the per-line cost matches the resolved amount (AC-13).
  - Given an order whose date is outside the cost's range, when processed, then that cost does not apply (AC-12).
  - Given overlapping rules (variant-specific vs generic, kit vs singles), when resolved, then no unit is charged twice and the variant-specific/cheapest-covering rule wins (AC-8).
  - *(Out of scope for Spec A — Spec C:* retroactive recompute when a cost is created/deleted after orders already exist.*)*

## Acceptance Criteria

- [ ] AC-1: `ProductCostSolver` lives at `sales/services/ProductCostSolver/`, split into `optionExpansion.ts` / `search.ts` / `scoring.ts` / `ProductCostSolver.ts`; the public `solve()` signature is unchanged and the 5 existing solver tests pass with only their import path updated.
- [ ] AC-2: Per-line allocation is implemented in `sales/services/ProductCostLineAllocator/`; `ProductCostApplicationHandler` contains no inline allocation or rounding arithmetic.
- [ ] AC-3: The handler subscribes to `OrderUpdated` only, with its `input` typed directly (zero `as unknown as` casts), retains the `orderQuery` property (the existing structural handler test stays green), and no longer contains the `ProductCostCreated`/`ProductCostDeleted` subscription or `recomputeAffected` (deferred to Spec C).
- [ ] AC-4: `SolvedProductCost.cost` and `.shipping` each carry a single `{ amountCents, currency }`; `Record<currency, number>` no longer appears in the solver's output type.
- [ ] AC-5: For a product whose solved total does not divide evenly across its lines, `Σ(per-line amountCents) == solved total`, allocated by largest-remainder and deterministic by `lineId` (e.g. 1000¢ over three equal lines → `334 / 333 / 333`).
- [ ] AC-6: A line resolving to ≥2 distinct currencies raises the typed `MIXED_CURRENCY_PRODUCT_COST` error.
- [ ] AC-7: `catalog`'s `ProductCostQueryService` returns Zod-typed `ApplicableProductCost[]`; the Drizzle and Mock impls plus all call sites are updated; `catalog` `tsc` + tests are green.
- [ ] AC-8: **Solver unit tests** cover quantity-modifier expansion (`EQ` boundaries incl. partial-cover, `GT`, `GTE`, `LT`, `LTE`), kits (`MULTIPLE`: all-members-present, member-absent, limiting-ingredient, multi-application), precedence/non-interference (variant-specific beats generic for the same product, two independent products don't cross-contaminate, **kit vs singles never double-count a unit**), scoring tie-breaks (most-covered ↓ then cheapest ↑), and partial-coverage acceptance. (See `## Testing` for the case list.)
- [ ] AC-9: `bun tsc`, `bun lint`, and `bun run test` are green; the 4 existing handler tests pass (their whole-number cases are unaffected by the rounding/currency changes).
- [ ] AC-10: The solver and allocator are **pure** units constructed via `new` (no injected dependencies), so no DI bindings are added or removed for them. The `ProductCostQueryService` binding stays in `catalog`. The stale `// ProductCostSolver is NOT registered …` comment in `catalog/registry.ts` is removed (the solver no longer lives in `catalog`). The handler keeps its existing DI registration and constructor deps (`orderQuery`, `costQuery`, `overrideRepo`).
- [ ] AC-11: **Allocator unit tests** cover single-line, even multi-line, and uneven multi-line (remainder, per AC-5) distribution, plus the `MIXED_CURRENCY_PRODUCT_COST` path (per AC-6).
- [ ] AC-12: **Query-service tests** for `findApplicable` cover date-range matching: order within range applies; before-range and after-range do not; open-ended (`endDate = null`) applies; the `at == startDate` and `at == endDate` boundaries are inclusive; with two non-overlapping ranges for the same product, the order's date selects the correct option.
- [ ] AC-13: A **flow test** at `packages/api/typescript/tests/flows/product-cost-application.flow.test.ts` (mock mode) proves the live path: (a) a `ProductCost` created via the catalog `CreateProductCost` use case is applied with the right per-line values when its order is processed via `OrderUpdated`; (b) `OrderUpdated` with a matching cost resolves & writes, and with no matching cost yields no entries; (c) replaying the same `OrderUpdated` is idempotent. (Retroactive recompute on cost create/delete is Spec C.)

## Testing

Layered to this project's test taxonomy (unit → query-service/repository → flow). Cases are written/locked **before** the internal refactor (Decision 9). Notation: `A`,`B` = products; `A1`,`A2`,`B1` = variants; amounts in cents.

### Solver unit — `sales/services/ProductCostSolver/ProductCostSolver.test.ts`
*(Moves the 5 existing cases; adds the rest. Pure — no DI, no DB.)*

**Quantity modifiers** (one product, generic cost):
- `GTE 1` @500, order qty 3 → applies per unit → 1500. *(existing)*
- `EQ 3` @900: qty 2 → ∅ (under-tier); qty 3 → 1× (900); qty 4 → 1× covering 3, 1 unit uncovered; qty 6 → 2× (1800).
- `GT 2` @700: qty 2 → ∅; qty 3 → applies.
- `LT 3` @400: qty 1–2 → applies; qty 3 → ∅.
- `LTE 3` @400: qty 3 → applies; qty 4 → covers up to the tier, remainder uncovered.

**Kits (`MULTIPLE`):**
- All members present (1×A + 1×B @1200) → kit applies, 1200. *(existing)*
- Member absent (only A) → ∅. *(existing)*
- Limiting ingredient (2×A + 1×B), order 10×A + 1×B → 1 kit.
- Multi-application (1×A + 1×B), order 3×A + 3×B → 3 kits.

**Precedence / non-interference:**
- Variant-specific beats generic: generic A @900 + specific A1 @100, order A1+A2 → A1 uses 100, A2 uses 900; both `costId`s present, no unit double-charged. *(extends existing)*
- Two independent products: cost A + cost B, order A+B → each applies to its own product only.
- **Kit vs singles, no double-count:** kit (A+B @1000) + single A @600 + single B @600, order A+B → the chosen combo covers each unit exactly once (assert total = the winning combo, and A is not charged by both kit and single).
- Scoring tie-break: two costs that could each cover A (per-unit vs cheaper bundle) → solver returns the most-covered, then cheapest combo.

**Partial coverage:** demand the solver can only partially satisfy → returns the combo covering ≥1 unit (not ∅).

### Allocator unit — `sales/services/ProductCostLineAllocator/ProductCostLineAllocator.test.ts`
- Single line → whole solved total on that line.
- Even split (900 across 3 equal lines) → 300/300/300.
- **Uneven split (1000 across 3 lines) → 334/333/333, Σ == 1000**, deterministic by `lineId` (AC-5).
- Two currencies on one line → throws `MIXED_CURRENCY_PRODUCT_COST` (AC-6).

### Query-service — `catalog/services/ProductCostQueryService/DrizzleProductCostQueryService.test.ts`
*(Date-range matching lives here — AC-12.)* Option range `[2026-01-01, 2026-06-30]`:
- order `2026-05-01` → applies; `2025-12-01` → ∅; `2026-07-01` → ∅.
- `endDate = null` (open-ended) → applies for any later date.
- boundaries `at == 2026-01-01` and `at == 2026-06-30` → inclusive (apply).
- two non-overlapping ranges for the same product → order date selects the correct option.

### Flow — `packages/api/typescript/tests/flows/product-cost-application.flow.test.ts` (mock mode, AC-13)
*(The "entire flow" for the live path. Create the cost via the real `CreateProductCost` use case; seed the order through `MockOrderQueryService.nextOrders` (the order read-model is Go-owned — there is no TS write repo, mirroring the existing handler test); then drive `OrderUpdated`.)*
- **Create→apply:** `CreateProductCost` (catalog, real) persists a cost → fire `OrderUpdated` for an order whose lines reference the cost's variant → handler resolves via `ProductCostQueryService` → `OrderOverride.productCostByLine` carries the right per-line values; Σ == resolved total.
- `OrderUpdated` for a store with a matching cost → resolves & writes; with no matching cost → no entries.
- **Idempotency:** replay `OrderUpdated` twice → identical override.
- *(Spec C: retroactive recompute when a cost is created/deleted after the order exists.)*

## Open Questions

1. **`endDate` end-of-day boundary.** `findApplicable` compares the full `externalCreatedAt` timestamp against `endDate` parsed as a date-only value (midnight UTC), so an order at `2026-06-30T15:00Z` is *excluded* from a range ending `2026-06-30`. This spec's query-service tests document **current** behavior (date-aligned boundaries). Decision needed — likely in **Spec D**, which already touches the matching/filtering layer — whether to treat `endDate` as inclusive-through-end-of-day. Not fixed here to keep Spec A behavior-preserving.

## Risks & Migration

- **Cross-context file relocation.** Moving the solver from `catalog` to `sales` causes import churn at the call sites (the handler) and removal of the stale solver comment from `catalog/registry.ts`. No DI bindings move (the solver/allocator are pure). Mitigated by writing/locking the characterization tests first (Decision 9).
- **Brittle structural handler test.** `ProductCostApplicationHandler.test.ts` test #4 asserts `handler.orderQuery` and the absence of `handler.db`; the refactor must keep those property names (Decision 7).
- **Read-DTO rename ripple.** `ProductCostFormatted → ApplicableProductCost` touches `DrizzleProductCostQueryService`, `MockProductCostQueryService`, `ProductCostQueryService`, the solver, and the handler import. Confirm no controller/SDK schema references the old type (internal services only — **no SDK regen expected**).
- **No DB migration.** The `ProductCost` aggregate shape and `OrderOverride` schema are unchanged.

## Out of Scope

- Search scalability — pruning, branch-and-bound, memoization, DP reframing (**Spec B**).
- **Recompute on cost create/delete** — fixing the dead wiring (Problem 7) so a created/deleted cost retroactively recomputes affected orders, plus replacing the all-store-orders synchronous re-solve with affected-orders fan-out (**Spec C**). Spec A only *removes* the dead subscription; it adds no recompute behavior.
- **Country- and currency-scoped cost matching** — surfacing the order's country (from `shipping_address` jsonb) and currency on `OrderQueryDTO` and filtering on them (**Spec D**). Today both are ignored at match time (Problem 7); this spec adds no tests asserting country/currency selection, only the `MIXED_CURRENCY_PRODUCT_COST` anomaly guard.
- Fixing the `endDate` end-of-day boundary (Open Question 1) — deferred, likely to **Spec D**.
- Any change to the `ProductCost` aggregate, its CRUD, the `OrderOverride` schema, database migrations, or HTTP/SDK surface.
