# Canonical Artifact Snippets — Design Spec

**Date:** 2026-05-27
**Status:** Approved
**Bounded Context:** cross-cutting tooling — `scripts/cli`, `.claude/skills/*/registry.yaml`, `.claude/commands/plan.md`, `scripts/review-plan.ts`, `scripts/graph/core/review-query.ts`
**Kind:** chore (developer-experience / tooling refactor)
**Story Points:** 21 — spans the backend CLI renderer, every skill `registry.yaml`, the `/plan` authoring contract, and the frontend assembler; explicitly decomposes into three plans (A → B → C). See "Decomposition" below.

## Context

An "artifact" in this template is a buildable unit of the architecture — `entity`, `value-object`, `usecase`, `controller`, `repository`, `component`, `route`, etc. Each artifact's canonical *shape* (the code you write when you create one) is currently written down in **three independent places that nothing keeps in sync**:

1. **The generator** — `scripts/cli/backend/typescript/templates.ts` (795 lines; sibling variants `scripts/cli/backend/go/templates.ts` at 1252 lines and `scripts/cli/backend/rust/templates.ts` at 871 lines). One template function per artifact returns the raw source string `bun cli <artifact>` emits. This is the only *executable* definition.
2. **The `canonical_snippet`** field in `.claude/skills/<skill>/<lang>/registry.yaml` (e.g. `.claude/skills/entity/typescript/registry.yaml:620`). An illustrative "what good looks like" block, read only by `scripts/graph/core/review-query.ts:134` (mapped to `canonicalSnippet`) and surfaced into the graph's `payload.registries[skill]`, which `/plan` consumes.
3. **The `SKILL.md`** body — `.claude/skills/entity/typescript/SKILL.md` (612 lines, 17 fenced code blocks). The full teaching doc, read by the model during `/plan` Phase 1.4 and `/review`.

The frontend CLI (`scripts/cli/frontend/`) is shaped differently: it is an **assembler**. Each `blocks/<block>.ts` emits a `BlockOutput` fragment (imports, hookCalls, declarations, jsxBefore, i18nSlots); `artifacts/component.ts` dedupes imports and stitches fragments into zones of a host component template; `recipes/<recipe>.ts` presets block bundles. So a frontend component is a *function of flags*, not a single static snippet.

The CLI has **zero programmatic linkage** to the registry: it only carries human comments pointing at `SKILL.md` (e.g. `scripts/cli/backend/go/templates.ts:4`). 34 skills declare a `scaffold:` line naming a `bun cli …` command, but none share a body with the generator.

## Problem

1. **Measured drift.** The same artifact's shape diverges across its three definitions. For backend TS `entity`, the registry `canonical_snippet` and the CLI `templates.ts` disagree on: the name-field validators (`z.string().trim().min(1).max(255)` vs `z.string().min(1)`), the error code (`NAME_REQUIRED` vs `TODO_NAME_REQUIRED`), which fields are shown (VO/enum/Id fields vs bare `name`), the `create()` signature, and whether imports are present. Three sources, three shapes, no reconciliation mechanism.
2. **`/plan` hand-writes boilerplate.** `/plan` ships the full implementation of each artifact inside Task steps (`plan.md` "Step 3: Write minimal implementation"). The model re-derives the boilerplate the CLI already owns — wasting tokens and reintroducing a fourth divergent copy per plan, which `scripts/review-plan.ts` then has to police.
3. **No single source of formatting.** There is no one place a maintainer can edit to change "how an entity is shaped" and have the CLI, the reviewer, and the planner all pick it up.

## Goal

A maintainer edits an artifact's canonical shape in **one** place — its skill `registry.yaml` — and the CLI (generation), `/review` + `/plan` (reasoning), and the planner all reference that single definition. `/plan` stops hand-writing boilerplate: it scaffolds each artifact via the CLI and then ships only the business-logic *delta*. Drift between the generator, the exemplar, and the teaching doc becomes structurally impossible because they stop being separate copies.

## Decisions

