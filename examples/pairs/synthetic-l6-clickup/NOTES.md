# NOTES — synthetic-l6-clickup / l6-clickup-iter5

## Provenance

- **stamp**: `l6-clickup-iter5`
- **task**: `synthetic-l6-clickup`
- **model**: `opus`
- **pass**: `true` (`failedGraders: []`)
- **graded ts**: `2026-06-16T03:54:37.692Z`
- **docTreeHash**: `1a2dc9de7e8e`
- Scoreboard row: `scripts/skill-evals/scoreboard/l6-clickup-iter5.jsonl`
- Patch source: `scripts/skill-evals/scoreboard/l6-clickup-iter5--synthetic-l6-clickup.patch`

## Patch structure

Plain (non-legacy) concatenated git diff: 160 `^diff --git` sections, each file appearing exactly
once (no duplicated per-file sections, no `^From ` mail headers, no `deleted file mode`, no
`rename from`). All 160 changes are new-file additions. No legacy-resumed-builder artifacts found.

## Base reconstruction

The patch file + scoreboard row were themselves committed together, verbatim, at commit
`6e6a2d371` ("docs(L6): ClickUp CONVERGED under the model split — k=2 (iter4+iter5 both 18/18
opus)") — i.e. the patch was captured as a build artifact and checked in as-is, not applied to the
tree at that commit. The build itself must have run at that commit's parent.

