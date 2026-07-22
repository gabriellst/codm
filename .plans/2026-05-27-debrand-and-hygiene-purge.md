# Medscall Purge & @template→@template Rebrand — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle. This is a **behavior-preserving
> rebrand**: the safety net is `bun tsc` + `bun install` resolution +
> grep-zero gates + the `HashedIdParity` parity test staying green.

**Goal:** The repo reads as bk-dash everywhere — zero `medscall`, every workspace package and import on the `@template/*` scope, top-level docs reframed to "bk-dash project" — without touching the `bk-dash` internals (`BK_DASH_NAMESPACE`, `bkdash_*` tables, `BkdashNotification*` entities).

**Architecture:** Three new tasks following the already-shipped T1 (tsc fix). T2 sweeps the documentation/config surface for medscall + reframes "Polyglot Template" prose + fixes the React-version line. T3 does the mechanical `@template/*` → `@template/*` rebrand across all 11 workspace `package.json` files + 638 source imports + Nx/tsconfig + `bun install`. T4 regenerates the SDK so dist symbols stop referencing `@medscall`. T2 and T3 touch disjoint file types (docs/skills/config vs package.json/source/Nx) and run in parallel; T4 depends on both.

**Tech Stack:** TypeScript, Bun (workspaces + bun.lock), Nx, drizzle-kit (unchanged — no schema work here).

**Spec:** .specs/2026-05-27-debrand-and-hygiene-purge-design.md
**Tasks:** 3 (plus T1 already shipped at `7ced24b0a`)
**Estimated minutes:** 120

> **Scope note:** `/task-breakdown` deliberately skipped — there are no new
> cross-boundary enums/events to Contract-Lock; the plan is a coordinated
> rebrand. The single Contract Lock (SDK regen, T4) follows the package rename
> per the `/plan` rule.

> **Course correction:** The prior version of this plan included T1–T6 covering
> `BK_DASH_NAMESPACE`, DB tables, and notifications entities renames. Those were
> dropped after the user clarified that `bk-dash` is the project brand. Only T1
> (tsc fix, naming-neutral) was retained and is already committed at
> `7ced24b0a`. T2–T4 below are the corrected scope.

---

## Task T2: medscall purge + docs reframe + README React 19