1. **The registry is the source of truth of formatting.** Each artifact's shape lives in its skill `registry.yaml` under a new `snippet:` block; the CLI and review tooling *parse/reference* it rather than holding their own copy.
2. **Two co-located layers.** `snippet.skeleton` is the executable layer the CLI emits (lean, placeholder-driven, the starting point to fill in). `snippet.exemplar` is the rich teaching layer the reviewer and planner reason about (VOs, enums, real methods). Both live in the same file so drift between them shows up in one diff. The existing top-level `canonical_snippet` field is migrated to `snippet.exemplar`.
3. **`SKILL.md` stops embedding competing code blocks.** It keeps prose, bad-practices, and a pointer to the registry `snippet`. This removes the third copy.
4. **Templating mechanism: YAML body + TS bindings (Approach 1).** `snippet.skeleton` and `snippet.imports` are strings containing a fixed `{{placeholder}}` vocabulary. A small per-artifact TS *bindings* function computes the placeholder values (e.g. `Name` = pascal-case, `base` = `AggregateRoot|BaseEntity` from `--aggregate`, `NAME_ERR` = the error const). A single generic renderer interpolates. No template-engine DSL (no `{{#if}}`/`{{|filter}}`); transform logic stays in testable TS.
5. **`templates.ts` dissolves.** Each backend artifact's *body* moves to its registry `snippet.skeleton`; each artifact's *logic* moves to a small `bindings/<artifact>.ts`. The CLI becomes "load registry skeleton → compute bindings → render → write."
6. **`/plan` becomes scaffold-then-mutate.** For each new artifact a Task creates, the plan emits a `bun cli …` scaffold step followed by a diff step carrying only the delta the behavior requires. The plan never re-pastes CLI-owned boilerplate. `scripts/review-plan.ts` reconstructs the final file (render skeleton + apply diff) before running its checklist. `/build` needs no engine change — it already runs bash + edits.
7. **Frontend stays compositional; only fragment bodies externalize.** Each frontend `block` externalizes its body + import list to a `snippet`-shaped YAML fragment. The assembler (zone-routing + import-dedupe) stays in TS because that logic is not declarable without reinventing a template engine. Recipes become a thin list of fragment-refs + a host-template ref.
8. **Scope of the renderer pilot is TypeScript backend.** Phase A migrates the TS backend artifacts; the Go and Rust `templates.ts` migrations are deferred follow-ups (same format, applied after the TS renderer proves out). This keeps an already-21-point program from ballooning.
9. **One spec, three plans.** This document is the single architecture; `/plan` cuts it into Plan A (backend single-source), Plan B (`/plan` rewiring), Plan C (frontend fragments). A unblocks B and C; B and C are independent of each other.

## User Stories

- **Story 1 — single source of formatting.** As a maintainer changing how an entity is shaped, I want to edit one `registry.yaml` `snippet` and have the CLI output, the reviewer's checklist, and the planner's reasoning all reflect it, so that the three definitions can never drift again.
  - Given the entity skeleton lives in `entity/typescript/registry.yaml`, when I change the `name` validator there and run `bun cli entity sales Order`, then the generated file reflects the change.
  - Given the same edit, when `/review` or `/plan` resolves the entity convention, then it reads the same `snippet` (no second copy in `templates.ts` or `SKILL.md` to contradict it).

- **Story 2 — planner stops hand-writing boilerplate.** As the `/plan` author (the model), I want to scaffold each artifact via `bun cli` and ship only the business-logic delta, so that I don't re-derive CLI-owned boilerplate or introduce a divergent fourth copy per plan.
  - Given a Task that creates a new use case, when `/plan` writes the Task, then Step "scaffold" runs `bun cli usecase …` and Step "mutate" carries only the delta as a diff.
  - Given such a Task, when `scripts/review-plan.ts` runs, then it reconstructs the final file (skeleton + diff) and reviews real code, not a partial diff.

- **Story 3 — frontend fragments share the format.** As a maintainer changing a frontend block's body, I want to edit its YAML fragment, so that `bun cli component …` reflects the change while the assembler's composition logic stays in code.
  - Given the `skeleton` block externalized its body to a YAML fragment, when I edit that fragment and run `bun cli component <route> Foo --skeleton`, then the emitted component contains the edited skeleton body.

## Acceptance Criteria

### Phase A — backend single-source (Plan A)

