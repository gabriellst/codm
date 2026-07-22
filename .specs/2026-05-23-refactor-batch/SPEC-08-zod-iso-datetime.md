# SPEC-08: Zod `z.string().datetime()` → `z.date()` in use cases

**Wave:** 1   **Depends on:** none   **Status:** done

## Motivation

Use-case input schemas accept ISO-8601 datetime strings from controllers. Zod 4's `z.date()` is the canonical validator for that — strict ISO format, no timezone ambiguity. The legacy `z.string().datetime()` form still works but is deprecated.

## Scope

Replace `z.string().datetime()` with `z.date()` in use-case input schemas and any other Zod consumer that validates ISO strings.

## Affected files

Discovery: `rg "z\.string\(\)\.datetime\(\)" packages/api/typescript --type ts`

Concentrations:
- `packages/api/typescript/src/**/usecases/*.ts`
- `packages/api/typescript/src/**/events/*.ts` (event payloads with timestamp strings)
- `packages/api/typescript/src/**/controllers/*.ts`

## Acceptance criteria

- [ ] `rg "z\.string\(\)\.datetime\(\)" packages/api/typescript --type ts` returns zero matches.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- `z.string().date()` — handled by SPEC-03.
- Any non-datetime string validators.

## Notes

- Inferred type stays `string`. No downstream consumer changes.
- `z.date()` accepts options like `{ offset: true, precision: 3 }` if needed for strict ISO sub-formats — defaults are fine for our wire format.