**Files to write:**
- Modify: `./package.json` (root) — drop the `"medscall": "."` self-dependency
- Modify: `README.md` — reframe to bk-dash + fix React 18 → 19
- Modify: `CLAUDE.md` — replace "Polyglot Template" framing with bk-dash; sweep medscall
- Modify: `docs/BACKEND.md`, `docs/FRONTEND.md`, `docs/CLI.md` — sweep medscall + reframe to bk-dash where docs say "template"
- Modify: `.claude/registry.yaml`, `.claude/commands/prime.md`, `.claude/commands/install.md`, `.claude/commands/pr.md` — sweep medscall
- Modify: every `.claude/skills/**/{SKILL.md,registry.yaml}` matching `grep -ril medscall` — sweep medscall
- Modify: `docker/Dockerfile.api` — sweep medscall
- Modify: `scripts/graph/core/config.ts` (L264) — drop `'@medscall/monorepo-sdk'` AND rename `'@template/client'` → `'@template/client'` in one edit (T2 owns this file fully; T3 does not touch it)
- Modify: `CLAUDE.md`, `README.md`, `docs/{BACKEND,FRONTEND,CLI}.md`, `.claude/registry.yaml`, `.claude/commands/*`, `.claude/skills/**/{SKILL.md,registry.yaml}` — also sweep `@template/` → `@template/` in any prose mentions (T3's sed only touches `packages/`)

**Files to read:**
- The output of `grep -ril medscall .` filtered to the active surface (to know what files need touching)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** (none — mechanical doc/config edit)
**Depends on:** (none)

Sweeps the `medscall` brand off the active surface AND reframes documentation/orientation files from the interim "Polyglot Template" wording to bk-dash. Historical records (`.specs/`, `.plans/`, `.claude/audit/`, generated artifacts) are explicitly excluded.

### Step T2.1 — Inventory the active-surface medscall footprint (RED)

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack
grep -rIil "medscall" . \
  | grep -vE "node_modules|/dist/|/generated/|\.graph/|bun\.lock|^\./\.specs/|^\./\.plans/|^\./\.claude/audit/"
```

Expected (current state): lists ~15-20 files including `package.json`, `docker/Dockerfile.api`, `CLAUDE.md`, `README.md`, `docs/BACKEND.md`, `docs/FRONTEND.md`, `docs/CLI.md`, `.claude/registry.yaml`, `.claude/commands/{prime,install,pr}.md`, several `.claude/skills/**/SKILL.md`, `scripts/graph/core/config.ts`.

### Step T2.2 — Drop the vestigial self-dependency

Modify root `package.json`:
```diff
 	"dependencies": {
-		"medscall": ".",
 		"react": "19",
```
(Verified: no source `import … from 'medscall'` exists.)

### Step T2.3 — Fix the README React version + reframe to bk-dash

Modify `README.md`:

Update the React line:
```diff
-| `packages/app` | React 18 · TanStack Router/Query/Form · Zustand · Base UI · Tailwind | SPA |
+| `packages/app` | React 19 · TanStack Router/Query/Form · Zustand · Base UI · Tailwind | SPA |
```

Reframe the heading + intro from "Monorepo Boilerplate" to bk-dash. Replace the existing `# Monorepo Boilerplate` header and the `Fullstack TypeScript boilerplate built with **DDD** …` intro paragraph with bk-dash project framing (preserve the substantive content — DDD/Clean/CQRS/EDA description, stack table, Quick-start commands — only the framing/identity changes). Sweep any remaining `medscall` literals.

### Step T2.4 — Reframe CLAUDE.md from "Polyglot Template" to bk-dash

Modify `CLAUDE.md`:

Update L1-3 from:
```diff
-# Claude Code Configuration — Polyglot Template (work-in-progress)
-
-> **In-flight restructure (branch `feat/clean-polyglot`).** The clean-2 medscall codebase is being repurposed as a polyglot fullstack template. See `/tmp/handofss/polyglot.md` for full design.
+# Claude Code Configuration — bk-dash
```
(Drop the in-flight restructure note entirely — the rebrand is the resolution of that note.)

Update the "## Project Overview" section's opening so it describes the bk-dash project rather than a "polyglot fullstack monorepo template". Sweep all remaining `medscall` literals (use `grep -n medscall CLAUDE.md` and edit each in place). Preserve substantive architectural content (DDD rules, citizens taxonomy, environment setup, skills dispatch).

### Step T2.5 — Reframe docs/BACKEND.md, docs/FRONTEND.md, docs/CLI.md

For each of `docs/BACKEND.md`, `docs/FRONTEND.md`, `docs/CLI.md`:
- Sweep `medscall` literals (find via `grep -n medscall <file>` and edit each).
- Reframe any "template" / "Polyglot Template" prose to bk-dash. Keep substantive content unchanged.

### Step T2.6 — Sweep medscall from .claude/, docker, and the graph config

For each file from Step T2.1's inventory not yet edited:
- `.claude/registry.yaml`, `.claude/commands/{prime,install,pr}.md`, and every `.claude/skills/**/{SKILL.md,registry.yaml}` with a medscall match: replace `medscall` (and any `@medscall/<x>` literal) with the bk-dash equivalent. For example, `@medscall/monorepo-sdk` → `@template/monorepo-sdk` in references; install/prime/pr commands' wording → bk-dash.
- `docker/Dockerfile.api`: sweep medscall literals.
- `scripts/graph/core/config.ts` (L264): replace the entire `typescript:` SDK alias array with the single bk-dash entry in **one edit** (T2 owns this file fully; T3 does not touch it):
  ```diff
  - typescript: ['@template/client', '@medscall/monorepo-sdk'],
  + typescript: ['@template/client'],
  ```
- **`@template/` prose sweep in non-`packages/` files.** After the medscall sweep, additionally replace `@template/` → `@template/` literally in: `CLAUDE.md` (the workspaces table mentions `@template/app-styles/tokens.css`), `README.md`, `docs/{BACKEND,FRONTEND,CLI}.md`, `.claude/registry.yaml`, `.claude/commands/*`, every `.claude/skills/**/{SKILL.md,registry.yaml}` that matches. T3's `sed` only touches `packages/`, so this T2 step is what makes AC-3 (zero `@template/` across the active surface) pass.

### Step T2.7 — Verify medscall is gone (GREEN)

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack
grep -rIil "medscall" . \
  | grep -vE "node_modules|/dist/|/generated/|\.graph/|bun\.lock|^\./\.specs/|^\./\.plans/|^\./\.claude/audit/"
```
Expected: no output (active surface is medscall-free).

### Step T2.8 — (deferred) `bun install` + tsc happen in T3

T2 does NOT run `bun install` or `tsc`. T3 owns the single combined regen
(its Step T3.7 picks up both T2's root-`package.json` drop and T3's 11
workspace renames). T2's verification is the grep-zero gate from T2.7.

### Step T2.9 — Report (no commit — orchestrator handles git)

Report status, the grep-zero result, the tsc result, and the list of paths actually modified.

---

## Task T3: rename @template/* → @template/* across all 11 workspace packages

**Files to write:**
- Modify (workspace manifests, 11 files): `packages/api/typescript/package.json`, `packages/api/typescript/core/package.json`, `packages/contracts/package.json`, `packages/contracts/generated/typescript/package.json`, `packages/client/package.json`, `packages/client/dist/typescript/package.json`, `packages/app/react/package.json`, `packages/app/astro/package.json`, `packages/app/expo/package.json`, `packages/app/styles/package.json`, `packages/e2e/package.json` — rename `name:` field AND any cross-workspace `dependencies` / `devDependencies` keys from `@template/<x>` to `@template/<x>`
- Modify (source imports): every `*.ts` / `*.tsx` / `*.astro` / `*.mts` / `*.cts` under `packages/` that contains `@template/` — ~638 files
- Modify (Nx): every `packages/**/project.json` whose `name:` is `@template/<x>`
- Modify (root TS config): `tsconfig.base.json` and any `packages/**/tsconfig*.json` with `paths` referencing `@template/<x>`
- Modify: `bun.lock` (regenerated by `bun install`, included in this Task's commit)

> **Scope boundary:** T3 only touches paths under `packages/` plus root `tsconfig*.json` + `bun.lock`. `scripts/graph/core/config.ts`, `CLAUDE.md`, `README.md`, `docs/`, `.claude/**`, `docker/` are owned by T2.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** (none — mechanical mass-rename)
**Depends on:** T2

> Serialized after T2 so the single `bun install` in T3.7 sees the combined
> effect of T2's root-`package.json` drop + T3's 11 workspace renames (one
> coherent lockfile regen instead of two racing).

Mechanical mass-rename. The 11 specifiers are exhaustive (per Spec Decision 2): `api-typescript`, `core-typescript`, `contracts`, `contracts-typescript`, `client`, `client-typescript`, `app-react`, `app-astro`, `app-expo`, `app-styles`, `e2e`. Apply in one coordinated pass; partial state breaks `bun install` and `bun tsc`.

### Step T3.1 — Inventory (RED)

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack
echo "package.json names:"
grep -rIl '"@template/' . --include=package.json | grep -v node_modules | wc -l
echo "source import lines:"
grep -rIn "@template/" packages --include='*.ts' --include='*.tsx' --include='*.astro' --include='*.mts' --include='*.cts' \
  | grep -v "/node_modules/" | grep -v "/dist/" | grep -v "/generated/" | wc -l
echo "project.json + tsconfig hits:"
grep -rIl '"@template/' . --include='project.json' --include='tsconfig*.json' | grep -v node_modules
```
Expected (current state): 11 package.json files; ~638+ source import lines; some project.json / tsconfig hits.

### Step T3.2 — Rename all 11 `package.json` `name` fields

For each of the 11 workspace packages, set `name: "@template/<x>"` where `<x>` is the existing suffix (e.g. `@template/api-typescript` → `@template/api-typescript`).

Use `jq -r` to discover and a one-liner edit per file, or edit each with the `Edit` tool. Either approach is fine — the result is what matters.

### Step T3.3 — Rewrite cross-package `dependencies` and `devDependencies`

For every `package.json` with a `dependencies` / `devDependencies` entry whose key starts with `@template/`, change the key to `@template/<x>` (value/version field unchanged). Workspace deps in this repo use `"workspace:*"` or similar — the value stays; only the key changes.

### Step T3.4 — Rewrite all source imports

For every TS/TSX/Astro source file under `packages/` (excluding `node_modules/`, `dist/`, `generated/`), replace the substring `@template/` with `@template/`. The string is distinctive enough that a global substring replace is safe:

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack
grep -rIl "@template/" packages --include='*.ts' --include='*.tsx' --include='*.astro' --include='*.mts' --include='*.cts' \
  | grep -v "/node_modules/" | grep -v "/dist/" | grep -v "/generated/" \
  | xargs sed -i '' 's|@template/|@template/|g'
```

(On Linux, drop the `''` after `-i`. The implementer should adapt to the platform; both produce identical output.)

### Step T3.5 — Rewrite `project.json` (Nx) names and `tsconfig*.json` paths

For every `project.json` whose `name:` is `@template/<x>`, change to `@template/<x>`. For every `tsconfig*.json` with `paths` referencing `@template/<x>`, change to `@template/<x>`. Use the inventory from T3.1 to find them.

### Step T3.6 — (skipped) graph SDK alias is owned by T2

`scripts/graph/core/config.ts` is T2's exclusive scope (T2.6 handles both the `@medscall` drop and the `@template/client` → `@template/client` rename in one edit). No T3 action.

### Step T3.7 — Regenerate the lockfile

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack
bun install
```
Expected: succeeds; `bun.lock` is updated (the workspace package keys change from `@template/*` to `@template/*`).

### Step T3.8 — Verify the rebrand (GREEN)

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack
echo "remaining @template/ on active surface (must be 0):"
grep -rIl "@template/" packages --include='*.ts' --include='*.tsx' --include='*.astro' --include='*.mts' --include='*.cts' --include='package.json' --include='project.json' --include='tsconfig*.json' \
  | grep -v "/node_modules/" | grep -v "/dist/" | grep -v "/generated/" | wc -l
echo "new @template/ presence (should be 638+):"
grep -rIc "@template/" packages --include='*.ts' --include='*.tsx' --include='*.astro' --include='*.mts' --include='*.cts' \
  | grep -v "/node_modules/" | grep -v "/dist/" | grep -v "/generated/" \
  | awk -F: '{s+=$2} END {print s}'
```
Expected: first count = 0; second count ≥ 638.

### Step T3.9 — Run the `HashedIdParity` test (no-regression gate)

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript
bun test src/identity/objects/HashedIdParity.test.ts
```
Expected: PASS (BK_DASH_NAMESPACE untouched; parity preserved).

### Step T3.10 — Type-check across all workspaces

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack
bun x nx run-many -t tsc
```
Expected: 0 errors across the 8 TS projects.

### Step T3.11 — Report (no commit — orchestrator handles git)

Report status, both grep counts from T3.8, the parity test result, the tsc result, and the list of paths actually modified (summary by directory if too long to enumerate).

---

## Task T4: Contract Lock — SDK regen drops the stale @medscall symbol

**Files to write:**
- Regen: `packages/client/dist/**` (output of `bun sdk`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T2, T3

After T2 dropped the `@medscall/monorepo-sdk` legacy alias and T3 renamed `@template/client` → `@template/client`, the generated `Symbol.for('@medscall/monorepo-sdk')` in dist is stale. Regenerating produces dist with no `@medscall` symbol; the new symbol derives from the renamed package.

### Step T4.1 — Regenerate OpenAPI + SDK

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack
bun sdk
```
Expected: completes; `packages/client/dist/**` is rewritten.

### Step T4.2 — Verify the stale symbol is gone (GREEN)

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack
grep -rIl "@medscall" packages/client/dist
```
Expected: no output.

### Step T4.3 — Type-check after regen

```bash
cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack
bun x nx run-many -t tsc
```
Expected: 0 errors across all workspaces (the app type-checks against the regenerated SDK).

### Step T4.4 — Report (no commit — orchestrator handles git)

Report status, the dist grep result, the tsc result, and the list of paths actually modified.

---

## Final Validation

- [ ] `bun tsc` (`bun x nx run-many -t tsc`) — clean across all workspaces (covers AC-1, AC-4 tsc, AC-8 tsc)
- [ ] `bun lint` (`bun x nx run-many -t lint`) — clean
- [ ] `bun run test` — full suite passes (notifications/analytics/identity-parity stay green per Spec Decision 3)
- [ ] `cd packages/api/go && go test ./...` — Go suite passes (bkDashNamespace untouched)
- [ ] Active-surface grep returns zero for medscall (AC-2):
  ```bash
  grep -rIil "medscall" . \
    | grep -vE "node_modules|/dist/|/generated/|\.graph/|bun\.lock|^\./\.specs/|^\./\.plans/|^\./\.claude/audit/"
  ```
- [ ] Active-surface grep returns zero for `@template/` (AC-3):
  ```bash
  grep -rIl "@template/" packages --include='*.ts' --include='*.tsx' --include='*.astro' --include='*.mts' --include='*.cts' --include='package.json' --include='project.json' --include='tsconfig*.json' \
    | grep -v "/node_modules/" | grep -v "/dist/" | grep -v "/generated/"
  ```
- [ ] `grep -rIl "@medscall" packages/client/dist` returns zero (AC-8)
- [ ] `BK_DASH_NAMESPACE` / `bkdash_*` / `BkdashNotification*` are unchanged on disk (AC-5, AC-9):
  ```bash
  grep -c BK_DASH_NAMESPACE packages/api/typescript/core/src/objects/Id.ts   # → 3
  grep -c bkDashNamespace packages/api/go/core/objects/id.go                 # → 4
  ls packages/contracts/db/schema/bkdash_notifications.ts packages/contracts/db/schema/bkdash_analytics.ts
  ls packages/api/typescript/src/notifications/entities/BkdashNotification.ts
  ```
- [ ] AC mapping (every spec AC → ≥1 verifying Task step or Final-Validation gate):
  - AC-1 → already met by commit `7ced24b0a`; reasserted by Final Validation `bun tsc`
  - AC-2 → T2.7 grep-zero + Final Validation grep
  - AC-3 → T3.8 grep-zero + Final Validation grep
  - AC-4 → T3.2/T3.3 (all 11 package.json renamed), T3.7 (`bun install` succeeds), T3.10 (tsc clean)
  - AC-5 → T3.9 (HashedIdParity test passes); the namespace files are explicitly out of `filesWrites` so untouched-by-construction
  - AC-6 → T2.4 + T2.5 (CLAUDE.md, README, docs/* reframed)
  - AC-7 → T2.3 (README React 19)
  - AC-8 → T4.2 (`grep @medscall packages/client/dist` = 0)
  - AC-9 → schema/entity files explicitly out of `filesWrites` so untouched-by-construction; reasserted by Final Validation `ls` checks above

## Notes

- **T1 already shipped** as commit `7ced24b0a` ("fix(tenancy): align Store.updateSettings test annotation with void return") before the spec was corrected. AC-1 is met at HEAD; this plan only must not regress it.
- **Sed quoting on macOS vs Linux.** Step T3.4 uses `sed -i ''` (BSD/macOS). On Linux, drop the `''`. Implementer should adapt; output is identical.
- **Lockfile is part of T3.** `bun.lock` regenerates from `bun install` (Step T3.7); commit it with T3, not separately.
- **No DB / migration changes.** Spec Decision 3 preserves `bkdash_*` tables; `packages/contracts/db/` is out of scope.
- **`tracking/usecases/GetPixelScriptSnippet.ts` is out of scope.** Its `bkdash` token is correct project brand — leave untouched.
