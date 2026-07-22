# Polyglot Frontend Alignment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. **No reviewer subagents** per `feedback_skip_reviewer_subagents` memory — controller self-verifies each commit via diff inspection. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the four-workspace app layout from `template-fullstack` (`astro`, `react`, `expo`, `styles`) into this branch, replacing the current `app/web` (medscall-era) and `app/expo` (skeleton). Standardize on `@template/*` package names everywhere. Port the platform-variant frontend skills (`web`→`react`, `mobile`→`expo`) and add `astro` variants where applicable. Bring in the `sheet` skill (Expo-only). Update `CLAUDE.md` + `scripts/cli.ts` to match the new structure.

**Architecture:** Mirror the layout `template-fullstack` arrived at on its `polyglot` branch — that repo forked from medscall, evolved the frontend (TanStack Start migration on `react`, Astro landing/blog/SEO, polished Expo) and split the skill family by platform. We are pulling those changes back into this monorepo while keeping the polyglot **backend** (`api/{typescript,rust,go}` + `client/{typescript,rust,go}` + `contracts`) intact. The styles workspace publishes `tokens.css`; `react` + `astro` import it; `expo` keeps its uniwind tokens independent (same as in `template-fullstack`).

**Tech Stack (added by this plan):** Astro 5 + MDX + `@astrojs/sitemap`, TanStack Start 1.167, Vite 7, Tailwind 4.1 (`@tailwindcss/vite`), `@fontsource/poppins` + `@fontsource-variable/newsreader`, Expo SDK 55 (`expo-router`, `expo-local-authentication`, `better-auth/expo`, `@shopify/react-native-skia`), `uniwind`, `nitro` + `nginx` for SSR routing.

**Source repo (reference, never mutated):** `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack`, branch `polyglot`, HEAD `06ded567`.

**Tasks:** 22
**Estimated:** ~10-14 hours

---

## Prerequisites

- Branch `feat/clean-polyglot` checked out, working tree clean (commit any in-flight edits to `packages/contracts/codegen/emit-wire-go.ts`, `packages/api/go/go.mod`, etc. first — these belong to the polyglot-client-sdk plan).
- `bun install` resolves cleanly at repo root.
- `cargo check --workspace` clean at HEAD.
- `bun --cwd packages/api/typescript tsc` clean at HEAD (root `bun tsc` is expected to fail because `packages/app/web` carries pre-polyglot SDK imports — this plan resolves that by replacing the workspace).
- Read access to `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack` (source for the four app workspaces + skill variants).

## Scope

- **In scope:** `packages/app/{astro,react,expo,styles}/`, `.claude/skills/{component,primitive,route,form,sheet}/`, `scripts/cli/`, root `package.json`, `nx.json`, root `CLAUDE.md`, `docs/FRONTEND.md`, `docs/CLI.md`, `eslint.config.ts`, `biome.jsonc` (only if root scripts change globs).
- **Out of scope:** `packages/api/{typescript,rust,go}/` (untouched). `packages/client/{typescript,rust,go}/` (untouched — keeps emitting `@template/client-typescript`, which the new `react` and `expo` already import). `packages/contracts/` (untouched). `packages/e2e/` is touched only to update `@medscall/monorepo-*` imports to `@template/*` and base URLs if they changed.
- **Out of scope (deferred):** Aligning `expo` uniwind tokens with the shared `styles/tokens.css`. Storybook re-enablement for `react`. Any backend wiring change.

## Hook policy

- The repo's pre-commit hook runs `bun tsc` workspace-wide. While Phase 1 is in flight (the four workspaces being moved in) it will fail. Use `git commit --no-verify` for **Phase 1 commits only** (Tasks 1–9). From Phase 2 onward, the hook must pass; if it doesn't, fix the underlying error rather than bypass.
- Do not bypass for any commit unrelated to this plan.

## Naming conventions (binding)

- **All workspaces** end up under `@template/*`:
  - `@template/app-astro`
  - `@template/app-react`
  - `@template/app-expo`
  - `@template/app-styles`
  - Existing already on this branch: `@template/contracts`, `@template/contracts-typescript`, `@template/core`, `@template/api-typescript`, `@template/client-typescript`.
