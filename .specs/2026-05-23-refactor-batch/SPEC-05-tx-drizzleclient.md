# SPEC-05: Repository / query `tx?` param = `DrizzleClient`

**Wave:** 2   **Depends on:** SPEC-13   **Status:** done

## Motivation

Repository and query use-case methods accept an optional transaction handle:

```ts
async findById(id: string, tx?: Transaction): Promise<Goal | undefined>
```

Inside the body, they cast: `const db = (tx ?? this.db) as DrizzleClient`. The cast is unnecessary because `Transaction` is structurally compatible with `DrizzleClient` for the read/write methods the repo uses. Type the param as `DrizzleClient` directly so the cast can go away.

## Scope

Change the `tx?: Transaction` parameter type to `tx?: DrizzleClient` in:
- Every `packages/api/typescript/src/**/repositories/**/Drizzle*Repository.ts` method
- Every `packages/api/typescript/src/**/usecases/queries/*.ts` (BFF query use cases)
- Any other call site that takes a `Transaction` from a `UnitOfWork` and uses it as the db handle

Remove the `as DrizzleClient` cast at call sites inside the body.

## Affected files

Discovery: `rg "tx\?: Transaction" packages/api/typescript/src --type ts -l`

## Acceptance criteria

- [ ] All repo / query methods take `tx?: DrizzleClient`.
- [ ] No `as DrizzleClient` casts inside the bodies after the type change.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean — repo integration tests still pass.

## Out of scope

- Use-case orchestration code that calls `unitOfWork.run(async (tx) => ...)` — the callback's `tx` parameter stays whatever `UnitOfWork.run` infers. Only the repo / query method signatures change.
- The `Transaction` type itself in `core/src/services/UnitOfWork/`. Stays.

## Notes

- `DrizzleClient` is the union of the regular Drizzle db client and the transaction client (Drizzle provides this typing). `Transaction` is a specialized subtype.
- Callers passing a `Transaction` to a method now typed as `DrizzleClient` are still valid (subtype assignable to supertype).
- The cast was load-bearing only because the previous param type was too narrow — fixing the type widens it, the cast becomes unnecessary.
