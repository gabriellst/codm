# SPEC-01: Shared `MonetaryAmount` value object

**Wave:** 1   **Stream:** A   **Depends on:** (none)   **Status:** done

## Motivation

The same "money" shape is re-declared in at least six places, with subtle drift:

- `src/analytics/entities/Goal.ts:10-11` — two **flat** fields `targetAmountCents: z.number().int().positive()` + `currency: CurrencyCodeSchema`.
- `src/finance/entities/OperationalCost.ts:24-25` — flat `amountCents` + `currency`.
- `src/sales/readmodels/objects/MonetaryAmount.ts:11-12` — a local `MonetaryAmountSchema` (allows negative).
- `src/sales/objects/OrderOverrideFields.ts:5-8` — a local `MonetaryAmountSchema` (`nonnegative`).
- `src/marketing/entities/AdSpend.ts:15-18` — a local `MonetaryAmountSchema` (`min(0)`).
- `src/catalog/entities/ProductCost.ts:8-11` — a local `MonetaryAmountSchema` (`nonnegative`).

There is no shared value object — `src/shared/objects/` exists but is empty. Money is a textbook value object (defined by its attributes, immutable, self-validating); duplicating the schema invites the exact `>0` vs `>=0` vs `min(0)` divergence seen above.

## Scope

1. Create `src/shared/objects/MonetaryAmount.ts` as a **composite** value object extending `BaseValueObject` (mirror the `Range` / `Address` composite VO shape — `src/...core/src/objects/Range.ts` is the canonical reference, not the `Email` primitive):

   ```ts
   export const MonetaryAmountSchema = z.object({
     amountCents: z.number().int().nonnegative(),
     currency: z.enum(CurrencyCode),
   })

   export class MonetaryAmount extends BaseValueObject<typeof MonetaryAmountSchema> {
     static override schema = MonetaryAmountSchema
     // equals(other), toJSON() inherited; add helpers only if a caller needs them
   }
   export interface MonetaryAmount extends z.infer<typeof MonetaryAmountSchema> {}
   ```

   - `amountCents` is a non-negative integer (refunds/zero are valid money). `currency` uses `z.enum(CurrencyCode)` directly per the wire-enum convention (SPEC-02 lands the enum-only export; until then `CurrencyCodeSchema` is acceptable — coordinate ordering in the same wave).
2. Replace each duplicated shape with the shared VO:
   - **Goal** (`analytics`): collapse the flat `targetAmountCents` + `currency` into a single `targetAmount: MonetaryAmountSchema.input(),`, and add `.refine(m => m.amountCents > 0)` (or `.positive()` on a goal-local extension) so the existing "target must be positive" invariant is preserved.
   - **OperationalCost** (`finance`): same flat→`amount: MonetaryAmountSchema` collapse, keeping its positive bound at the entity level.
   - **OrderOverrideFields** (`sales`), **AdSpend** (`marketing`), **ProductCost** (`catalog`): delete the local `MonetaryAmountSchema` and import the shared one.
   - **`src/sales/readmodels/objects/MonetaryAmount.ts`**: delete; re-point importers to `@shared/objects` (note: the sales read-model itself is removed in SPEC-11 — if SPEC-11 lands first, this importer may already be gone).
3. Update repositories' hydration + the entities' `.create()`/`.update()` call sites to build/read the nested `MonetaryAmount` object. Hydration stays schema-driven (`Entity.schema.parse(...)`, batch-1 SPEC-13 convention).

## Affected files

- `src/shared/objects/MonetaryAmount.ts` — NEW
- `src/shared/objects/index.ts` — export it (create if absent)
- `src/analytics/entities/Goal.ts` + `DrizzleGoalRepository.ts` / `MockGoalRepository.ts` + `analytics/usecases/{CreateGoal,UpdateGoal}.ts`
- `src/finance/entities/OperationalCost.ts` + its repos + use cases
- `src/sales/objects/OrderOverrideFields.ts` (delete local schema)
- `src/marketing/entities/AdSpend.ts` (delete local schema) — coordinates with SPEC-16
- `src/catalog/entities/ProductCost.ts` (delete local schema) — coordinates with SPEC-15
- `src/sales/readmodels/objects/MonetaryAmount.ts` — DELETE (see SPEC-11)
- Drizzle column mapping is unchanged (still two columns `*_amount_cents` + `*_currency` per money field); only the in-memory shape collapses into the VO.

## Acceptance criteria

- [ ] `MonetaryAmount` exists in `src/shared/objects/`, extends `BaseValueObject`, validates `amountCents >= 0` integer + a `CurrencyCode`.
- [ ] No local `MonetaryAmountSchema` definitions remain outside `src/shared/objects/` (grep `const MonetaryAmountSchema` returns one hit).
- [ ] `Goal` and `OperationalCost` no longer carry flat `*AmountCents` + `currency` pairs; they embed `MonetaryAmount` and keep their positive-amount invariant.
- [ ] Entity round-trip tests (save → findById) pass with the nested money shape.
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- The wire-enum `z.enum` migration itself (SPEC-02) — this spec may use `CurrencyCodeSchema` if it lands first.
- AdSpend's broader schema fix (SPEC-16) and ProductCost's date-range refine (SPEC-15) — they only swap in the VO here.
- Changing DB columns — the two-column persistence layout stays.

## Notes

- Composite VO (two properties) → `BaseValueObject`, not `BasePrimitiveValueObject`. `Range.ts` is the closest existing reference.
- Keep the VO permissive (`>= 0`). Per-entity stricter bounds live in the *entity* schema where the VO is embedded — don't bake `> 0` into the shared VO or you'll break refund/zero use cases.
- If a caller needs arithmetic (`add`, `subtract`), add it on the VO only when a real consumer appears — don't speculatively build a money library.
