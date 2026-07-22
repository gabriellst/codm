# SPEC-16: Fix `AdSpendSchema` — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Harden `AdSpendSchema` in `src/marketing/entities/AdSpend.ts`:
replace `z.string()` date fields with `z.date()`; replace the
`MarketingPlatformSchema.or(z.literal('MANUAL'))` mixed type with
`z.enum(MarketingPlatform)` (manual entries distinguished via
`adSpendType`); swap the local `MonetaryAmountSchema` for the shared
`MonetaryAmount` VO from SPEC-01; and move the inline `startDate <=
endDate` checks in `.create()` / `.updateManual()` into a single
`AdSpendSchema.refine()`, mirroring `core/src/objects/Range.ts`.

**Architecture:** Four atomic commits: (1) entity schema hardening
+ schema-level date refine; (2) update entity `.create()` / `.updateManual()`
call-sites + existing entity tests; (3) update repo hydration and
persistence mapping; (4) update event payloads. No DB migration is needed
— `start_date` / `end_date` columns are already `text` in the Drizzle
schema; the entity stores ISO strings and `z.date()` accepts/
produces the same ISO string format, so no column type change occurs.
The `platform` column is also `text`, so MANUAL platform values already
stored as `'MANUAL'` are handled by the `toDomain` fallback (`row.platform ?? 'MANUAL'`); that fallback is removed once `platform` becomes `optional()` at the schema level (MANUAL rows can store `null`).

> **Planner note — migration decision.** The `start_date` / `end_date`
> columns are `text('start_date')` / `text('end_date')` in
> `packages/contracts/db/schema/marketing.ts:170-171`. The TS entity has
> always stored/read ISO strings. `z.date()` validates the same
> ISO 8601 string format — no column type change, no migration needed.
> The `platform` column is `text` and nullable (`platform: text('platform')`
> — no `.notNull()`). MANUAL rows that already have `'MANUAL'` stored in
> the `platform` column will fail the new `z.enum(MarketingPlatform)`
> parse. To avoid a data migration, `AdSpendSchema.platform` becomes
> `z.enum(MarketingPlatform).optional()` and the null/MANUAL stored value
> maps to `undefined` in `toDomain`. The MANUAL/AUTOMATIC discriminator
> remains `adSpendType`.

> **Planner note — SPEC-08 coordination.** `ManualAdSpendRecordedEvent`
> still carries per-field payload (not entity-embed yet — that is SPEC-08).
> This plan updates `startDate`/`endDate` types in that event's schema
> from `z.string()` to `z.date()` since they are date fields
> whose types are fixed here. The full entity-embed reshape is deferred
> to SPEC-08.

> **Planner note — SPEC-01 dependency.** SPEC-01 creates
> `src/shared/objects/MonetaryAmount.ts` and removes the local
> `MonetaryAmountSchema` from `AdSpend.ts` as part of its scope.
> **If SPEC-01 lands before this plan executes**, Task 1 here only
> needs to import `MonetaryAmountSchema` from `@shared/objects` rather
> than re-declaring it — the local `MonetaryAmountSchema` will already
> be gone. If SPEC-01 has not landed, Task 1 removes the local
> `MonetaryAmountSchema` and imports from `@shared/objects`.
> Either way, Task 1 does NOT recreate the VO class (that is SPEC-01's
> job); it only ensures the import path is correct.

**Tech Stack:** TypeScript + Bun + Zod (`@template/core-typescript`
re-exports `z`). No DB migration. No SDK regen required (the entity
is not exposed directly via OpenAPI — controllers wrap use-case output
schemas; those schemas already use `z.iso.date()` for date inputs).

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-16-adspend-schema-fix.md`
**Tasks:** 4
**Estimated minutes:** 70

---

## Task 1: `AdSpendSchema` uses `z.date()`, `z.enum(MarketingPlatform)`, and shared `MonetaryAmount`; `startDate <= endDate` is a schema `.refine()`

**Files:**
- Modify: `packages/api/typescript/src/marketing/entities/AdSpend.ts`
- Modify: `packages/api/typescript/src/marketing/entities/AdSpend.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /schema
**Depends on:** SPEC-01

- [ ] **Step 1: Write the failing test (RED)**

Add focused schema-level assertions to
`packages/api/typescript/src/marketing/entities/AdSpend.test.ts`.
Append a new `describe` block without touching the existing tests:

