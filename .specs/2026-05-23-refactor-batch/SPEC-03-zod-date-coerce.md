# SPEC-03: Zod date → `z.coerce.date()`

**Wave:** 1   **Depends on:** none   **Status:** done

## Motivation

`z.string().date()` (ISO date-string validator) is being replaced with `z.coerce.date()` (parses string → `Date`). Most callers want a `Date` instance, not a validated string — the coerce form fits the use-case ergonomically and is the project's chosen convention going forward.

## Scope

Replace `z.string().date()` with `z.coerce.date()` everywhere.

If any caller actually needs the string form (e.g. wire serialization that should remain ISO string), leave it on `z.iso.date()` instead (Zod 4's explicit ISO-date string validator) — note these cases in the PR description.

## Affected files

Discovery: `rg "z\.string\(\)\.date\(\)" packages/api/typescript --type ts`

## Acceptance criteria

- [ ] `rg "z\.string\(\)\.date\(\)" packages/api/typescript --type ts` returns zero matches.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean for any suite that touches changed files.

## Out of scope

- `z.string().datetime()` — handled by SPEC-08.
- `z.string()` general usage — only the `.date()` variant here.

## Notes

- Downstream consumers may see a type change (string → Date). The compiler will flag mismatches — fix them by either using the resulting Date directly or calling `.toISOString()` where a string is required.
- Drizzle insert payloads typically want `Date` so coerce is generally the right move.
