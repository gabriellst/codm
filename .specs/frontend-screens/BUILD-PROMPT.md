# Prompt — Build all BK Dash `/app` screens (spec + ui-composition → plan → build → visual match)

> A working prompt for this effort (not a project command). Hand the relevant slice to an agent.
> Goal: build every `/app/...` screen so it **matches its HTML reference**, is composed of the
> citizens in its spec's `## UI Composition`, owns data correctly (sections call the SDK; leaves take
> props), and is fed by the spec's `## Controller Contract` queries — with a **Storybook story for
> every component** and a final visual match against the reference.

## Inputs (read these first)

- **Screen specs** — `.specs/frontend-screens/`. Start with **`_schema-fundamentals.md`** (the shared
  atoms: `NumberMetric`/`MoneyMetric`/`Money`, enums, `Segmented<Enum>`, the rules) and
  **`SPECS_INDEX.md`** (the full screen list + the consolidated **Controller Registry** — which controllers
  already exist vs. which to create). Each `<area>/SPEC.md` has `## UI Composition` (Component Tree +
  Anatomy + Data Cards + Reuse Summary + Hand-off) and a `## Controller Contract`.
- **Visual references** — `/Users/work/Desktop/Projetos/bk-company/bk-dash-frontend/docs/bkdash/app/<area>/htmls/*.html`.
  These browser-captured snapshots are the **source of truth for the visuals** (the specs were generated
  from them). They link Next.js assets that may 404 standalone — the inline styles + DOM structure +
  Tailwind classes are still the reference; read them for exact spacing/typography/tokens.
- **Project conventions** — `CLAUDE.md`, `docs/FRONTEND.md`, `docs/CLI.md`. Money renders via
  `useMoney()`; data flows only through the SDK; **frontend artifacts are scaffolded via `bun cli`**
  (route/component/store/form/primitive) — this is **enforced by `validate-plan` PR-27**, never
  hand-write a scaffoldable artifact.

---

## Phase 0 — Cross-screen shared analysis (do ONCE, before any screen)

Build the shared layer first so screens compose it instead of duplicating it.

1. Read **every** screen spec listed in `SPECS_INDEX.md` — each one's `## UI Composition` (Component
   Tree, Reuse Summary, Hand-off) + `## Controller Contract` — and the Controller Registry in `SPECS_INDEX.md`.
2. Produce a **Shared Inventory** (write it to `.specs/frontend-screens/SHARED-INVENTORY.md`):
   - **Reuse (already built)** — components in `@/components/` to consume as-is: `Header`, `Navbar`,
     `StatCard`, `DataTable`, `DataError`, `RouteError` (+ `@/components/ui/*` primitives). Cite each.
   - **Promote-to-shared** — any citizen appearing in **≥2 screens** that isn't shared yet (KPI/stat
     leaves, chart widgets, period/date-range pickers, common dialogs, the store/tenancy switcher,
     `MoneyMetric`/`NumberMetric` display cells, segmented breakdown rows, etc.). Each becomes
     `@/components/<Name>/` (dialogs → `@/components/Dialogs/<Name>/` + barrel). List its consumers.
     The specs' **Reuse Summary** already flags many — consolidate them, don't re-decide per screen.
   - **Shared queries/controllers** — reuse the existing ones (`GetUserInfo`, `ListNotifications`,
     `ListOrders`, …); the decomposed dashboard controllers (`GetFunnel`, `GetIncomeGraph`,
     `GetProductRanking`, …) are per-screen. **Never redefine an existing controller.**
3. **Build the shared components first** (each via `bun cli component`/`primitive` → Storybook story),
   then proceed to screens. Emit an **ordered build list**: shared layer → `/app` Dashboard (shares the
   most) → the rest, foundational/simple before complex.

---

## Per-screen pipeline (repeat for each screen, in the Phase-0 order)

For screen `<route>` with spec `<spec>` and references `<htmls>`:

### 1 — Analyze the data
Read `## Controller Contract` + `### Data Cards`. List every query the page and each component needs.
Tag each citizen **owns-query (Section)** vs **receives-props (Leaf)** straight from the Data Cards
(`Data:` field). This is the contract for steps 2–5.

### 2 — Create the query use case(s) [backend, scaffold-first]
For each BFF query in the Controller Contract **not already in the registry**:
- `bun cli query <Name>` → mutate its Output schema to the contract (consume `_schema-fundamentals`
  atoms: `NumberMetric`/`MoneyMetric`/`Money`/`Segmented<Enum>` + enums). Add its controller.
- Regenerate the SDK (`bun sdk`) so the frontend gets the typed hook (Contract Lock).
- Reuse existing controllers as-is.

### 3–5 — Plan → Build the UI (Storybook + actual)
Run the project flow per screen:

- **`/plan <spec>`** → produces scaffold-first tasks (PR-27) ordered leaves → sections → route →
  dialogs/forms, each as `bun cli` scaffold + a full proposed-file (no diffs). Re-validate against
  current `main` (the route may already exist → Modify, not recreate).
- **`/build <plan>`** → scaffold → proposed-file → spec-compliance MATCH → commit per Task. Build with:
  - **Leaves** (`bun cli component … --recipe=card`): props-only, no SDK; Storybook story driven by
    **args** (one story per visual state from the spec's "Inventário de Estados").
  - **Sections** (`--recipe=section`): own their SDK query (`useGetX`), read URL search / stores; render
    inline skeleton + empty + error. Storybook story uses the project's **connected-component pattern**
    — MSW handler for the SDK call + a `QueryClient` + a stubbed TanStack router (see the memory
    `storybook-data-components-msw` and `givenStores` helpers). Mock data must match the new
    `MoneyMetric` shape (`{ value: { amountCents, currency }, deltaPct }`), not bare numbers.
  - **Route** (`bun cli route` or Modify the existing): thin shell, search-param contract, mounts sections.
  - **Forms/Dialogs** via `/form` (TanStack Form + SDK schema) and `useDialogStore`.
  - Conventions: money → `useMoney()`; enums → SDK enum + labels map (no hardcoded option lists);
    i18n via `--i18n` keys; **no `data` prop drilling**; leaves never re-fetch.

### 6 — Visual iteration vs the HTML reference (Playwright)
Loop until the Storybook render is **very similar** to the reference:
1. Open the reference: Playwright MCP `browser_navigate` → `file://<htmls>/<state>.html` →
   `browser_take_screenshot` (resize to 1440×900). If assets 404, also **read the HTML** for the exact
   Tailwind classes / CSS tokens / spacing the styling must match.
2. Start Storybook (`cd packages/app/react && bun storybook`, port 6006) → `browser_navigate` to the
   component/section story (and the assembled route) → screenshot.
3. Diff by eye: layout, spacing, grid, typography, color tokens, icon set, states. Fix the
   component/section; re-screenshot. Iterate **story-level first** (each section), then the **assembled
   route**. Match the screen's main state + the key states from "Inventário de Estados".

---

## Definition of done (per screen)
- `/plan` validates (PR-18..27); `/build` green — `tsc` + `lint` + tests + spec-compliance MATCH per Task.
- **Every UI-Composition citizen exists with a Storybook story** (leaves = args; data components = MSW).
- The route renders the assembled screen; **Storybook ↔ HTML visual match confirmed via screenshot**.
- Shared components are **reused**, not duplicated; no existing controller redefined; no hand-written
  scaffoldable artifact (PR-27 clean).
- One commit per Task; the screen's commits land on the working branch.

## Reminders
- **Phase 0 first** — shared components + the shared inventory before any screen.
- **Wrap `/plan` then `/build`** per screen; the visual loop is the screen's acceptance gate.
- **Scaffold-first** — every component/route/store/form/primitive starts from `bun cli`.
- **Don't** redefine existing controllers, prop-drill data, or hardcode enum option lists.