- [ ] AC-A1: A new `snippet:` block exists in each migrated TS backend skill `registry.yaml`, with `imports`, `skeleton`, and `exemplar` keys. The former `canonical_snippet` content is present as `snippet.exemplar`.
- [ ] AC-A2: A generic renderer interpolates a skeleton's `{{placeholders}}` from a bindings map and produces the file body; it is unit-tested against the entity skeleton.
- [ ] AC-A3: `bun cli entity <ctx> <Name> [--aggregate]` produces a file by rendering the registry `snippet.skeleton` (not by calling a `templates.ts` body). Output type-checks (`bun tsc`).
- [ ] AC-A4: Pilot artifacts `entity`, `valueObject`, `usecase`, `controller` are migrated to the YAML format and their `templates.ts` bodies are removed; `bun cli` for each produces equivalent output to pre-migration (golden-file comparison).
- [ ] AC-A5: After the pilot proves out, the remaining ~18 TS backend artifacts are migrated and `scripts/cli/backend/typescript/templates.ts` no longer carries artifact bodies.
- [ ] AC-A6: `scripts/graph/core/review-query.ts` reads `snippet.exemplar` (falling back to legacy `canonical_snippet` during migration) so `/plan` and `/review` still receive the rich form.
- [ ] AC-A7: Each migrated `SKILL.md` no longer embeds a full code block that competes with the registry `snippet`; it points to the registry instead.

### Phase B — `/plan` scaffold-then-mutate (Plan B)

- [ ] AC-B1: `.claude/commands/plan.md` documents the scaffold-then-mutate Task shape (a `bun cli …` step + a delta-only diff step) in place of "Step 3: Write minimal implementation" pasting whole files for artifacts the CLI can scaffold.
- [ ] AC-B2: A plan produced under the new contract contains, for each scaffoldable new artifact, a `bun cli` step and a diff step — and does not paste CLI-owned boilerplate.
- [ ] AC-B3: `scripts/review-plan.ts` reconstructs a Task's final file by rendering the referenced skeleton and applying the plan's diff, then runs the existing registry checklist against the reconstructed file.

### Phase C — frontend fragments (Plan C)

- [ ] AC-C1: Each frontend `block` externalizes its body + import list to a `snippet`-shaped YAML fragment; the block module reads its body from the fragment.
- [ ] AC-C2: `bun cli component <route> <Name>` with the same flags produces output equivalent to pre-migration (golden-file comparison); the assembler's zone-routing and import-dedupe remain in TS.
- [ ] AC-C3: A recipe is expressed as a list of fragment-refs + a host-template ref.

## Decomposition

- **Plan A — Backend single-source** (no dependencies). Builds the `snippet` format, the renderer, the bindings layer, repoints `review-query.ts`, migrates the pilot four artifacts, then sweeps the rest, dissolving `templates.ts`. Unblocks B and C.
- **Plan B — `/plan` rewiring** (depends on A). Updates `plan.md`'s authoring contract and teaches `review-plan.ts` to reconstruct-then-review.
- **Plan C — Frontend fragments** (depends on A; independent of B). Externalizes block bodies to YAML fragments; keeps the assembler in TS.

Estimate ≥ 13 sanity check: yes, this can be three specs — but the format (`snippet` schema + placeholder vocabulary) is the shared contract all three depend on, so it is authored once here and the three plans consume it. Decomposition happens at the plan/build boundary, not the spec boundary.

## Out of Scope

- **Go and Rust backend CLI migration.** Same format applies later (Decision 8); not in this program's three plans.
- **A template-engine DSL** (`{{#if}}`, `{{|filters}}`) — explicitly rejected (Decision 4).
- **Changing the frontend assembler's composition model** — only block *bodies* move to YAML; zone-routing/dedupe stay in TS (Decision 7).
- **`/build` engine changes** — none required (Decision 6).

## Risks & Migration

- **Renderer equivalence.** The pilot (AC-A4) and frontend (AC-C2) use golden-file comparison against pre-migration output to guarantee `bun cli` behavior is unchanged by the refactor. This is the primary safety net.
- **Transition window.** During Phase A's sweep, some artifacts are YAML-sourced and some still in `templates.ts`. `review-query.ts` reads `snippet.exemplar` with a `canonical_snippet` fallback (AC-A6) so `/plan`/`/review` never break mid-migration.
- **Placeholder vocabulary creep.** If a new artifact needs computation that doesn't fit the fixed placeholder set, it goes in that artifact's `bindings.ts` (TS), not into a YAML conditional — preserving Decision 4.

## Open Questions

- Exact `snippet` key names and the placeholder-vocabulary spelling are settled during Plan A's first task (the format is the shared contract) and are not re-litigated in B or C.
