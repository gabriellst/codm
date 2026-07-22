# SPEC-04: Zod `nativeEnum` → `enum`

**Wave:** 1   **Depends on:** none   **Status:** done

## Motivation

Zod 4 unifies enum handling: `z.enum(SomeEnum)` accepts a TS `enum` object directly, replacing `z.nativeEnum(SomeEnum)`. The wire enums (generated TypeSpec → TS) are conventional TS enums, so they work with `z.enum()`.

## Scope

Replace `z.nativeEnum(X)` with `z.enum(X)` for every wire-enum usage.

## Affected files

Discovery: `rg "z\.nativeEnum\(" packages/api/typescript --type ts`

Common concentrations:
- Entity schemas (status fields, type fields)
- Use-case input schemas
- Controller request schemas
- `core/src/schemas/platform.ts` (after SPEC-19 — but SPEC-19 already uses `z.enum`)

## Acceptance criteria

- [ ] `rg "z\.nativeEnum\(" packages/api/typescript --type ts` returns zero matches.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- String-literal-tuple enums (`z.enum(['A','B'])`) — already correct, no change.
- Any non-Zod enum handling.

## Notes

- The inferred type stays identical (`z.infer<typeof X>` resolves to the enum's value union).
- For runtime, `z.enum(EnumObject)` and `z.nativeEnum(EnumObject)` accept the same values — no behavioral diff.
- **Resolution (2026-05-23):** No-op for this codebase. `rg "z\.nativeEnum\(" packages/api/typescript --type ts` returns zero matches. All `nativeEnum` usages live in `packages/contracts/codegen/` (which writes them into auto-generated wire-enum files) and the generated files themselves — both out of scope per the spec's discovery path. If the contracts codegen is later updated to emit `z.enum()` instead, that's a separate change.
