# Polyglot App ↔ SDK Wiring

**Status:** RESOLVED 2026-05-14. Done as part of the alignment plan's follow-up sweep.

## Resolution summary

- **Games feature deleted end-to-end** — no backend support; routes/sheets/e2e tests removed across `app/react`, `app/expo`, `e2e`.
- **`configureClient` calls migrated** to per-service base URL signature: `{ typescript, rust, go }` instead of `{ baseUrl }`.
- **`ApiErrorsEnum` import path** corrected to `@template/client-typescript/typescript` (was `…/app`).
- **`createClient` factory** wired into `e2e/utils/given/api.ts` (was `client` direct export).
- **`tsc` targets restored** on `app-react`, `app-expo`, `e2e` — all three workspaces now type-check clean.
- **Expo `tsconfig.json`** got `allowImportingTsExtensions: true` so it can consume the SDK source.
- **SDK unused-param fix**: `client.ts` `TError` → `_TError` (consumer projects with `noUnusedParameters: true` were blocked).

## Original problem (now resolved)

## Problem

`packages/app/react/` and `packages/app/expo/` were copied from `template-fullstack/polyglot`, which forked from the clean-2 medscall codebase before the polyglot client SDK restructure. Their source still imports from medscall-era subpaths:

- `@template/client-typescript/app` — used by `useListGames`, `useDeleteGame`, `useUpdateGame`, `GameGenreEnum`, `listGamesQueryKey`, `ApiErrorsEnum`, `ListGamesQueryResponse`, etc.
- `@template/client-typescript/http` — used by `configureClient`.

The polyglot SDK (per `superpowers/plans/2026-05-14-polyglot-client-sdk.md`) emits per-backend subpaths only: `@template/client-typescript/typescript`, `@template/client-typescript/rust`, `@template/client-typescript/go`. There is no `app` context and no `http` re-export.

## Symptom

Running `bun --cwd packages/app/react tsc` or `bun --cwd packages/app/expo tsc` produces `TS2307: Cannot find module '@template/client-typescript/app'` (and `…/http`) plus downstream i18n key drift in components that use `GameGenreEnum`. Until this is wired, root `bun tsc` would be red, so the alignment plan stubbed the `tsc` Nx target on both workspaces with a TODO echo.

## Scope of the wiring task

1. Decide which backend hosts each endpoint the app calls. Likely starting point: every game-related read lives on api-typescript, writes on api-rust. Confirm against the openapi.json emitted by each backend.
2. Replace `@template/client-typescript/app` imports with the correct per-backend subpath. Where one logical hook needs both a read (TS) and a write (Rust), import from each subpath and compose at the call site.
3. Replace `@template/client-typescript/http` with whatever `configureClient` ends up exposing in the new SDK structure — probably `@template/client-typescript` (root export) or `@template/client-typescript/lib`.
4. Reconcile generated enum names. `GameGenreEnum` was a Zod inferred type in the medscall SDK; the polyglot SDK emits enums from contracts. The frontend's i18n keys are templated against the old name — update either the enum import or the i18n key generation.
5. Update the i18n type definitions if `GameGenreEnum` values changed casing (`enums.GameGenre.<value>`).
6. Restore the real `tsc` target on both project.jsons:

   ```json
   "tsc": {
     "executor": "nx:run-commands",
     "cache": true,
     "dependsOn": [{ "projects": "client-typescript", "target": "build" }],
     "inputs": ["{projectRoot}/src/**/*", "{projectRoot}/tsconfig.json", "{projectRoot}/tsr.config.json"],
     "options": { "command": "bun x tsc --noEmit", "cwd": "packages/app/react" }
   }
   ```
   And the equivalent for `app-expo`.

## Out of scope here

- No backend changes. The SDK is canonical.
- No new app features. This is wiring-only.

## Acceptance

- `bun --cwd packages/app/react tsc` clean.
- `bun --cwd packages/app/expo tsc` clean.
- Root `bun tsc` clean without the TODO echoes.
- Both apps boot against a live polyglot backend and the existing `/games` route round-trips list / create / update / delete.
