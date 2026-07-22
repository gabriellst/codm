# Task: synthetic-l6-clickup

> Verbatim `prompt` field from `scripts/skill-evals/tasks/synthetic-l6-clickup.yaml`.

BUILD A MINIMAL CLICKUP APP, end to end, in this monorepo, from this one-line idea:
"A workspace has spaces; each space has ordered lists; tasks live in lists and carry a status (a
workflow), a priority, and assignees; tasks move through statuses; the same tasks render in BOTH a
List view and a Board view, live as they change. Auth is handled by the template."
You are the ORCHESTRATOR (you have the Task tool) — model, lock the contract, plan with handoffs,
then DISPATCH a fresh worker subagent per Task. Follow the full pipeline in the preamble.
ARCHITECTURE (non-negotiable, it is the grading rubric): DDD + Clean + CQRS + Event-Driven per the
root CLAUDE.md and docs/BACKEND.md / docs/FRONTEND.md.
DECOMPOSE into SOUND bounded contexts (read .claude/skills/ddd-modeling — the invariant/lifecycle
boundary DOMINATES entity count): a `workspace` context owns the container hierarchy (Workspace
owns Spaces; a Space owns its Lists as ordered VALUE OBJECTS and defines its status set); a `task`
context owns the Task aggregate (its OWN context — different lifecycle; status/priority/assigneeIds/
listId), with invariants (a task's status must be one of its space's statuses; a task belongs to a
list in its space); a `collaboration`/`membership` context owns workspace members + task
assignment (or fold membership into workspace). Status and Priority are ENUMS (TaskStatus:
TODO|IN_PROGRESS|IN_REVIEW|DONE, TaskPriority: LOW|NORMAL|HIGH|URGENT), NOT contexts. NO god-context
(one `clickup` context owning everything), NO per-table sprawl, NEVER lump Task into workspace.
CONTRACT LOCK (freeze before building any context): author the integration event named exactly
`TaskStatusChanged` (TypeSpec model `TaskStatusChangedEvent`, event name
`integration.shared.task.status_changed`, payload carrying `workspaceId` (REQUIRED — the SSE
realtime tenancy filter), `taskId`, `fromStatus`, `toStatus`); the `TaskStatus` + `TaskPriority`
enums in TypeSpec used by both languages; add it to the BROWSER_EVENTS union in the ui ListenEvents
controller; add the workspaces/spaces/lists/tasks tables (Drizzle); run `bun contracts` + `bun sdk`.
READ-SIDE (the richer-app payoff): TWO projections of the same tasks — a ListViewProjection (space →
lists → tasks) AND a BoardViewProjection (space → statuses → tasks), each driven by a projector from
TaskCreated/TaskStatusChanged, exposed via `ui` BFF queries.
FRONTEND (react, per packages/app/react/CLAUDE.md): a space route (thin shell, params typed) with a
List-view + Board-view toggle that is BOOKMARKABLE (route search param, not useState); data-owning
sections calling the GetListView/GetBoardView hooks + routeApi + exactly one
useServerEvents(TaskStatusChanged…) that invalidates the view query key; a CreateTaskDialog via
useDialogStore validating the SDK create-task mutation schema; status-change + assign mutations
(kept whole, no try/catch/onError). Status/priority labels via the typed enums.* i18n catalog in
BOTH locales. EVERY actionable button wired (no dead buttons); NO hardcoded user-facing text (use
t()).
E2E (packages/e2e, per .claude/skills/e2e): a Playwright spec at the EXACT path
packages/e2e/tests/clickup-tasks-realtime.spec.ts that sets up via the API request context (not
UI), role/label selectors, no waitForTimeout, and asserts the REALTIME path — with the board open,
change a task's status via the API and assert it moves to the new status column WITHOUT reload.
This spec is graded by READING (static + a judge), NOT by running Playwright — write it COMPLETE
with ACTIVE assertions; never comment out the body / `expect(true).toBe(true)` / `.skip`. A
stubbed spec grades FAIL.
TESTS (TDD — per .claude/skills/test/typescript, NOT optional): the Task aggregate's bounded context
lives at packages/api/typescript/src/task/. Write COLOCATED tests there that PASS: (a) an ENTITY test
asserting a Task invariant (a task's status must be one of its space's statuses; a task belongs to a
list in its space — rejected with the named domain error); (b) a USE CASE test in TestBed integration
mode (`TestBed.create('integration', …)`) for CreateTask / ChangeStatus. Green:
`cd packages/api/typescript && bun test src/task`.
GATES before done: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` AND
`bun test src/task` (green); `cd packages/app/react && bun x tsc --noEmit`; `cd packages/e2e && bun x
tsc --noEmit`; `bun run detect` clean. Final message: the bounded contexts, the frozen contract,
per-Task worker dispatch + gate results, the tests written, and which core flows are covered.
