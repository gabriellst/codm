# L6 Gold Rubric — scoped ClickUp clone (app #2, richer than mini-Kanban)

> The frozen "definition of the core" for L6 app #2. Richer than Kanban: a container hierarchy,
> a task work-item with a status workflow + priority + assignment, and TWO read views of the same
> tasks (the CQRS payoff). Grade SOUNDNESS against this, not exact match.

## App in one line (the probe's input)

"Build a minimal ClickUp: a workspace has spaces, each space has lists; tasks live in lists, carry a
status (a workflow) + priority + assignees, move through statuses, and show up in both a List view
and a Board view — live as they change. Auth is handled by the template."

## Core bounded contexts (the gold BC set — names may differ; grade SOUNDNESS)

A sound decomposition has roughly these, by responsibility:

- **`workspace`** — the container hierarchy. Workspace owns Spaces; a Space owns its Lists (Lists as
  ordered VALUE OBJECTS, not their own aggregate) and defines its task **status set**. Acceptable
  EITHER as one `workspace` context holding Workspace+Space, OR Space as its own context — a real
  judgment call, not a failure. Invariant: an archived space rejects new lists/tasks.
- **`task`** — the Task aggregate (its OWN context — a different lifecycle from the container: a task
  changes status constantly). Owns: listId, status (from the space's set), priority, assigneeIds,
  dueDate. Invariants: a task's status must be one of its space's defined statuses; a task belongs to
  a list that exists in its space. Raises **TaskStatusChanged**, TaskAssigned, TaskMoved.
- **`collaboration` / `membership`** — workspace members + roles; task **assignment** references
  members. Acceptable as its own context OR folded into `workspace`.
- **Read side (`ui` BFF)** — TWO projections of the same tasks: a **ListViewProjection** (tasks
  grouped by list) AND a **BoardViewProjection** (tasks grouped by status). This is the point of the
  richer app — one write model, two denormalized read shapes.

### Status & Priority are ENUMS, not contexts

`TaskStatus` (e.g. TODO | IN_PROGRESS | IN_REVIEW | DONE) and `TaskPriority` (LOW | NORMAL | HIGH |
URGENT) are closed sets → code enums (+ pgEnum), NOT bounded contexts and NOT their own aggregates.

### Anti-patterns the BC-decomposition grader must penalize

- **God-context**: one `clickup` / `tasks` context owning workspace + space + list + task + member +
  assignment → FAIL.
- **Per-table sprawl**: separate contexts for workspace, space, list, task, status, priority,
  assignment, member each → FAIL (status/priority are enums; list is a VO; space≤2 contexts).
- **Task lumped into workspace**: Task has its own lifecycle + invariants → it is its OWN context,
  not a child of workspace → lumping it is a FAIL.

## Core domain/integration events (frozen in Phase 0)

- `TaskStatusChanged` (integration — **carries `workspaceId` for realtime tenancy**; also taskId,
  fromStatus, toStatus), `TaskCreated`, `TaskAssigned` (domain or integration as needed).

## Core read models + projections

- `ListViewProjection` (space → lists → tasks) and `BoardViewProjection` (space → statuses → tasks),
  each driven by a projector listening to TaskCreated/TaskStatusChanged/TaskMoved.

## Core flows (must WORK — graded by e2e: API-context setup, no waitForTimeout)

1. Create a workspace with a space + ≥2 lists.
2. Create a task in a list with a status + priority.
3. **Change a task's status** (workflow) → emits `TaskStatusChanged` → BOTH projections reflect it
   (it moves list-group position / status-group).
4. **Assign** a task to a member.
5. **Realtime**: a second session sees the status change appear **without reload**
   (`useServerEvents(TaskStatusChanged)` → invalidate the view query key).
6. The same tasks render in **both** a List view and a Board view (two projections, one write model).

## Frontend (must exist, canon-clean)

- A workspace/space route (thin shell, params typed) with a **List view + Board view** toggle (the
  view is bookmarkable → route search param).
- Data-owning sections that call the GetListView / GetBoardView BFF hooks + own the realtime sub.
- A `CreateTaskDialog` via `useDialogStore` validating the SDK create-task mutation schema.
- A status-change + assign mutation (kept whole). Status/priority labels via the typed `enums.*`
  catalog in BOTH locales. Every actionable button wired (no dead buttons); no hardcoded text.

## Stage thresholds ("without failing too much")

- **model**: BC-decomposition judge PASS — sound carve-up (workspace / task / collaboration), Task is
  its own context with real invariants, status/priority are enums, no god-context, no sprawl.
- **lock**: TaskStatusChanged (+ workspaceId) + TaskStatus/TaskPriority enums + tables frozen first.
- **build**: backend + app-react + e2e tsc green; all 6 detectors clean.
- **e2e**: real spec (not stubbed) covering flow 3 + flow 5 (status-change + realtime).
- **Aggregate**: PASS if model + build clear AND ≥4/6 core flows have e2e/code coverage AND BOTH
  projections exist. A single non-catastrophic stage miss is acceptable (the stage vector records it).
