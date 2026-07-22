<!--
  CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-l5-learnings-meta
  task:        synthetic-l5-learnings-meta
  stamp:       ladder-synthetic-l5-learnings-meta
  docTreeHash: 21385794902e
  model:       sonnet
  graded:      2026-06-13T20:14:57.195Z
  source:      .learnings/synthetic-l5-learnings-meta/proposals.md (archived eval build, applied at HEAD)
  Verbatim extract of the archived eval build — NOT a live module. Do not import it.
-->
# /learnings meta-pass — synthetic-l5 window proposals
# Window: 2026-06-06 → 2026-06-13 · docTreeHash: a91f7d3e0b22 (all rows same-condition)

---

## Findings Triage

| Finding | Pattern / Axis | Current rung | k (valid scoreboard samples failing) | Verdict |
|---------|---------------|--------------|--------------------------------------|---------|
| F1 | `CENTRALIZE-MAPS` (label half) · owner `enum#typescript` · graders `enum#i18n-catalog` + `atlas#CENTRALIZE-MAPS` | docs | **5** — rows 1–5 (notifications×2, dashboard-chart×2, expo-form-state-subscribe×1); 4 distinct tasks; all same docTreeHash; canon present and read in all transcripts; doc already rewritten louder one window prior | **ESCALATE** |
| F2 | `CENTRALIZE-MAPS` (dispatch-map half) · same owner `enum#typescript` · grader `atlas#CENTRALIZE-MAPS` | docs | **4** — rows 1–4 (notifications×2, dashboard-chart×2); 2 distinct tasks; same docTreeHash; same family as F1, counts toward the same axis | **ESCALATE** (same proposal as F1 — one axis, one escalation) |
| F3 | `LOCALE-MONEY` · owner `app-react#CLAUDE.md` · graders `component#bp-15` + `atlas#LOCALE-MONEY` | **detector** | 1 (row 2 only) — `bun detect` gate went red and flagged the new finding; the rail caught it before merge | **NO-ACTION (rail working)** |
| F4 | No axis/grader id — human review only (`app-react#CLAUDE.md` "Money" section) | docs (implicit, no axis entry) | 0 on scoreboard (surfaced by human reviewer, single occurrence) | **NO-ACTION (k=1 noise)** |
| F5 | `enum#typed-usage` grader (instrument) — blind to `enums.SyncStatusValues` tuple spelling | n/a (instrument, not a product rung) | 2 (rows 6–7, `synthetic-go-controller-summary`×2) — canon-true code confirmed in transcripts; the grader regex is too narrow | **INSTRUMENT-REPAIR** |
| F6 | `route#RTE-P14` (breadcrumb shape rule) | docs | 0 — zero appearances in scoreboard `failedGraders`, zero review findings, zero audit mentions; scaffold now emits the `crumb` shape by default, making the old rule structurally unreachable | **RETIRE** |
| F7 | `STATE-PLACEMENT` · owner `store#STR-P10` · grader `store#STR-P10` | docs | 1 (row 8 only — `synthetic-react-state-placement` iter1 failed; iter2 in row 9 passed); non-repeating single | **NO-ACTION (k=1 noise)** |

---

## Proposals

### P-001 — CENTRALIZE-MAPS: escalate from docs to scaffold (rung 1) + detector (rung 2)

**Findings addressed:** F1 + F2 (one axis, one escalation)

**Owner anchor:** `enum#typescript` (axis `CENTRALIZE-MAPS`, `.claude/atlas/axes.yaml`)

**Target rung:** Rung 1 (scaffold / Eliminate) ranked first; Rung 2 (detector / Detect) as the complementary gate.

**Mechanism:**

