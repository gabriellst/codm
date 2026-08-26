---
name: ui-composition
description: Classify a UI screen (image / wireframe / mockup) into the 6 architectural citizens (Route Shell, Section, Component, Leaf, Dialog, Form) plus data cards, reuse decisions, ASCII layout map, and hand-off list. Produces the `## UI Composition` section to be appended to a spec in `.specs/`. Use when starting UI work from a visual artifact or when refactoring an existing screen.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before producing the section
> 2. **`bad_practices`** — keep these violations in mind while classifying

# UI Composition Skill

Produces a structured `## UI Composition` markdown section that turns a visual screen artifact into an architectural plan downstream skills (`/route`, `/component`, `/form`, `/store`, `/primitive`) can execute.

## When to Use

- A screenshot, wireframe, mockup, or detailed visual description of a UI screen is the starting point
- `/brainstorm` is producing a spec for UI work and the agent needs to lock the component tree
- Refactoring an existing screen — input is the current screenshot + desired changes

## When NOT to Use

- Pure backend work — use `/brainstorm` + appropriate backend skills directly
- Creating a primitive component in isolation — use `/primitive`
- Implementing already-classified components — use `/route`, `/component`, `/form`, `/store`
- Generating mockups from user stories (the inverse direction) — use `/prototype`

## Inputs

At least one source artifact is required — **image**, **HTML**, or both. Other inputs are always optional.

- **Image** (optional) — attached to the conversation, or a path to a PNG/JPG/PDF (read with the `Read` tool)
- **HTML** (optional) — a path to an `.html` file. When present, it gives you exact DOM hierarchy, class names, ARIA attributes, and text content — ground truth for classification and slot trees.
- **Optional spec context** — the existing `.specs/YYYY-MM-DD-<slug>-design.md` (Goal, Decisions, User Stories)
- **Optional user stories** — extracted from the spec or provided inline

### Preparing the source artifact

How you proceed depends on which artifacts the user provided:

| You have | Do this |
|---|---|
| Image only | Work from the image. Read its text content carefully — KPI labels, button copy, and headers will be reused verbatim in ASCII mockups. |
| HTML only | **Open the HTML in Playwright and take a screenshot first.** You need both the picture (for proportions, emphasis, "which one is highlighted") and the markup (for exact DOM/text/ARIA). Once you have the screenshot, treat it as the `Image + HTML` case. |
| Image + HTML | Use both. Image gives you fast orientation and visual emphasis cues (selected state, relative panel widths). HTML gives you exact text, structural hierarchy, and ARIA — pull mockup copy and slot names from the HTML, not from your visual recognition of the image. |

**Playwright screenshot recipe** (HTML-only case):

1. Use the Playwright MCP browser tools: `browser_navigate` to a `file://` URL pointing at the local HTML, then `browser_take_screenshot` with `fullPage: true`.
2. If the HTML references relative assets (images, CSS, fonts) that aren't local, the screenshot will be partial — that's OK. Re-render after `browser_resize` to a desktop width (1440×900 is the canonical viewport) so layouts that depend on `md:`/`lg:` breakpoints render correctly.
3. Save the screenshot alongside the spec (`.specs/<slug>/source-screenshot.png`) and reference it from the spec's `Context` section as the captured artifact.
4. Then proceed with the normal process below.

## Outputs

A single markdown block titled `## UI Composition` containing **seven sub-sections** in this order:

1. **URL Contract** — path, search params with schema sketch, breadcrumb, `errorComponent`
2. **ASCII Layout Map** — nested rectangles named with the component, no internal detail, dialogs/overlays in a block below
3. **Component Tree** — indented textual hierarchy with role annotations
4. **Component Anatomy** — per-citizen visual tree: layout container, slots, sub-elements, primitives, variants
5. **Data Cards** — table or per-node block covering all obligatory fields
6. **Reuse Summary** — list of `reuse` / `promote-to-shared` / `create-new-shared` / `create-route-local` decisions with rationale
7. **Hand-off** — ordered table of skills to invoke during `/build` with path proposals

## Process

Run these 8 steps in order. Each step's output feeds the next.

### 1. Identify boundaries

Walk the source artifact and mark each **discrete visible region**. Examples of a boundary: a card, a list of items, a sidebar, a filter row, a modal sketch, a button group, a tab strip. Implicit boundaries also count — a "+ Novo X" button implies a Dialog overlay even if it's not drawn.