- **Nx project names** match the workspace folder name when unambiguous: `app-astro`, `app-react`, `app-expo`, `app-styles`, `api-typescript`, `api-rust`, `api-go`, `client-typescript`, `client-rust`, `client-go`, `contracts`, `e2e`. (Matches what the root `package.json` scripts on this branch already assume — `nx run app-web:dev` becomes `nx run app-react:dev`.)
- **Skill variant folders**: `react/` and `expo/` (renamed from `web/` and `mobile/`), plus `astro/` where applicable.

## File Structure

**New / moved files:**

```
packages/app/styles/                                        [CREATE — copy from template-fullstack]
├── package.json                                            [CREATE — rename @medscall/monorepo-app-styles → @template/app-styles]
├── project.json                                            [CREATE]
└── tokens.css                                              [COPY verbatim]

packages/app/astro/                                         [CREATE — copy from template-fullstack]
├── package.json                                            [CREATE — rename to @template/app-astro; dep on @template/app-styles]
├── project.json                                            [CREATE]
├── astro.config.mjs                                        [COPY]
├── tsconfig.json                                           [COPY]
├── public/                                                 [COPY]
└── src/                                                    [COPY — pages/, content/, components/, layouts/, lib/]

packages/app/react/                                         [REPLACE current packages/app/web]
├── package.json                                            [CREATE — @template/app-react; deps on @template/app-styles + @template/client-typescript]
├── project.json                                            [CREATE — nx project name app-react]
├── components.json                                         [COPY from template]
├── nginx.conf                                              [COPY from template]
├── tsconfig.json                                           [COPY]
├── tsr.config.json                                         [COPY]
├── vite.config.ts                                          [COPY]
├── src/                                                    [COPY — incl. TanStack Start migration (Plan 2 follow-ups)]
└── (NO index.html — Start owns the entry now)

packages/app/expo/                                          [REPLACE current empty skeleton]
├── package.json                                            [CREATE — @template/app-expo; dep on @template/client-typescript]
├── project.json                                            [CREATE — nx project name app-expo]
├── app.json                                                [COPY]
├── babel.config.js                                         [COPY]
├── eslint.config.js                                        [COPY]
├── metro.config.js                                         [COPY]
├── tsconfig.json                                           [COPY]
├── @types/                                                 [COPY]
├── app/                                                    [COPY — expo-router pages]
├── assets/                                                 [COPY]
├── components/                                             [COPY]
├── ios/                                                    [COPY]
├── lib/                                                    [COPY]
├── locales/                                                [COPY]
├── scripts/                                                [COPY]
├── global.css                                              [COPY — uniwind, not shared tokens.css]
├── expo-env.d.ts                                           [COPY]
├── uniwind-env.d.ts                                        [COPY]
└── uniwind-types.d.ts                                      [COPY]

.claude/skills/component/
├── SKILL.md                                                [REWRITE — dispatch hub: routes by .astro / .tsx + cwd]
├── registry.yaml                                           [DELETE — variants own their checklists]
├── react/                                                  [RENAME from current single-flavor; port from template/web/]
│   ├── SKILL.md
│   └── registry.yaml
├── expo/                                                   [PORT from template/mobile/]
│   ├── SKILL.md
│   └── registry.yaml
└── astro/                                                  [CREATE — new variant for .astro components]
    ├── SKILL.md
    └── registry.yaml

.claude/skills/primitive/
├── SKILL.md                                                [REWRITE — dispatch hub]
├── react/ + expo/ + astro/                                 [SAME pattern as component]

.claude/skills/route/
├── SKILL.md                                                [REWRITE — dispatch hub]
├── react/ (TanStack Router + Start)
├── expo/ (expo-router)
└── astro/ (Astro pages + content collections)

.claude/skills/form/
├── SKILL.md                                                [REWRITE — dispatch hub: routes by cwd; no astro variant]
├── react/ + expo/                                          [PORT from template]

.claude/skills/sheet/                                       [CREATE — expo-only; port from template]
├── SKILL.md
└── registry.yaml

.claude/skills/store/                                       [UNCHANGED — single flavor (Zustand)]
```

