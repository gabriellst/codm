# L6 Gold Rubric — mini-Kanban (scoped ClickUp/Trello clone)

> The frozen "definition of the core" for L6 app #1. The oracle for stage-gated grading. Grade
> SOUNDNESS against this, not exact match — an equivalent carve-up with different names passes.

## App in one line (the probe's input)

"Build a minimal Kanban board: workspaces of boards, each board has ordered lists (columns), cards
move between lists, and everyone viewing a board sees moves live. Auth is handled by the template."

## Core bounded contexts (the gold BC set)

A SOUND decomposition has roughly these, by responsibility (names may differ):

- **`board`** — the Board aggregate. A board owns its **lists as ordered VALUE OBJECTS / columns**,
  NOT separate aggregates. Invariant: an archived board rejects new lists/cards. (Modeling List as
  its own aggregate/BC is the canonical OVER-FRAGMENTATION trap — penalize.)
- **`card`** — the Card aggregate (identity + lifecycle + moves). Invariant: a card may only sit on a
  list that exists on its board; moving a card on an archived board is rejected. Raises **CardMoved**.
- **`collaboration` / `membership`** — who can access a board (member + role). Acceptable EITHER as
  its own BC OR folded into `board` — this is a legitimate judgment call, not a failure.
- **Read side (BFF, context `ui`)** — a **BoardViewProjection**: the denormalized board → ordered
  lists → ordered cards shape the screen renders. (Cross-aggregate read shape ⇒ projection, not a
  join in a controller.)

### Anti-patterns (the BC-decomposition grader must penalize)

- **God-context**: one `kanban` BC owning board + list + card + membership + everything → FAIL (no
  boundaries; the whole point of DDD is gone).
- **Per-table sprawl**: separate BCs for board, list, card, label, comment, attachment, … in a
  SCOPED app → FAIL (over-fragmented; lists are VOs, labels/comments are out of the scoped core).
- **Anemic boards**: Board/Card with no invariants (just CRUD bags) → weak (the aggregates must own
  the archived-board / card-belongs-to-board rules).

## Core domain/integration events (frozen in Phase 0)

- `CardCreated` (domain), `CardMoved` (integration — **carries `boardId` for realtime tenancy** so
  the SSE broadcaster can scope it; this is the realtime contract), `BoardArchived` (domain).

## Core read model + projection

- `BoardViewProjection` updated by a `BoardViewProjector` listening to CardCreated/CardMoved/… via
  the canonical find → applyEvent → save (or atomic op for the move's ordering).

## Core flows (must WORK — graded by e2e, API-context setup, no waitForTimeout)

1. Create a board with ≥2 lists (columns).
2. Add a card to a list.
3. **Move a card to another list** → emits `CardMoved` → projection reflects the new list.
4. **Realtime**: a second session viewing the same board sees the move appear **without reload**
   (the `useServerEvents(CardMoved)` → invalidate the GetBoard query-key path).
5. Archiving a board → adding a card to it is rejected with the named domain error.

## Frontend (must exist, canon-clean)

- Board route under `routes/(app)/…/boards/$boardId/` — thin shell, params typed.
- A data-owning `BoardSection` — calls the GetBoard BFF hook + `routeApi` itself, renders the
  columns, owns the realtime subscription (exactly one `useServerEvents(CardMoved…)` → invalidate).
- A `CreateCardDialog` via `useDialogStore`, validating the SDK create-card mutation schema.
- Card move = a mutation (kept whole, no try/catch/onError); optimistic or invalidate-on-settle.
- Any card/list status labels via the typed `enums.*` i18n catalog in BOTH locale files.

## Stage thresholds ("without failing too much")

- **spec**: 6 sections present; names ≥4 of the 5 core flows.
- **model**: BC-decomposition judge PASS (sound carve-up, no god-context, no sprawl); Board+Card own
  real invariants.
- **contract-lock**: CardMoved (+ boardId) + tables frozen before BC implementation.
- **plan**: `validate-plan` PR-28 clean (every dependent Task carries a handoff).
- **build**: backend + app-react tsc green; detectors clean (registry-scan, import-direction,
  slice-closure, route-closure, component-props, projection-shape).
- **e2e**: spec exists, not stubbed, covers flows 3 + 4 (move + realtime).
- **Aggregate**: PASS if model + plan + build stages each clear AND ≥4/5 core flows have e2e
  coverage. A single non-catastrophic stage miss is acceptable (the stage vector records it).
