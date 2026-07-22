# FxRate Timeline — Design Spec

**Date:** 2026-06-03
**Status:** Draft
**Bounded Context:** finance
**Kind:** chore (modeling consistency)
**Story Points:** 2 — touches only the `FxRate` value/entity schema in `packages/api/typescript/src/finance/entities/FxRate.ts` plus a documentation/vocabulary pass; the `fx_rates` table, its migration, the composite index, and every repository query (`findEffective`/`list`/`save`) stay exactly as they are. No jsonb column, no `Timeline<T>`, no SDK reshape.

## Context

`FxRate` (`packages/api/typescript/src/finance/entities/FxRate.ts`) is the finance currency-conversion source of truth. The entity is intentionally minimal:

```ts
export const FxRateSchema = z.object({
	fromCurrency: z.enum(CurrencyCode),
	toCurrency: z.enum(CurrencyCode),
	/** Rate carried as string to preserve provider-side decimal precision. */
	rate: z.string(),
	startDate: z.date(),
})
```

Its entity doc already states the historical-series intent in prose: *"Captured rates form a historical series; consumers resolve the latest entry with `startDate <= asOf` for a (from, to) pair."*

Persistence is **append-only, row-per-rate**, in `fx_rates` (`packages/contracts/db/schema/finance.ts`): columns `from_currency`, `to_currency`, `rate` (`text`, for decimal precision), `start_date`, plus `id`/`created_at` — **no `updated_at`, no `version`, no `end_date`**. The canonical "rate at time T" query is documented on the table:

```sql
SELECT * FROM fx_rates
 WHERE from_currency = ? AND to_currency = ?
   AND start_date <= ?
 ORDER BY start_date DESC LIMIT 1
```

served as a single-page seek by the composite `fx_rates_pair_start_date_idx` on `(from_currency, to_currency, start_date)`. The repository (`packages/api/typescript/src/finance/repositories/FxRateRepository/`) exposes `findEffective(from, to, asOf)` (the query above), `list(query)` (paginated, newest-first), and an idempotent append `save` (`onConflictDoUpdate` keyed on `id`). The Mock mirrors this with the same sort/filter semantics.

Writes come from `UpdateFxRates` (`packages/api/typescript/src/finance/usecases/UpdateFxRates.ts`, the hourly scheduler seam): it takes a batch `{ startDate, rates: [{ fromCurrency, toCurrency, rate }] }`, filters identity pairs (`from === to`), creates one `FxRate` per pair, saves it, and emits one `FxRateCapturedEvent` (`packages/api/typescript/src/finance/events/FxRateCapturedEvent.ts`, name `finance.fx_rate.captured`) per pair. Reads are `GetFxRates` (`packages/api/typescript/src/finance/usecases/GetFxRates.ts`, paginated series) and the resolver path through `findEffective`.

On this branch, `Fees` and `Taxes` were just refactored onto a shared time-window abstraction (`.specs/2026-06-02-fees-taxes-timeline-model-design.md`): `z.historical(...)` (`packages/api/typescript/core/src/utils/schema/ExtraTypes.ts`) appends a `{ startDate, endDate: null }` window to a value schema, and `Timeline<T>` (`packages/api/typescript/src/shared/objects/Timeline.ts`) is a last-write-wins interval series **embedded as jsonb** in a single row per store. The principle adopted there is **keys structural, values historical**: identity fields (platform, payment method) live outside the window; only the changing value is wrapped (`GatewayFeeRate = z.historical({ variable, fixed })` in `packages/api/typescript/src/finance/objects/GatewayFee.ts`; `RevenueTax = z.historical({ type, deductionType, rate, multiplier })` in `RevenueTax.ts`).

## Problem

`FxRate` expresses the same conceptual shape as `Fees`/`Taxes` — a value (`{ rate }`) that is effective from a `startDate` for a structural key (the currency pair) — but it predates `z.historical` and so states that shape only in a doc comment. Two inconsistencies follow:

1. **Vocabulary drift.** The pair-keyed historical series is described in English (entity doc, table doc, `findEffective` JSDoc) rather than in the project's now-canonical `z.historical` / keys-structural terms. A reader who learned the pattern from `GatewayFee`/`RevenueTax` does not see it mirrored on `FxRate`, even though the modeling intent is identical.
2. **An apparent invitation to over-apply the new tool.** The naive "make it consistent" move is to embed a `Timeline<FxRate>` jsonb per currency pair, exactly like `Fees`. That would be **wrong for FxRate** and the spec must say so explicitly, so the consistency pass does not regress the storage model.

Note: there is **no `source`/`FxRateSource` field** on the entity, the `fx_rates` table, or the `FxRateCapturedEvent` today (verified — `grep -i source` finds nothing in those files; no `fx-rate-source.tsp` enum exists in `packages/contracts/wire/enums/`). This spec does **not** introduce one — adding a field is out of scope for a modeling-consistency chore.

## Goal