```ts
import { AdSpendSchema } from './AdSpend'

describe('AdSpendSchema (SPEC-16)', () => {
  const base = {
    storeId: 'aaaaaaaa-0001-4000-8000-000000000001',
    platform: 'META',
    currency: 'USD',
    startDate: '2026-04-20T23:00:00.000Z',
    endDate: '2026-04-20T23:59:59.000Z',
    groupBy: 'HOURLY',
    spend: { amountCents: 1564, currency: 'USD' },
    adSpendType: 'AUTOMATIC',
    createdByUserId: 'go-worker',
  }

  it('accepts a valid AUTOMATIC record with datetime dates', () => {
    expect(AdSpendSchema.safeParse(base).success).toBe(true)
  })

  it('rejects bare date string for startDate', () => {
    // 'z.date()' rejects plain date-only strings
    const r = AdSpendSchema.safeParse({ ...base, startDate: '2026-04-20' })
    expect(r.success).toBe(false)
  })

  it('rejects MANUAL as platform value', () => {
    const r = AdSpendSchema.safeParse({ ...base, platform: 'MANUAL' })
    expect(r.success).toBe(false)
  })

  it('accepts undefined platform for MANUAL ad-spend rows', () => {
    const r = AdSpendSchema.safeParse({ ...base, platform: undefined, adSpendType: 'MANUAL' })
    expect(r.success).toBe(true)
  })

  it('rejects startDate > endDate via schema refine', () => {
    const r = AdSpendSchema.safeParse({
      ...base,
      startDate: '2026-04-20T23:59:59.000Z',
      endDate: '2026-04-20T23:00:00.000Z',
    })
    expect(r.success).toBe(false)
  })

  it('accepts startDate === endDate', () => {
    const r = AdSpendSchema.safeParse({
      ...base,
      startDate: '2026-04-20T23:00:00.000Z',
      endDate: '2026-04-20T23:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })

  it('spend is parsed via MonetaryAmountSchema (nonnegative int)', () => {
    const r = AdSpendSchema.safeParse({ ...base, spend: { amountCents: -1, currency: 'USD' } })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/marketing/entities/AdSpend.test.ts
```

Expected: FAIL — at minimum the `MANUAL as platform` test passes (current
schema allows it via `.or(z.literal('MANUAL'))`), and the `bare date string`
test passes (current schema uses `z.string()`). Several assertions flip.

- [ ] **Step 3: Rewrite `AdSpendSchema` in `AdSpend.ts`**

Key changes to `packages/api/typescript/src/marketing/entities/AdSpend.ts`:

1. Remove the local `MonetaryAmountSchema` block (lines 15–18). Import
   `MonetaryAmountSchema` from `@shared/objects` instead (provided by
   SPEC-01 — if SPEC-01 has not landed yet, this import will fail; run
   SPEC-01 first as required by `Depends on`).

2. Remove `MarketingPlatformSchema` from the import list (no longer
   needed in the schema; keep `MarketingPlatform` the enum value for
   the type).

3. Replace `AdSpendSchema` with:

```ts
export const AdSpendSchema = z
  .object({
    storeId: z.instance(Id),
    adAccountExternalId: z.string().optional(),
    campaignExternalId: z.string().optional(),
    // Optional: MANUAL rows store null in DB; undefined here means no platform.
    platform: z.enum(MarketingPlatform).optional(),
    currency: CurrencyCodeSchema,
    startDate: z.date(),
    endDate: z.date(),
    groupBy: z.enum(AdSpendGroupBy),
    spend: MonetaryAmountSchema,
    impressions: z.number().int().optional(),
    clicks: z.number().int().optional(),
    conversions: z.number().int().optional(),
    adSpendType: z.enum(AdSpendType),
    name: z.string().optional(),
    description: z.string().optional(),
    bindings: z.array(ManualMarketingExpenseBindingSchema).optional(),
    createdByuserId: z.uuid(),
    disabledAt: z.string().optional(),
  })
  .refine(data => data.startDate <= data.endDate, {
    error: 'INVALID_DATE_RANGE' as MarketingDomainErrors,
  })
```

4. Clean up imports: remove `AdSpendGroupBySchema` (replaced by
   `z.enum(AdSpendGroupBy)`), remove `AdSpendTypeSchema` (replaced by
   `z.enum(AdSpendType)`), remove `CurrencyCode` type import if no
   longer used directly in the class (keep `CurrencyCodeSchema`).