- **Image-only:** scan top-to-bottom, left-to-right; number boundaries on a mental copy of the image (do not annotate the file).
- **HTML available:** walk the DOM in source order. Each `<section>`, `<aside>`, `<article>`, or `<div>` carrying a layout class (`grid`, `flex`, `card`) is a candidate boundary. Repeated children of the same shape are the Leaves of a Section. Use the screenshot as a cross-check that you haven't missed an overlay or a visually distinct grouping that the DOM merges into one container.

### 2. Classify each boundary

Apply the **Visual Cue Catalog** + **Citizen Taxonomy** rules. Every boundary gets exactly one of the 6 citizens:

- `Route Shell` — URL contract + layout; **never fetches data**
- `Section` — container that orchestrates **≥3 distinct sub-components** OR is the sole data-fetching root of a region. Sufixo `Section` é convenção, não obrigatório (`ChatPanel`, `ChatSidebar` são Sections sem sufixo)
- `Component` — single-purpose, owns its own data/state, renders once, does NOT orchestrate ≥3 distinct children
- `Leaf` — receives item via prop, rendered N times inside a `.map()`
- `Dialog` — self-contained modal; opened via `useDialogStore.show(...)`; no `open`/`onOpenChange` props
- `Form` — TanStack Form + SDK schema; Type A (standalone), B (wizard step), or C (inside Dialog)

When a boundary doesn't fit, flag it as an Open Question in the final section with a proposed classification.

### 3. Build the component tree

Top-down: Route Shell → Sections → Components/Leaves → Dialogs/Forms. Leaf components colocate under the parent that owns the list query. Dialogs go in a separate `Overlays` block below the main tree (they are mounted by `useDialogStore`, not by the parent visually).

### 4. Draw the anatomy of every citizen

For each citizen except `Route Shell`, write an **anatomy tree**: the visual layout container, the named slots (header, body, action, etc.), the leaf elements (icon, label, value, badge), and the primitive each maps to. This is the bridge between the citizen classification and the actual JSX a downstream skill will emit. See the **Component Anatomy Schema** below for the exact format.

### 5. Fill the data card for every node

Walk every node and complete the **Data Card Schema**. Specifically: data source, URL r/w, store r/w, useState, ARIA, file path, downstream skill.

### 6. Reuse search

For each node, grep against the four tiers:

```bash
ls packages/app/ui/src/components/                   # primitive
ls packages/app/react/src/components/                      # shared (excl. ui, Dialogs)
ls packages/app/react/src/components/Dialogs/              # shared dialogs
find packages/app/react/src/routes -type d -name -components  # route-locals
```

Search by name and by shape-of-props. Sinônimos para considerar: `Card`/`Item`/`Row`, `Panel`/`Widget`, `Bar`/`Header`/`Toolbar`. Compare props shape (visible fields) — if ≥70% overlap with an existing component AND it appears in ≥2 routes, it is a promotion candidate.

### 7. Reuse decision per node

For each node, record one of:

- `reuse` — existing primitive/shared/route-local fits as-is
- `promote-to-shared` — similar shape exists in ≥2 routes; extract to `@/components/<Name>/` (or `@/components/Dialogs/` for dialogs)
- `create-new-shared` — no existing match but props are generic enough to live cross-route
- `create-route-local` — domain coupled; lives under the route's `-components/`

Always cite the existing path (for `reuse`/`promote-to-shared`) or list ≥2 hypothetical consumers (for `create-new-shared`).

### 8. Emit the section

Produce the `## UI Composition` markdown block following the **Output Template** below. Seven sub-sections in fixed order. Append to the spec file under the appropriate location (usually right after `## Acceptance Criteria`).

## Citizen Taxonomy

Six citizens. Each corresponds to a file/folder created by exactly one downstream skill.

| Citizen | Skill | Folder pattern | Renders | Owns data? | Notes |
|---|---|---|---|---|---|
| Route Shell | `/route` | `routes/.../index.tsx` or `route.tsx` | Once | No (loader OK, but does NOT fetch lists for children) | URL contract + layout |
| Section | `/component` (sufixo `Section` convencional) | `routes/.../-components/<Name>/` OR `@/components/<Name>/` if shared | Once | Yes — owns a query + orchestrates ≥3 sub-components OR is data root for a region | Renders own skeleton/empty/error inline |
| Component | `/component` | same as Section but without orchestration role | Once | Yes — own URL r/w, own SDK hook, OR receives nothing | Use when boundary has 0-2 distinct sub-components |
| Leaf | `/component` | colocated under the Section that owns the list | N times | No (props only) | May own mutations (delete button on a row), MUST NOT re-fetch the item |
| Dialog | `/component` (uses `useDialogStore`) | route-local: `routes/.../-components/<Name>Dialog/` · shared: `@/components/Dialogs/<Name>Dialog/` with barrel export | On-demand | Yes — owns its mutation; may contain a Form | Opened via `useDialogStore.show(<X />)`; never receives `open`/`onOpenChange` |
| Form | `/form` | inside a Dialog (Type C), in a wizard step (Type B), or standalone (Type A) | Once | Yes — owns mutation | Validators from SDK schema |