**Deleted directories:**

```
packages/app/web/                                           [DELETE — replaced by packages/app/react/]
```

**Modified (high level):**

- Root `package.json` — workspaces list: drop `packages/app/web`, add `packages/app/{astro,react,expo,styles}`; rename dev script `app-web` → `app-react`; add `dev:app:astro` script; rename name to `@template/root` (or leave `template`, just confirm).
- Root `CLAUDE.md` — workspace table gets `app/astro` + `app/styles` rows; commands section gets astro/react/expo lines; Skill dispatch table grows `react`/`expo`/`astro` rows and links to `.astro` extension handling.
- `docs/FRONTEND.md` — add Astro section (landing, MDX, SEO); rename "web" → "react"; describe styles workspace boundary.
- `docs/CLI.md` — platform routing now resolves `react`/`expo`/`astro`; add `astro:` recipes (mostly content collections + sitemap entries).
- `scripts/cli/frontend/` — split into `react/` + `expo/` + `astro/` (or keep `frontend/` and detect platform). Match what `template-fullstack` did (it has `scripts/cli/{backend,frontend,mobile}/` — extend with `astro/`).
- `nx.json` — only if target defaults need adding for astro (`build`, `dev`, `tsc`).
- `eslint.config.ts` — ignore globs for `packages/app/astro/dist`, `packages/app/expo/ios`.
- `.gitignore` — add `.expo/`, `.astro/`, `packages/app/react/.tanstack/` if not present.
- `packages/e2e/` — touch only to rename `@medscall/monorepo-*` imports and any `/app` basepath assumptions to match the new `react` Start config.

---

## Phase 0 — Pre-flight (Tasks 1)

### Task 1: Commit / stash in-flight edits unrelated to this plan

**Files:** working tree state (`.env.example`, `CLAUDE.md`, `docker/docker-compose.yml`, `eslint.config.ts`, `package.json`, `packages/api/go/go.{mod,sum}`, `packages/client/{go,rust,typescript}/scripts/sdk.ts`, `packages/contracts/codegen/emit-wire-go.ts`, `packages/contracts/generated/go/wire/*.go`, `packages/e2e/scripts/generate-svg.ts`, `packages/e2e/utils/recorder.ts`, `scripts/create-template.ts`, `superpowers/plans/2026-05-14-polyglot-client-sdk.md`).

**Steps:**
- [ ] Run `git status` and confirm the list above matches.
- [ ] Decide per file whether each diff belongs to the polyglot-client-sdk plan (commit there) or to this plan's prerequisites (carry forward).
- [ ] Commit unrelated diffs on `feat/clean-polyglot` so the alignment work starts from a clean tree.

**Verification:** `git status --short` returns no `M` lines outside this plan's scope.

---

## Phase 1 — Workspaces (Tasks 2-9)

> Commits in this phase may use `git commit --no-verify` because root `bun tsc` will be red until Task 9.

### Task 2: Add `packages/app/styles` workspace

**Files:** `packages/app/styles/{package.json,project.json,tokens.css}` (CREATE).

**Steps:**
- [ ] Copy `tokens.css` verbatim from `template-fullstack/packages/app/styles/tokens.css`.
- [ ] Create `package.json`: `name: "@template/app-styles"`, exports `./tokens.css`, deps on `@fontsource/poppins` + `@fontsource-variable/newsreader`.
- [ ] Create `project.json` with Nx targets `build` (no-op) and `lint` (biome on `tokens.css`).
- [ ] Add `"packages/app/styles"` to root `package.json` workspaces array.
- [ ] `bun install` — confirms the workspace resolves.

**Verification:** `bun --filter @template/app-styles run lint` clean. `bun pm ls @template/app-styles` resolves.

### Task 3: Add `packages/app/astro` workspace

**Files:** `packages/app/astro/{package.json,project.json,astro.config.mjs,tsconfig.json,public/**,src/**}`.