5. Update the `AdSpend.create()` static signature — `platform` parameter
   becomes `MarketingPlatform | undefined` (drop `| 'MANUAL'`); the
   default `platform: data.platform ?? 'MANUAL'` in the constructor call
   becomes `platform: data.platform` (no default — `undefined` is now
   the canonical "no platform" value for MANUAL rows).

6. Update the `AdSpend.updateManual()` patch parameter — `spend` type
   becomes `{ amountCents: number; currency: string }` (matches
   `MonetaryAmountSchema`, which accepts the inferred type). If
   SPEC-01's `MonetaryAmount` VO is imported, use its inferred type.

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```bash
cd packages/api/typescript && bun test src/marketing/entities/AdSpend.test.ts
```

Expected: PASS — all tests including the new SPEC-16 block.

- [ ] **Step 5: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors. If `toPersistence` in `DrizzleAdSpendRepository`
references `entity.platform` and passes it as a non-null string, it will
now need to handle `entity.platform ?? null` (Task 3 fixes this). For
now, `tsc` should still pass because `platform` in the Drizzle schema is
already a nullable `text` column.

- [ ] **Step 6: Commit**

Use `/commit`:

```
refactor(marketing): SPEC-16 AdSpendSchema — datetime dates, enum platform, shared MonetaryAmount, schema refine (Task 1)
```

Stage: `packages/api/typescript/src/marketing/entities/AdSpend.ts`,
`packages/api/typescript/src/marketing/entities/AdSpend.test.ts`

---

## Task 2: Remove inline `startDate > endDate` guards from `.create()` and `.updateManual()`; update entity unit tests

