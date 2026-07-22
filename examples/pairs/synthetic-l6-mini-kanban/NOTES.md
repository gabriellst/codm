# NOTES — synthetic-l6-mini-kanban / l6-mini-kanban-iter4

## Provenance

- **stamp**: `l6-mini-kanban-iter4`
- **task**: `synthetic-l6-mini-kanban`
- **model**: `sonnet`
- **mode**: `agent`
- **pass**: `true` (`failedGraders: []`)
- **graded ts**: `2026-06-15T19:41:55.230Z`
- **docTreeHash**: `4621fa28fac3`

Source row (`scripts/skill-evals/scoreboard/l6-mini-kanban-iter4.jsonl`):
```json
{"ts":"2026-06-15T19:41:55.230Z","task":"synthetic-l6-mini-kanban","mode":"agent","pass":true,"failedGraders":[],"docTreeHash":"4621fa28fac3","model":"sonnet"}
```

## Base ref reconstruction

The patch (`l6-mini-kanban-iter4--synthetic-l6-mini-kanban.patch`) is a **single, clean
git-diff document** — 89 `diff --git` headers, all unique paths (no repeated file
sections, no `^From ` mail headers), so this is NOT the legacy-concatenated format.
72 of the 89 entries are `new file mode` (fresh files), 17 are modifications to
existing tracked files, 0 deletions.

Base was located by correlating the row's `ts` (graded at 2026-06-15T19:41:55Z UTC =
16:41:55 local/-03:00) against the `v1.9` commit timeline for that day. The commit
`f2e493f20 "docs(L6): k=2 CONFIRMED — iter4 also 16/16, the app-from-idea build is
RELIABLE"` lands at 16:43:08 local — **1m13s after** this row's graded timestamp,
i.e. it is the commit that documents this exact iter4 result. The build therefore
ran against the HEAD immediately prior to that documentation commit:

- **BASE REF: `bea58094e`** ("docs(L6): GOAL ACHIEVED — autonomous app-from-idea
  build is FULLY GREEN (iter3 16/16)", 2026-06-15T15:11:51-03:00) — the last commit
  before `f2e493f20` and before the graded ts.

`promote`'s HEAD-apply was never attempted/needed as a separate failing step here:
this is a from-scratch synthetic build (task notes: "Builds FROM SCRATCH (no seed)"),
so the natural reconstruction path is dated-commit correlation, not a failed
HEAD-apply followed by bisection. `git worktree add --detach <tmp> bea58094e` +
`git apply --check <patch>` succeeded with **zero rejects** on the first candidate
tried — no `-3`, no chunk-splitting, no `--reject` fallback was required.

## What the exemplar shows

Full L6 "app-from-idea" probe: from a one-line idea ("workspaces of boards; ordered
lists; cards move between lists; realtime for viewers") the build (orchestrated via
the `Task` tool, worker subagents per wave) produced an end-to-end minimal Kanban
slice:

- **Bounded contexts**: `board` (Board aggregate owning its lists as ordered
  value-objects/columns — NOT a separate List aggregate/context) and `card` (Card
  aggregate with identity + move behavior), plus the `ui` BFF context for the
  read-side query/controller and the realtime `ListenEvents` SSE endpoint.
- **Contract lock**: the `CardMoved` integration event (`CardMovedEvent` TypeSpec
  model, wire name `integration.shared.card.moved`) carrying `boardId` (realtime
  tenancy key) + `cardId` + `fromListId` + `toListId`, frozen in
  `packages/contracts/wire/events/card-moved.tsp` and wired into the generated
  TS/Go bindings, plus the `kanban` Drizzle schema (boards/lists/cards) and its
  migration `0052_dashing_sleeper.sql`.
- **Read-side**: `GetBoard`/`ListBoards` UI use cases and controllers backing a
  `BoardView`-shaped read query.
- **Frontend**: `/kanban` and `/kanban/$boardId` routes, a data-owning
  `BoardSection` (GetBoard hook + realtime subscription) and `CreateCardDialog`,
  i18n entries in both `en.json`/`pt.json`, and the regenerated SDK
  (`@berzerk/client-typescript` dist — client fns, hooks, zod schemas, types) for
  `createBoard`/`createCard`/`getBoard`/`listBoards`/`moveCard`.
- **E2E**: `packages/e2e/tests/kanban-board-realtime.spec.ts` — the fixed-path
  spec asserting the realtime card-move flow via the API request context.

This is the GREEN (`pass: true`, all graders empty-failed) iter4 sample used to
confirm k=2 reliability of the autonomous app-from-idea pipeline for this task.

## Files (GOT/)

72 new files, 17 modified files (0 deletions) copied verbatim from the patch as
applied at `bea58094e`:

```
packages/api/typescript/src/board/controllers/ArchiveBoardController.ts
packages/api/typescript/src/board/controllers/CreateBoardController.ts
packages/api/typescript/src/board/controllers/index.ts
packages/api/typescript/src/board/entities/Board.ts
packages/api/typescript/src/board/entities/BoardList.ts
packages/api/typescript/src/board/errors/index.ts
packages/api/typescript/src/board/events/BoardArchivedEvent.ts
packages/api/typescript/src/board/events/BoardCreatedEvent.ts
packages/api/typescript/src/board/events/index.ts
packages/api/typescript/src/board/index.ts
packages/api/typescript/src/board/registry.ts
packages/api/typescript/src/board/repositories/BoardRepository.ts
packages/api/typescript/src/board/repositories/DrizzleBoardRepository.ts
packages/api/typescript/src/board/repositories/index.ts
packages/api/typescript/src/board/repositories/MockBoardRepository.ts
packages/api/typescript/src/board/usecases/ArchiveBoard.ts
packages/api/typescript/src/board/usecases/CreateBoard.ts
packages/api/typescript/src/board/usecases/index.ts
packages/api/typescript/src/card/controllers/CreateCardController.ts
packages/api/typescript/src/card/controllers/index.ts
packages/api/typescript/src/card/controllers/MoveCardController.ts
packages/api/typescript/src/card/entities/Card.ts
packages/api/typescript/src/card/errors/index.ts
packages/api/typescript/src/card/events/CardCreatedEvent.ts
packages/api/typescript/src/card/events/CardMovedDomainEvent.ts
packages/api/typescript/src/card/events/index.ts
packages/api/typescript/src/card/handlers/CardMovedDomainEventHandler.ts
packages/api/typescript/src/card/handlers/internal.ts
packages/api/typescript/src/card/index.ts
packages/api/typescript/src/card/registry.ts
packages/api/typescript/src/card/repositories/CardRepository.ts
packages/api/typescript/src/card/repositories/DrizzleCardRepository.ts
packages/api/typescript/src/card/repositories/index.ts
packages/api/typescript/src/card/repositories/MockCardRepository.ts
packages/api/typescript/src/card/usecases/CreateCard.ts
packages/api/typescript/src/card/usecases/index.ts
packages/api/typescript/src/card/usecases/MoveCard.ts
packages/api/typescript/src/index.ts
packages/api/typescript/src/shared/registry.ts
packages/api/typescript/src/ui/controllers/GetBoardController.ts
packages/api/typescript/src/ui/controllers/index.ts
packages/api/typescript/src/ui/controllers/ListBoardsController.ts
packages/api/typescript/src/ui/controllers/ListenEvents.ts
packages/api/typescript/src/ui/usecases/GetBoard.ts
packages/api/typescript/src/ui/usecases/index.ts
packages/api/typescript/src/ui/usecases/ListBoards.ts
packages/app/react/src/locales/en.json
packages/app/react/src/locales/pt.json
packages/app/react/src/routes/(app)/kanban/-components/BoardsListSection/index.tsx
packages/app/react/src/routes/(app)/kanban/$boardId/-components/BoardSection/index.tsx
packages/app/react/src/routes/(app)/kanban/$boardId/-components/CreateCardDialog/index.tsx
packages/app/react/src/routes/(app)/kanban/$boardId/index.tsx
packages/app/react/src/routes/(app)/kanban/index.tsx
packages/app/react/src/routeTree.gen.ts
packages/client/dist/typescript/src/typescript/client/createBoard.ts
packages/client/dist/typescript/src/typescript/client/createCard.ts
packages/client/dist/typescript/src/typescript/client/getBoard.ts
packages/client/dist/typescript/src/typescript/client/listBoards.ts
packages/client/dist/typescript/src/typescript/client/moveCard.ts
packages/client/dist/typescript/src/typescript/hooks/useCreateBoard.ts
packages/client/dist/typescript/src/typescript/hooks/useCreateCard.ts
packages/client/dist/typescript/src/typescript/hooks/useGetBoard.ts
packages/client/dist/typescript/src/typescript/hooks/useListBoards.ts
packages/client/dist/typescript/src/typescript/hooks/useMoveCard.ts
packages/client/dist/typescript/src/typescript/index.ts
packages/client/dist/typescript/src/typescript/types/CreateBoard.ts
packages/client/dist/typescript/src/typescript/types/CreateCard.ts
packages/client/dist/typescript/src/typescript/types/GetBoard.ts
packages/client/dist/typescript/src/typescript/types/ListBoards.ts
packages/client/dist/typescript/src/typescript/types/ListenEvents.ts
packages/client/dist/typescript/src/typescript/types/MoveCard.ts
packages/client/dist/typescript/src/typescript/zod/createBoardSchema.ts
packages/client/dist/typescript/src/typescript/zod/createCardSchema.ts
packages/client/dist/typescript/src/typescript/zod/getBoardSchema.ts
packages/client/dist/typescript/src/typescript/zod/listBoardsSchema.ts
packages/client/dist/typescript/src/typescript/zod/moveCardSchema.ts
packages/contracts/db/migrations/0052_dashing_sleeper.sql
packages/contracts/db/migrations/meta/_journal.json
packages/contracts/db/migrations/meta/0052_snapshot.json
packages/contracts/db/schema/index.ts
packages/contracts/db/schema/kanban.ts
packages/contracts/generated/go/wire/envelope.go
packages/contracts/generated/go/wire/events.go
packages/contracts/generated/typescript/src/wire/events/_imports.ts
packages/contracts/generated/typescript/src/wire/events/card-moved.ts
packages/contracts/generated/typescript/src/wire/events/index.ts
packages/contracts/wire/events/card-moved.tsp
packages/contracts/wire/events/index.tsp
packages/e2e/tests/kanban-board-realtime.spec.ts
```

No deleted files in this patch.

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
- `packages/client/dist/typescript/src/typescript/client/createBoard.ts`
- `packages/client/dist/typescript/src/typescript/client/createCard.ts`
- `packages/client/dist/typescript/src/typescript/client/getBoard.ts`
- `packages/client/dist/typescript/src/typescript/client/listBoards.ts`
- `packages/client/dist/typescript/src/typescript/client/moveCard.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useCreateBoard.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useCreateCard.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useGetBoard.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useListBoards.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useMoveCard.ts`
- `packages/client/dist/typescript/src/typescript/index.ts`
- `packages/client/dist/typescript/src/typescript/types/CreateBoard.ts`
- `packages/client/dist/typescript/src/typescript/types/CreateCard.ts`
- `packages/client/dist/typescript/src/typescript/types/GetBoard.ts`
- `packages/client/dist/typescript/src/typescript/types/ListBoards.ts`
- `packages/client/dist/typescript/src/typescript/types/ListenEvents.ts`
- `packages/client/dist/typescript/src/typescript/types/MoveCard.ts`
- `packages/client/dist/typescript/src/typescript/zod/createBoardSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/createCardSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/getBoardSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/listBoardsSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/moveCardSchema.ts`
- `packages/contracts/db/migrations/meta/0052_snapshot.json`
- `packages/contracts/db/migrations/meta/_journal.json`
- `packages/contracts/generated/go/wire/envelope.go`
- `packages/contracts/generated/go/wire/events.go`
- `packages/contracts/generated/typescript/src/wire/events/_imports.ts`
- `packages/contracts/generated/typescript/src/wire/events/card-moved.ts`
- `packages/contracts/generated/typescript/src/wire/events/index.ts`