### Section vs Component — the explicit rule

A boundary is a **Section** if AND ONLY IF at least one of the following holds:

1. It orchestrates **≥3 distinct sub-components** (children of different kinds — a header + a filter + a list, not just 3 cards)
2. It is the **sole data-fetching root** of a screen region (everything below it consumes that region's data via props)

Otherwise it is a **Component**. Specifically:

- A standalone search input that writes URL → **Component**
- A pagination control → **Component**
- A tab strip → **Component**
- A filter dropdown → **Component**
- A single stat card → **Component**
- A list of 3 stat cards → **Section + Leaf** (the Section owns the stats query, the StatCard is the Leaf)

### Store as attribute

Zustand stores are NOT a citizen on the tree — they are an **attribute** of the citizen that reads/writes them. Stores are introduced when the analysis reveals interactive state shared between ≥2 components that should not live in URL search params (typing indicator, presence, sidebar collapse with persist, multi-step navigation index).

## Visual Cue Catalog

Each row maps a visible pattern to a citizen with attributes. Cite the codebase reference for fastest grounding.

| What you see | Citizen | Typical attributes | Reference |
|---|---|---|---|
| Header (title + 1-2 action buttons) | Route Shell static UI | no data; buttons may call `useDialogStore.show(...)` | `routes/(app)/patients/index.tsx` |
| Grid/list of N identical items | Section + Leaf | parent owns list query; Leaf receives item via prop | `routes/(app)/patients/-components/PatientListSection/` + `PatientRow/` |
| Container with ≥3 distinct sub-components | Section | usually owns one or more queries | `routes/(app)/dashboard/-components/AppointmentsSection/` |
| Master + detail panel | 2 Sections side by side | URL `selectedId` (or similar) | `routes/(app)/channel/chat/-components/ChatSidebar/` + `ChatPanel/` |
| Filter bar isolated | Component (Section if ≥3 sub) | reads/writes URL search params; uses `useDebouncedSearch` for text input | `routes/(app)/agenda/-components/FilterBar/` |
| Search input isolated | Component | URL `search` via `useDebouncedSearch` | `routes/(app)/patients/-components/PatientListSection/SearchRow/` |
| Pagination | Component | URL `page`, `pageSize`; uses primitive `Pagination` | (canonical: any list page) |
| Tabs / segmented control | Component | URL `tab` (or named param); uses primitive `Tabs` | — |
| Stats / KPI cards (≥2) | Section + Leaf | stats query → N cards | `routes/(app)/patients/-components/StatsSection/` |
| Calendar rendering events | shared Component (Section if owns query) | feeds via props; owns view state via store | `@/components/CalendarWidget/` |
| Dialog used in 1 route | route-local Dialog | `useDialogStore.show()`; owns form | `routes/(app)/collaborators/-components/InviteDoctorDialog/` |
| Dialog used in ≥2 routes | shared Dialog | `@/components/Dialogs/<Name>/`; barrel export added | `@/components/Dialogs/CreateAppointmentDialog/` |
| Multi-step wizard | Form Type B | parent `useForm` + N step sub-forms + navigation store | `routes/onboarding/` |
| Step indicator / step nav | Component | renders once | `routes/onboarding/-components/StepIndicator/` |
| Form standalone (sign-in / sign-up) | Form Type A | dedicated route + `<X>Form` + `<X>Sidebar` | `routes/sign-up/-components/SignUpForm/` |
| App-wide sidebar (collapsible) | shared Component + Store | `persist` middleware | `@/components/Navbar/` + `stores/useSidebarStore.ts` |
| App-wide header (notif + profile) | shared Component | composes notifications + user popover | `@/components/Header/` |
| Empty / skeleton / error inline | **variant** of the data-owning node | NOT a separate citizen | every Section in the codebase |
| Action button "+ Novo X" | Component (action) → opens Dialog | `useDialogStore.show(<CreateXDialog />)` | `routes/(app)/patients/-components/PatientListSection/` |
| Three-dot row context menu | Component → opens Dialog | `useDialogStore.show(<UpdateX/Delete...Dialog />)` | `routes/(app)/channel/chat/-components/ChatSidebar/ChatListItem/ChatRowContextMenu.tsx` |
| Presence / typing indicator | Component + Store | Zustand ephemeral state | `routes/(app)/channel/chat/-hooks/useChatPresence.ts` + `useChatStore` |
| Date range picker | Component | `useRangeSearchParams` | `routes/(app)/dashboard/-components/AppointmentsSection/` |
| Detail header (entity name + actions) | Section | owns a `useGet<Entity>` query | `routes/(app)/patients/$patientId/-components/PatientHeaderSection/` |
| Right-column card stack | Section (parent) + N Cards (Components) | parent owns multiple queries OR one composite query | `routes/(app)/patients/$patientId/-components/RightColumnSection/` |

When the screen has a pattern not on this table, fall back to the Citizen Taxonomy decision rules.

## Component Anatomy Schema

Every citizen except `Route Shell` gets an **anatomy block**. The Component Tree says *what's a citizen*; the anatomy says *what's inside it* — the visual sub-elements, their layout, and which primitive each one maps to. Without this, the downstream `/component`, `/form`, and `/primitive` skills have to re-invent the shape from scratch.

### Format

Each anatomy block has **two fenced code blocks** in this order:

1. **Mockup** — an ASCII art sketch of the rendered shape (required for `Leaf` / `Component` / `Dialog`; omitted for `Section` because its layout is already in the page-level ASCII Layout Map; omitted for `Form` because it lives inside a Dialog's body)
2. **Slots** — the textual slot tree using `└─ / ├─`

```text
<CitizenName>  (<Role>)
└─ <root container element>  [<layout: flex/grid + direction + spacing + padding>]
   ├─ <slot name>: <element description>  [primitive: <Name>]
   │  ├─ <child element>: <description>  [<style hint>]
   │  └─ <child element>: <description>
   └─ <slot name>: <element description>
```

Then an optional **Variants** and/or **States** list immediately below the tree.

### Mockup drawing rules

- Use Unicode box-drawing characters: `┌ ┐ └ ┘ │ ─ ╭ ╮ ╰ ╯ ╔ ╗ ╚ ╝ ╠ ╣ ═ ║`
- Width ≤ 80 columns. Approximate proportions — never pixel-perfect.
- Use **Dialog double-line borders** (`╔ ╗ ╚ ╝ ═ ║`) to distinguish modals from inline cards.
- Use **rounded corners** (`╭ ╮ ╰ ╯`) for sub-elements like icon badges, chips, and gauges; **square corners** (`┌ ┐ └ ┘`) for the outer Card.
- Show **representative copy**, not lorem ipsum — pull a real-looking string from the source artifact (e.g., "R$ 12.087,41", "Lucro", "Page View").
- Mark interactive affordances with brackets: `[ + ]`, `[ ↻ ]`, `[×]`, `[ Salvar ]`, `[○ ]` (toggle off), `[● ]` (toggle on).
- Mark icons by symbol/letter inside a small box `╭───╮ │ $ │ ╰───╯` or with an emoji shorthand `🛒`, `📢`, `🏆`. Do not try to draw the actual icon glyph faithfully.
- Mark images with `[🖼]` or a small placeholder box.
- For lists rendered N times (Leaves), draw **1–3 representative rows**, then `...` to indicate continuation.
- Avoid color references — ASCII is monochrome; encode emphasis via brackets, double borders, or fills (`▓ ▒ ░`).

### Required fields per anatomy block

| Field | Obrigatório | Purpose |
|---|---|---|
| Citizen name + role | ✓ | Matches Component Tree 1:1 |
| **Mockup** | ✓ for Leaf/Component/Dialog · ✗ for Section/Form | ASCII sketch of the rendered shape |
| Root container | ✓ | The outermost element + the primitive it wraps (`Card`, `div`, `Dialog`, `Form`) + layout class summary |
| Slots / sub-elements | ✓ | Every visible element (icon, label, value, badge, action button, image). One line per element. |
| Primitive references | conditional | When an element maps to a primitive in `@codm/app-ui/`, cite it inline as `[primitive: <Name>]`. Cite even when the primitive is "obvious" — readers should not have to guess. |
| Variants | conditional | When the same component has visually distinct states driven by props/URL/store (e.g., selected KPI card with green background) |
| States | conditional | Skeleton / empty / error visual sketch when it deviates from a trivial `Skeleton` block |
| ARIA | conditional | When the element has icon-only buttons, lists, or regions that need labels — mirror these in the data card |

### Required fields per anatomy block

| Field | Obrigatório | Purpose |
|---|---|---|
| Citizen name + role | ✓ | Matches Component Tree 1:1 |
| Root container | ✓ | The outermost element + the primitive it wraps (`Card`, `div`, `Dialog`, `Form`) + layout class summary |
| Slots / sub-elements | ✓ | Every visible element (icon, label, value, badge, action button, image). One line per element. |
| Primitive references | conditional | When an element maps to a primitive in `@codm/app-ui/`, cite it inline as `[primitive: <Name>]`. Cite even when the primitive is "obvious" — readers should not have to guess. |
| Variants | conditional | When the same component has visually distinct states driven by props/URL/store (e.g., selected KPI card with green background) |
| States | conditional | Skeleton / empty / error visual sketch when it deviates from a trivial `Skeleton` block |
| ARIA | conditional | When the element has icon-only buttons, lists, or regions that need labels — mirror these in the data card |

### Drawing rules

- Names of citizens MUST match the Component Tree exactly (1:1 mapping).
- Indent with `├─ / └─ / │` (same characters as the Component Tree) — never tabs alone.
- Use **layout shorthand** in brackets: `[flex row, gap-3, p-4]`, `[grid grid-cols-3 gap-2]`. Don't write full Tailwind class lists — only the load-bearing classes.
- Use **`[primitive: <Name>]`** inline whenever an element wraps an existing primitive (`Card`, `Button`, `Badge`, `Skeleton`, `Switch`, etc.). The full path is implicit (`@codm/app-ui/<name>.tsx`).
- **Slot names** are domain words: `Header`, `IconBadge`, `Label`, `Value`, `Delta`, `Action`, `Footer`, `Trigger`, `Body`. Avoid HTML-tag-as-slot-name (`Div`, `Span`).
- Keep each line ≤100 columns.
- For Leaves rendered N times, draw the anatomy **once** — the Leaf's anatomy is the same for every iteration.
- For Sections that mostly compose other citizens (e.g., `RevenueChartSection` → `ChartTypeSelector + ChartLegend + RevenueChartCanvas`), the anatomy is short: show the container + ordered references to the sub-citizens. Don't duplicate the sub-citizens' anatomies — they have their own blocks.
- For Dialogs, anatomy must show: `Dialog` root, `DialogHeader` (title + close), `DialogBody` (which Form or content), `DialogFooter` (action buttons). When the body is a Form, reference the Form citizen — don't inline its fields.
- For Forms, anatomy must list every field as a slot with the SDK schema field name and the primitive (`Input`, `Select`, `Combobox`, `DatePicker`, `Switch`, `Textarea`).
- **Do NOT include behavior** (hooks, queries, store calls) — that's the Data Card. Anatomy is *shape only*.

### Skeleton

````markdown
**`<CitizenName>`** (<Role>)

Mockup:

```text
<ascii sketch>
```

Slots:

```text
<CitizenName>
└─ <root>  [<layout>]
   ├─ <slot>: <element>  [primitive: <Name>]
   └─ <slot>: <element>
```

Variants:
- `<condition>` → `<visual delta>`

States:
- skeleton: `<sketch>`
- empty: `<sketch>`
````

### Worked example (the KPI card the operator called out)

````markdown
**`KpiMetricCard`** (Leaf)

Mockup:

```text
┌──────────────────────────────────┐
│ ╭───╮  Lucro                     │
│ │ $ │  R$ 12.087,41  ▼ -41%      │
│ ╰───╯                            │
└──────────────────────────────────┘
```

Slots:

```text
KpiMetricCard
└─ Card  [primitive: Card]  [flex row items-center gap-3 p-4, role="button"]
   ├─ IconBadge: rounded-full size-10 bg-<metric.color>/10, centered
   │  └─ Icon  [lucide, size-5, text-<metric.color>]
   ├─ Body: flex flex-col gap-1, flex-1
   │  ├─ Label: text-sm text-muted-foreground  (metric.label, e.g. "Lucro")
   │  └─ ValueRow: flex items-baseline gap-2
   │     ├─ Value: text-2xl font-bold  (currency-formatted via i18n.format)
   │     └─ Delta: text-xs  (text-danger / text-success based on sign, with arrow icon)
   └─ Action (optional, Taxas only): IconButton  [primitive: Button, variant="ghost", size="icon"]
      └─ Icon: Pencil  [lucide, size-4]  (aria-label="Editar taxas")
```

Variants:
- `metric === selectedMetric` → Card background `bg-emerald-500/10`, border `border-emerald-500/40`, Label + Value text `text-emerald-50`
- `delta === 0` → Delta hidden

States:
- skeleton: full-card `Skeleton` block at the same height (h-20)
- empty: never empty — every KPI always has a value (zero is rendered)
````

### How anatomy interacts with reuse decisions

- If a slot maps to a primitive (`Card`, `Button`, `Switch`, `Badge`) and that primitive **does not exist** in `@codm/app-ui/`, the Hand-off MUST add a `/primitive` step for it before the consuming component. The anatomy is what surfaces this gap — flag it during step 4.
- If two citizens have anatomies that overlap ≥70% (same root, same slot names, same primitives), that's a **promote-to-shared** signal — even when only one consumer exists today. Update the Reuse Summary accordingly.

## Data Card Schema

Every node in the Component Tree gets a card. Fields marked **obrigatório** are required; **opcional** is filled when applicable.

| Field | Obrigatório | Format | Example |
|---|---|---|---|
| `Name` | ✓ | PascalCase, no "The" prefix | `PatientListSection` |
| `Role` | ✓ | one of `RouteShell` / `Section` / `Component` / `Leaf` / `Dialog` / `Form` | `Section` |
| `Renders` | ✓ | `once` or `N (in .map)` | `once` |
| `Data` | ✓ | `useXxx({ params })` OR `props from <Parent>` OR `—` | `useListPatients({ page, search, unitId })` |
| `URL r/w` | ✓ | `reads: [list], writes: [list]` (search param names) OR `—` | `reads: [page, search, unitId], writes: [page, search]` |
| `Store r/w` | ✓ | `<storeName>: { reads, writes }` OR `—` | `useChatStore: { reads: [channelId], writes: [] }` |
| `Local state` | ✓ | brief `useState` list OR `—` | `[isAtBottom, unreadCount]` |
| `Reuse.decision` | ✓ | `reuse` / `promote-to-shared` / `create-new-shared` / `create-route-local` | `create-route-local` |
| `Reuse.rationale` | ✓ | one sentence | "Patient-domain coupled; no parallel in other routes" |
| `Reuse.existingPath` | conditional | path to existing component when `decision = reuse` or `promote-to-shared` | `@/components/Dialogs/CreatePatientDialog` |
| `File path` | ✓ | absolute path within `packages/app/react/src/` | `packages/app/react/src/routes/(app)/patients/-components/PatientListSection/index.tsx` |
| `Skill` | ✓ | downstream skill to invoke | `/component` |
| `ARIA` | opcional | labels needed (icon-only button, list, dialog, section) | `role="list" aria-label="Lista de pacientes"` |
| `Skeleton variant` | opcional | brief description of inline skeleton | "6 card placeholders in a grid" |
| `Empty variant` | opcional | brief description of empty state | "Empty primitive: 'Nenhum paciente encontrado'" |

### Compact rendering

When the tree is wide, render data cards as a markdown table with columns: `Name | Role | Data | URL r/w | Store r/w | Local | Reuse decision | File | Skill`. Move `Rationale`, `ARIA`, `Skeleton`, `Empty` into a per-node note below the table when they need elaboration.

## Reuse Rules

Three tiers in the codebase. The decision matrix at the bottom resolves every node to exactly one outcome.

### Tier 1 — Primitive

Lives in `@codm/app-ui/<x>.tsx`. Stateless, Base UI + CVA + Tailwind. Examples: `Button`, `Card`, `Input`, `Select`, `Dialog`, `Combobox`, `Skeleton`, `Empty`, `Table`, `Tabs`, `Badge`.

Use when the boundary is a **design system atom**. Never re-create — if a needed primitive is missing, recommend creating it via `/primitive` (separate skill, separate task).

### Tier 2 — Shared component

Lives in `@/components/<Name>/`. Reusable across routes. Props contract must work for ≥2 consumers. May own its own store (`@/components/<Name>/stores/use<X>Store.ts`, see `@/components/Navbar/`). May know about a domain (e.g., `CalendarWidget` knows "appointment"), but the **props shape** must be generic — consumers feed different data.

Promote when the same shape emerges in **≥2 routes**.

### Tier 3 — Shared dialog

Lives in `@/components/Dialogs/<Name>/` with an export added to `@/components/Dialogs/index.tsx` (barrel). Same rules as shared component but for dialogs opened from ≥2 routes (e.g., `CreatePatientDialog` opens from patients list AND channel/chat).

### Tier 4 — Route-local

Lives in `routes/.../-components/<Name>/`. Domain coupled, used in one route only. This is the **default** — only promote when criteria are met.

### Decision matrix

| Existing match | Generic-enough? | Decision |
|---|---|---|
| `@codm/app-ui/<X>.tsx` | always (by definition) | `reuse` — primitive |
| `@/components/<Name>/` or `@/components/Dialogs/<X>/` | yes | `reuse` — shared |
| Similar shape in `routes/<a>/...` AND `routes/<b>/...` | yes (≥70% prop overlap, no domain coupling in name) | `promote-to-shared` (cite both routes) |
| No existing match, but anticipated to be used in ≥2 routes with generic props | yes | `create-new-shared` (list ≥2 hypothetical consumers) |
| No existing match, domain coupled | no | `create-route-local` |

When a node is `promote-to-shared`, the Hand-off section MUST include the refactor task: extract the existing route-local into the new shared location, update both consumers.

## ASCII Layout Map — Drawing Rules

- Each boundary is a rectangle drawn with `┌─┐` / `└─┘` / `│` containing **only the component name** (and role annotation when ambiguous).
- Nesting reflects the real DOM nesting — a child sits inside the parent's rectangle.
- Side-by-side vs stacked positioning reflects the original image (left/right, top/bottom).
- Annotate role between parentheses when the name alone is unclear: `PatientCard (Leaf ×N)`, `CreatePatientDialog (Dialog, overlay)`.
- **Do NOT draw internal content** — no buttons, no inputs, no list items. Just the named boundary.
- Dialogs and overlays appear in a separate `Overlays:` block below the main map with a note about what opens them: `CreatePatientDialog (Dialog) — opens on click of "+ Novo Paciente"`.
- Skeleton / empty / error variants do NOT appear (they are variants of the data-owning node).
- Width ≤100 columns. For wide screens, approximate proportionally — pixel-perfect is not the goal.
- Names in the ASCII map MUST match exactly the names in the Component Tree below it (1:1 mapping).

### Skeleton

```text
┌────────────────────────────────────────────────────────────┐
│ <RouteShellName> — <static UI hint>                        │
├────────────────────────────────────────────────────────────┤
│ ┌──────────────┐  ┌──────────────────────────────────────┐ │
│ │ <SectionA>   │  │ <SectionB>                            │ │
│ │              │  │  ┌──────────────────────────────────┐ │ │
│ │              │  │  │ <ChildName> (Leaf ×N)             │ │ │
│ │              │  │  └──────────────────────────────────┘ │ │
│ └──────────────┘  └──────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘

Overlays:
  <DialogName> (Dialog)  ── opens on click of "<trigger label>"
```

## Output Template

The final emitted block. Names in `<>` are placeholders to fill from the analysis. Append this block to the target spec under `## Acceptance Criteria`.

````markdown
## UI Composition

### URL Contract

- **Path:** `/<path>`
- **Breadcrumb:** `<label>` (or breadcrumbs array for nested routes)
- **Search params (Zod sketch):**
  - `<param1>` — `<type>` — `<purpose>`
  - `<param2>` — `<type>` — `<purpose>`
- **Loader (if any):** `<loader summary>`
- **errorComponent:** `RouteError` (default) or custom

### ASCII Layout Map

```text
<ascii map per drawing rules>
```

### Component Tree

```text
<RouteShell>                                                 (Route Shell)
├─ <SectionA>                                                (Section)
│  ├─ <ComponentA1>                                          (Component)
│  └─ <ComponentA2>                                          (Component)
├─ <SectionB>                                                (Section, owns list query)
│  ├─ <ComponentB1>                                          (Component, pagination)
│  └─ <LeafB1>                                               (Leaf ×N)
└─ <static UI in route shell>

Overlays:
├─ <DialogX>                                                 (Dialog, shared/route-local)
└─ <DialogY>                                                 (Dialog, opens form)
```

### Component Anatomy

One block per citizen (except RouteShell). Order = Component Tree order.

**`<SectionA>`** (Section)

```text
<SectionA>
└─ <root>  [<layout>]
   ├─ <slot>: <element>  [primitive: <Name>]
   └─ <slot>: <element>
```

Variants: …
States: …

**`<ComponentA1>`** (Component)

```text
<ComponentA1>
└─ …
```

(repeat for every citizen)

### Data Cards

| Name | Role | Data | URL r/w | Store r/w | Local | Reuse | File | Skill |
|---|---|---|---|---|---|---|---|---|
| <RouteShell> | RouteShell | — | reads: […] | — | — | create-route-local | routes/.../index.tsx | /route |
| <SectionA> | Section | useXxx({…}) | reads: […] | — | — | <decision> | routes/.../-components/<A>/ | /component |
| <LeafB1> | Leaf | props from <SectionB> | — | — | — | <decision> | routes/.../-components/<B>/<Leaf>/ | /component |
| <DialogX> | Dialog | — | — | useDialogStore | — | reuse / promote-to-shared / create-* | @/components/Dialogs/<X>/ | /component |

**Per-node notes** (when ARIA, skeleton, empty, or rationale need elaboration):

- **<SectionB>:** Skeleton: `<description>`. Empty: `<description>`. ARIA: `role="list" aria-label="<label>"`. Rationale: `<one sentence>`.

### Reuse Summary

- **Reuse (no work):** `<List of nodes with decision = reuse>` — cites existing paths
- **Promote to shared:** `<List with decision = promote-to-shared>` — for each, cite ≥2 current consumers and the target path
- **Create new shared:** `<List with decision = create-new-shared>` — for each, justify generic-enough props
- **Create route-local:** `<List with decision = create-route-local>` — default; no justification needed

### Hand-off — Skills a invocar no `/build`

| Order | Skill | Artifact | Path | Notes |
|---|---|---|---|---|
| 1 | /route | <RouteShellName> | `routes/<path>/index.tsx` | |
| 2 | /store (if any) | use<X>Store | `routes/<path>/-stores/` | |
| 3 | /component (shared/promote) | <NewSharedName> | `@/components/<Name>/` | requires consumer refactor |
| 4 | /component | <SectionA> | `routes/<path>/-components/<SectionA>/` | |
| 5 | /component | <LeafB1> | `routes/<path>/-components/<SectionB>/<LeafB1>/` | |
| 6 | (reuse) | <DialogX> | `@/components/Dialogs/<X>/` | already exists |
| 7 | /form (if dialog has input) | <DialogX form body> | inside <DialogX> | |

### Open Questions (if any)

- OQ-1. `<boundary description>` — proposed classification: `<X>` — needs operator decision.
````

The Hand-off ordering rule: Route → Store → New shared/primitive → Sections (top-down) → Leaves → Dialogs → Forms (inside dialogs).

## Worked Examples

See `examples/` next to this skill:

- `examples/01-patients-list.md` — list page with Sections, Leaf, existing Dialog reuse
- `examples/02-dashboard.md` — master/detail with shared `CalendarWidget`, KPI Section
- `examples/03-channel-chat.md` — deep Sections, multiple Dialogs, Zustand store, real-time

## Checklist

Before committing the emitted section to the spec, verify against the design ACs:

- [ ] (AC-1) Output is markdown only, destined for a spec in `.specs/`
- [ ] (AC-1b) Section contains **ASCII Layout Map**, **Component Tree**, AND **Component Anatomy** with 1:1 name mapping across all three
- [ ] (AC-2) Every visible boundary has exactly one citizen label; unclear ones are listed under "Open Questions"
- [ ] (AC-3) `Section` is used only when the boundary orchestrates ≥3 distinct sub-components OR is the sole data root of a region
- [ ] (AC-4) Every node's data card has all obligatory fields filled (no `—` where a value should exist)
- [ ] (AC-4b) Every citizen except RouteShell has a Component Anatomy block with root container, slots, and primitive references
- [ ] (AC-4c) Every Leaf / Component / Dialog has an ASCII mockup before its slot tree; Sections and Forms may omit the mockup
- [ ] (AC-5) Every `reuse` / `promote-to-shared` node cites an existing path; every `promote-to-shared` cites ≥2 consumers
- [ ] (AC-6) Hand-off block lists skills in execution order with concrete paths
- [ ] (AC-7) URL search params are named and each Component/Section says whether it reads, writes, or both
- [ ] (AC-8) New dialogs follow the placement rule: 1 route → `-components/`; ≥2 routes → `@/components/Dialogs/` with barrel export
- [ ] (AC-9) No code in the output — only the markdown section
- [ ] (AC-10) Every primitive reference (in anatomy and data cards) points at an existing file in `@codm/app-ui/` — gaps are flagged in Hand-off as `/primitive` steps

## References

- `.specs/2026-05-20-ui-composition-skill-design.md` — design rationale + ACs
- `docs/FRONTEND.md` — frontend architecture (citizens, state strategy, dialog pattern)
- `.claude/skills/route/SKILL.md`, `.claude/skills/component/SKILL.md`, `.claude/skills/form/SKILL.md`, `.claude/skills/store/SKILL.md`, `.claude/skills/primitive/SKILL.md` — downstream skills referenced in Hand-off
- `.claude/skills/prototype/SKILL.md` — inverse direction (user stories → mockup)
- Reference routes in the codebase: `routes/(app)/patients/`, `routes/(app)/dashboard/`, `routes/(app)/channel/chat/`, `routes/onboarding/`, `@/components/Dialogs/`, `@/components/CalendarWidget/`
