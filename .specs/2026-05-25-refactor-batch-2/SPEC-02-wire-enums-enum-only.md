# SPEC-02: Wire enums export the enum only (no `…Schema`)

**Wave:** 1   **Stream:** B   **Depends on:** (none)   **Status:** done

## Motivation

Every generated wire enum exports **both** the TS enum and a Zod schema:

```ts
// packages/contracts/generated/typescript/src/wire/enums/goal-type.ts
export enum GoalType { REVENUE = 'REVENUE', PROFIT = 'PROFIT' }
export const GoalTypeSchema = z.nativeEnum(GoalType)   // emitted by codegen
```

This couples the wire layer to a specific Zod construct (`z.nativeEnum`, now deprecated), and means ~300 consumer sites import `GoalTypeSchema` / `CurrencyCodeSchema` / etc. instead of composing the enum themselves. The enum is the contract; the schema is a consumer concern. Entities should write `z.enum(GoalType)` at the point of use, exactly as the `/enum` and `/schema` skills prescribe.

## Scope

This is a **contracts codegen + sweep** change. Edit the generator, not the generated files.

1. **Codegen template** — `packages/contracts/codegen/emit-wire-ts.ts`:
   - Line ~30: stop emitting `export const ${e.name}Schema = z.nativeEnum(${e.name})`. Emit the enum only.
   - Lines ~48 / ~80 (event-payload codegen): replace every `${t.ref}Schema` reference with `z.enum(${t.ref})` and add the corresponding enum import. The generated event schemas must still compile without the `…Schema` exports.
   - Drop the now-unused `z` import from enum files if nothing else needs it.
2. **Regenerate**: `bun emit-openapi && bun sdk`. Confirm the generated `wire/enums/*.ts` no longer contain `…Schema` and the generated `wire/events/*.ts` use `z.enum(...)`.
3. **Sweep consumers** (~300 sites): every `import { XSchema } from '@template/contracts-typescript/wire/enums'` becomes `import { X } from '...'` and the usage `field: XSchema` becomes `field: z.enum(X)`. Hot spots: entities, schemas, events, read-models, controllers across analytics/sales/billing/marketing/catalog/finance/identity.
4. **Go emitter** — `emit-wire-go.ts`: confirm it does **not** depend on the TS `…Schema` export (it generates its own enum types). No behavioural change expected; verify `bun emit-openapi` + the Go build stay green. (The Rust emitter is deleted in SPEC-17, Wave 0 — if for some reason SPEC-17 hasn't landed, also leave `emit-wire-rs.ts` working.)

## Affected files

- `packages/contracts/codegen/emit-wire-ts.ts` — template change (the crux)
- `packages/contracts/generated/typescript/src/wire/enums/*.ts` — regenerated (no hand edits)
- `packages/contracts/generated/typescript/src/wire/events/*.ts` — regenerated (uses `z.enum`)
- ~300 consumer files across `packages/api/typescript/src/**` — `XSchema` → `z.enum(X)`
- `packages/contracts/codegen/emit-wire-go.ts` — verify-only (Rust emitter deleted in SPEC-17)
- Regenerated SDK under `packages/client/dist/`

## Acceptance criteria

- [x] No generated `wire/enums/*.ts` file exports a `…Schema` (grep `Schema = z.nativeEnum` and `Schema = z.enum` in `wire/enums/` → zero).
- [x] Generated `wire/events/*.ts` compile using `z.enum(...)` for enum-typed fields.
- [x] Zero `import { …Schema }` from `@template/contracts-typescript/wire` remain (grep across `src/**`).
- [x] `bun emit-openapi && bun sdk` regenerates cleanly; OpenAPI still lists the enums.
- [x] `bun tsc` clean across TS workspaces; the Go emitter/consumers (`go build ./...`) unaffected. (Rust removed by SPEC-17.)
- [x] `bun run test` clean.

## Out of scope

- Per-context enum re-export barrels (`<ctx>/enums/index.ts`) — removed in SPEC-03 (which depends on this).
- Adding/removing enum members or changing enum values.
- Domain-local (non-wire) enums in `<ctx>/enums/` that aren't generated — leave their shape alone.

## Notes

- Run this before SPEC-03: once the `…Schema` exports are gone, the per-context re-export barrels won't compile, which is precisely what SPEC-03 cleans up.
- `z.enum(SomeTsEnum)` is the project convention (batch-1 SPEC-04 already moved `z.nativeEnum` → `z.enum`); this spec finishes the job at the source so consumers stop importing a schema at all.
- The sweep is large but mechanical — a codemod (`XSchema` → `z.enum(X)` with import rewrite) is appropriate; spot-check discriminated unions where an enum appears inside `z.discriminatedUnion`.
- `PLATFORM_REGISTRY` (batch-1 SPEC-19) already uses `z.enum(AuthMode)` / `z.enum(SalesPlatform)` — it's the pattern to match.
