# ECOSYSTEM — Repo Family, Ownership Tiers & Sync Model

> How template-fullstack and its product forks stay aligned without freezing product work.
> Companion plans: `.plans/2026-07-11-ecosystem-sync-up.md` (heal existing drift) and
> `.plans/2026-07-11-sync-machinery.md` (build the machinery described here).
> Evidence base: the 2026-07-10 tri-repo audit (86 verified drift findings, 22 pattern extractions)
> — artifact: https://claude.ai/code/artifact/59c51e1f-d914-4b15-a04d-665e222362c6

## 1. The family

| Repo | Role | Layout |
|---|---|---|
| **template-fullstack** (`~/Desktop/Projetos/pessoal/template-fullstack`) | **Canon / single source of truth.** Every shared surface's authoritative copy lives here. | Polyglot: `packages/{api/{typescript,go},app/{react,astro},contracts,client,e2e}` |
| **fork mobile** (`<caminho local do fork>`) | Product fork, **shares git history** with template. Mobile/Expo exemplar. | Same polyglot layout, `@fork/*` scope |
| **fork clínico** (`<caminho local do fork>`) | Production product, **diverged layout** (pre-polyglot). Battle-testing ground. **Settled 2026-07-11: it keeps its layout — sync happens at file granularity via the manifest's path map, never via a layout migration.** | `packages/api` (TS, core at `src/shared`), `packages/channel` (Go), `@fork/*` scope |
| fork e-commerce legado (`<caminho local do fork>`) | Frozen source system. Read-only provenance; port branches live in template (`feat/ecommerce-fork-*`). | legacy |

**Iron rule (verified industry-wide by the 2026-07 research):** exactly one source of truth,
one-way flow. Two-way sync is unsupported by every serious tool and carries a documented
silent-reversion race (Dagster). Downstream fixes flow up **as PRs to the template**, then ride
the train back down.

## 2. The four ownership tiers

Every file in every repo belongs to exactly one tier. The manifest (`sync.yaml`, Plan 2) makes
tier membership machine-readable.

### Tier 1 — Platform kernel (template owns; robot syncs; downstream NEVER edits)
`packages/api/typescript/core/**`, `packages/api/go/core/**`, `scripts/**` (review, review-plan,
graph, cli, detectors, lib), `.claude/{skills,registry.yaml,agents}/**`, `.githooks/**`, lint/CI
configs, `docs/{BACKEND,FRONTEND,CLI,CORRECTNESS,ECOSYSTEM}.md`.

- Treat as **vendored dependencies that happen to live in your tree**.
- A fix is made in the template first — or, when a deadline forces fixing downstream, the same
  change is PR'd upstream **the same week, as the same commit** (cherry-pick, never re-implement:
  half-ported commits are how the mobile fork got `--with-graph` without the fix that made it work).