1. **Scaffold — `bun cli` `--labels` flag (rung 1 / Eliminate).**
   The `bun cli` enum recipe gains a `--labels` flag that, when a component or section is scaffolded against an enum, automatically:
   - emits the `t('enums.<EnumName>.<VALUE>')` call-site wiring instead of an inline map;
   - seeds the two catalog files (`src/locales/pt.json`, `src/locales/en.json`) with the `enums.<EnumName>.*` subtree keys.

   CORRECTNESS.md §1 rung-ladder row names this mechanism verbatim: "`--labels` writes the t() wiring + seeds the catalog." This eliminates the mis-spelling at source: the builder cannot hand-roll a label map if the scaffold already emitted the correct wiring.

2. **Detector for the hand-rolled-map and if/else-dispatch spellings (rung 2 / Detect).**
   A new grader/detector pattern added to `scripts/detectors/` (or to the existing CENTRALIZE-MAPS detector if one exists) with two checks:
   - **label-map-in-code:** `grep-must-not` matching `Record<[A-Z]\w+,\s*string>\s*=\s*\{` inside component `.tsx` files (catches the inline `const CATEGORY_LABEL: Record<NotificationCategory, string> = {...}` shape).
   - **if-else dispatch chain on enum:** `grep-must-not` matching three or more consecutive `if \(\w+ ===` / `else if \(\w+ ===` lines inside a single component (catches the `if (kind === 'weekday') ... else if (kind === 'region')` dispatch anti-pattern).

   The detector targets `packages/app/react/src/**/*.tsx` and `packages/app/expo/**/*.tsx`. It baseline-ratchets pre-existing debt so only new violations gate.

**Rationale (escalation policy):** k=5 valid same-condition samples (docTreeHash `a91f7d3e0b22`) across 4 distinct tasks; canon present and read in every transcript; the doc was already rewritten louder one window prior. CORRECTNESS.md escalation policy: "when a documented canon fails k ≥ 2 valid measured samples with the canon present and read, it escalates — to a detector, a scaffold, or a type — never to 'rewrite the doc louder.'" Scaffold outranks detector on the rung ladder (p ≈ 1.0 vs p ≈ 1.0 at merge, but scaffold eliminates the cause while the detector catches it after the fact). Both are proposed because the scaffold covers net-new code while the detector guards against inline drift in existing files.

**KPI impact:** Streak ↑ (removes the most-fired grader family from the scoreboard); Attempts ↓ (eliminates the fix-loop iteration for this family); Presence ↓ (the scaffold means the human reviewer no longer has to catch label maps in code).

**reversible:** easy (additive: new CLI flag + new detector pattern; no existing file deleted or replaced)

---

### P-002 — INSTRUMENT-REPAIR: generalize `enum#typed-usage` grader regex to cover enum-derived tuples

**Finding addressed:** F5

**Owner anchor:** `enum#typed-usage` grader (instrument file, `scripts/skill-evals/tasks/synthetic-go-controller-summary.yaml` or the grader specification it references)

**Target rung:** n/a (instrument repair, not a product rung change)

**Mechanism:** Replace the current narrow regex anchor:

```
grep-must: enums\.SyncStatus
```

with a prefix-tolerant form that matches both direct member access (`enums.SyncStatus.ACTIVE`) and the generated tuple spelling (`enums.SyncStatusValues`):

```
grep-must: enums\.SyncStatus
# generalize to prefix: enums\.SyncStatus(?:Values|[.\s\[])
```

The change is one regex line in the grader spec. It should also be applied prospectively to any other `enum#typed-usage` grader that anchors on `enums\.<EnumName>` without accounting for the `Values` tuple sibling — both spellings are generated by the codegen pipeline and are semantically equivalent uses of the enum.

**Rationale:** k=2 samples on `synthetic-go-controller-summary` (rows 6–7), same docTreeHash. Transcript forensics confirmed the builder produced canon-true code; the regex did not match the generated-tuple spelling. CORRECTNESS.md §3: "Instrument repair is first-class … grader regexes blind to equivalent spellings (enum-derived tuples)." This is exactly the catalogued failure mode. Fixing and generalizing the regex is the correct action; no product or doc change is warranted.

