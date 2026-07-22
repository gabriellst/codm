# NOTES — WANT → GOT translation (dashboard pair)

First entry of the want→got corpus. **WANT.md** holds two frozen *backend* read-layer plans; **GOT/**
holds the *frontend* code that consumes those contracts on `feat/template-polyglot`. This file records
what the plan asked, how it became code, and what a future port should **not** carry over.

Every file under `GOT/` is a copy with a `CONTEXT-ORIGIN` header prepended (repo / branch /
source path / role). Purged product vocabulary was renamed to neutral identifiers (product-residue
rail); nothing else in the bodies was edited — read them as ground truth, read this as the map.

---

## 1. Scope of this pair (why a backend plan pairs with frontend code)

The two WANT plans design the reintroduced **`ui` BFF context**: the `GetDashboard` discriminated read,
the persisted `StoreVisualization` setting, and three static promo reads. They stop at the contract — the
Zod output schema, the `kind` discriminator, the section matrix.

GOT is the **other side of that contract**: the React components that render the dashboard by calling the
generated SDK hooks (`useGetDashboard`, `useGetPixelFunnel`). So the pair is a *spec → UI* hop. It is a
faithful want→got precisely because the frontend never re-derives the shape — it imports the SDK types the
plan's schemas generate, so the plan's decisions show up directly as narrowing and field access in the code.

Not everything in GOT traces back to a WANT line — see §4 (the gradient/token system is frontend substrate
the read-layer plans never mention). That asymmetry is itself the lesson: a plan specifies the contract, not
the whole deliverable.

---

## 2. WANT → GOT trace (plan decision → the code it produced)

| WANT (plan) | GOT (code) |
|---|---|
| Plan A §5: one `GetDashboard`, `z.discriminatedUnion('kind', …)` over `SINGLE_GLOBAL / SINGLE_NATIONAL / MULTI_GLOBAL / MULTI_NATIONAL` | `AdditionalCostsSection/index.tsx` narrows on `data.kind === 'SINGLE_NATIONAL' \|\| data.kind === 'MULTI_NATIONAL'` — the union is consumed exactly as designed, with exhaustive per-`kind` access. |
| Plan A §4: `draftOrders` is **NATIONAL-only** and **informational (not summed)** | The `draftOrders` row is `rows.push(...)`ed **only** inside the `*_NATIONAL` branch and is **excluded** from `headerTotal` (`COST_KEYS` sums the five non-draft keys). Comment in the code repeats the rule. |
| Plan A §0/§4: `TallySchema = { count: Metric, value: Metric }`; money leaves are Metrics | Code reads `draftOrders.count.value` (count) and `draftOrders.value.value` (money) and `operational.total.value` — the `{count,value}` and `{value,deltaPct}` shapes land verbatim. |
| Plan A §4: money shape **flips** with `ViewScope` (mono `Metric` → consolidated `CurrencyMetric`), consolidated is a single reporting currency | The component is scope-agnostic: `useMoney()` + `Money { amountCents, currency }` normalizes both. The **stories** exercise the flip — `singleResponse` (mono) vs `multiResponse` (consolidated, "money already converted to a single reporting currency, spec D1"). |
| Plan A §1: **faker-backed** query use cases, real swap later behind the same interface | Frontend renders whatever the read returns; determinism/shape is asserted only in stories via `mockQuery`. The component holds no assumption that the data is real vs faked. |
| Plan A §10 + §4: rename `kpis → stat`, pull `orders` **out of stat into details** | Reflected in the SDK types the components import (`GetDashboard200['additionalCost']`); the additional-costs card reads the `additionalCost` top-level the rename settled on. |
| Plan A §9: `GetPixelFunnel` is its own plan; `viewScope` is **input-only** | `PixelFunnelSection/index.tsx` calls `useGetPixelFunnel({ viewScope, startDate, endDate })` — scope is passed in, never echoed back into the view. |
| Plan A §9: `GetCostBreakdown` **DROPPED** — the cost donut is derived frontend-side | GOT deliberately **omits** any `CostDistributionSection`/breakdown-fetch component. Do not add one (§4). |

### The pixel funnel's own translation decision
`GetPixelFunnel` exposes 8 `PixelEventType` steps; the UI shows a curated **5**. `funnel.ts` encodes that
subset as **wire-key string literals** (`PAGE_VIEWED`, … `CHECKOUT_COMPLETED`) with
`satisfies readonly PixelStepKey[]`, and its comment states *why*: "the SDK exposes no `pixelEventTypeEnum`
value, so we use the wire key literals (still type-checked)". That is a real plan→code gap resolved in code,
not in the spec — worth flagging as the kind of decision a port must preserve (the `satisfies` guard) rather
than silently hardcode.

### UI-only state stayed out of the contract (a "correct omission")
`DiscountCostsToggle.tsx` writes `discountAdditionalCosts` to a **Zustand store**, not a URL param and not a
`GetDashboard` field. The plans never model it — matching the house rule "UI-only display prefs → store, not
a domain field". This pair is a clean example of what a read-layer plan should **leave out**.

---

## 3. The gradient/token system (GOT-only, no WANT line)

`ui/button.tsx`, `ui/gradient-icon.tsx`, `ui/gradient-icon-badge.tsx`, `styles/tokens.css`,
`styles/web-utilities.css` are the styling substrate the funnel + costs cards render on:

- `web-utilities.css` defines the `@utility gradient-box / gradient-bg-* / gradient-border-*` Tailwind-4
  utilities; `button.tsx` composes them per variant (`gradient-box ${primaryBg} ${primaryBorder}`).
- `gradient-icon.tsx` paints an icon with a vertical `currentColor` opacity gradient; `gradient-icon-badge.tsx`
  is the "purple coin" wrapping it — used by `FunnelSummaryStat` and `AdditionalCostsSection`.
- `tokens.css` supplies the palette the above resolve against (`--primary`, `--template-purple`, `--border`, …)
  in light + dark.

None of this appears in the WANT plans — read-layer plans are silent on visual design. It is included in GOT
because the components **do not compile/render without it**, and a corpus example should show the full
deliverable, not just the data-bound parts. Treat it as reusable frontend infra, **subject to §4 rebranding**.

---

## 4. Do NOT copy on port

- **Brand tokens & scope.** `--template-purple` / `--template-green`, the BK purple palette, `fill-template-purple/70`,
  `bg-template-purple/15`, the "purple coin", and every `@codedm/client-typescript/typescript` /
  `@codedm/core-typescript` import specifier are **brand**, not canon. On any port, rebrand the palette and
  swap the SDK scope to the target's (`@berzerk/*` downstream; the template's own scope). The **mechanism**
  (gradient utilities, `GradientIcon` currentColor trick, `satisfies keyof`) is the reusable part.
- **i18n keys** (`pixelFunnel.*`, `dashboard.additionalCosts.*`) are product copy, not structure — don't lift
  the strings, keep the `t(...)` seams.
- **Faker/static payloads.** Per Plan A §1 / Plan B §1 the use-case bodies return faker/static data behind a
  contract that a real Drizzle/CMS read later replaces. Do **not** treat the mock shapes (or the stories'
  inline builders) as the real read model.
- **`CostDistributionSection`.** Intentionally absent (Plan A §9 dropped `GetCostBreakdown`; the donut is
  derived from `stat.costs` + `revenue`/`profit`). Don't reintroduce a fetch for it.
- **The deleted `shared/schemas/ui/` god-file.** Plan A §3 records it was removed and its speculative orphans
  (ProfileAlert/IncomeGraph/SalesBy*/RecommendedApp) dropped — schemas live with their query use case. Don't
  resurrect that layout when reading these plans.
- **Story scaffolding.** `AdditionalCostsSection.stories.tsx` mock builders exist to type-check UI states, not
  to ship — they aren't a runtime data source.

---

## 5. Provenance & fidelity

- WANT.md = `git show feat/template-polyglot:.plans/2026-06-03-get-dashboard-and-ui-context.md` +
  `…:.plans/2026-06-03-dashboard-static-reads.md`, under a corpus header (purged product
  vocabulary renamed to neutral identifiers; otherwise verbatim).
- GOT/ = `git show` of each source path with the same vocabulary sanitization applied (see each
  file's `CONTEXT-ORIGIN` header), grouped as
  `components/` (the four dashboard components + PixelFunnel math/test), `ui/` (the gradient primitives), and
  `styles/` (the two shared CSS files).
- These are reference artifacts, **not wired into any build** — they live under `examples/`, outside every
  workspace `tsconfig` `include`, so they do not participate in `bun tsc` / test / lint.