`FxRate`'s historical-series shape is expressed in the same `z.historical` vocabulary and keys-structural framing as `Fees`/`Taxes`, **without** changing the append-only `fx_rates` storage model, its composite index, its migration, the `FxRateCapturedEvent` payload, or any repository query — so the codebase has one consistent *way of describing* "a value effective from a time" while still using the *right storage* (row-per-rate) for a high-frequency append-only series.

## Decisions

1. **Keep the append-only row-per-rate `fx_rates` table unchanged — fit option (a).** `fx_rates` is high-frequency (hourly capture per currency pair → many rows over time) and is queried exclusively as "latest row with `start_date <= at`", which the composite index `fx_rates_pair_start_date_idx` serves as a single-page seek (`packages/contracts/db/schema/finance.ts`). This is categorically different from `Fees`/`Taxes`, which are **low-write, one-row-per-store** configs read as "the whole config for this store" — the exact shape jsonb `Timeline` was chosen for (per its Decision 8). No table, column, index, or migration change.

2. **Reject embedding a `Timeline<FxRate>` in jsonb (rejected option, was a candidate "b/Timeline" path).** A per-pair jsonb `Timeline` would (i) grow unbounded as hourly captures accumulate, turning every append into a read-modify-write of an ever-larger array, (ii) lose the `(pair, start_date)` index seek that the row-per-rate table gets for free, and (iii) contradict `Timeline`'s own documented scope — its class comment says "Scope a Timeline per logical key … low-write per store" (`packages/api/typescript/src/shared/objects/Timeline.ts`). `Timeline<T>` does **not** fit FxRate.

