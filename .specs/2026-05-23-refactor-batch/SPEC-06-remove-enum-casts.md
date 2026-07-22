# SPEC-06: Remove enum `as` casts when the prop is already typed

**Wave:** 2   **Depends on:** SPEC-13   **Status:** done

## Motivation

Many sites cast enum values redundantly:

```ts
const x = something() as GoalType   // but something() already returns GoalType
const y = row.currency as CurrencyCode  // but the column is typed as CurrencyCode via Drizzle's pgEnum
```

These casts add no information and hide accidental drift if the underlying type changes.

After SPEC-13 (`schema.parse` hydration) lands, most of these vanish automatically. Sweep the remainder.

## Scope

Remove enum `as` casts where:
- The left-hand side variable is declared with the enum type
- The right-hand expression already produces the same enum type (inferred from Drizzle, from a Zod schema, from another typed call)

Examples to remove:
```ts
const status = row.status as OrderStatus       // row.status already OrderStatus
const tier = subscription.tier as PlanTier     // subscription.tier already PlanTier
return data.platform as SalesPlatform           // data already typed
```

Examples to KEEP (these are real narrowings, not redundant casts):
- Casts on `unknown` from external input — the cast is the narrowing
- Casts on `string` from an untyped source (e.g. JSON.parse result) — same
- Casts inside test fixtures with `as never` / `as any` — fixtures intentionally short-circuit

## Affected files

Discovery: `rg "as (OrderStatus|PaymentStatus|PaymentMethod|CurrencyCode|PlanTier|GoalType|SalesPlatform|.*Status|.*Type|.*Mode)" packages/api/typescript/src --type ts -n`. For each match, check whether the LHS / RHS type is already the enum; if yes, remove the cast.

## Acceptance criteria

- [ ] No redundant enum casts in production code (`packages/api/typescript/src/**/*.ts` excluding `.test.ts`).
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- Test fixtures with `as any` / `as never` — intentional shortcuts, handled in SPEC-07.
- Casts that narrow `unknown` / `string` to an enum — real narrowings, keep.

## Notes

- If a cast removal reveals a type mismatch, the right fix is usually upstream: tighten the producing function's return type, or fix the schema. Don't restore the cast — surface the issue.
- This spec should be a near-no-op after SPEC-13 since most enum casts live in repository hydration paths.
