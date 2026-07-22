# SPEC-07: Remove `as any` and unnecessary inferred-return casts

**Wave:** 2   **Depends on:** SPEC-13   **Status:** done

## Motivation

Two related code smells, both type-system-bypassing:

1. **`as any` in db calls** — typically used when the agent didn't trust Drizzle's inferred types or used a builder pattern that confused TS. Drizzle's typing is now mature enough that `as any` is almost always unnecessary.

2. **Redundant casts on already-inferred selects** — e.g.:
   ```ts
   const rows = await db.select({ bucket, total }).from(...) as Array<{ bucket: string; total: string | null }>
   ```
   The inferred type from `db.select({...})` already produces that shape. The cast is dead weight.

## Scope

- Remove `as any` from every db call in `packages/api/typescript/src/**/*.ts` (excluding `.test.ts` files where intentional).
- Remove explicit return-shape casts from `db.select(...)` chains when the inferred type already matches.

If removing a cast surfaces a real type error, fix the underlying cause — don't restore the cast.

## Affected files

Discovery:
- `rg "as any" packages/api/typescript/src --type ts -l | rg -v test\.ts`
- `rg "select\(.*\).*\) as Array<" packages/api/typescript/src --type ts` (and similar `as <Type>[]` patterns immediately after a select)

## Acceptance criteria

- [ ] Zero `as any` in non-test source (verified by `rg`).
- [ ] No explicit shape casts after `db.select(...)` chains where the select already infers the shape.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- `.test.ts` files — tests can use `as any` / `as never` for fixture shortcuts (handled case-by-case if obviously unnecessary, otherwise leave).
- Generic-type casts (`as T`) inside generic helper code where the caller's type is the source of truth — keep.

## Notes

- If `as any` is suppressing a real generic-inference bug in framework code (e.g. `tsyringe.resolve(X as any)`), check whether the right fix is at the framework level (e.g. a better-typed `resolve<T>` helper) and surface as a follow-up in the PR description. Don't add framework abstractions in this spec.
- For the few cases where `Drizzle`'s typing genuinely can't infer (e.g. dynamic column lists), add a single inline `// drizzle-cant-infer: <reason>` comment justifying the cast.