**Steps:**
- [ ] Copy directory tree from `template-fullstack/packages/app/astro/` verbatim.
- [ ] Edit `package.json`: rename to `@template/app-astro`; rewrite the `@medscall/monorepo-app-styles` dep to `@template/app-styles`; keep all astro/react/tailwind deps as in template.
- [ ] Create `project.json` mirroring the react one but with targets `dev` (`astro dev`), `build` (`astro build`), `tsc` (`astro check`), `lint` (`biome check src`).
- [ ] Update any in-file imports of `@medscall/monorepo-app-styles` → `@template/app-styles`.
- [ ] Add `"packages/app/astro"` to root workspaces.
- [ ] `bun install`.

**Verification:** `bun --filter @template/app-astro run tsc` clean (astro check). `bun --filter @template/app-astro run build` produces `dist/`.

### Task 4: Replace `packages/app/web` with `packages/app/react`

**Files:** `packages/app/web/` (DELETE entire tree), `packages/app/react/{...}` (CREATE).

**Steps:**
- [ ] `git rm -r packages/app/web`.
- [ ] Copy `template-fullstack/packages/app/react/` verbatim to `packages/app/react/`.
- [ ] Edit `package.json`:
  - `name: "@template/app-react"`.
  - Replace `@medscall/monorepo-app-styles` → `@template/app-styles`.
  - Replace `@medscall/monorepo-sdk` → `@template/client-typescript`.
- [ ] Edit `project.json`: Nx project `name: "app-react"`, targets `dev`, `build`, `tsc`, `lint`, `storybook` (keep, even if currently dormant).
- [ ] Rewrite any in-src import paths to point at `@template/client-typescript` (the polyglot SDK package). Note: template's `react` was emitted before the SDK rename; expect non-trivial fixups in `src/lib/`, `src/routes/`, `src/components/`. List the offenders by running `grep -rln '@medscall/monorepo-sdk' src` after copy.
- [ ] Update `tsconfig.json` paths if they refer to medscall paths.
- [ ] `vite.config.ts` and `nginx.conf` — verify the `/app` basepath is still desired here; if so, no change. (Document the basepath decision in `docs/FRONTEND.md` in Task 18.)

**Verification:** `bun --filter @template/app-react run tsc` clean after Task 8 lands (imports of `@template/client-typescript` resolve once root install completes).

### Task 5: Replace `packages/app/expo` skeleton with full template expo

**Files:** `packages/app/expo/` (BLOW AWAY contents and recopy).

**Steps:**
- [ ] `git rm -r packages/app/expo` (preserves Nx project removal in history).
- [ ] Copy `template-fullstack/packages/app/expo/` verbatim, **except** `ios/Pods` and `node_modules` (these regenerate locally).
- [ ] Edit `package.json`:
  - `name: "@template/app-expo"`.
  - Replace `@medscall/monorepo-sdk` → `@template/client-typescript`.
  - All other expo/uniwind deps as in template.
- [ ] Create / port `project.json` with targets `dev` (no-op or `expo start`), `ios`, `android`, `tsc`, `lint`.
- [ ] Update in-src imports `@medscall/monorepo-sdk` → `@template/client-typescript`.
- [ ] `bun install`.

