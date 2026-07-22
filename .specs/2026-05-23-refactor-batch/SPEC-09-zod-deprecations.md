# SPEC-09: Zod deprecation sweep

**Wave:** 1   **Depends on:** SPEC-01, SPEC-03, SPEC-04, SPEC-08   **Status:** done

## Motivation

After SPEC-01, SPEC-03, SPEC-04, SPEC-08 land, sweep any remaining `@deprecated` Zod usages flagged by tsc / editor / Biome. Catch anything missed by the targeted earlier specs.

## Scope

Resolve every remaining `@deprecated` from the `zod` package by adopting the suggested replacement.

Common remaining shapes (non-exhaustive):
- `z.string().url()` → `z.url()`
- `z.string().cuid()` → `z.cuid()`
- `z.string().regex(...)` (kept — not deprecated, just verify)
- `z.preprocess(...)` (kept — verify each is intentional)
- `z.object({}).strict()` semantics in v4 (verify `.strict()` behavior is still what callers want)

## Affected files

Discovery in order:
1. `bun tsc` and look for `@deprecated` strikethroughs in IDE.
2. `rg "\.deprecated\(" packages/api/typescript` to find Zod schemas explicitly marked deprecated locally — those are project-level, leave alone.
3. Check the `zod` package's CHANGELOG for any v4-specific deprecations not in the prior specs.

## Acceptance criteria

- [ ] No remaining `@deprecated` from the `zod` package shown by tsc on any TS file under `packages/api/typescript`.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- Project-local `.deprecated('...')` schemas (intentional).
- Non-Zod deprecations (e.g. from other libs).

## Notes

- `bun tsc` doesn't emit warnings for `@deprecated` by default. The agent should rely on IDE hints or `bun x tsc --noEmit --strict` plus a grep for `@deprecated` in `node_modules/zod` source if needed.
- If a deprecation has no obvious replacement, leave it and add a `// TODO(zod-v5): ...` comment with a brief reason; flag the case in the PR description.
