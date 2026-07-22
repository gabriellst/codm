# Review-findings corpus — window 2026-06-06 -> 2026-06-13

> Harvested from `bun review` runs + eval-harness graders across the last window.
> Each finding cites the pattern id that fired and the artifact it fired on. This is the
> raw material a `/learnings` pass digests into rung-escalation proposals.
> Pair this with `scoreboard.jsonl` (the same window's measured pass/fail rows) before
> deciding what — if anything — to escalate. Same `docTreeHash` across rows = same-condition
> samples; the canon was present and read in every run below (the task prompts named the
> carrier `CLAUDE.md` first, verified in the transcripts).

---

## F1 — enum labels rendered through a hand-rolled map instead of the i18n catalog

- **Pattern:** `enum#ENUM-P08` (Frontend enum labels via i18n under `enums.<EnumName>.<VALUE>`)
  / axis `CENTRALIZE-MAPS` (owner `enum#typescript`, **rung: docs**). Grader id on the
  scoreboard: `enum#i18n-catalog` + `atlas#CENTRALIZE-MAPS`.
- **Where it fired (5 distinct agent samples, 4 distinct tasks):**
  - `synthetic-react-notifications` (iter2, iter4) — category labels built from an inline
    `const CATEGORY_LABEL: Record<NotificationCategory, string> = {...}` in code; `enums.*`
    subtree never touched. pt.json / en.json missing the keys.
  - `synthetic-react-dashboard-chart` (iter3, iter10) — `recorte` (ChartType) option labels
    hardcoded as Portuguese strings next to the enum values.
  - `synthetic-expo-form-state-subscribe` (iter1) — status labels via a literal `switch` on
    the enum returning hardcoded copy.
- **Canon state:** the enum SKILL.md + ENUM-P08 already say "labels via `enums.<EnumName>.<VALUE>`,
  there is NO `lib/labels.ts`, the namespace also feeds `getEnumLabel`". The doc was
  *rewritten and made louder* one window ago (added the worked `GameGenre` example) and the
  family STILL fires. The carrier was present and read in all 5 transcripts.
- **Note from CORRECTNESS.md:** "the i18n catalog mis-namespacing survived a rewritten doc ->
  became the dynamic-`t()` rule." The dynamic-`t()`-outside-`enums.*` lint rule exists for the
  *mis-namespacing* spelling, but the *hand-rolled-label-map-in-code* spelling above is not yet
  mechanically caught, and no scaffold emits the catalog wiring + seeds the two JSON files.

## F2 — dispatch by `if/else-if` chain across enum members instead of one keyed map

- **Pattern:** axis `CENTRALIZE-MAPS` again (the icon/color/variant-per-enum-value rule);
  grader id `atlas#CENTRALIZE-MAPS`.
- **Where it fired (3 distinct samples, 2 tasks):**
  - `synthetic-react-dashboard-chart` (iter3, iter10) — five chart kinds rendered by an
    inline `if (kind === 'weekday') ... else if (kind === 'region') ...` chain inside one
    component instead of a module-level `Record<ChartType, ElementType>` dispatch.
  - `synthetic-react-notifications` (iter4) — category icon resolved via a ternary chain.
- **Canon state:** documented (the component skill's dispatch-map rule + app-react CLAUDE.md
  "Dispatch maps … keyed by the enum … No `switch`/ternary chains on the value"). Carrier
  present and read. This is the SAME owner/axis as F1 (`CENTRALIZE-MAPS`) — the two are the
  label half and the style-map half of one decision.

## F3 — hardcoded `'pt-BR'` locale literal in an `Intl`/`toLocale*` call

- **Pattern:** axis `LOCALE-MONEY` (owner `app-react#CLAUDE.md`, **rung: detector** — already
  escalated; component `bp-15` detects hardcoded ptBR). Grader id `atlas#LOCALE-MONEY` /
  `component#bp-15`.
- **Where it fired (1 sample):**
  - `synthetic-react-notifications` (iter4) — one `date.toLocaleDateString('pt-BR')` slipped
    through; the detector (`bp-15`) DID flag it as a new finding and the build's `bun detect`
    gate went red. The agent had not run `bun detect` locally before finishing.
- **Canon state:** already at the detector rung. The gate caught it; this is the rail working
  as designed, not a missed escalation.

## F4 — `formatMoney` imported from `@/lib/format` directly inside a component

- **Pattern:** app-react CLAUDE.md "Money" section ("use `useMoney()` in a component — do not
  call `formatMoney` from `@/lib/format` directly"). No grader/axis id — surfaced only by a
  human reviewer comment, not by any mechanical gate.
- **Where it fired (1 sample):**
  - `synthetic-react-dashboard-chart` (iter10) — one `formatMoney(m, locale)` call inside a
    leaf instead of `useMoney()`. Single occurrence, did not recur in any other sample.

## F5 — grader false-positive: `enum#typed-usage` blind to an enum-derived tuple

- **Observation (instrument, not product):** on `synthetic-go-controller-summary` (iter2,
  iter3) the `enum#typed-usage` grep grader (`grep-must enums\.SyncStatus`) reported FAIL even
  though the controller DID use the enum — it referenced the values through
  `enums.SyncStatusValues` (the generated tuple) rather than the bare `enums.SyncStatus`
  member access the regex anchors on. The transcript shows canon-true code; the regex is too
  narrow. This is the same shape CORRECTNESS.md catalogues under "instrument repair is
  first-class … grader regexes blind to equivalent spellings (the SDK's own zod schema,
  enum-derived tuples)".
- **Where it fired:** 2 samples, both `synthetic-go-controller-summary`. Identical mechanism.

## F6 — pattern `RTE-P14` (route breadcrumb shape) has not fired in the window

- **Observation (inversion / retirement candidate):** `route#RTE-P14` appears in zero review
  findings, zero scoreboard `failedGraders`, and zero audit-log mentions across the window.
  Two recent routes that WOULD have triggered it under the old layout instead used the new
  `crumb` static-data shape, which the route scaffold now emits by default — the structural
  change made the rule unreachable. The rule text still describes the pre-scaffold spelling.

## F7 — one-off: a `useState` mirroring a debounced search input

- **Observation (single, non-repeating):** `synthetic-react-state-placement` (iter1) had one
  `useState` holding a debounced copy of the search text that also lived in the URL search
  params (STATE-PLACEMENT case-2-vs-case-5 confusion). It appeared in exactly ONE sample, did
  not recur in iter2 or any sibling task, and the relevant canon (store STR-P10 / the
  five-questions short form in app-react CLAUDE.md) is already at the docs rung with a live
  exemplar. No other sample in the window touched this.