3. **Reject stamping `endDate`/`effectiveTo` on rows (rejected option b).** Treating the table as a DB-level interval series (close the prior open row's `end_date` on each capture) would add write-amplification: every hourly tick would issue an extra `UPDATE` against the previous row per pair, doubling the write volume the table was explicitly designed to avoid (the table has no `updated_at`/`version` precisely because rows are immutable once written). The validity window is already **derivable** from the next row's `start_date`; storing it buys nothing the query doesn't already give.

4. **Adopt the `z.historical` *vocabulary* on the value schema (fit option (a) realized), keys structural.** The currency pair `(fromCurrency, toCurrency)` is the **structural key** (mirroring `platform`/`paymentMethod` on `GatewayFee`); `{ rate }` is the **historical value**. Express this by composing the value with `z.historical`:
   - `FxRateValueSchema = z.historical({ rate: z.string() })` — yields `{ rate: string, startDate: Date, endDate: Date | null }`, the same window shape `GatewayFeeRate`/`RevenueTax` carry.
   - `FxRateSchema = z.object({ fromCurrency: z.enum(CurrencyCode), toCurrency: z.enum(CurrencyCode) }).and(FxRateValueSchema)` — keys outside the window, value (with window) composed in. The entity keeps `rate: string` and `startDate: Date` exactly as today; the only addition to the inferred shape is `endDate: Date | null`.

5. **`endDate` is a *derived, non-persisted* window terminator — never written.** Per the `z.historical` contract, `endDate: null` = open-ended / currently effective. For FxRate, every persisted row is effectively `endDate: null` at write time; a row's *real* validity end is the **next row's `start_date`** for the same pair, computed at read time, never stored. The repository's `toDomain` (`DrizzleFxRateRepository`) therefore rehydrates each row with `endDate: null`. **No new column, no `save`-path change.** This is the honest reading of "the window is `[startDate, nextStartDate)` derived, not stored as endDate" — `z.historical` types it; the data layer leaves it implicit. (If a future read path needs the explicit upper bound, it is the `start_date` of the next row in the `ORDER BY start_date DESC` series — a windowing concern for that query, not a stored field.)

6. **No `Timeline<T>` instance, no `place()` on the entity.** `FxRate` stays an `AggregateRoot` whose `create()` constructs a single immutable captured rate (its current shape). It does **not** own a collection or paint intervals — the row-per-rate table *is* the series, and `findEffective` *is* the `activeAt(asOf)` read. The `Timeline` interval-paint machinery (`place`/trim/split) is unnecessary because rows are never superseded in place; a new rate is just a new row.

7. **No change to writes, events, or reads beyond typing.** `UpdateFxRates`, `FxRateCapturedEvent` (payload `{ fxRateId, fromCurrency, toCurrency, rate, startDate }`, no `endDate`), `GetFxRates`, `findEffective`, `list`, and `save` keep their current signatures and behavior. `GetFxRatesOutputSchema`'s item shape (`{ fromCurrency, toCurrency, rate, startDate }`) is unaffected; if `endDate` ever surfaces on the entity it stays internal to the domain shape and is **not** added to the controller/SDK output by this spec.

## User Stories

- **Story 1:** As a developer reading `FxRate`, I want its historical-series shape stated in the same `z.historical` keys-structural vocabulary as `GatewayFee`/`RevenueTax`, so that I recognize the pattern without re-reading prose.
  - Given `packages/api/typescript/src/finance/entities/FxRate.ts`, when I read the schema, then `{ rate }` is wrapped by `z.historical(...)` and `(fromCurrency, toCurrency)` sit outside the window — visibly mirroring `GatewayFeeRate`/`RevenueTax`.
  - Given the entity is rehydrated from a row, when `toDomain` runs (`DrizzleFxRateRepository`), then `endDate` is `null` (open-ended) and `startDate`/`rate`/pair are unchanged.

- **Story 2:** As a developer maintaining the FX storage, I want the append-only row-per-rate table and its index untouched, so that the hourly-capture write path and the `start_date <= at` seek keep performing as designed.
  - Given the `fx_rates` table, when this chore lands, then there is no new column (no `end_date`), no migration, and `fx_rates_pair_start_date_idx` is identical.
  - Given `UpdateFxRates` runs an hourly batch, when it saves N non-identity rates, then it still issues N inserts and N `FxRateCapturedEvent`s with no extra `UPDATE` to close prior rows.

- **Story 3:** As a developer resolving a rate at a timestamp, I want `findEffective` to remain the canonical `activeAt(asOf)` read, so that the derived `[startDate, nextStartDate)` window needs no stored terminator.
  - Given multiple rows for `(USD, BRL)` with ascending `start_date`, when `findEffective(USD, BRL, asOf)` runs, then it returns the row with the greatest `start_date <= asOf` (existing behavior, existing test in `FxRate.test.ts`).

## Acceptance Criteria

- [ ] AC-1: `FxRateSchema` (`packages/api/typescript/src/finance/entities/FxRate.ts`) is expressed with `z.historical({ rate: z.string() })` for the value and `{ fromCurrency, toCurrency }` outside the window; the inferred props are `{ fromCurrency, toCurrency, rate: string, startDate: Date, endDate: Date | null }` (only `endDate` is new vs. today). Keys are never inside the window.
- [ ] AC-2: The `fx_rates` table (`packages/contracts/db/schema/finance.ts`) is byte-for-byte unchanged — no `end_date`/`effective_to` column, no new index, no migration file added. (Grep: no new `*.sql` migration references `fx_rates`.)
- [ ] AC-3: `DrizzleFxRateRepository.toDomain` and `MockFxRateRepository` rehydrate `FxRate` with `endDate: null`; `findEffective`, `list`, and `save` keep their current SQL/semantics (still `ORDER BY start_date DESC LIMIT 1`, still idempotent `onConflictDoUpdate` on `id`, still no `version`/`updatedAt` write).
- [ ] AC-4: `FxRateCapturedEvent` payload (`packages/api/typescript/src/finance/events/FxRateCapturedEvent.ts` + `packages/contracts/wire/events/fx-rate-captured.tsp`) is unchanged — no `endDate` added; `UpdateFxRates` write loop is unchanged.
- [ ] AC-5: `GetFxRatesOutputSchema` item shape (`packages/api/typescript/src/finance/usecases/GetFxRates.ts`) is unchanged (`{ fromCurrency, toCurrency, rate, startDate }`); no `endDate` leaks to the SDK/controller output.
- [ ] AC-6: No `Timeline` import and no `place()`/interval-paint method appear in `FxRate.ts` or its repositories.
- [ ] AC-7: Existing `FxRate.test.ts` (`packages/api/typescript/src/finance/usecases/FxRate.test.ts`) passes unmodified except for any assertion that now also sees `endDate: null` on a rehydrated entity; `bun tsc` (`cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`) is clean. No `bun sdk` change required (no controller/output schema change).

## Risks & Migration

- **Risk of over-application.** The only real hazard is a future contributor "finishing the consistency job" by migrating `fx_rates` to a jsonb `Timeline`. Decisions 1–3 and AC-2/AC-6 exist to pin that door shut: the storage stays row-per-rate; `z.historical` is adopted as **vocabulary only**.
- **No migration.** This chore adds no migration and no column. The append-only model and `fx_rates_pair_start_date_idx` are explicitly preserved (the append/volume trade-off is the whole reason `Timeline`-in-jsonb is rejected).
- **`endDate` semantics.** `endDate` is domain-typed but always `null` at the data layer (Decision 5). If a consumer ever needs the explicit upper bound, derive it from the next row's `start_date` in the existing series query — do **not** add a stored column.

## Open Questions

- None blocking. One non-blocking call to confirm with the reviewer: whether adding the always-`null` `endDate` to the entity's inferred shape (purely for vocabulary symmetry with `GatewayFeeRate`/`RevenueTax`) is worth the field, or whether the lighter outcome — keep `FxRateSchema` exactly as-is and only align the **doc comments** to the `z.historical` keys-structural language — is preferable. Both are valid realizations of fit-option (a); this spec recommends the `z.historical({ rate })` composition (AC-1) for genuine type-level consistency, but the doc-only variant is a legitimate smaller result if the team prefers zero shape change. Either way, storage is untouched.
