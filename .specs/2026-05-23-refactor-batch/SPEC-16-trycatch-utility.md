# SPEC-16: `try/catch` → `tryCatch` / `tryCatchAsync`

**Wave:** 1   **Depends on:** none   **Status:** done

## Motivation

The codebase has a utility `tryCatch` / `tryCatchAsync` (in `@template/core-typescript`) that wraps a callable and returns a `Result<T>` discriminated union (`{ success: true, data } | { success: false, error }`). It removes the imperative `try { ... } catch (e) { ... }` ceremony and forces the call site to deal with the error explicitly.

Existing usage in core: `BoundedContext.ts:86`, `BoundedContext.ts:102`, `Mediator.ts:32`, `Mediator.ts:44`. Pattern is established and tested.

The raw `try/catch` form is still used in many places. Migrate them.

## Scope

Replace raw `try/catch` blocks with `tryCatch(...)` (sync) or `tryCatchAsync(async () => ...)` (async) — wherever the try block is around a single expression / single async call and the catch just logs or rebrands the error.

### Keep raw `try/catch` when:
- The `try` body contains complex control flow (early returns, multiple awaits with intermediate state)
- The `catch` rethrows with extra context that needs the original stack
- The block uses `finally` (tryCatch doesn't model this)

If unsure, leave as-is and note in the PR description.

## Affected files

Discovery: `rg "try \{" packages/api/typescript/src --type ts -l` — review each, decide migrate or keep.

## Acceptance criteria

- [ ] Single-expression try/catch blocks across `packages/api/typescript/src` migrated to `tryCatch` / `tryCatchAsync`.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.
- [ ] PR description lists any try/catch blocks kept-as-is with a one-line reason.

## Out of scope

- Go side (Go's idiomatic `if err != nil` stays as-is).
- `try/catch` inside framework code (`core/src/`) where the wrapping pattern is already used — verify these are using the utility, but don't over-edit.

## Notes

- `tryCatch` signature: `tryCatch<T>(fn: () => T): { success: true; data: T } | { success: false; error: Error }`.
- `tryCatchAsync` is the async equivalent — takes `() => Promise<T>` and returns `Promise<{ success: true; data: T } | { success: false; error: Error }>`.
- Imports: `import { tryCatch, tryCatchAsync } from '@template/core-typescript'`.
- Migration shape:
  ```ts
  // Before
  try {
    const result = await something()
    return result
  } catch (e) {
    console.warn('failed', e)
    return null
  }

  // After
  const r = await tryCatchAsync(() => something())
  if (!r.success) {
    console.warn('failed', r.error)
    return null
  }
  return r.data
  ```
