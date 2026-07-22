# Medscall Purge & @template→@template Rebrand — Design Spec

**Date:** 2026-05-28 (revised — see "Course correction" below)
**Status:** Approved
**Bounded Context:** cross-cutting — 11 workspace packages + 638 source import sites + active docs/config/skills + SDK regen
**Kind:** chore (rebrand / hygiene)
**Story Points:** 13 — full-rebrand rename across 11 workspace packages (`@template/*` → `@template/*`) with 638 source-file import sites + Nx/tsconfig/lockfile coordination, combined with the medscall purge across active code/config/docs and an SDK regen. Mechanical but broad and coordination-heavy; one-shot lockfile + tsc gate is the safety net.

## Course correction (2026-05-28)

The first revision of this spec (2026-05-27) treated **both** `medscall` and `bkdash` as legacy brands to neutralize toward `template`. **That was wrong.** This is the **bk-dash** project — `bk-dash` / `bkdash` / `BK_DASH_NAMESPACE` are the canonical brand and must stay. Only `medscall` (the original fork) needs to go. The interim `@template/*` package convention — introduced when the codebase was being neutralized — is the inconsistency to resolve: it gets renamed to `@template/*` so the project reads as bk-dash everywhere. Tasks T2 (ID namespace rename), T3 (DB tables rename), and T4 (notifications entity rename) from the prior plan are explicitly **dropped**. T1 (tsc fix) is naming-neutral and already shipped (commit `7ced24b0a`).

## Context

This repo was forked from `medscall`, then partially rebranded to `bk-dash`, then partially neutralized toward `@template/*` for an aborted "polyglot template" framing. Today three brands coexist on the active surface:

- **`medscall`** survives in ~48 files including `package.json` (a vestigial self-dep `"medscall": "."`), `docker/Dockerfile.api`, the orientation docs (`CLAUDE.md`, `README.md`, `docs/{BACKEND,FRONTEND,CLI}.md`), `.claude/registry.yaml`, several skill playbooks (`.claude/skills/{trace-analysis,sdk,errors/go,e2e}/SKILL.md`), commands (`.claude/commands/{prime,install,pr}.md`), and the legacy SDK alias `'@medscall/monorepo-sdk'` in `scripts/graph/core/config.ts:264`. The generated `Symbol.for('@medscall/monorepo-sdk')` in `packages/client/dist/*` is downstream of that source/regen.
- **`@template/*`** is the npm scope of **11 workspace packages** (`@template/api-typescript`, `@template/core-typescript`, `@template/contracts`, `@template/contracts-typescript`, `@template/client`, `@template/client-typescript`, `@template/app-react`, `@template/app-astro`, `@template/app-expo`, `@template/app-styles`, `@template/e2e`) and is referenced by **638 source files** plus the Nx project graph and any tsconfig paths. This is the interim "template" convention that should not have outlived the brand decision.
- **`bk-dash` / `bkdash` / `BK_DASH_NAMESPACE`** is the **canonical project brand** — to be preserved untouched: the locked UUIDv5 namespace value `f63cfbe6-…` in `packages/api/typescript/core/src/objects/Id.ts:11` and Go `packages/api/go/core/objects/id.go:18`, the DB tables `bkdash_notifications` / `bkdash_analytics`, the `BkdashNotification` / `BkdashNotificationDelivery` entities + repositories, and `bk-dash`/`bkdash` mentions in skills/docs that correctly describe the project.

Two small hygiene defects ride along: `bun tsc` was red on one error at `packages/api/typescript/src/tenancy/entities/Store.test.ts:68` (**already fixed and shipped as commit `7ced24b0a`** before the scope correction); and `README.md:12` advertises "React 18" while the workspace runs React 19 (`package.json` → `"react": "19"`).

## Problem

1. The template reads as a **three-brand fork**: a developer cloning sees `medscall` (legacy fork), `@template/*` (interim neutralization), and `bk-dash`/`bkdash` (real brand) tangled together. The intent is unclear and the codebase looks unfinished.
2. The brand reaches **load-bearing layers** — 11 npm package names, 638 source imports, the SDK package symbol — so the cleanup is non-trivial and needs to be atomic (half-renamed = broken).
3. `README.md` misstates the React version, reducing template credibility.