**Files:**
- Modify: `packages/api/typescript/src/marketing/entities/AdSpend.ts`
- Modify: `packages/api/typescript/src/marketing/entities/AdSpend.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** 1

- [ ] **Step 1: Write the failing test (RED)**

The existing test `'propagates INVALID_DATE_RANGE when startDate > endDate'`
in `ManualAdSpend.test.ts` asserts the error is thrown from `.create()`.
After Task 1, the schema `.refine()` throws on `AdSpend.schema.parse()`
inside the constructor — the use case test should still pass without
changes. However, the entity-level unit test in `AdSpend.test.ts` needs
to assert the refine path correctly (using `safeParse` not a `throw`).

Add to the `AdSpend entity` describe block in `AdSpend.test.ts`:

```ts
it('create() throws INVALID_DATE_RANGE when startDate > endDate via schema refine', () => {
  let caught: unknown = null
  try {
    AdSpend.create({
      storeId: 'store-1',
      currency: CurrencyCode.USD,
      startDate: '2026-05-31T00:00:00.000Z',
      endDate: '2026-05-01T00:00:00.000Z',
      spend: { amountCents: 100, currency: CurrencyCode.USD },
      adSpendType: AdSpendType.MANUAL,
      createdByUserId: 'user-1',
    })
  } catch (e) {
    caught = e
  }
  expect(caught).toBeInstanceOf(BaseError)
  expect((caught as BaseError).name).toBe('INVALID_DATE_RANGE')
})
```

Also add an import for `BaseError` from `@template/core-typescript` at
the top of `AdSpend.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/marketing/entities/AdSpend.test.ts
```

Expected: FAIL on the new test — the inline guard in `.create()` still
fires first (it throws a `BaseError` before the schema parse can). The
test assertion will pass, but the next step removes the duplicate guard
and confirms the schema refine takes over.

> Note: if the entity uses `schema.parse()` at construction time (via
> `AggregateRoot` base), the schema refine already fires before the
> method-level guard, making the test pass immediately. Either outcome is
> acceptable — proceed to Step 3 regardless.

- [ ] **Step 3: Remove the inline date-range guards**

In `packages/api/typescript/src/marketing/entities/AdSpend.ts`:

1. Remove the `if (data.startDate > data.endDate)` block from `create()`
   (lines 72–74 in the current file).

2. Remove the `effectiveStart`/`effectiveEnd` computation and the
   `if (effectiveStart > effectiveEnd)` block from `updateManual()`.

After removal, `updateManual()` must still enforce the range invariant.
Since the schema `.refine()` is evaluated on `schema.parse()`, and
`AggregateRoot` parses on construction, the approach is:

- In `updateManual()`, after applying the patch fields to `this.startDate`
  and `this.endDate`, call `AdSpendSchema.parse(this)` (or equivalently
  rely on the base class to re-parse on mutation if that is the pattern).
  If `AggregateRoot` does not auto-parse on mutation, add an explicit
  call:

```ts
updateManual(patch: { ... }): void {
  if (this.adSpendType !== AdSpendType.MANUAL) {
    throw new BaseError<MarketingDomainErrors>('CANNOT_MUTATE_AUTOMATIC_AD_SPEND')
  }
  // Apply patch fields to this.*
  if (patch.name !== undefined) this.name = patch.name
  if (patch.description !== undefined) this.description = patch.description
  if (patch.startDate !== undefined) this.startDate = patch.startDate
  if (patch.endDate !== undefined) this.endDate = patch.endDate
  if (patch.spend !== undefined) this.spend = patch.spend
  if (patch.bindings !== undefined) this.bindings = patch.bindings
  // Validate via schema refine — throws ZodError / maps to BaseError
  // if the resulting dates violate startDate <= endDate.
  AdSpendSchema.parse({
    ...this,
    storeId: this.storeId, // Id instance already on `this`
  })
}
```

> If `AggregateRoot` already calls `static schema.parse(this)` inside a
> mutation helper, use that mechanism instead. Check
> `packages/api/typescript/core/src/objects/AggregateRoot.ts` to confirm
> the base class behavior before adding a redundant parse call.

- [ ] **Step 4: Verify `AggregateRoot` base class mutation pattern**

```bash
grep -n "parse\|validate\|schema" packages/api/typescript/core/src/objects/AggregateRoot.ts | head -20
```

Use the output to decide whether an explicit `AdSpendSchema.parse(this)`
call is needed in `updateManual()` or whether the base class handles it.
Adjust Step 3's implementation accordingly.

- [ ] **Step 5: Run test to verify it passes (GREEN)**

```bash
cd packages/api/typescript && bun test src/marketing/entities/AdSpend.test.ts
```

Expected: PASS — the new test confirms the refine fires via
`create()`/`updateManual()` without inline guards.

- [ ] **Step 6: Run the use-case integration tests**

```bash
cd packages/api/typescript && bun test src/marketing/usecases/ManualAdSpend.test.ts
```

Expected: PASS — the `'propagates INVALID_DATE_RANGE when startDate > endDate'`
test still passes because the schema refine surfaces the same
`INVALID_DATE_RANGE` error code as the removed inline guard did.

- [ ] **Step 7: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

Use `/commit`:

```
refactor(marketing): SPEC-16 remove inline date guards; schema refine is the invariant (Task 2)
```

Stage: `packages/api/typescript/src/marketing/entities/AdSpend.ts`,
`packages/api/typescript/src/marketing/entities/AdSpend.test.ts`

---

## Task 3: Repository hydration + persistence mapping aligned with new schema

**Files:**
- Modify: `packages/api/typescript/src/marketing/repositories/AdSpendRepository/DrizzleAdSpendRepository.ts`
- Modify: `packages/api/typescript/src/marketing/repositories/AdSpendRepository/MockAdSpendRepository.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository
**Depends on:** 1

- [ ] **Step 1: Audit `toDomain` and `toPersistence` (RED — `tsc` errors expected)**

After Task 1, `tsc` may surface:

1. `toDomain` passes `platform: row.platform ?? 'MANUAL'` — the fallback
   `'MANUAL'` string is no longer in `MarketingPlatform`; must become
   `platform: row.platform ?? undefined` (or simply `row.platform ?? undefined`
   since the column is nullable).

2. `toDomain` builds `spend: { amountCents: Number(row.amountCents), currency: row.currency }` —
   this still matches `MonetaryAmountSchema` shape, no change needed.

3. `toDomain` passes `startDate: row.startDate` (a `text` column returning
   a plain ISO string) — `z.date()` validates that string at parse
   time; the stored format must be a full ISO datetime. Confirm existing
   MANUAL rows store date-only strings (`'2026-05-01'`) — if so, the
   parse will fail on old rows. Resolution: keep `startDate: z.iso.date().or(z.date())` in the schema OR ensure `toPersistence` always writes a datetime string. **Decision: use `z.date()` in the schema and update `RecordManualAdSpend` use case to accept / convert date-only input to datetime.** This is addressed in the `create()` call-site (the controller already passes `z.iso.date()` inputs; `AdSpend.create()` must coerce to datetime). See Step 3b.

