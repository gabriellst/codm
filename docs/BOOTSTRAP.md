# BOOTSTRAP — MVP Bootstrapping Method (idea → running product)

> The repeatable pipeline for spinning a NEW product off this template. Runs AFTER the ecosystem
> sync program (`.plans/2026-07-11-ecosystem-sync-up.md` + `.plans/2026-07-11-sync-machinery.md`)
> — it assumes the healed canon: `template.config.ts` one-file rebrand, sync-train enrollment,
> generic `billing`/`quota` (Tier-2), Tier-3 exemplars with provenance stamps
> (`docs/ECOSYSTEM.md`).
>
> Source: the founder's Excalidraw flow (2026-07-11). Stages marked ∥ run in parallel once their
> gate opens. Each stage names the skill/tool that executes it.

## The DAG at a glance

```
A1 Idea search → A2 Market research → A3 Product decision ──► B1 PRD ──► B2 Features (commands/queries prose)
                                                                │
                                                                ▼
                                              C DDD Modelling (contexts, screens, commands,
                                                queries, entities, events)  ═══ CONTRACT LOCK ═══
                                                                │
                                                                ▼
                                              C2 Exemplar curation (per-product want→got picks
                                                 from the siblings — founder-reviewed, G3.5)
                                                                │
                                                                ▼
                                              D Scaffold from template (config rebrand, plugs,
                                                contracts, migrations, sync-train enrollment)
                                                                │
                    ┌───────────────────────────────────────────┴──────────────────────────────┐
                    ▼  TRACK W (write side)                                                     ▼  TRACK D (design/read side)
        W1 Write controllers (+ bun sdk)                                    D1 Mobbin research (niche apps, telas interessantes)
                    │                                                       D2 Design system (design only) — PRD tone words in
                    ▼                                                       D3 Screen designs
        W2 Write business logic                                                         │
           (entities, use cases, handlers,                       ┌──────────────────────┴───────────────┐
            projections — TDD)                                   ▼                                      ▼
                    │                                 D4a Design system IN CODE            D4b READ controllers (+ bun sdk)
                    │                                     (primitives, tokens)                 (BFF query per screen)
                    │                                            │                                      │
                    │                                            │                          D5 Read business logic (queries)
                    │                                            └──────────────┬───────────────────────┘
                    │                                                           ▼
                    └───────────────────────────────► E Screens IN CODE, wired to read+write controllers
                                                                                │
                                                                                ▼
                                                            F E2E + /verify → MVP gate
```

## Phase A — Discover (serial)

| Stage | What | Skill / tool | Artifact |
|---|---|---|---|
| A1 | Find **5 ideas** that make sense AND have demonstrated traffic (search volume, communities, competitor revenue signals) | `/saas-research` (4-lens discovery: SEO economics, trends/waves, community pain mining, copy-&-reposition) | `research/ideas.md` — 5 ideas, each with traffic evidence |
| A2 | Market research per idea: competitors, pricing norms, distribution channels, why-now, MRR comps | `/saas-research` steps 3–4 (weighted scorecard + hard vetoes; deep-research harness for extra claim verification) | `research/market-<idea>.md` ×5 + `research/scorecard.md` |
| A3 | **Product decision** | Founder (gate **G1** — human picks; agent recommends, never decides) | one line in the PRD header: what we're building and why it won |

## Phase B — Define (serial)

| Stage | What | Skill | Artifact |
|---|---|---|---|
| B1 | **PRD**: what it is, what it does, who it helps (segment/persona), pricing intent, and **the look in words** — tone adjectives ("luxury", "friendly", "clinical") that later feed D2 directly | `/prd` | `PRD.md` |
| B2 | **Features as commands & queries, in specific prose.** One line each, but concrete: not "should edit videos" — "should trim a video clip to a start/end timestamp and export MP4". Rule of thumb: every line names actor + verb + object + observable outcome. Split reads ("what we can SEE") from writes ("what we can DO") — they become the two tracks. | `/user-stories` (+ the anti-vague rule above) | `PRD.md` §Features (Commands / Queries lists) |

Gate **G2**: founder approves PRD + feature lists.

## Phase C — Model (THE contract lock; serial, everything downstream depends on it)

`/ddd-modeling` (or `/ddd-spec` for the full generated document) over the PRD + features →
**contexts, entities, commands, queries, integration events, enums, AND the screens list**
(each query maps to a screen or section; screens named here are what D3 designs and D4b reads for).