- Brand differences (each fork's `@fork/*` scope, Go module paths, SDK specifiers) are **parameters**
  (`template.config.*` + Nunjucks variables), never edits.

### Tier 2 — Shared contexts with variation points (template owns skeleton; product owns plugs)
`billing`, `quota`, `auth`, `owner`, `notifications` (and any future generic context).

The skeleton ships: entities, use cases, derivers, abstract **ports**, config **schema**.
The product ships, inside its own tree, never by editing skeleton files:

| Plug kind | Example |
|---|---|
| **Adapter** (implements a port) | `PaymentProvider` gateway adapters; `QuotaCounter` implemented in the OWNING product context (`nutrition/MealScanCounter`) |
| **Enum vocabulary** | `QuotaKey`, notification kinds, `ActivityType` |
| **Config-as-code** | `PlanRegistry` (plans, prices, quota limits) |

Directory convention makes sync mechanical:
```
billing/                    ← in sync.yaml (skeleton, synced)
billing/adapters/**         ← NOT in manifest (product-owned)
billing/config.ts           ← NOT in manifest (product-owned)
```
Anti-pattern (real, from the audit): the clinical fork's `GlobalErrorMapper` hardcodes a union importing
every context — a variation point not extracted, and exactly the file that can't sync. When you
find one of these, extract the port/registry upstream first.

### Tier 3 — Exemplar contexts (copy once with provenance; product owns forever)
Template keeps canonical exemplars for scaffolding the *next* product (`integration`, dashboard
read-model, a slim `catalog`). On copy, stamp the header:
```ts
// CONTEXT-ORIGIN: template@<short-sha> (2026-07-11) — owned by this repo since copy
```
**Never robot-synced** (the shadcn model: you own what you copied). Improvements return only by
deliberate curation — the `clean-branch` skill is the extraction vehicle from a fork back to canon.

### Tier 4 — Product code (no rules)
`nutrition`, `training`, `social` (mobile fork); `appointment`, `clinic`, `patient`, `agent`,
`channel` domain code (clinical fork). Not the template's business.

## 3. The daily litmus

Before editing any file, one question: **is it in `sync.yaml`?**

- **No** → it's yours. Go.
- **Yes** → you have exactly three legal moves, in order of preference:
  1. **Plug** — express the need as adapter/enum/config in your product tree (most "domain-specific
     implementation" needs are this).
  2. **Upstream PR** — the change is generic (a second product would want it): PR the skeleton in
     the template; it rides the train back to everyone.
  3. **Eject** — truly product-only-forever: remove the file from the manifest and mark it:
     ```ts
     // SYNC-DIVERGENCE: <why> — <repo>, <date>
     ```
     Deliberate, visible, recorded. Drift CI treats it as owned.

**The one illegal move:** silently editing a synced file. That is the entire failure class the
system exists to prevent (86 findings' worth in ~6 weeks).

Borderline test: *would a second product want this change?* Yes → generalize (move 2).
Only-this-domain → plug or eject.

## 4. Ownership ≠ location (CODEOWNERS hats)

The repo that runs a thing **in production** owns its *evolution*; the template owns its
*interface*. Encoded in the template's `CODEOWNERS`:

```
packages/api/typescript/src/billing/**   # clinical-fork-hat — its chargebacks, its call
packages/api/typescript/src/quota/**     # clinical-fork-hat
packages/app/expo/**                     # mobile-fork-hat — its production mobile app
.claude/skills/mobile-patterns/** .claude/skills/sheet/**  # mobile-fork-hat
scripts/** packages/api/*/core/**        # template-hat
```
Solo-maintainer reading: the hat answers *"whose production experience must this change satisfy?"*
at review time. When the clinical fork battle-hardens billing, clinical-fork-hat upstreams the hardening —
that's the flow direction, encoded.

## 5. The sync train (pull-based — DECIDED 2026-07-21, machinery in `scripts/sync/`)

> **"O template não sabe dos filhos; os filhos declaram o pai."** Exactly the git fork model.
> This supersedes the earlier push-train design (template-side target registry +
> `repo-file-sync-action`); history in `.plans/2026-07-11-sync-machinery.md`.

- **The child declares the parent.** A fork adds ONE file at its root — `sync.yaml`
  (documented in `scripts/sync/sync.yaml.example`): `parent { repo, ref }` (pinned full
  commit sha), `inherited` (path globs that must byte-match the parent at the pin),
  `adapted` (exact files that came from the parent and deliberately diverged, each with a
  mandatory `why`). Everything undeclared is **owned** — absence IS the declaration.
  The template itself carries **no sync.yaml**: it is a root, and every sync command
  no-ops green on it.
- **Drift gate:** `bun sync:check` in the fork's CI diffs every `inherited` glob against
  the parent at the pin. Each drifted file is a named failure with the fix menu:
  (a) re-pull · (b) reclassify to `adapted` WITH a why · (c) upstream the change as a PR.
  `adapted` entries are liveness-gated — the file must exist AND differ from the parent;
  a re-converged file is a fossil and fails (reclassify to inherited).
- **Propagation:** `bun sync:pull [--to <ref>]` in the fork applies the parent's surface
  changes and advances the pin (fast-forward from a clean base; any overlap with adapted
  or locally drifted files is a loud conflict, nothing applied). The tool itself
  (`scripts/sync/**`) rides the inherited surface, so fixing it upstream fixes every fork.
- **Reverse flow:** always an explicit PR to the parent — no hooks, no automation, never
  auto-merge into the canon.
- **Brand values** never need templating in synced files: pull copies bytes; branding
  flows from each repo's `template.config.ts` at runtime (Phase 1 of the plan).
- **Offline / CI without network:** `SYNC_PARENT_PATH=<local clone>` short-circuits the
  temp bare clone of `parent.repo`.
- **Ceiling (deferred):** graduate to Copybara (Starlark `core.move`/`core.replace`) only
  if transformation needs outgrow byte-copy + config — structural moves across layouts.

## 6. Worked scenarios

**A. The clinical fork hardens billing (flow up-and-around).** Incident → fix lands in the clinical fork's billing →
same-week upstream PR to template skeleton (generic: nothing medical in it) → template merges →
train opens sync PRs → the mobile fork gets double-charge protection without ever having had the incident
→ the clinical fork's own sync PR is a no-op that realigns its pin.

**B. The mobile fork needs domain behavior inside a shared context** ("free users: 3 AI meal scans/day"):
add `MEAL_SCANS` to its `QuotaKey` + `PlanRegistry` entry (config) → implement
`MealScanCounter` in `nutrition/` (adapter, owning context) → one `quotaGate.assertCanPerform`
line in `RequestMealAnalysis`. **Zero synced files touched**; next train passes clean.

**C. The gate lacks an API the mobile fork needs** (`remainingFor()` for "2 scans left" UI): NOT a local
edit. It's generic (the clinical fork would show "X messages left") → upstream PR (move 2). If it were
truly mobile-fork-only-forever → eject with a `SYNC-DIVERGENCE` marker (move 3).

## 7. House rules (add to each repo's CLAUDE.md)

1. **Upstream-first** for any Tier 1/2 surface; downstream-first only under deadline, mirrored
   upstream the same week.
2. **Whole commits, never re-implementations** — `git cherry-pick`/merge across repos.
3. **Every shared-surface file is either in sync or carries a `SYNC-DIVERGENCE` marker.** The
   drift gate enforces; no third state.
4. **Exemplars carry `CONTEXT-ORIGIN` stamps**; improvements return via `clean-branch`, not sync.
5. When you meet an unextracted variation point (hardcoded product knowledge in a skeleton),
   extracting it upstream **is** the fix — not working around it locally.
