# Correctness Rung System — design

> **Date:** 2026-06-09 · **Branch:** `feat/correctness-system`
> **Predecessor:** `.specs/2026-06-08-pattern-cohesion-atlas-design.md` (the audit — evidence
> for everything here). This spec supersedes that document's §5 proposal: the Atlas is
> **demoted** from centerpiece to byproduct (see Decisions).

## Context

The architecture is encoded as ~40 skills (SKILL.md + registry.yaml). The 53-agent audit
found the per-artifact knowledge strong but the cross-cutting knowledge fractured: 135
findings (46 high), 30 contradictions, only 1 of 29 cross-cutting axes fully AI-inferable.
Root cause is singular: rules exist as N drifted copies with no canonical owner, and nearly
all rules live at the weakest enforcement rung (prose the model must read and obey).

## Problem

Agent build success is a product of per-decision success: `P = ∏ pᵢ ≈ p^N` over N ≈ 60
decisions per feature. At p ≈ 0.97 that yields P ≈ 0.16 first-pass. Documentation alone
caps p at ~0.95–0.98 per decision — no doc format escapes the exponent. Worse,
**contradictory docs create systematic bias, not noise**: retries re-read the same wrong
rule and converge on the wrong answer; feedback loops amplify whatever is written.

## Goal

Maximize first-pass build correctness by moving every rule to the highest enforcement rung
it can occupy, and by measuring the system so rules keep migrating upward:

> If you wrote it twice → the **scaffolder** writes it.
> If you documented it → a **detector** checks it.
> If the detector always fires the same fix → the **type system** makes it impossible.
> Only irreducible judgment stays as **docs**: one owner, one real tested example, eval-measured.

Target: P ≈ 0.84 first-pass (N: 60→~35 via elimination; ~20 decisions detector-covered at
p_eff ≈ 0.999; residual ~15 judgment decisions at p ≈ 0.99). ~5× today.

## Decisions

1. **TS event canon = use-case-born** *(user decision, 2026-06-09)*. The use case builds
   the domain event inline after `entity.save()` and persists via
   `domainEventRepository.save(event, tx)`. Entity `addEvent()` references (fictional — 0
   usages) are removed from the TS skills. The TS↔Go divergence (Go is entity-born via
   `AddDomainEvent`/`PullDomainEvents`) is documented as **intentional** in the entity hub.
2. **Scope now = Phase 0 + Phase 1** *(user decision, 2026-06-09)*; each phase is its own
   PR off `feat/correctness-system`. Phases 2–4 specced here, executed after review.
3. **Meta-work does not use `/plan`→`/build`** — those assume system artifacts (citizens,
   code graph, spec-compliance contracts). Meta-work (skills/registries/scripts/hooks) uses
   this spec + a `.plans/` doc + direct execution, with the per-artifact verification gates
   defined below. `/learnings` conventions apply (reviewable commits per logical change).
4. **Rung priority: eliminate > detect > document.** Doc-format work (incl. the Atlas) is
   never prioritized over decision-elimination or detector coverage.
5. **Atlas demoted to byproduct.** The axis inventory (Phase 3) is a routing table deciding
   each rule's rung; a rendered matrix may be generated from it, but is not a goal.
6. **Branch base = current HEAD lineage** (`feat/bk-dash-app-screens`), not `v1.4` — the
   skills tree barely exists on `v1.4` (+46.8k lines behind).

## User stories

- As an agent building a feature, banned idioms either don't exist in the API surface or
  are flagged in-loop the moment I write them — I never learn them from a stale doc.
- As an agent making a modeling decision (entity vs VO vs event; projection vs query-join;
  which UI citizen), I find exactly one canonical rubric with a real, tested example.
- As a maintainer editing a skill, CI fails if my edit contradicts the canonical owner of
  that rule or references a pattern ID/path that doesn't exist.
- As the team, every doc change is validated by evals before merging, and KPIs tell us
  which rung each failing rule should migrate to.

## The rung ladder (target architecture)

| Rung | Mechanism | Effect on P | Examples (this repo) |
|---|---|---|---|
| 1 — Eliminate | scaffolder / type system / codegen | N↓, p=1 | `bun cli` writes + **wires** artifacts; `z` re-export surface drops `nativeEnum`; `.input()` typed to object schemas only; Controller envelope typed `{body,query,params,ctx}`; repo tx typed so no cast is needed |
| 2 — Detect | lint/walkers in the edit hook + CI | error suppression becomes geometric | ast-grep pack compiled from registry `wrong:` patterns; import-direction lint; slice-closure walker; grep packs (locale, tokens, `fetch(`, i18n mirror) |
| 3 — Document | single-owner judgment rules | p↑ on residual | citizen-selection rubrics, aggregate boundaries, projection archetypes, "it depends" discriminators; examples point at real code under test |
| 4 — Measure | eval harness + /learnings | keeps rules migrating up | replay evals from 46 ACed specs; foreign-domain holdout; L1–L5 KPI vector; consistency@k; ablation pruning |

