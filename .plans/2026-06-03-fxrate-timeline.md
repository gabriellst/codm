# Plan: FxRate z.historical vocabulary consistency

**Spec:** `.specs/2026-06-03-fxrate-timeline-design.md`
**Branch:** `worktree-fxrate-impl`
**Scope:** `packages/api/typescript/src/finance/` — FxRate entity + repositories only. No table, migration, event, use case, or SDK change.

## Task T1: Adopt z.historical on FxRateValueSchema (entity shape)

### Step T1.1 — Write failing test assertion for endDate: null on rehydrated entity

In `DrizzleFxRateRepository.test.ts`, add assertions that `fetched?.endDate` is `null` after a round-trip. This fails today because the entity shape has no `endDate` field.

**Files to write:** `packages/api/typescript/src/finance/repositories/FxRateRepository/DrizzleFxRateRepository.test.ts` (add assertions)

**Depends on:** nothing (baseline tsc clean)

### Step T1.2 — Introduce FxRateValueSchema + reshape FxRateSchema

Compose `FxRateValueSchema = z.historical({ rate: z.string() })` and
`FxRateSchema = z.object({ fromCurrency, toCurrency }).and(FxRateValueSchema)`.
The inferred `FxRateProps` now carries `endDate: Date | null`. Caller still
passes `{ fromCurrency, toCurrency, rate, startDate }`; `endDate` defaults to
`null` via `z.historical`'s `TimeWindowShape`.

**Files to write:** `packages/api/typescript/src/finance/entities/FxRate.ts`

**Depends on:** T1.1 (test red)

### Step T1.3 — Update toDomain in DrizzleFxRateRepository to pass endDate: null

Add `endDate: null` to the parsed object in `toDomain` so the entity is
rehydrated with the always-null terminator. `toPersistence` is unchanged
(no `end_date` column).

**Files to write:** `packages/api/typescript/src/finance/repositories/FxRateRepository/DrizzleFxRateRepository.ts`

**Depends on:** T1.2

## Task T2: Verify + green tests

### Step T2.1 — Run tests + tsc + lint, confirm green

All finance tests green; `endDate: null` assertions pass; no pre-existing
errors introduced.

**Depends on:** T1.3