4. `toPersistence` passes `platform: entity.platform` — now typed as
   `MarketingPlatform | undefined`, but the Drizzle insert expects
   `string | null`. Change to `platform: entity.platform ?? null`.

5. `MockAdSpendRepository.breakdown` compares `s.startDate` and `s.endDate`
   as strings (`s.endDate < query.from`). The `query.from` and `query.to`
   are still raw strings (not typed by the entity schema). Ensure the
   mock comparison uses ISO strings consistently — datetime strings sort
   lexicographically the same as dates when zero-padded.

Run:

```bash
cd packages/api/typescript && bun tsc 2>&1 | grep -i "AdSpend\|adSpend\|adspend" | head -30
```

Expected: errors in `DrizzleAdSpendRepository.ts` on `platform` fallback.

- [ ] **Step 2: Write a repo round-trip test (RED)**

Add to `ManualAdSpend.test.ts` (or a new `AdSpendRepository.test.ts` if
a dedicated repo test does not exist):

```ts
it('saves and reloads a MANUAL AdSpend with datetime dates', async () => {
  const out = await record.execute({
    userId: USER,
    storeId: STORE,
    // Use ISO datetime strings; the controller input is date-only
    // but the entity stores datetimes — test the entity-level path.
    startDate: '2026-05-01T00:00:00.000Z',
    endDate: '2026-05-31T23:59:59.000Z',
    currency: CurrencyCode.USD,
    amountCents: 20_000,
  })
  const saved = await repo.findById(out.adSpendId)
  expect(saved?.startDate).toBe('2026-05-01T00:00:00.000Z')
  expect(saved?.spend.amountCents).toBe(20_000)
  expect(saved?.platform).toBeUndefined()  // MANUAL rows have no platform
})
```

Run:

```bash
cd packages/api/typescript && bun test src/marketing/usecases/ManualAdSpend.test.ts
```

Expected: FAIL — `startDate` round-trip fails if the repo still writes
the date as-is.

- [ ] **Step 3a: Fix `toPersistence`**

In `DrizzleAdSpendRepository.ts`:

```diff
- platform: entity.platform,
+ platform: entity.platform ?? null,
```

No change needed for `startDate`/`endDate` — they are already written as
`entity.startDate` / `entity.endDate` (ISO strings); the column type is
`text` which stores them verbatim.

- [ ] **Step 3b: Fix `toDomain`**

```diff
- platform: row.platform ?? 'MANUAL',
+ platform: row.platform ?? undefined,
```

For `startDate`/`endDate`: MANUAL rows recorded before this migration may
have date-only strings (`'2026-05-01'`) in the `text` columns. The new
schema uses `z.date()`. To avoid breaking existing rows,
extend `AdSpendSchema.startDate` / `endDate` to accept both formats at
the schema boundary while the repo hydrates them:

```ts
// In AdSpendSchema — temporary coercion for legacy date-only DB rows:
startDate: z.date().or(z.iso.date().transform(d => `${d}T00:00:00.000Z`)),
endDate: z.date().or(z.iso.date().transform(d => `${d}T23:59:59.999Z`)),
```

> This is a **one-way coercion at the repo boundary**: old rows are
> normalised to datetime on first read. The schema's runtime output is
> always a datetime string. New rows written by `toPersistence` will
> always be datetime strings (since the entity holds datetimes after the
> coercion). This removes the `or()` branch once legacy rows are
> migrated — mark with a `// TODO: remove after legacy date-only rows migrate` comment.

Alternatively, if the codebase confirms no existing MANUAL rows exist
in production (template project — no real data), omit the coercion and
keep `z.date()` only. The agent must check this before deciding.

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```bash
cd packages/api/typescript && bun test src/marketing/usecases/ManualAdSpend.test.ts
```

Expected: PASS — all existing + new round-trip test.

- [ ] **Step 5: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 6: `bun run test` (all marketing tests)**

