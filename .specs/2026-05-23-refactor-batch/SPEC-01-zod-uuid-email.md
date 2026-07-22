# SPEC-01: Zod uuid / email modernization

**Wave:** 1   **Depends on:** none   **Status:** done

## Motivation

Zod 4 exposes top-level `z.uuid()` and `z.email()` validators that replace the chained `z.string().uuid()` / `z.string().email()` forms. The chained forms still work but are deprecated. Migrate to the modern shape for consistency.

## Scope

- Replace `z.string().uuid()` with `z.uuid()` everywhere except entity id fields (those become `z.instance(Id)` in SPEC-02 — leave them as `z.string().uuid()` here so SPEC-02 has a clear before-state to target).
- Replace `z.string().email()` with `z.email()`.

## Affected files

Discovery: `rg "z\.string\(\)\.(uuid|email)\(\)" packages/api/typescript --type ts`. Sweep every match.

Likely concentrations:
- `packages/api/typescript/src/**/objects/*.ts` (value object schemas)
- `packages/api/typescript/src/**/usecases/*.ts` (input schemas)
- `packages/api/typescript/src/**/controllers/*.ts` (request schemas)
- `packages/contracts/db/schema/**` (if any Drizzle column schemas use Zod directly)

## Acceptance criteria

- [ ] `rg "z\.string\(\)\.(uuid|email)\(\)" packages/api/typescript --type ts` returns only entity id fields (which SPEC-02 will migrate next).
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean for any suite that touches changed files.

## Out of scope

- Entity id-field schemas — handled by SPEC-02.
- Any deprecation other than `uuid` / `email` — handled by SPEC-09.

## Notes

- `z.uuid()` accepts a version-string parameter (e.g. `z.uuid('v4')`) if you need to restrict. Default behavior matches `z.string().uuid()` (any RFC 4122 uuid). No callers should need the parameter.
- `z.email()` matches the same regex behavior as `z.string().email()`.