Output lands as the product's modeling spec in `.specs/`, and the cross-boundary parts are
**authored + frozen in `packages/contracts`** (TypeSpec enums + integration events) exactly per
CLAUDE.md "Phase 0 — Contract Lock". **This freeze is what makes Tracks W and D safely parallel**
— both build against the same frozen vocabulary; neither serializes through the other.

Gate **G3**: modeling spec approved; contracts compile (`bun contracts`).

## Phase C2 — Exemplar curation (deliberate, per-product; ~half a day of THINKING, not mechanics)

After C names this product's contexts, commands, and screens: **deliberately pick which want→got
pairs this product learns from.** Not automatic corpus lookup — each sibling does small,
really good things, and the right set depends on what THIS product is. Walk C's outputs against
the seed inventory below (+ `exemplars.yaml` as it grows) and write `research/exemplars.md`:
per screen/command cluster → the chosen pair(s) → why → what to deliberately NOT copy.

**Seed inventory — where each sibling excels:**

| Repo | Small, really good things |
|---|---|
| **clinical fork** | Channel-route discrimination (`@union`/`@variant` payloads) · **SSE** (`ServerEvent` synthesized union + typed `useServerEvents` narrowing) · genuinely distinct UI treatments for **navbar, channel route, account** screens · calendar/scheduling widgets · billing/idempotency discipline |
| **fork e-commerce** (polyglot branch) | **Backend integrations** (IntegrationRegistry tiers, `(type,platform)` factories, handshake/webhook services) · specific components **with unit tests** (`routes/(app)/dashboard/-components`) · beautifully done **system design in primitives** (`app/styles/tokens.css` + `web-utilities.css`, gradient button/icon system) |
| **mobile fork** | The nice, well-organized **mobile app**: expo router structure, sheet shapes (gate/wizard/takeover/drawer), keyboard geometry, perceived-speed kit, mobile-patterns skill |

Both tracks consume the curation: Track W loads the backend pairs (e.g. product has third-party
integrations → the e-commerce fork IntegrationRegistry pair; realtime → the clinical fork SSE pair) and Track D the
UI pairs (dashboard-dense → the e-commerce fork; distinct-per-surface chrome → the clinical fork navbar/account;
mobile → the mobile fork). Gate **G3.5**: `research/exemplars.md` reviewed by the founder — this is a
taste decision, not an agent decision.

## Phase D — Scaffold (one day, mechanical)

1. New repo from template (post-sync: `copier copy` if templatized, else clone + reset history).
2. `template.config.ts`: set scope/module/brand — **one file** (ECOSYSTEM.md P1 principle), regen.
3. Enroll in the sync train + drift CI (add target to template's `sync.yml`; bootstrap
   `.github/workflows/gates.yml`).
