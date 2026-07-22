# SPEC-16: Fix `AdSpendSchema`

**Wave:** 6   **Stream:** C   **Depends on:** SPEC-01   **Status:** done

## Motivation

`AdSpendSchema` (`src/marketing/entities/AdSpend.ts:25-44`) is close but has type/enum sloppiness, judged against a real synced ad-spend record:

```jsonc
{ "adAccountExternalId": "act_…", "campaignExternalId": "120…", "currency": "USD",
  "startDate": "2026-04-20T23:00:00.000Z", "endDate": "2026-04-20T23:59:59.000Z",
  "groupBy": "HOURLY", "platform": "FACEBOOK", "spend": 1564 }
```

Current issues:
- `startDate` / `endDate` are `z.string()` — should be `z.iso.date()` / `z.date()` so the range is typed and comparable.
- `platform` is `MarketingPlatformSchema.or(z.literal('MANUAL'))` — a mixed enum-plus-literal; should use the platform enum cleanly (treat "manual" via `adSpendType`, not a magic platform literal).
- `spend` is a local `MonetaryAmountSchema` — should be the shared `MonetaryAmount` VO (SPEC-01).
- A `startDate > endDate` check is inlined in `.create()`/`.updateManual()` — should be a schema `.refine()` (same pattern as SPEC-15).

## Scope

1. Change `startDate` / `endDate` to `z.iso.date()` (or `z.date()` if intra-day windows like the `HOURLY` example are required — pick datetime to support `groupBy: HOURLY`).
2. Replace `platform: MarketingPlatformSchema.or(z.literal('MANUAL'))` with `platform: z.enum(MarketingPlatform)`. Represent manual entries via the existing `adSpendType` (`AdSpendType`) enum rather than a `'MANUAL'` platform literal; if a "manual" platform value is genuinely needed, add it to the `MarketingPlatform` wire enum instead of an inline literal.
3. Swap `spend` to the shared `MonetaryAmount` VO (SPEC-01).
4. Add the `startDate <= endDate` invariant to `AdSpendSchema.refine(...)` (mirroring SPEC-15 / `Range.ts`). **Keep** the inline named-error guard in `.create()` / `.updateManual()`: `BaseEntity` maps any schema-validation failure (including a `.refine()` rejection) to a generic `INVALID_ENTITY`, so the inline `throw INVALID_DATE_RANGE` is what surfaces the specific named error callers/tests assert on. (Resolved during implementation — the original "drop the inline checks" assumed the refine's error code propagates, which it doesn't.)
5. Keep `groupBy: z.enum(AdSpendGroupBy)` (already correct) and the domain fields (`impressions`, `clicks`, `conversions`, `adSpendType`, `bindings`, etc.).
6. If column types change (dates), add a migration; update the AdSpend repo hydration + the `ManualAdSpendRecorded/Updated` event payloads (the latter is reshaped by SPEC-08 if it lands first).

## Affected files

- `src/marketing/entities/AdSpend.ts`
- `src/marketing/repositories/AdSpendRepository/{Drizzle,Mock}AdSpendRepository.ts`
- `src/marketing/controllers/{RecordManualAdSpend,UpdateManualAdSpend}Controller.ts` (date input types)
- `src/marketing/events/ManualAdSpend{Recorded,Updated}Event.ts` (coordinate with SPEC-08)
- `packages/contracts/db/schema/*` + migration (only if date column types change)
- `MarketingPlatform` wire enum (only if a manual member is added) — coordinate with SPEC-02

## Acceptance criteria

- [ ] `AdSpend` dates are `z.iso.date()`/`z.date()`, not bare `z.string()`.
- [ ] `platform` uses `z.enum(MarketingPlatform)` with no inline `'MANUAL'` literal; manual entries are distinguished via `adSpendType`.
- [ ] `spend` is the shared `MonetaryAmount` VO (SPEC-01).
- [x] The `startDate <= endDate` invariant is a schema `.refine()`; the inline `INVALID_DATE_RANGE` guard in `.create()`/`.updateManual()` is retained (BaseEntity maps refine failures to `INVALID_ENTITY`, so the named guard is required).
- [ ] Entity + repo round-trip tests pass; `bun tsc` clean; `bun run test` clean (and migration applies if added).

## Out of scope

- Building a synced (non-manual) ad-spend ingest pipeline — the entity shape is fixed here; ingest is a separate concern.
- Reworking `GetAdSpendBreakdown` query semantics (only its `groupBy`/date param types follow).
- The broader event-embed reshape (SPEC-08) — this spec only adjusts AdSpend's own fields.

## Notes

- Depends on SPEC-01 for `MonetaryAmount`. If SPEC-08 lands first, the `ManualAdSpend*` events already embed `AdSpendSchema`, so fixing the schema here propagates automatically.
- The reference doc is a *synced* record (`platform: FACEBOOK`, `groupBy: HOURLY`); the current entity is "manual" ad spend. Keep both representable: `platform` = the real channel enum, `adSpendType` = manual vs synced. Don't overload `platform` with a `MANUAL` literal.
- `groupBy: HOURLY` implies datetime windows — prefer `z.date()` for the dates so hourly buckets are expressible.