**Verification:** `bun --filter @template/app-expo run tsc` clean. (iOS native build is out of scope of this plan's verification — manual smoke is enough.)

### Task 6: Update root `package.json` (workspaces + dev scripts)

**Files:** `package.json`.

**Steps:**
- [ ] Replace `"packages/app/web"` with `"packages/app/astro"`, `"packages/app/react"`, `"packages/app/expo"`, `"packages/app/styles"`.
- [ ] Replace `dev` script: `nx run-many -t dev -p api-typescript,api-rust,api-go,app-react,app-astro --parallel=5`.
- [ ] Add `dev:app:react` (`nx run app-react:dev`), `dev:app:astro` (`nx run app-astro:dev`), keep `dev:app:expo` but point at `app-expo`.
- [ ] Remove `dev:app:web`.
- [ ] Match `lint-staged` globs to the new workspaces (drop the medscall expo exclusion that no longer applies; reinstate if expo eslint config is incompatible with the root biome run).

**Verification:** `bun run dev:app:react` boots Vite/Start on the configured port. `bun run dev:app:astro` boots Astro on its port. `bun install` resolves cleanly.

### Task 7: Standardize package names — sweep `@medscall/monorepo-*` → `@template/*`

**Files:** all 31 files containing `@medscall/monorepo`:
- `.claude/skills/{handler/typescript,route,enum/typescript,component,sdk,e2e,usecase/typescript}/SKILL.md`
- `docs/{FRONTEND,CLI}.md`
- `superpowers/plans/2026-05-14-polyglot-client-sdk.md` (only past-tense references; do **not** retroactively change naming claims that were accurate at the time — leave the plan history alone where it documents the prior state).
- `scripts/graph/core/config.ts`
- `scripts/cli/frontend/blocks/{query,sdk}.ts`
- `scripts/cli/frontend/artifacts/{onboarding-step,dialog,component,form,route}.ts`
- `packages/e2e/{package.json,tests/games.spec.ts,utils/mock.ts,utils/given/{user,api}.ts}`
- `CLAUDE.md` (only if any remain after Task 18).

**Steps:**
- [ ] `rg -l '@medscall/monorepo' --hidden --no-ignore-vcs` and walk the list.
- [ ] For docs / skill SKILL.md / scripts: replace `@medscall/monorepo-sdk` → `@template/client-typescript`; `@medscall/monorepo-app` → `@template/app-react`; `@medscall/monorepo-app-styles` → `@template/app-styles`.
- [ ] For `packages/e2e/`: same renames; also rewrite any base URL pointing at `app-web` → `app-react`.
- [ ] **Do not edit `superpowers/plans/2026-05-13-*.md`** — they document prior phases.

**Verification:** `rg '@medscall/monorepo' --hidden --no-ignore-vcs` returns 0 hits (or only the explicitly preserved historical refs in plan files, which should be ≤2).

### Task 8: Re-resolve workspace deps + ensure SDK reaches new consumers

**Files:** `bun.lock` (regenerated), `packages/client/typescript/package.json` (verify name is `@template/client-typescript`).

**Steps:**
- [ ] Rerun `bun install` at repo root.
- [ ] `bun sdk:typescript` to regenerate the SDK and ensure exports match what the new `react` + `expo` import.
- [ ] If `react`/`expo` reference SDK hook paths that don't exist anymore (post-polyglot SDK restructure), file them as known follow-ups in `.specs/` — do NOT fix mass import drift inside this plan. The plan delivers the alignment; deep app→SDK rewiring is its own spec.

**Verification:** `bun --filter @template/client-typescript run build` clean. `bun pm ls` shows all four `@template/app-*` workspaces resolving.

### Task 9: Make `bun tsc` (root) green again

**Files:** any source files whose imports broke after the workspace shuffle.

**Steps:**
- [ ] `bun tsc` and capture errors.
- [ ] Triage: errors in `app-react` / `app-expo` SDK-path drift → file a follow-up issue per the prior task; **do not** fix here.
- [ ] Errors purely from rename (e.g. `@template/app-styles` not exported) → fix.
- [ ] If app-react/app-expo SDK drift is broad, **exclude them from root `bun tsc`** by adjusting `nx.json` target dependencies or by setting `"tsc"` target on app-react/app-expo to a placeholder that exits 0 with a TODO marker. Reproduces the same compromise the polyglot-client-sdk plan already documented for `app/web` + `e2e`.

**Verification:** `bun --cwd packages/api/typescript tsc` clean (was the gate the polyglot-client-sdk plan used). Root `bun tsc` excluding the documented placeholders also clean. Pre-commit hook stops requiring `--no-verify` from this point on.

---

## Phase 2 — Skill variants (Tasks 10-16)

> Each skill task = (1) rewrite the parent dispatch `SKILL.md`, (2) create variant subfolders, (3) port content from `template-fullstack` and from the existing single-flavor `SKILL.md`, (4) update `.claude/registry.yaml` artifact resolution.

### Task 10: Component skill → react / expo / astro

**Files:** `.claude/skills/component/{SKILL.md,registry.yaml,react/{SKILL.md,registry.yaml},expo/{SKILL.md,registry.yaml},astro/{SKILL.md,registry.yaml}}`.

**Steps:**
- [ ] Rewrite parent `SKILL.md` as a **dispatch hub** matching the language-variant pattern (cf. `.claude/skills/entity/SKILL.md`). Routing table:
  - `packages/app/react/**/*.tsx` → `react/`
  - `packages/app/expo/**/*.tsx` → `expo/`
  - `packages/app/astro/**/*.astro` → `astro/`
  - `packages/app/astro/**/*.tsx` (interactive island) → `astro/` (the variant documents both .astro and .tsx islands).
- [ ] Move existing single-flavor body into `react/SKILL.md` (it's already TanStack-Router-flavored).
- [ ] Port `template-fullstack/.claude/skills/component/mobile/{SKILL.md,registry.yaml}` → `component/expo/`.
- [ ] Author `astro/SKILL.md` from scratch: covers `.astro` components, `client:*` directives, when to fall back to a React island, no React Query (use Astro fetch in frontmatter), no Zustand (use props + URL).
- [ ] Author `astro/registry.yaml`: `bad_practices` = "use of client:only without justification", "fetch in client island (do it in frontmatter)", "importing tailwind utilities not registered in shared tokens.css", etc.
- [ ] Delete the now-redundant root `component/registry.yaml`.

**Verification:** Open each variant's `registry.yaml` in `bun review` once Task 16 lands; per-artifact resolution kicks off correctly.

### Task 11: Primitive skill → react / expo / astro

**Files:** `.claude/skills/primitive/{SKILL.md,react/,expo/,astro/}`.

**Steps:**
- [ ] Parent dispatch hub: routing as above.
- [ ] `react/` = current `primitive/SKILL.md` (Base UI + CVA + Tailwind) renamed/moved.
- [ ] `expo/` = port from `template-fullstack/.claude/skills/primitive/mobile/`.
- [ ] `astro/` = new: Astro primitives are typically `.astro` files in `src/components/`, no state, no client JS unless necessary; if interactive, write the primitive as a `.tsx` island and consume from `.astro`. Document the convention.

### Task 12: Route skill → react / expo / astro

**Files:** `.claude/skills/route/{SKILL.md,react/,expo/,astro/}`.

**Steps:**
- [ ] Parent dispatch hub: routing by `packages/app/{react,expo,astro}/...`.
- [ ] `react/` = current `route/SKILL.md` content; also document the TanStack Start migration (Plan 2 follow-up) — SSR on auth, `defaultSsr: false`, basepath `/app`.
- [ ] `expo/` = port from `template-fullstack/.claude/skills/route/mobile/`.
- [ ] `astro/` = new: pages live in `src/pages/`, content collections in `src/content/`, sitemap config via `@astrojs/sitemap`, i18n routing convention.

### Task 13: Form skill → react / expo (no astro)

**Files:** `.claude/skills/form/{SKILL.md,react/,expo/}`.

**Steps:**
- [ ] Parent dispatch hub: routing by cwd; explicit "no astro variant — forms aren't a landing-page concern; if you need a form on Astro, build it as a React island and follow the `react/` skill".
- [ ] `react/` = current `form/SKILL.md` content.
- [ ] `expo/` = port from `template-fullstack/.claude/skills/form/mobile/`.

### Task 14: Sheet skill → expo-only (new)

**Files:** `.claude/skills/sheet/{SKILL.md,registry.yaml}` (CREATE, single-flavor — expo only).

**Steps:**
- [ ] Copy from `template-fullstack/.claude/skills/sheet/`.
- [ ] Confirm the description starts with "Expo / React Native sheet" and the routing line says "Use only inside `packages/app/expo/`".

### Task 15: Store skill stays single-flavor (no change)

**Files:** none.

**Steps:**
- [ ] Add a one-paragraph note in `store/SKILL.md` clarifying that Zustand is used identically across `react`, `expo`; not relevant for `astro` (use frontmatter / props).

### Task 16: Update `.claude/registry.yaml` dispatcher

**Files:** `.claude/registry.yaml`, `scripts/review.ts` (verify `detectLang(file)` resolution).

**Steps:**
- [ ] In `.claude/registry.yaml`, for each frontend artifact pattern, declare the variant lookup keyed by `(skill, platform, artifact)`. Mirror the existing backend `(skill, lang, artifact)` shape introduced for `entity` etc.
- [ ] In `scripts/review.ts`, add a `detectPlatform(file)` helper alongside `detectLang(file)`:
  - `.astro` → `astro`.
  - `packages/app/react/` → `react`.
  - `packages/app/expo/` → `expo`.
  - `packages/app/astro/` → `astro`.
- [ ] `getCompiledChecklist(skill, platformOrLang, artifact)` resolves through `resolveRegistryPath()` to the variant folder if present, falling back to root.

**Verification:** `bun review --pr` produces variant-specific batches (`component-react`, `component-expo`, `component-astro`) and never mixes them in the same prompt.

---

## Phase 3 — Scaffolder + docs (Tasks 17-21)

### Task 17: Split `scripts/cli/frontend/` into platform-routed scaffolder

**Files:** `scripts/cli/{frontend,react,expo,astro}/`, `scripts/cli.ts`.

**Steps:**
- [ ] Match what `template-fullstack` did: it kept `scripts/cli/frontend/` for web verbs and added `scripts/cli/mobile/` for mobile verbs. Replicate but with names `react/`, `expo/`, `astro/`.
- [ ] In `scripts/cli.ts`, route shared verbs (`route`, `component`, `primitive`, `form`) to the platform handler by:
  1. `--platform=react|expo|astro` flag if passed.
  2. Otherwise detect from `process.cwd()`: `packages/app/react/` → react; `packages/app/expo/` → expo; `packages/app/astro/` → astro.
- [ ] `sheet` verb remains expo-only.
- [ ] `dialog`, `mask`, `i18n`, `onboarding-step`, `store` remain react-only (web-only in template-speak).
- [ ] Add `astro` verbs: `astro:page`, `astro:content-collection`, `astro:island` (a React island with `client:*`).

**Verification:** `bun cli route /products --platform=react` scaffolds correctly. `bun cli component MyCard --platform=expo` scaffolds correctly. `bun cli astro:page about` scaffolds.

### Task 18: Rewrite root `CLAUDE.md`

**Files:** `CLAUDE.md`.

**Steps:**
- [ ] Workspace table: add `app/astro` (`Astro + MDX + Tailwind 4` — Landing pages, blog, SEO) and `app/styles` (`Shared design tokens (CSS)` — Consumed by react+astro).
- [ ] Rename row `app/web` → `app/react`.
- [ ] `Environment Setup`: keep but mention astro + styles in the workspace list at the top.
- [ ] `Commands` section: replace `dev:app:web` with `dev:app:react`; add `dev:app:astro`.
- [ ] `Frontend scaffolding` section: rewrite to describe the three platforms and reference `docs/CLI.md` for the verb→platform table.
- [ ] `Skill dispatch by language / target` table: add rows for `.astro` → `astro`, `packages/app/react/**` → `react`, `packages/app/expo/**` → `expo`, `packages/app/astro/**` → `astro`. Update the "Frontend variants" list to `react`, `expo`, `astro`. Remove the `(planned)` qualifier from those entries.

### Task 19: Update `docs/FRONTEND.md`

**Files:** `docs/FRONTEND.md`.

**Steps:**
- [ ] Add an "Astro (landing + blog)" section: when to use vs `react`, how MDX content collections work, sitemap + JSON-LD + OG image generation, i18n routing convention.
- [ ] Rename "web app" / "app/web" references → "react app" / "app/react".
- [ ] Document the styles workspace boundary: `app/react` and `app/astro` import `@template/app-styles/tokens.css`; `app/expo` keeps its uniwind theme; if a token has to be shared with expo, fork it manually for now (this is the deferred work flagged in Scope).
- [ ] Document the TanStack Start migration in the `react` section (SSR on auth routes, defaultSsr: false, nginx routing split with astro at `/`, react at `/app`).

### Task 20: Update `docs/CLI.md`

**Files:** `docs/CLI.md`.

**Steps:**
- [ ] Verb→platform table: each cross-platform verb (`route`, `component`, `primitive`, `form`) lists `react/expo/astro` (or `react/expo` for `form`) under "Routes to".
- [ ] Add `astro:*` verbs section with worked examples.
- [ ] Update existing `@medscall/monorepo-*` references to `@template/*`.

### Task 21: Update auto-memory pointers

**Files:** `~/.claude/projects/-Users-gabrielaraujo-Desktop-Projetos-medscall-monorepo/memory/MEMORY.md` and entries.

**Steps:**
- [ ] Search MEMORY.md for `app-web`, `web/`, `@medscall/monorepo-sdk`. Where the fact still applies under the new name, update it (e.g. "Route tree: `cd app && bun tsr generate`" → "`cd packages/app/react && bun tsr generate`"). Where the fact was specific to medscall code that no longer exists, mark as superseded with a date and reason.
- [ ] Add a new memory entry: `project_polyglot_frontend_layout.md` summarizing the four-workspace split (astro / react / expo / styles), the variant-skills folder convention (`react/`, `expo/`, `astro/`), and what each one is for.

---

## Phase 4 — Verification (Task 22)

### Task 22: End-to-end smoke

**Steps:**
- [ ] `bun install` clean.
- [ ] `bun tsc` (root) — green or only deferred-followup errors documented in Task 8 known-follow-ups.
- [ ] `bun lint` — green.
- [ ] `bun --filter @template/app-react run tsc` green.
- [ ] `bun --filter @template/app-astro run tsc` green (`astro check`).
- [ ] `bun --filter @template/app-expo run tsc` green.
- [ ] `bun dev:app:astro` and `bun dev:app:react` boot together (different ports).
- [ ] `bun review --pr` — variant-specific batches for any frontend file in the diff (`component-react`, `component-astro`, etc.); no mixed batches.
- [ ] Pre-commit hook passes without `--no-verify` on a no-op commit at HEAD.
- [ ] `rg '@medscall/monorepo' --hidden --no-ignore-vcs` returns ≤2 hits (only inside historical plan docs explicitly preserved).

**Acceptance:** All gates above green. The repo's `feat/clean-polyglot` branch now mirrors `template-fullstack/polyglot` on the app side while keeping the polyglot backend on this side. `/component`, `/route`, `/primitive`, `/form` skills dispatch to react/expo/astro variants from any frontend file. `bun cli` scaffolds into the correct platform.

---

## Known follow-ups (not blockers)

- ~~**SDK hook path drift in app-react / app-expo.**~~ **RESOLVED 2026-05-14.** Games feature deleted end-to-end (backend has no games — domain is video streaming). `configureClient` migrated to per-service signature. `ApiErrorsEnum` import path corrected. `createClient` factory wired in e2e. tsc targets restored. See `.specs/2026-05-14-polyglot-app-sdk-wiring.md` for resolution details.
- ~~**Expo ↔ shared tokens.**~~ **RESOLVED 2026-05-14.** Expo `global.css` token NAMES now match the shadcn convention used in `@template/app-styles/tokens.css` (`--color-background`, `--color-foreground`, `--color-card`, `--color-success`, `--color-destructive`, etc.). Token VALUES retain the project's dark-only Berzerk aesthetic. Berzerk-specific extensions (`--color-foreground-subtle`, `--color-border-subtle/strong`, `--color-loss`, `--color-pulse`, `--color-cashback`) preserved as named tokens. 20 Tailwind class patterns renamed across 22 expo files. Future swap to the shared light/dark palette is one `@import` swap.
- **Astro variant skills are new.** `astro/registry.yaml` checklists are based on Astro best practices, not on observed bad code in this repo — expect to refine after the first real Astro feature lands.
- **Storybook.** `app-react` brings storybook deps from medscall but it's been dormant in this branch since the polyglot rebuild. Decide whether to re-enable as a separate task.