**KPI impact:** Streak ↑ (removes false-positive fails from the scoreboard for the Go controller task); Attempts ↓ (builders do not re-loop to satisfy a grader whose anchor is too narrow).

**reversible:** easy (single regex edit in the grader spec; the change only widens the match set, never narrows it)

---

### P-003 — RETIRE route#RTE-P14: deprecate with dated callout

**Finding addressed:** F6

**Owner anchor:** `route#RTE-P14` (within `.claude/skills/route/react/registry.yaml` or `SKILL.md` — whichever file contains the RTE-P14 breadcrumb-shape rule)

**Target rung:** retirement (rule becomes structurally unreachable; rung is moot)

**Mechanism:** In the route skill file that contains RTE-P14, replace or wrap the rule body with a deprecation callout:

```markdown
> **Deprecated 2026-06-13:** the route scaffold (`bun cli route`) now emits the `crumb`
> static-data shape by default, making this pre-scaffold spelling structurally unreachable
> in any scaffold-generated route. Retain this note for audit trail. Do not apply this
> pattern to new routes — the scaffold is the canonical source of the correct shape.
```

Per learnings.md §2.6: "Do NOT just delete — leave the old guidance with a `> Deprecated since <date>: <reason>` callout so the reasoning trail is preserved."

**Rationale:** Zero appearances in the window (zero scoreboard `failedGraders`, zero review findings, zero audit mentions). Two recent routes that would have triggered it under the old layout used the scaffold-emitted `crumb` shape instead. The structural change made the rule unreachable: the scaffold is the rail (rung 1), and a docs rule for a shape the scaffold never emits is dead weight. Learnings §2.6 inversion check: "BPs that haven't fired in N+ sessions … maybe the underlying issue was addressed structurally." Retiring it also prevents a future builder from applying an obsolete pattern when they find the rule text and the scaffold disagrees.

**KPI impact:** unmeasurable — judgment change (no scoreboard grader to delta against; the benefit is reduced doc corpus size and no contradicted scaffolding guidance).

**reversible:** easy (callout annotation only; the text is preserved, not deleted; reversible by removing the callout)

---

## Deliberately Not Acting

**F3, F4, F7 are left without a new rail.**

**F3 (LOCALE-MONEY, k=1 at detector rung):** The `LOCALE-MONEY` axis is already at the detector rung; `component#bp-15` fired correctly and `bun detect` went red before merge — the rail worked exactly as designed. Escalating a rung-2 axis that caught its violation is not warranted; CORRECTNESS.md §3 "consistent fail → fix at the rung" does not apply when there is no consistent fail, and learnings.md Phase 3 "Rule-rung review" asks "can it move UP the ladder?" only when the current rung's gate is not effective. It was effective here.

**F4 (formatMoney direct import, k=0 on scoreboard):** This surfaced via a single human reviewer comment with no corresponding grader or axis. k=0 on the scoreboard means there is no measured evidence of recurring agent failure — adding a detector or doc edit for a human-only, single-occurrence observation is the "treat every one-off as a pattern" anti-pattern that learnings.md §Anti-Patterns explicitly forbids. The `app-react#CLAUDE.md` "Money" section already covers this; no change is warranted.

**F7 (useState mirror, k=1 non-repeating):** A single failing sample on `synthetic-react-state-placement` iter1 that self-resolved in iter2 (row 9 passed). CORRECTNESS.md §3.5 convergence criterion: "remaining misses are non-repeating singles — no grader fails twice in a row." This is exactly that. The `store#STR-P10` canon plus the five-questions short form in `app-react#CLAUDE.md` is already at the docs rung with a live exemplar. Adding a new rail for a non-repeating single would be overfitting to noise — the same thing CORRECTNESS.md §3.5 names as "fixing a non-repeating single is overfitting to noise."