## Goal

A developer cloning this repo sees a **self-consistent bk-dash codebase**: zero `medscall` references on the surface they read/edit, every workspace package and import named `@template/*`, docs that frame the project as bk-dash (not "Polyglot Template"), accurate top-level docs, and a green `bun tsc` — with deterministic-ID behavior and DB schema unchanged.

## Decisions

1. **Purge `medscall` from the active surface.** Sweep all `medscall` references out of code + config + *active* docs + skills + commands + the `scripts/graph/core/config.ts:264` legacy SDK alias. Drop the vestigial `"medscall": "."` root self-dep (verified: no source `import … from 'medscall'` exists).
2. **Rename `@template/*` → `@template/*` across all workspace packages.** Update the `name:` field in each of the 11 `package.json` files; update every `dependencies` / `devDependencies` entry that references a workspace package; sweep all 638 source-file imports (`from '@template/X'` → `from '@template/X'`); update any `tsconfig*.json` `paths` and any `project.json` `name:` fields that mirror the package name; regenerate the lockfile via `bun install`. The 11 specifiers are exhaustively: `api-typescript`, `core-typescript`, `contracts`, `contracts-typescript`, `client`, `client-typescript`, `app-react`, `app-astro`, `app-expo`, `app-styles`, `e2e`.
3. **Preserve bk-dash internals untouched.** Out of scope: `BK_DASH_NAMESPACE` (TS + Go, value `f63cfbe6-…` locked), `bkdash_notifications` / `bkdash_analytics` DB tables, `BkdashNotification` / `BkdashNotificationDelivery` entities + repositories, `bk-dash`/`bkdash` mentions in skills/docs that correctly describe the project. The `HashedIdParity` TS↔Go test stays green as the proof.
4. **Reframe active docs from "Polyglot Template" to bk-dash.** Rewrite `CLAUDE.md` ("# Claude Code Configuration — Polyglot Template" header + relevant intro), `README.md` ("# Monorepo Boilerplate" intro), and `docs/{BACKEND,FRONTEND,CLI}.md` framing so the docs describe the **bk-dash** project rather than a generic template. Preserve content/structure; only the framing wording changes.
5. **Leave historical records untouched.** `.specs/`, `.plans/`, `.claude/audit/*.jsonl`, generated `**/dist/`, `**/generated/`, `*.tsbuildinfo`, `node_modules/` — these are a record, not live surface.
6. **Re-brand the SDK symbol via regen, not by hand.** After Decision 2 lands, run `bun sdk` to regenerate `packages/client/dist/**`. The kubb-emitted `Symbol.for('@medscall/monorepo-sdk')` then derives from the new `@template/client` package name. Never edit dist by hand.
7. **Fix `README.md` "React 18" → "React 19"** to match the workspace.
8. **The tsc fix at `Store.test.ts:68` is already shipped** as commit `7ced24b0a` and is not re-litigated here; AC-1 below just asserts its persistence.

## User Stories

- **Story 1 — clean bk-dash identity.** As a developer cloning this repo, I want a self-consistent bk-dash codebase — no foreign `medscall` references, no interim `@template/*` package names — so the project reads as bk-dash rather than a half-renamed fork. *(AC-2, AC-3, AC-4, AC-6)*
  - Given a fresh clone, when I grep the active surface for `medscall` / `@template/`, then there are zero matches (history + generated artifacts excluded).
  - Given the renamed packages, when I run `bun install` followed by `bun tsc`, then both succeed and every import resolves under the `@template/*` scope.

- **Story 2 — bk-dash internals untouched.** As a developer relying on deterministic IDs and the existing DB schema, I want `BK_DASH_NAMESPACE`, the `bkdash_*` tables, and the `BkdashNotification*` entities to remain exactly as they are, so the rebrand doesn't silently break parity or migrations. *(AC-5, AC-9)*
  - Given the rebrand applied, when the `HashedIdParity` TS↔Go test runs, then both sides still produce identical UUIDs and the test passes.
  - Given the rebrand applied, when I list the schema, then `bkdash_notifications` and `bkdash_analytics` still exist with their column definitions unchanged.

