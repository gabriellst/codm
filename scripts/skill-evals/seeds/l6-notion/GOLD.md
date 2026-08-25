# L6 Gold Rubric — scoped Notion clone (app #3, the hardest MODELING test)

> The frozen "definition of the core" for L6 app #3. The novel challenge is RECURSION: a Page owns a
> TREE of Blocks where a Block can contain Blocks, AND Pages themselves nest (a page inside a page).
> This is a self-referential / tree-structured aggregate — modeling it without over-fragmenting (every
> Block an aggregate) or flattening the tree is the test. Grade SOUNDNESS, not exact match.

## App in one line (the probe's input)

"Build a minimal Notion: a workspace has pages; pages nest inside pages; a page is a tree of typed
blocks (text, heading, toggle); a toggle block contains child blocks; editing/adding a block shows up
live for everyone viewing the page. Auth is handled by the template."

## Core bounded contexts (the gold BC set — names may differ; grade SOUNDNESS)

- **`workspace`** — owns the PAGE HIERARCHY: a workspace has pages; a page may have a `parentPageId`
  (pages form a TREE). The page-tree containment is the workspace's concern. Acceptable to model the
  page-tree here or in a `page` context.
- **`page`** — the Page aggregate. A Page owns a **recursive tree of Blocks**: a Block is a typed
  value object / child entity (`type: text|heading|toggle`, content, order) that can itself hold
  `children: Block[]`. Blocks are VALUE OBJECTS / child entities OWNED BY the page — NOT their own
  aggregates (a block has no independent lifecycle; it's edited in-page). The Page aggregate is the
  consistency boundary for its whole block tree. Invariants: the block tree is well-formed (no
  cycles, children only under container blocks like toggle); a block belongs to its page. Raises
  **BlockAdded / BlockEdited / BlockMoved**.
- **Read side (`ui` BFF)** — a **PageViewProjection**: the page denormalized as its nested block tree
  (+ the page's child-page list), driven by a projector from the block events.

### Anti-patterns the BC-decomposition grader must penalize

- **Block as its own aggregate** — a Block with its own Id/repository/usecase/controller/event is the
  canonical OVER-MODEL for this app → FAIL. Blocks are VOs in the Page's tree.
- **Flattened tree** — modeling blocks as a flat list with a `parentId` foreign key ONLY, with no
  recursive `children` structure in the domain model, loses the tree → the domain Block must be
  recursive (`children: Block[]`), even if the DB stores it adjacency-list style.
- **God-context** — one `notion` context owning workspace + page + block → FAIL.
- **Anemic Page** — a Page with no invariant over its block tree → weak.

### BlockType is an ENUM

`BlockType` (TEXT | HEADING | TOGGLE | …) is a closed set → a code enum (+ pgEnum), not a context.

## Core domain/integration events (frozen in Phase 0)

- `PageContentChanged` (integration — **carries `workspaceId` for realtime tenancy**; pageId, the
  change kind), plus domain `BlockAdded` / `BlockEdited` / `PageCreated`.

## Core read model + projection

- `PageViewProjection` (the page's recursive block tree + child-page list), driven by a
  `PageViewProjector` from PageCreated / BlockAdded / BlockEdited / BlockMoved.

## Core flows (must WORK — graded by e2e: API-context setup, no waitForTimeout)

1. Create a workspace + a top-level page.
2. Add typed blocks (text, heading, toggle) to a page.
3. **Nest a block inside a toggle block** (the recursion) — the block tree reflects the nesting.
4. **Create a nested page** (a page with a parentPageId) — the page tree reflects it.
5. Edit a block's content → emits `BlockEdited` → the PageView projection reflects it.
6. **Realtime**: a second session viewing the page sees a block add/edit appear **without reload**
   (`useServerEvents(PageContentChanged)` → invalidate the page-view query key).

## Frontend (must exist, canon-clean)

- A page route (thin shell, params typed: workspaceId/pageId). A data-owning section that renders the
  **recursive block tree** (a recursive Block component), owns the GetPageView hook + the realtime
  subscription. A page-tree sidebar/nav. A CreateBlock action via a mutation (kept whole). Block-type
  labels via the typed `enums.BlockType.*` catalog in BOTH locales. Every actionable button wired; no
  hardcoded text.

## Stage thresholds ("without failing too much")

- **model**: BC-decomposition judge PASS — Page owns a RECURSIVE block tree, Blocks are VOs (not
  aggregates), no god-context, no flat-only tree, BlockType is an enum, Page owns a tree invariant.
- **lock**: PageContentChanged (+ workspaceId) + BlockType enum + tables frozen first.
- **build**: backend + app-react + e2e tsc green; all 6 detectors clean.
- **e2e**: real spec (not stubbed) covering flow 3 (nest a block) + flow 6 (realtime).
- **Aggregate**: PASS if model + build clear AND ≥4/6 flows covered AND the recursion is genuinely
  modeled (recursive Block + recursive render). A single non-catastrophic stage miss is acceptable.