- **BASE REF reconstructed at**: `059ca657f` ("docs(evals): storybook connected-story probe PASSES
  12/12 — learned canons now gated") — the direct parent of `6e6a2d371` on `v1.9`.
- Verified via a detached throwaway worktree (`git worktree add --detach <tmp> 059ca657f`):
  `git apply --check` against this ref returned **zero errors, zero rejects**. Plain `git apply`
  (no `-3`, no chunk-splitting, no `--reject` needed) applied the entire patch cleanly in one shot.
  This is the only base tested because it was the structurally obvious candidate (parent-of-the-
  commit-that-added-the-patch-file) and it worked on the first try — no HEAD-apply was attempted
  since HEAD (current `v1.9` tip) is far ahead of the 2026-06-16 build point and was never a
  plausible base.
- Resulting worktree diff: 95 `git status --porcelain` entries (64 `??`, 31 `M`) — reconciles with
  160 patch file-sections because three whole new directories collapse to single `??` lines under
  porcelain status: `packages/api/typescript/src/task/`, `packages/api/typescript/src/workspace/`,
  `packages/app/react/src/routes/(app)/spaces/`. Enumerated per-file, all 160 patch paths exist on
  disk post-apply with none missing.

## What the exemplar shows

Orchestrated (multi-agent, `Task`-tool-driven) from-scratch build of a minimal ClickUp clone from a
one-line idea, scored 18/18 (full pass, no failed graders) under an opus orchestrator / sonnet
worker split. It is presented in the L6 "app-from-idea" eval ladder as the app that CONFIRMED (at
k=2, alongside iter4) that opus-orchestrated judgment fixes the BC-decomposition variance seen
under a sonnet orchestrator. Per the task prompt/rubric it demonstrates:

- **DDD decomposition**: three sound bounded contexts — `workspace` (Workspace owns Spaces; Lists
  as ordered value objects), `task` (Task aggregate, its own lifecycle/invariants: status must
  belong to its space's status set, task belongs to a list in its space), and assignment folded
  into `workspace`/`task` collaboration rather than a fourth god-context. `TaskStatus` /
  `TaskPriority` modeled as enums, not contexts.
- **Contract lock**: `TaskStatusChanged` integration event (`packages/contracts/wire/events/
  task-status-changed.tsp`) with `workspaceId` as the realtime tenancy key, `TaskStatus` /
  `TaskPriority` enums in TypeSpec, generated into both TS and Go bindings, plus new Drizzle tables
  (`packages/contracts/db/schema/clickup.ts`) and migration `0052_chubby_the_santerians.sql`.
- **CQRS read-side**: two distinct projections of the same Task events — `ListViewProjection` and
  `BoardViewProjection` — each with its own projector (`ListViewProjector`, `BoardViewProjector`)
  and its own `ui` BFF query (`GetListView`, `GetBoardView`).
- **Frontend**: a bookmarkable List/Board toggle route (`spaces/$spaceId`), data-owning sections
  (`ListViewSection`, `BoardViewSection`, `SpaceTasksSection`), a `CreateTaskDialog`, and a realtime
  wire-up via `useServerEvents(TaskStatusChanged…)`.
- **E2E discipline**: a real (non-stubbed) Playwright spec at the pinned path
  `packages/e2e/tests/clickup-tasks-realtime.spec.ts`, API-driven setup, asserting the board updates
  to a new status column without reload.
- **TDD**: colocated entity + integration-mode use-case tests are part of the patch's `task` bounded
  context (per-file test presence was not independently re-run here — this reconstruction only
  verifies the patch applies cleanly and reproduces the file set; it does not re-execute `bun test`
  or `tsc`).

## Files (GOT/)

160 files copied verbatim from the applied-patch worktree (all additions, no deletions/renames in
the patch). Full relative-path listing:

```
.plans/2026-06-15-clickup-app-build.md
packages/api/go/public/openapi.json
packages/api/typescript/public/docs/openapi.json
packages/api/typescript/scripts/emit-openapi.ts
packages/api/typescript/src/index.ts
packages/api/typescript/src/shared/registry.ts
packages/api/typescript/src/task/controllers/AssignTask.ts
packages/api/typescript/src/task/controllers/ChangeTaskStatus.ts
packages/api/typescript/src/task/controllers/CreateTask.ts
packages/api/typescript/src/task/controllers/index.ts
packages/api/typescript/src/task/controllers/MoveTask.ts
packages/api/typescript/src/task/entities/index.ts
packages/api/typescript/src/task/entities/Task.ts
packages/api/typescript/src/task/errors/index.ts
packages/api/typescript/src/task/events/index.ts
packages/api/typescript/src/task/events/TaskAssignedEvent.ts
packages/api/typescript/src/task/events/TaskCreatedEvent.ts
packages/api/typescript/src/task/events/TaskMovedEvent.ts
packages/api/typescript/src/task/events/TaskStatusChangedEvent.ts
packages/api/typescript/src/task/handlers/internal.ts
packages/api/typescript/src/task/handlers/PublishTaskStatusChangedHandler.ts
packages/api/typescript/src/task/index.ts
packages/api/typescript/src/task/projections/BoardViewProjection.ts
packages/api/typescript/src/task/projections/BoardViewProjectionRepository.ts
packages/api/typescript/src/task/projections/ListViewProjection.ts
packages/api/typescript/src/task/projections/ListViewProjectionRepository.ts
packages/api/typescript/src/task/projections/projectors/BoardViewProjector.ts
packages/api/typescript/src/task/projections/projectors/index.ts
packages/api/typescript/src/task/projections/projectors/ListViewProjector.ts
packages/api/typescript/src/task/registry.ts
packages/api/typescript/src/task/repositories/index.ts
packages/api/typescript/src/task/repositories/TaskRepository/DrizzleTaskRepository.ts
packages/api/typescript/src/task/repositories/TaskRepository/index.ts
packages/api/typescript/src/task/repositories/TaskRepository/MockTaskRepository.ts
packages/api/typescript/src/task/repositories/TaskRepository/TaskRepository.ts
packages/api/typescript/src/task/usecases/AssignTask.ts
packages/api/typescript/src/task/usecases/ChangeTaskStatus.ts
packages/api/typescript/src/task/usecases/CreateTask.ts
packages/api/typescript/src/task/usecases/index.ts
packages/api/typescript/src/task/usecases/MoveTask.ts
packages/api/typescript/src/ui/controllers/GetBoardView.ts
packages/api/typescript/src/ui/controllers/GetListView.ts
packages/api/typescript/src/ui/controllers/index.ts
packages/api/typescript/src/ui/controllers/ListenEvents.ts
packages/api/typescript/src/ui/usecases/GetBoardView.ts
packages/api/typescript/src/ui/usecases/GetListView.ts
packages/api/typescript/src/ui/usecases/index.ts
packages/api/typescript/src/workspace/controllers/AddList.ts
packages/api/typescript/src/workspace/controllers/CreateSpace.ts
packages/api/typescript/src/workspace/controllers/CreateWorkspace.ts
packages/api/typescript/src/workspace/controllers/index.ts
packages/api/typescript/src/workspace/entities/index.ts
packages/api/typescript/src/workspace/entities/Space.ts
packages/api/typescript/src/workspace/entities/Workspace.ts
packages/api/typescript/src/workspace/errors/index.ts
packages/api/typescript/src/workspace/events/index.ts
packages/api/typescript/src/workspace/events/ListAddedEvent.ts
packages/api/typescript/src/workspace/events/SpaceCreatedEvent.ts
packages/api/typescript/src/workspace/events/WorkspaceCreatedEvent.ts
packages/api/typescript/src/workspace/index.ts
packages/api/typescript/src/workspace/objects/SpaceList.ts
packages/api/typescript/src/workspace/registry.ts
packages/api/typescript/src/workspace/repositories/SpaceRepository/DrizzleSpaceRepository.ts
packages/api/typescript/src/workspace/repositories/SpaceRepository/index.ts
packages/api/typescript/src/workspace/repositories/SpaceRepository/MockSpaceRepository.ts
packages/api/typescript/src/workspace/repositories/SpaceRepository/SpaceRepository.ts
packages/api/typescript/src/workspace/repositories/WorkspaceRepository/DrizzleWorkspaceRepository.ts
packages/api/typescript/src/workspace/repositories/WorkspaceRepository/index.ts
packages/api/typescript/src/workspace/repositories/WorkspaceRepository/MockWorkspaceRepository.ts
packages/api/typescript/src/workspace/repositories/WorkspaceRepository/WorkspaceRepository.ts
packages/api/typescript/src/workspace/usecases/AddList.ts
packages/api/typescript/src/workspace/usecases/CreateSpace.ts
packages/api/typescript/src/workspace/usecases/CreateWorkspace.ts
packages/api/typescript/src/workspace/usecases/index.ts
packages/app/react/src/locales/en.json
packages/app/react/src/locales/pt.json
packages/app/react/src/routes/(app)/spaces/$spaceId/-components/BoardViewSection/index.tsx
packages/app/react/src/routes/(app)/spaces/$spaceId/-components/CreateTaskDialog/index.tsx
packages/app/react/src/routes/(app)/spaces/$spaceId/-components/ListViewSection/index.tsx
packages/app/react/src/routes/(app)/spaces/$spaceId/-components/SpaceTasksSection/index.tsx
packages/app/react/src/routes/(app)/spaces/$spaceId/-components/TaskCard/index.tsx
packages/app/react/src/routes/(app)/spaces/$spaceId/-components/ViewToggle/index.tsx
packages/app/react/src/routes/(app)/spaces/$spaceId/index.tsx
packages/app/react/src/routeTree.gen.ts
packages/client/dist/go/pkg/go/client.gen.go
packages/client/dist/go/pkg/typescript/client.gen.go
packages/client/dist/typescript/src/go/index.ts
packages/client/dist/typescript/src/go/types/TaskPriority.ts
packages/client/dist/typescript/src/go/types/TaskStatus.ts
packages/client/dist/typescript/src/go/zod/taskPrioritySchema.ts
packages/client/dist/typescript/src/go/zod/taskStatusSchema.ts
packages/client/dist/typescript/src/typescript/Client.ts
packages/client/dist/typescript/src/typescript/client/addList.ts
packages/client/dist/typescript/src/typescript/client/assignTask.ts
packages/client/dist/typescript/src/typescript/client/changeTaskStatus.ts
packages/client/dist/typescript/src/typescript/client/createSpace.ts
packages/client/dist/typescript/src/typescript/client/createTask.ts
packages/client/dist/typescript/src/typescript/client/createWorkspace.ts
packages/client/dist/typescript/src/typescript/client/getBoardView.ts
packages/client/dist/typescript/src/typescript/client/getListView.ts
packages/client/dist/typescript/src/typescript/client/index.ts
packages/client/dist/typescript/src/typescript/client/moveTask.ts
packages/client/dist/typescript/src/typescript/hooks/useAddList.ts
packages/client/dist/typescript/src/typescript/hooks/useAssignTask.ts
packages/client/dist/typescript/src/typescript/hooks/useChangeTaskStatus.ts
packages/client/dist/typescript/src/typescript/hooks/useCreateSpace.ts
packages/client/dist/typescript/src/typescript/hooks/useCreateTask.ts
packages/client/dist/typescript/src/typescript/hooks/useCreateWorkspace.ts
packages/client/dist/typescript/src/typescript/hooks/useGetBoardView.ts
packages/client/dist/typescript/src/typescript/hooks/useGetBoardViewSuspense.ts
packages/client/dist/typescript/src/typescript/hooks/useGetListView.ts
packages/client/dist/typescript/src/typescript/hooks/useGetListViewSuspense.ts
packages/client/dist/typescript/src/typescript/hooks/useMoveTask.ts
packages/client/dist/typescript/src/typescript/index.ts
packages/client/dist/typescript/src/typescript/types/AddList.ts
packages/client/dist/typescript/src/typescript/types/ApiErrors.ts
packages/client/dist/typescript/src/typescript/types/AssignTask.ts
packages/client/dist/typescript/src/typescript/types/ChangeTaskStatus.ts
packages/client/dist/typescript/src/typescript/types/CreateSpace.ts
packages/client/dist/typescript/src/typescript/types/CreateTask.ts
packages/client/dist/typescript/src/typescript/types/CreateWorkspace.ts
packages/client/dist/typescript/src/typescript/types/GetBoardView.ts
packages/client/dist/typescript/src/typescript/types/GetListView.ts
packages/client/dist/typescript/src/typescript/types/ListenEvents.ts
packages/client/dist/typescript/src/typescript/types/MoveTask.ts
packages/client/dist/typescript/src/typescript/types/TaskPriority.ts
packages/client/dist/typescript/src/typescript/types/TaskStatus.ts
packages/client/dist/typescript/src/typescript/zod/addListSchema.ts
packages/client/dist/typescript/src/typescript/zod/apiErrorsSchema.ts
packages/client/dist/typescript/src/typescript/zod/assignTaskSchema.ts
packages/client/dist/typescript/src/typescript/zod/changeTaskStatusSchema.ts
packages/client/dist/typescript/src/typescript/zod/createSpaceSchema.ts
packages/client/dist/typescript/src/typescript/zod/createTaskSchema.ts
packages/client/dist/typescript/src/typescript/zod/createWorkspaceSchema.ts
packages/client/dist/typescript/src/typescript/zod/getBoardViewSchema.ts
packages/client/dist/typescript/src/typescript/zod/getListViewSchema.ts
packages/client/dist/typescript/src/typescript/zod/listenEventsSchema.ts
packages/client/dist/typescript/src/typescript/zod/moveTaskSchema.ts
packages/client/dist/typescript/src/typescript/zod/taskPrioritySchema.ts
packages/client/dist/typescript/src/typescript/zod/taskStatusSchema.ts
packages/contracts/db/migrations/0052_chubby_the_santerians.sql
packages/contracts/db/migrations/meta/_journal.json
packages/contracts/db/migrations/meta/0052_snapshot.json
packages/contracts/db/schema/clickup.ts
packages/contracts/db/schema/index.ts
packages/contracts/generated/go/wire/enums.go
packages/contracts/generated/go/wire/envelope.go
packages/contracts/generated/go/wire/events.go
packages/contracts/generated/typescript/src/wire/enums/index.ts
packages/contracts/generated/typescript/src/wire/enums/task-priority.ts
packages/contracts/generated/typescript/src/wire/enums/task-status.ts
packages/contracts/generated/typescript/src/wire/events/_imports.ts
packages/contracts/generated/typescript/src/wire/events/index.ts
packages/contracts/generated/typescript/src/wire/events/task-status-changed.ts
packages/contracts/wire/enums/task-priority.tsp
packages/contracts/wire/enums/task-status.tsp
packages/contracts/wire/events/index.tsp
packages/contracts/wire/events/task-status-changed.tsp
packages/contracts/wire/main.tsp
packages/e2e/tests/clickup-tasks-realtime.spec.ts
```

No deleted files in this patch (0 rejects, 0 `deleted file mode` entries, 0 renames) — nothing
omitted from GOT/ on that account.

## Sanitization

This build predates the product-vocabulary purge; at promotion the standard map was applied
across GOT/ (legacy platform names → the template generic set; legacy Go module/package prefixes →
the template prefixes). Structure, logic, and file layout are otherwise byte-faithful to the
patch applied at the base ref above.

## Pruned generated artifacts

Codegen outputs the build carried (SDK dist, openapi.json, contracts/generated, drizzle meta
snapshots) were pruned at promotion — they are regenerable (`bun sdk` / `bun migrate:create`) and
carried pre-purge vocabulary. Hand-authored content (src, .tsp sources, migration .sql, tests) is
intact. Pruned:
- `packages/api/go/public/openapi.json`
- `packages/api/typescript/public/docs/openapi.json`
- `packages/client/dist/go/pkg/go/client.gen.go`
- `packages/client/dist/go/pkg/typescript/client.gen.go`
- `packages/client/dist/typescript/src/go/index.ts`
- `packages/client/dist/typescript/src/go/types/TaskPriority.ts`
- `packages/client/dist/typescript/src/go/types/TaskStatus.ts`
- `packages/client/dist/typescript/src/go/zod/taskPrioritySchema.ts`
- `packages/client/dist/typescript/src/go/zod/taskStatusSchema.ts`
- `packages/client/dist/typescript/src/typescript/Client.ts`
- `packages/client/dist/typescript/src/typescript/client/addList.ts`
- `packages/client/dist/typescript/src/typescript/client/assignTask.ts`
- `packages/client/dist/typescript/src/typescript/client/changeTaskStatus.ts`
- `packages/client/dist/typescript/src/typescript/client/createSpace.ts`
- `packages/client/dist/typescript/src/typescript/client/createTask.ts`
- `packages/client/dist/typescript/src/typescript/client/createWorkspace.ts`
- `packages/client/dist/typescript/src/typescript/client/getBoardView.ts`
- `packages/client/dist/typescript/src/typescript/client/getListView.ts`
- `packages/client/dist/typescript/src/typescript/client/index.ts`
- `packages/client/dist/typescript/src/typescript/client/moveTask.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useAddList.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useAssignTask.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useChangeTaskStatus.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useCreateSpace.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useCreateTask.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useCreateWorkspace.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useGetBoardView.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useGetBoardViewSuspense.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useGetListView.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useGetListViewSuspense.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useMoveTask.ts`
- `packages/client/dist/typescript/src/typescript/index.ts`
- `packages/client/dist/typescript/src/typescript/types/AddList.ts`
- `packages/client/dist/typescript/src/typescript/types/ApiErrors.ts`
- `packages/client/dist/typescript/src/typescript/types/AssignTask.ts`
- `packages/client/dist/typescript/src/typescript/types/ChangeTaskStatus.ts`
- `packages/client/dist/typescript/src/typescript/types/CreateSpace.ts`
- `packages/client/dist/typescript/src/typescript/types/CreateTask.ts`
- `packages/client/dist/typescript/src/typescript/types/CreateWorkspace.ts`
- `packages/client/dist/typescript/src/typescript/types/GetBoardView.ts`
- `packages/client/dist/typescript/src/typescript/types/GetListView.ts`
- `packages/client/dist/typescript/src/typescript/types/ListenEvents.ts`
- `packages/client/dist/typescript/src/typescript/types/MoveTask.ts`
- `packages/client/dist/typescript/src/typescript/types/TaskPriority.ts`
- `packages/client/dist/typescript/src/typescript/types/TaskStatus.ts`
- `packages/client/dist/typescript/src/typescript/zod/addListSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/apiErrorsSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/assignTaskSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/changeTaskStatusSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/createSpaceSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/createTaskSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/createWorkspaceSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/getBoardViewSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/getListViewSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/listenEventsSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/moveTaskSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/taskPrioritySchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/taskStatusSchema.ts`
- `packages/contracts/db/migrations/meta/0052_snapshot.json`
- `packages/contracts/db/migrations/meta/_journal.json`
- `packages/contracts/generated/go/wire/enums.go`
- `packages/contracts/generated/go/wire/envelope.go`
- `packages/contracts/generated/go/wire/events.go`
- `packages/contracts/generated/typescript/src/wire/enums/index.ts`
- `packages/contracts/generated/typescript/src/wire/enums/task-priority.ts`
- `packages/contracts/generated/typescript/src/wire/enums/task-status.ts`
- `packages/contracts/generated/typescript/src/wire/events/_imports.ts`
- `packages/contracts/generated/typescript/src/wire/events/index.ts`
- `packages/contracts/generated/typescript/src/wire/events/task-status-changed.ts`
