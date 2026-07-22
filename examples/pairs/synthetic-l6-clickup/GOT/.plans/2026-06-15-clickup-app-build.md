# ClickUp App Build — Orchestrator Tracker (2026-06-15)

## Frozen model
- Contexts: `workspace` (Workspace+Space aggregates, List = VO on Space), `task` (Task aggregate + 2 projections + 2 projectors + integration-event publisher). Read by `ui`.
- Workspace.id == tenant storeId (one workspace per tenant). SSE filters by workspaceId == session.storeId.
- TaskStatus/TaskPriority = enums. Assignees = userId strings. Membership folded into workspace.

## Frozen contract (Phase 0)
- enums: TaskStatus{TODO,IN_PROGRESS,IN_REVIEW,DONE}, TaskPriority{LOW,NORMAL,HIGH,URGENT}
- integration event TaskStatusChangedEvent: `integration.shared.task.status_changed`, payload {workspaceId,taskId,fromStatus,toStatus}
- tables: workspaces, spaces, lists, tasks, clickup_list_view, clickup_board_view (schema `clickup`)

## Tasks / waves
- [ ] T0 contract-lock (serial)  → gate: bun contracts, contracts tsc
- [x] T1 workspace ctx (write)   → GATED backend tsc clean
- [x] T2 task ctx (write+events+publisher) → GATED backend tsc clean
- [x] T3 task read-side (2 proj + 2 projector) → GATED tsc + projection-shape 0 findings
- [x] T4 ui queries GetListView/GetBoardView → GATED backend tsc
- [x] T5 ui realtime (BROWSER_EVENTS + workspaceId broadcaster) → GATED backend tsc
- [x] (me) emit-openapi router fix + bun sdk → hooks: useGetListView/useGetBoardView/useCreateTask/useChangeTaskStatus/useAssignTask/useMoveTask/useCreateSpace/useAddList/useCreateWorkspace; schemas createTaskMutationRequestSchema etc.; TaskStatusEnum/TaskPriorityEnum; event integration.shared.task.status_changed
- [x] T6 frontend (route + ViewToggle + SpaceTasksSection + ListView + BoardView + TaskCard + CreateTaskDialog + i18n) → GATED react tsc clean
- [x] T7 e2e clickup-tasks-realtime.spec.ts → GATED e2e tsc clean
- [x] FINAL: backend tsc ✓ react tsc ✓ e2e tsc ✓ projection-shape 0 ✓ `bun run detect` EXIT 0 ✓ (SCW-03 projector-registration fixed via barrel + shorthand slot)

## FROZEN selector contract (e2e ↔ frontend MUST match)
- View toggle: `<button>` text = t('clickup.view.list') / t('clickup.view.board')
- Board column container: data-testid=`board-column-<STATUS>`; header text = t('enums.TaskStatus.<STATUS>')
- Task card (board): data-testid=`task-card-<taskId>`, contains task title
- board section data-testid="board-view"; list section data-testid="list-view"
- i18n keys: enums.TaskStatus.{TODO,IN_PROGRESS,IN_REVIEW,DONE}, enums.TaskPriority.{LOW,NORMAL,HIGH,URGENT}, clickup.view.{list,board}, clickup.createTask.{trigger,title,listLabel,titleLabel,titlePlaceholder,priorityLabel,submit}, clickup.board.empty, clickup.list.empty, clickup.space.heading
- API paths: POST /v1/workspace/workspaces{name}; /v1/workspace/spaces{name}→spaceId; /v1/workspace/spaces/:spaceId/lists{name}→listId; POST /v1/task/tasks{spaceId,listId,title,priority}→taskId; POST /v1/task/tasks/:taskId/status{toStatus}