## Phases

### Phase 0 — De-bias (this PR)
Fix the verified contradictions that actively teach wrong patterns. Must precede everything:
feedback loops amplify whatever is written. Full fix list + per-edit verification in
`.plans/2026-06-09-correctness-phase-0-and-detectors.md`.

**ACs:** every audited `wrong` idiom is absent from the skills tree (grep assertions);
duplicate `CTRL-C12` ID de-collided; all edited YAML parses with the parser `review.ts`
uses; entity hub documents the TS↔Go event divergence.

### Phase 1 — Detector sprint (next PR)
1. **Registry→ast-grep compiler** (`scripts/detectors/`): compile mechanically-checkable
   `wrong:` patterns from registries into an ast-grep/grep pack.
2. **Import-direction lint**: controller↛repository, component↛`fetch`, context↛context
   entities, usecase↛mediator.publish, app↛non-SDK backend imports.
3. **Slice-closure walker**: events with no subscriber, projections without projectors,
   controllers/handlers not barrel-registered.
4. Wire all three into the edit hook (in-loop) + `bun lint`/CI (gate).

**ACs:** each detector has a fixture self-test (violating fixture fires; clean fixture
silent); running across HEAD yields zero unexplained findings (real hits become tickets;
false positives fix the rule before merge); edit-hook latency stays < 2s.

### Phase 2 — Type-level eliminations
`z` surface control (remove `nativeEnum`; type `.input()` to object schemas), Controller
envelope typing, repository tx narrowing without cast. **Then delete the doc rules these
obsolete.** ACs: the wrong code no longer compiles; corresponding registry entries removed
or downgraded to a one-line "enforced by type" note; `bun tsc` green repo-wide.

### Phase 3 — Knowledge consolidation (axis routing)
For each of the 29 audit axes: assign every rule a rung; what stays at rung 3 gets a single
owner + cross-references replacing the N copies; examples re-pointed at real tested code;
ubiquitous-language naming promoted to regex-backed bad_practices. ACs: zero same-rule
duplication across registries (drift check); every rung-3 rule names its owner.

### Phase 4 — Eval harness
`scripts/skill-evals/`: ~15 replay tasks from `.specs/` + merged commits (gold
decompositions for free), foreign-domain holdout fixtures, mechanical graders (tsc + the
Phase 1 detectors + registry rubric via review.ts), scoreboard JSONL, consistency@k.
`/learnings` proposals gated by the scoreboard. ACs: baseline vector recorded; a doc-change
PR can show its before/after eval delta.

## Meta-verification gates (replaces /build's gates for this work)

| Artifact | Gate |
|---|---|
| `registry.yaml` edit | YAML parses (same parser as review.ts) + before/after grep assertion (old wrong pattern gone) + review.ts dry-run loads it |
| `SKILL.md` edit | referenced pattern IDs exist in the sibling registry; referenced paths exist on disk |
| detector script | `bun tsc` + fixture pair self-test (must-fire / must-not-fire) |
| hook wiring | manual run against a sample edit; latency budget |
| eval runner | golden-task smoke run completes; scoreboard row schema validates |

## KPI reference (measured from Phase 4 on)

L1 idiom correctness (per-pattern pass rate, consistency@k) · L2 artifact integrity
(completeness, registration, scaffold adherence) · L3 composition (citizen-selection
accuracy, over/under-build vs gold, slice-closure, dependency-direction) · L4 requirement
fit (AC coverage, behavioral pass, invention rate, edge-case yield) · L5 UI quality (story
render, token/i18n/locale compliance, a11y, data-ownership, visual fidelity).
Failure routing: L1→registry text · L2→CLI template · L3→ddd-modeling/ui-composition ·
L4→brainstorm/plan skills · L5→frontend skills + lint promotion.

## Out of scope

Go-side refactors (event-birth unification was decided against); the generated ATLAS.md
rendering (optional Phase 3 byproduct); expo locale conventions (expo has no `useLocale`
hook yet — tracked as a Phase 3 item, not silently changed in Phase 0).
