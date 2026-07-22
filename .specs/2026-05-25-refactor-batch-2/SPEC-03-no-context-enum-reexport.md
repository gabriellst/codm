# SPEC-03: No bounded context re-exports wire enums

**Wave:** 1   **Stream:** B   **Depends on:** SPEC-02   **Status:** done

## Motivation

Several contexts re-export wire enums (and their schemas) through a local barrel:

```ts
// src/sales/enums/index.ts
export {
  PaymentStatus, PaymentStatusSchema,
  TransactionKind, TransactionKindSchema,
  SalesPlatform, SalesPlatformSchema,
  CurrencyCode, CurrencyCodeSchema,
  // …~10 more
} from '@template/contracts-typescript/wire'
```

`marketing/enums/index.ts` and `billing/enums/index.ts` do the same. This creates a second, per-context source of truth for cross-boundary enums and lets consumers import the same enum from two places. The wire layer is the single source — contexts should import from it directly. (After SPEC-02 these barrels also won't compile, since the `…Schema` symbols they re-export no longer exist.)

## Scope

1. Delete the **wire-enum re-export blocks** from:
   - `src/sales/enums/index.ts`
   - `src/marketing/enums/index.ts`
   - `src/billing/enums/index.ts`
2. Keep any **domain-local** enums defined in those barrels (e.g. an enum declared in the context, not generated). Only the `… from '@template/contracts-typescript/wire'` re-exports go. `auth/enums/index.ts` (local `UserRole`) and the placeholder barrels (`ui`, `notifications`) are unaffected.
3. Repoint every consumer that imported a wire enum **via the context barrel** to import it from `@template/contracts-typescript/wire/enums` directly. (Most consumers already import from wire; this only touches the ones routing through `<ctx>/enums`.)
4. If a context barrel becomes empty, delete the file and drop its `export * from './enums'` from the context index.

## Affected files

- `src/sales/enums/index.ts`, `src/marketing/enums/index.ts`, `src/billing/enums/index.ts` — remove wire re-exports
- Consumers in those three contexts that imported wire enums via the local barrel
- The contexts' top-level `index.ts` if a barrel is deleted

## Acceptance criteria

- [ ] No `export { … } from '@template/contracts-typescript/wire'` (or `/wire/enums`) inside any `src/<ctx>/enums/index.ts`.
- [ ] Domain-local enums (if any) in those barrels are preserved.
- [ ] All wire-enum imports resolve to `@template/contracts-typescript/wire/enums` directly.
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- The wire codegen change (SPEC-02) — this spec assumes the enum-only export already landed.
- Moving or renaming domain-local enums.

## Notes

- This is the natural follow-on to SPEC-02 and shares its stream — once `…Schema` is gone, the re-export barrels are the remaining compile breakage; fixing them here keeps the wave green.
- Heuristic for "is it a wire enum?": it's generated under `packages/contracts/generated/typescript/src/wire/enums/`. Anything else is domain-local and stays.