- **Story 3 — accurate top-level docs.** As a maintainer, I want `CLAUDE.md` / `README.md` / `docs/*.md` to describe the project as bk-dash with the correct React version, so the orientation docs aren't misleading. *(AC-6, AC-7)*

## Acceptance Criteria

- [ ] AC-1: `bun tsc` exits 0 across all workspaces (already met by commit `7ced24b0a`; the rebrand must not regress this).
- [ ] AC-2: A case-insensitive grep for `medscall` over the active surface — `packages/`, `docs/`, `CLAUDE.md`, `README.md`, `.claude/{commands,skills,registry.yaml}`, `docker/`, `scripts/` — returns zero matches, excluding `**/node_modules/`, `**/dist/`, `**/generated/`, `**/.graph/`, `bun.lock`, `.specs/`, `.plans/`, `.claude/audit/`.
- [ ] AC-3: A case-sensitive grep for `@template/` over the same active surface (same exclusions) returns zero matches.
- [ ] AC-4: All 11 workspace `package.json` `name:` fields are `@template/<x>`; cross-package `dependencies` / `devDependencies` reference `@template/<x>`; `bun install` succeeds without conflicts; `bun tsc` is clean.
- [ ] AC-5: `BK_DASH_NAMESPACE` (TS, `Id.ts`) and `bkDashNamespace` (Go, `id.go`) are unchanged, both still bound to value `f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e`; the `HashedIdParity` TS↔Go test passes.
- [ ] AC-6: `CLAUDE.md`, `README.md`, and `docs/{BACKEND,FRONTEND,CLI}.md` describe this as the **bk-dash** project (no "Polyglot Template" header, no "Monorepo Boilerplate" intro — replaced with bk-dash framing).
- [ ] AC-7: `README.md` states "React 19" (matching the workspace `react` version).
- [ ] AC-8: `bun sdk` regenerates `packages/client/dist/` with no `@medscall` symbol present; `bun tsc` is clean after regen.
- [ ] AC-9: `bkdash_notifications` and `bkdash_analytics` schema files exist with table-name strings unchanged; `BkdashNotification` / `BkdashNotificationDelivery` entities + their repository dirs/classes exist unchanged; the notifications integration tests still pass.

## Out of Scope

- **Renaming any `bkdash`-named artifact.** `BK_DASH_NAMESPACE`, `bkdash_*` tables, `BkdashNotification*` entities/repos — all stay (Decision 3, AC-5, AC-9).
- **Rewriting historical records.** `.specs/`, `.plans/`, `.claude/audit/` (Decision 5).
- **Migration history changes.** No schema rename → no migration changes; the prior plan's squash idea is moot.
- **Introducing a fourth naming convention.** Rebrand lands on `bk-dash` / `@template/*` (matching the existing prose convention with hyphen), not `@bkdash/*` or other variants.

## Risks & Migration

- **Atomic-rename risk.** Half-renamed `@template/*` (some packages renamed, some imports still pointing at old) = broken `bun install`/`bun tsc`. T3 must do the rename in one coordinated pass, then `bun install`, then verify.
- **Nx project names.** Some Nx `project.json` `name:` fields mirror the package name (`@template/client-typescript` is one Nx project name observed); the rename must update those so Nx targets keep resolving. Some Nx names don't follow the scope (`core-typescript`, `api-typescript`) — those stay.
- **Lockfile drift.** `bun.lock` will regenerate after `bun install`; this is expected and goes in the rebrand commit, not separately.
- **SDK symbol derivation.** `Symbol.for('@medscall/monorepo-sdk')` in dist is kubb-emitted; after T3 renames `@template/client` → `@template/client`, the regen MAY produce `Symbol.for('@template/monorepo-sdk')` (if it derives from package name) or a different convention (if it derives elsewhere). AC-8 only asserts "no `@medscall`"; the new symbol's exact spelling is a downstream artifact of regen, not a Decision.
- **Tracking pixel.** `tracking/usecases/GetPixelScriptSnippet.ts` emits a `bkdash` token in the JS snippet it produces. That is **correct** (it's the project brand) — leave it untouched.

## Open Questions

None blocking. The new SDK symbol's exact post-regen spelling is observed in AC-8's verification step, not pre-decided here.