```bash
cd packages/api/typescript && bun test src/marketing/
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

Use `/commit`:

```
refactor(marketing): SPEC-16 repo hydration — platform optional, datetime normalisation (Task 3)
```

Stage: `packages/api/typescript/src/marketing/repositories/AdSpendRepository/DrizzleAdSpendRepository.ts`,
`packages/api/typescript/src/marketing/repositories/AdSpendRepository/MockAdSpendRepository.ts`

---

## Task 4: Update `ManualAdSpendRecordedEvent` date types; verify full test suite

**Files:**
- Modify: `packages/api/typescript/src/marketing/events/ManualAdSpendRecordedEvent.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event
**Depends on:** 2, 3

- [ ] **Step 1: Write the failing assertion (RED)**

The current `ManualAdSpendRecordedEventSchema` has
`startDate: z.string()` / `endDate: z.string()` (lines 9–10 of
`ManualAdSpendRecordedEvent.ts`). After the entity fix, the use case
passes datetime strings to the event payload, but the schema accepts any
string — no type error yet. Add a focused event schema test:

Create `packages/api/typescript/src/marketing/events/ManualAdSpendRecordedEvent.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { ManualAdSpendRecordedEventSchema } from './ManualAdSpendRecordedEvent'

describe('ManualAdSpendRecordedEventSchema (SPEC-16)', () => {
  const validPayload = {
    adSpendId: 'aaaaaaaa-0001-4000-8000-000000000001',
    storeId: 'aaaaaaaa-0002-4000-8000-000000000002',
    amountCents: 1000,
    currency: 'USD',
    startDate: '2026-05-01T00:00:00.000Z',
    endDate: '2026-05-31T23:59:59.000Z',
  }

  it('accepts datetime startDate/endDate', () => {
    expect(ManualAdSpendRecordedEventSchema.safeParse(validPayload).success).toBe(true)
  })

  it('rejects bare date-only startDate', () => {
    const r = ManualAdSpendRecordedEventSchema.safeParse({
      ...validPayload,
      startDate: '2026-05-01',
    })
    expect(r.success).toBe(false)
  })
})
```

Run:

```bash
cd packages/api/typescript && bun test src/marketing/events/ManualAdSpendRecordedEvent.test.ts
```

Expected: FAIL — `rejects bare date-only startDate` passes (schema
currently accepts any string, so the bare date string is accepted, but
the test expects rejection).

- [ ] **Step 2: Update `ManualAdSpendRecordedEvent.ts`**

```diff
- startDate: z.string(),
- endDate: z.string(),
+ startDate: z.date(),
+ endDate: z.date(),
```

No other changes. `ManualAdSpendUpdatedEvent` does not carry date fields
directly (it embeds `entity: z.record(...)` — typed by SPEC-08 later).

- [ ] **Step 3: Run test to verify it passes (GREEN)**

```bash
cd packages/api/typescript && bun test src/marketing/events/ManualAdSpendRecordedEvent.test.ts
```

Expected: PASS — 2 tests.

- [ ] **Step 4: Full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass; no regressions across other contexts.

- [ ] **Step 5: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

Use `/commit`:

```
refactor(marketing): SPEC-16 ManualAdSpendRecordedEvent startDate/endDate → datetime (Task 4)
```

Stage: `packages/api/typescript/src/marketing/events/ManualAdSpendRecordedEvent.ts`,
`packages/api/typescript/src/marketing/events/ManualAdSpendRecordedEvent.test.ts`

---

## Acceptance Criteria Coverage

| AC | Covered by |
|---|---|
| `startDate`/`endDate` are `z.date()` | Task 1 Step 3 |
| `platform` uses `z.enum(MarketingPlatform).optional()` with no `'MANUAL'` literal | Task 1 Step 3 |
| `spend` uses shared `MonetaryAmount` VO (SPEC-01) | Task 1 Step 3 |
| `startDate <= endDate` is a schema `.refine()`, not an inline method check | Tasks 1–2 |
| Entity + repo round-trip tests pass | Tasks 2–3 |
| `bun tsc` clean | Tasks 1–4 |
| `bun run test` clean | Task 4 Step 4 |

## Migration Decision

**No migration needed.** The `start_date` / `end_date` columns in
`packages/contracts/db/schema/marketing.ts` are already `text` — they
store ISO strings and will continue to do so. The entity schema change
from `z.string()` to `z.date()` is a runtime-only validation
tightening; no column type changes occur. The `platform` column is
already nullable `text` — setting `'MANUAL'` → `null` for new MANUAL
rows requires no DDL change (the column already accepts `null`, as
`platform: text('platform')` without `.notNull()`).