4. Tier-2 plugs: `PlanRegistry` (this product's plans/prices), `QuotaKey`s + counters stubs,
   payment adapter choice. Tier-3 exemplar copies (with `CONTEXT-ORIGIN` stamps) only for
   contexts C actually named.
5. `bun cli context` scaffolds per C's contexts; Drizzle schema derived from C's entities
   (`/db-modelling` → `/migrate`); `bun sdk` end-to-end green.

Gate **G4**: fresh repo — `tsc` ✓ `lint` ✓ `test` ✓ `bun sdk` ✓ drift CI enrolled.

## Tracks W ∥ D (the parallel heart)

**Track W — write side (starts immediately at G4; does NOT wait for design):**
- **W1 Write controllers**: `/controller` per command from C, expressive Zod schemas → `bun sdk`
  (contract-lock commit). Frontend can now build against typed hooks even before logic exists.
- **W2 Write business logic**: `/entity` invariants, `/usecase` per command, `/event` +
  `/handler` side-effects, `/projection`+`/projector` where read models need materializing —
  strict TDD, one behavior per task.

**Track D — design/read side (starts at G2/G3 in parallel with C's tail):**
- **D1 Mobbin research**: niche apps + interesting screens for each screen C named
  (`mcp__mobbin__search_{apps,screens,flows}`) → reference board.
- **D2 Design system (design only)**: `/design-system` — PRD tone words + D1 references →
  `SYSTEM.md` tokens/palette/type. No code.
- **D3 Screen designs**: `/prototype` (or hi-fi in the Design project) per screen; then
  `/ui-composition` classifies each into Route/Section/Component/Dialog/Form for hand-off.
- **D4a Design system in code** ∥ **D4b read controllers** (both gated only on D3):
  - D4a: `/primitive` + tokens — SYSTEM.md becomes `components/ui/*` + `app-styles`.
  - D4b: `/query` + `/controller` per screen (BFF: the screen's designed shape defines the DTO —
    this is WHY read controllers wait for screen design while write controllers don't) →
    `bun sdk` regen.
- **D5 Read business logic**: implement the query use cases (direct Drizzle, per-screen DTOs).

**Convergence — E Screens in code**: `bun cli route/component/form` per D3's composition map;
components own their data via SDK hooks (read: D4b/D5; write: W1/W2). Runs ∥ with D5 once D4a +
D4b exist (mock the not-yet-implemented query bodies behind the frozen controller contract).

## Phase F — MVP gate

`/e2e` on the golden paths (signup → core action → billing) · `/verify` end-to-end · full gates ·
aggregate `bun review` — then it's an MVP, and the repo lives on as a normal fork under the
ecosystem rules (upstream-first, drift CI, sync PRs).

## Ordering rationale (why this differs slightly from a naive left-to-right)

1. **Write controllers don't wait for design** — commands come from C, not from screens. Only
   READ controllers wait for D3, because in this architecture a query IS a screen's shape (BFF).
2. **Every controller stage ends in `bun sdk`** — the contract-lock commit is what lets the other
   track consume typed hooks instead of guessing.
3. **C is the single choke point on purpose** (Phase-0 Contract Lock): after it, nothing
   serializes through a shared file again.

## Known gaps to build (once, in the template)

- [x] **`saas-research` skill** (A1–A2) — DONE 2026-07-11: `.claude/skills/saas-research/SKILL.md`
      (4 lenses, weighted scorecard, validation pass bars) built from the micro-SaaS idea-finding
      playbook, which travels with it at `references/playbook.md`.
- [ ] `bun cli` recipe for D4b ("query-from-screen": scaffold query+controller from a
      ui-composition hand-off entry).
- [ ] Bootstrap checklist automation (`bun create-template` already exists — extend to cover
      Phase D steps 2–4).
- [ ] **Exemplar corpus — want→got pairs** (`examples/` + `exemplars.yaml` in the template).
      NOT an archetype taxonomy — no two products' screens are equal; what transfers is the
      **translation from a specific need to code under this architecture**. Each exemplar is a
      worked pair:
      - **WANT** — the real intent artifact that motivated the code: PRD excerpt, spec section,
        `/ui-composition` hand-off, screen design, or plan Task (what was needed, tone,
        constraints, data shape);
      - **GOT** — the resulting code, provenance-stamped (`CONTEXT-ORIGIN: <repo|branch>@<sha>`);
      - **NOTES** — the translation decisions (what the architecture forced, what was invented,
        what was rejected).
      Matching is by **similarity of need**, not category: Track D agents read the pairs whose
      WANT resembles their current want before designing/coding. Pairing intent with outcome is
      what makes an example steerable instead of copy-bait; the evidence that examples work is
      already in-house (plan-skill sibling reads, `snippet.exemplar`, the clinical fork's own-barrel
      inlining fix, the 2026-07 extraction probes).
      **First pairs to curate** (both sides already exist on this repo's `feat/ecommerce-fork-polyglot`
      branch; paths verified 2026-07-11): the dashboard — WANT =
      `.plans/2026-06-03-get-dashboard-and-ui-context.md` +
      `.plans/2026-06-03-dashboard-static-reads.md`; GOT =
      `packages/app/react/src/routes/(app)/dashboard/` (`PixelFunnelSection`,
      `FunnelStageColumn`, `FunnelSummaryStat`, `AdditionalCostsSection`, `-stores/`) with
      `packages/app/styles/{tokens.css,web-utilities.css}` and the gradient system
      (`components/ui/button.tsx` `gradient-bg-[…]`/`gradient-border-[…]`, `gradient-icon.tsx`,
      `gradient-icon-badge.tsx`). Then: the clinical fork scheduling/calendar + billing screens (WANT
      from its specs), the mobile fork sheets/keyboard flows (WANT from the S-01..S-13 specs +
      UI-ANALYSIS frames). Native desktop (Tauri/Electron) stays out of scope until a product
      needs it — the e-commerce fork + the clinical fork web dashboards ARE the desktop-class examples.
