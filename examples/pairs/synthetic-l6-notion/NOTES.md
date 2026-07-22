# NOTES — synthetic-l6-notion / l6-notion-iter1

## Provenance

- **stamp**: `l6-notion-iter1`
- **task**: `synthetic-l6-notion`
- **model**: `opus`
- **pass**: `true` (`failedGraders: []`)
- **graded ts**: `2026-06-16T06:01:06.566Z`
- **docTreeHash**: `1a2dc9de7e8e`
- Scoreboard row: `scripts/skill-evals/scoreboard/l6-notion-iter1.jsonl`
- Patch source: `scripts/skill-evals/scoreboard/l6-notion-iter1--synthetic-l6-notion.patch`

## Patch structure

Plain (non-legacy) single-pass git diff: 137 `^diff --git` sections, each file appearing exactly
once (`grep -c '^diff --git'` = 137, and `sort -u` on the header lines also = 137 — no duplicated
per-file sections, no resumed-builder repeats). Zero `^From ` mail headers, zero `deleted file
mode`, zero `rename from`. 106 sections carry `new file mode` (creates); the remaining 31 are
modifications to existing tracked files (generated SDK/OpenAPI/contracts index files, `shared`
registry wiring, `ui/controllers/ListenEvents.ts`, locale files, `routeTree.gen.ts`). No legacy
concatenated-format artifacts found — a single clean `git apply` sufficed, no `-3`, no chunk-
splitting, no `--reject` needed.

## Base reconstruction

The patch file + scoreboard row were committed together, verbatim, as a build artifact at commit
`928cecb5e` ("docs(L6): Notion 21/21 FIRST SAMPLE — the hardest app, under the stricter test bar")
— i.e. the patch was captured and checked in as-is, never applied to the tree at that commit
(`git show --stat 928cecb5e` shows only the two new files: the `.patch` and the `.jsonl` row, 2
files changed, 0 files from the app itself).

- **BASE REF reconstructed at**: `6c2f221f0` ("feat(L6): add test# stage — the apps must WRITE
  tests (TDD) that RUN green"), commit timestamp `2026-06-16T01:08:31-03:00`.
- Candidate refs tried, in order, using `git worktree add --detach <tmp> <ref>` +
  `git apply --check`:
  - `6c2f221f0` (parent of the docs commit, adds the TDD test# stage to the task yaml) → **0
    errors, 0 rejects**.
  - `0e74f8537` ("feat(L6): app #3 — Notion clone probe (the hardest modeling test: RECURSION)",
    the commit that created the task, timestamped `2026-06-16T00:59:26-03:00`) → **also 0 errors,
    0 rejects**.
  - `928cecb5e` itself (the docs commit) → 0 errors, 0 rejects (expected — tree there is identical
    to its parent for app code).
  - Current `v1.9` tip (`9065a96af`) → **fails** (multiple `patch does not apply` errors on
    `openapi.json`, `page-content-changed.tsp`, `main.tsp`, etc. — confirms HEAD-apply is not
    viable and a historical base is required).
  - `git diff --stat 0e74f8537 6c2f221f0` shows the ONLY difference between these two candidates is
    the three task yaml files (`synthetic-l6-clickup.yaml`, `synthetic-l6-mini-kanban.yaml`,
    `synthetic-l6-notion.yaml`) — none of which are in the patch's file universe. So the two
    candidate bases are byte-identical for every file the patch touches; either applies
    identically. `6c2f221f0` is preferred as the more precise base because it is the commit that
    introduced the stricter TDD test# grading stage ("Restarting Notion with it" — per its commit
    message) under which this build actually ran, and this patch does include the required
    colocated tests (`Page.test.ts` entity test, `AddBlock.test.ts` integration-mode use-case
    test) satisfying that stage.
  - Plain `git apply` (no reject/fuzz needed) applied the entire patch cleanly in one shot at
    `6c2f221f0`. Resulting worktree: `git status --porcelain -uall` → exactly 137 entries,
    matching the patch's 137-file universe 1:1 (an earlier `--porcelain` run without `-uall`
    showed only 85 lines because several brand-new directories collapse to one `??` line per
    directory under default porcelain output — `-uall` forces full enumeration).

## What the exemplar shows

Orchestrated (multi-agent, `Task`-tool-driven, opus orchestrator per the model-split rail) from-
scratch build of a minimal Notion clone, scored a clean pass (`failedGraders: []`) — the L6 ladder's
"21/21 FIRST SAMPLE" result, the hardest of the three L6 apps because the modeling challenge is
genuine RECURSION (self-referential block tree + nested pages), plus the newly-added TDD test#
stage. Per the task prompt/rubric it demonstrates:

- **DDD decomposition**: two bounded contexts — `workspace` (owns the page hierarchy: `Workspace`
  entity, `CreateWorkspace`/`GetWorkspacePageTree`) and `page` (owns the **Page aggregate**, which
  owns the entire recursive block tree). No third `notion` god-context.
- **Recursion, modeled correctly on both sides**:
  - Backend: `packages/api/typescript/src/page/objects/Block.ts` defines `Block` as a recursive
    composite VALUE OBJECT (`BlockProps` has `children: BlockProps[]`), with a self-referential Zod
    schema via `z.lazy()`, plus `findBlock`/`flattenTree`/`buildTree` tree helpers. It is explicitly
    NOT an aggregate — no Block repository, use case, controller, or event; the `Page` entity is
    the sole consistency boundary and enforces the invariant that only `TOGGLE` (container) blocks
    may hold children, throwing named domain errors (`BLOCK_NOT_FOUND`, `BLOCK_PARENT_NOT_CONTAINER`)
    from `packages/api/typescript/src/page/entities/Page.ts` when violated.
  - Frontend: `PageViewSection/Block.tsx` is a genuinely recursive component — `ToggleBlock` maps
    `block.children` back into `<Block key={child.id} block={child} pageId={pageId} />`, with a
    type-keyed render-map (`TextBlock`/`HeadingBlock`/`ToggleBlock`) dispatching on `BlockTypeEnum`.
  - `BlockType` is an enum (`TEXT|HEADING|TOGGLE`), not a context, sourced from
    `packages/contracts/wire/enums/block-type.tsp` and generated into both TS and Go bindings.
  - Pages nest via `parentPageId` (`workspace` context's `GetWorkspacePageTree` + `PageTreeNav` on
    the frontend).
- **Contract lock**: `PageContentChanged` integration event (`packages/contracts/wire/events/
  page-content-changed.tsp`, TypeSpec model `PageContentChangedEvent`, wire name
  `integration.shared.page.content_changed`) carrying `workspaceId` (SSE realtime tenancy key),
  `pageId`, and a `PageChangeKind` enum; wired into the `ui` BFF's `ListenEvents` controller
  BROWSER_EVENTS union; new Drizzle tables (`packages/contracts/db/schema/page.ts`,
  `packages/contracts/db/schema/workspace.ts`) and migration `0052_wandering_blackheart.sql` (blocks
  stored adjacency-list style with `parent_block_id` + `position`).
- **CQRS read-side**: `PageView` projection — the page denormalized as its nested block tree plus
  child-page list — driven by `PageViewProjector` off `PageCreated`/`BlockAdded`/`BlockEdited`,
  exposed via the `page` context's `GetPageView` use case + `ui`-style controller.
- **Frontend**: a thin `pages/$pageId` route, a data-owning `PageViewSection` rendering the tree via
  the recursive `Block` component, a `PageTreeNav` for page nesting, a `CreateBlockControl` mutation,
  and one `useServerEvents(PageContentChanged…)` invalidating the page-view query key. Block-type
  labels sourced from the typed `BlockTypeEnum` catalog in both `en.json`/`pt.json` locales.
- **TDD**: colocated tests inside `packages/api/typescript/src/page/` — `entities/Page.test.ts`
  (entity invariant test on the block tree) and `usecases/AddBlock.test.ts` (use case test using
  `TestBed.create('integration', …)`) — satisfying the task's new `test#colocated-exists` /
  `test#integration-mode` / `test#green` grading stage. (This reconstruction verifies the patch
  applies cleanly and reproduces the file set; it does not independently re-run `bun test` or
  `tsc` — those are the scoreboard row's own `pass:true` claim, not re-verified here.)
- **E2E discipline**: a real (non-stubbed) Playwright spec at the pinned path
  `packages/e2e/tests/notion-page-realtime.spec.ts` — sets up state via the authenticated REST API
  (not UI clicks), uses role/text selectors (no `getByTestId`), no `waitForTimeout`, and asserts a
  block added via the API appears in the open page without reload (SSE → React Query invalidation).

## Files (GOT/)

137 files copied verbatim from the applied-patch worktree (all creates/modifications; 0 deletions,
0 renames in this patch — nothing omitted on that account). Full relative-path listing:

```
packages/api/go/public/openapi.json
packages/api/typescript/core/src/repositories/DomainEventRepository.ts
packages/api/typescript/public/docs/openapi.json
packages/api/typescript/scripts/emit-openapi.ts
packages/api/typescript/src/index.ts
packages/api/typescript/src/page/controllers/AddBlock.ts
packages/api/typescript/src/page/controllers/CreatePage.ts
packages/api/typescript/src/page/controllers/EditBlock.ts
packages/api/typescript/src/page/controllers/GetPageView.ts
packages/api/typescript/src/page/controllers/index.ts
packages/api/typescript/src/page/entities/Page.test.ts
packages/api/typescript/src/page/entities/Page.ts
packages/api/typescript/src/page/errors/index.ts
packages/api/typescript/src/page/events/BlockAddedEvent.ts
packages/api/typescript/src/page/events/BlockEditedEvent.ts
packages/api/typescript/src/page/events/index.ts
packages/api/typescript/src/page/events/PageCreatedEvent.ts
packages/api/typescript/src/page/handlers/internal.ts
packages/api/typescript/src/page/index.ts
packages/api/typescript/src/page/objects/Block.ts
packages/api/typescript/src/page/projections/PageView.ts
packages/api/typescript/src/page/projections/PageViewProjectionRepository/DrizzlePageViewProjectionRepository.ts
packages/api/typescript/src/page/projections/PageViewProjectionRepository/index.ts
packages/api/typescript/src/page/projections/PageViewProjectionRepository/MockPageViewProjectionRepository.ts
packages/api/typescript/src/page/projections/PageViewProjectionRepository/PageViewProjectionRepository.ts
packages/api/typescript/src/page/projections/projectors/index.ts
packages/api/typescript/src/page/projections/projectors/PageViewProjector.ts
packages/api/typescript/src/page/registry.ts
packages/api/typescript/src/page/repositories/PageRepository/DrizzlePageRepository.ts
packages/api/typescript/src/page/repositories/PageRepository/index.ts
packages/api/typescript/src/page/repositories/PageRepository/MockPageRepository.ts
packages/api/typescript/src/page/repositories/PageRepository/PageRepository.ts
packages/api/typescript/src/page/usecases/AddBlock.test.ts
packages/api/typescript/src/page/usecases/AddBlock.ts
packages/api/typescript/src/page/usecases/CreatePage.ts
packages/api/typescript/src/page/usecases/EditBlock.ts
packages/api/typescript/src/page/usecases/GetPageView.ts
packages/api/typescript/src/page/usecases/index.ts
packages/api/typescript/src/shared/index.ts
packages/api/typescript/src/shared/registry.ts
packages/api/typescript/src/ui/controllers/ListenEvents.ts
packages/api/typescript/src/workspace/controllers/CreateWorkspace.ts
packages/api/typescript/src/workspace/controllers/GetWorkspacePageTree.ts
packages/api/typescript/src/workspace/controllers/index.ts
packages/api/typescript/src/workspace/entities/Workspace.ts
packages/api/typescript/src/workspace/errors/index.ts
packages/api/typescript/src/workspace/events/index.ts
packages/api/typescript/src/workspace/events/WorkspaceCreatedEvent.ts
packages/api/typescript/src/workspace/index.ts
packages/api/typescript/src/workspace/registry.ts
packages/api/typescript/src/workspace/repositories/WorkspaceRepository/DrizzleWorkspaceRepository.ts
packages/api/typescript/src/workspace/repositories/WorkspaceRepository/index.ts
packages/api/typescript/src/workspace/repositories/WorkspaceRepository/MockWorkspaceRepository.ts
packages/api/typescript/src/workspace/repositories/WorkspaceRepository/WorkspaceRepository.ts
packages/api/typescript/src/workspace/usecases/CreateWorkspace.ts
packages/api/typescript/src/workspace/usecases/GetWorkspacePageTree.ts
packages/api/typescript/src/workspace/usecases/index.ts
packages/app/react/src/locales/en.json
packages/app/react/src/locales/pt.json
packages/app/react/src/routes/(app)/workspaces/$workspaceId/pages/$pageId/-components/PageTreeNav/index.tsx
packages/app/react/src/routes/(app)/workspaces/$workspaceId/pages/$pageId/-components/PageViewSection/Block.tsx
packages/app/react/src/routes/(app)/workspaces/$workspaceId/pages/$pageId/-components/PageViewSection/blockNode.ts
packages/app/react/src/routes/(app)/workspaces/$workspaceId/pages/$pageId/-components/PageViewSection/CreateBlockControl.tsx
packages/app/react/src/routes/(app)/workspaces/$workspaceId/pages/$pageId/-components/PageViewSection/index.tsx
packages/app/react/src/routes/(app)/workspaces/$workspaceId/pages/$pageId/index.tsx
packages/app/react/src/routeTree.gen.ts
packages/client/dist/go/pkg/go/client.gen.go
packages/client/dist/go/pkg/typescript/client.gen.go
packages/client/dist/typescript/src/go/index.ts
packages/client/dist/typescript/src/go/types/BlockType.ts
packages/client/dist/typescript/src/go/types/PageChangeKind.ts
packages/client/dist/typescript/src/go/zod/blockTypeSchema.ts
packages/client/dist/typescript/src/go/zod/pageChangeKindSchema.ts
packages/client/dist/typescript/src/typescript/Client.ts
packages/client/dist/typescript/src/typescript/client/addBlock.ts
packages/client/dist/typescript/src/typescript/client/createPage.ts
packages/client/dist/typescript/src/typescript/client/createWorkspace.ts
packages/client/dist/typescript/src/typescript/client/editBlock.ts
packages/client/dist/typescript/src/typescript/client/getPageView.ts
packages/client/dist/typescript/src/typescript/client/getWorkspacePageTree.ts
packages/client/dist/typescript/src/typescript/client/index.ts
packages/client/dist/typescript/src/typescript/hooks/useAddBlock.ts
packages/client/dist/typescript/src/typescript/hooks/useCreatePage.ts
packages/client/dist/typescript/src/typescript/hooks/useCreateWorkspace.ts
packages/client/dist/typescript/src/typescript/hooks/useEditBlock.ts
packages/client/dist/typescript/src/typescript/hooks/useGetPageView.ts
packages/client/dist/typescript/src/typescript/hooks/useGetPageViewSuspense.ts
packages/client/dist/typescript/src/typescript/hooks/useGetWorkspacePageTree.ts
packages/client/dist/typescript/src/typescript/hooks/useGetWorkspacePageTreeSuspense.ts
packages/client/dist/typescript/src/typescript/index.ts
packages/client/dist/typescript/src/typescript/types/AddBlock.ts
packages/client/dist/typescript/src/typescript/types/ApiErrors.ts
packages/client/dist/typescript/src/typescript/types/BlockType.ts
packages/client/dist/typescript/src/typescript/types/CreatePage.ts
packages/client/dist/typescript/src/typescript/types/CreateWorkspace.ts
packages/client/dist/typescript/src/typescript/types/EditBlock.ts
packages/client/dist/typescript/src/typescript/types/GetPageView.ts
packages/client/dist/typescript/src/typescript/types/GetWorkspacePageTree.ts
packages/client/dist/typescript/src/typescript/types/ListenEvents.ts
packages/client/dist/typescript/src/typescript/types/PageChangeKind.ts
packages/client/dist/typescript/src/typescript/types/PageTreeNode.ts
packages/client/dist/typescript/src/typescript/types/PageViewBlockNode.ts
packages/client/dist/typescript/src/typescript/types/Schema0.ts
packages/client/dist/typescript/src/typescript/zod/addBlockSchema.ts
packages/client/dist/typescript/src/typescript/zod/apiErrorsSchema.ts
packages/client/dist/typescript/src/typescript/zod/blockTypeSchema.ts
packages/client/dist/typescript/src/typescript/zod/createPageSchema.ts
packages/client/dist/typescript/src/typescript/zod/createWorkspaceSchema.ts
packages/client/dist/typescript/src/typescript/zod/editBlockSchema.ts
packages/client/dist/typescript/src/typescript/zod/getPageViewSchema.ts
packages/client/dist/typescript/src/typescript/zod/getWorkspacePageTreeSchema.ts
packages/client/dist/typescript/src/typescript/zod/listenEventsSchema.ts
packages/client/dist/typescript/src/typescript/zod/pageChangeKindSchema.ts
packages/client/dist/typescript/src/typescript/zod/pageTreeNodeSchema.ts
packages/client/dist/typescript/src/typescript/zod/pageViewBlockNodeSchema.ts
packages/client/dist/typescript/src/typescript/zod/schema0Schema.ts
packages/contracts/db/migrations/0052_wandering_blackheart.sql
packages/contracts/db/migrations/meta/_journal.json
packages/contracts/db/migrations/meta/0052_snapshot.json
packages/contracts/db/schema/index.ts
packages/contracts/db/schema/page.ts
packages/contracts/db/schema/workspace.ts
packages/contracts/generated/go/wire/enums.go
packages/contracts/generated/go/wire/envelope.go
packages/contracts/generated/go/wire/events.go
packages/contracts/generated/typescript/src/wire/enums/block-type.ts
packages/contracts/generated/typescript/src/wire/enums/index.ts
packages/contracts/generated/typescript/src/wire/enums/page-change-kind.ts
packages/contracts/generated/typescript/src/wire/events/_imports.ts
packages/contracts/generated/typescript/src/wire/events/index.ts
packages/contracts/generated/typescript/src/wire/events/page-content-changed.ts
packages/contracts/wire/enums/block-type.tsp
packages/contracts/wire/enums/page-change-kind.tsp
packages/contracts/wire/events/index.tsp
packages/contracts/wire/events/page-content-changed.tsp
packages/contracts/wire/main.tsp
packages/e2e/tests/notion-page-realtime.spec.ts
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
- `packages/client/dist/typescript/src/go/types/BlockType.ts`
- `packages/client/dist/typescript/src/go/types/PageChangeKind.ts`
- `packages/client/dist/typescript/src/go/zod/blockTypeSchema.ts`
- `packages/client/dist/typescript/src/go/zod/pageChangeKindSchema.ts`
- `packages/client/dist/typescript/src/typescript/Client.ts`
- `packages/client/dist/typescript/src/typescript/client/addBlock.ts`
- `packages/client/dist/typescript/src/typescript/client/createPage.ts`
- `packages/client/dist/typescript/src/typescript/client/createWorkspace.ts`
- `packages/client/dist/typescript/src/typescript/client/editBlock.ts`
- `packages/client/dist/typescript/src/typescript/client/getPageView.ts`
- `packages/client/dist/typescript/src/typescript/client/getWorkspacePageTree.ts`
- `packages/client/dist/typescript/src/typescript/client/index.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useAddBlock.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useCreatePage.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useCreateWorkspace.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useEditBlock.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useGetPageView.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useGetPageViewSuspense.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useGetWorkspacePageTree.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useGetWorkspacePageTreeSuspense.ts`
- `packages/client/dist/typescript/src/typescript/index.ts`
- `packages/client/dist/typescript/src/typescript/types/AddBlock.ts`
- `packages/client/dist/typescript/src/typescript/types/ApiErrors.ts`
- `packages/client/dist/typescript/src/typescript/types/BlockType.ts`
- `packages/client/dist/typescript/src/typescript/types/CreatePage.ts`
- `packages/client/dist/typescript/src/typescript/types/CreateWorkspace.ts`
- `packages/client/dist/typescript/src/typescript/types/EditBlock.ts`
- `packages/client/dist/typescript/src/typescript/types/GetPageView.ts`
- `packages/client/dist/typescript/src/typescript/types/GetWorkspacePageTree.ts`
- `packages/client/dist/typescript/src/typescript/types/ListenEvents.ts`
- `packages/client/dist/typescript/src/typescript/types/PageChangeKind.ts`
- `packages/client/dist/typescript/src/typescript/types/PageTreeNode.ts`
- `packages/client/dist/typescript/src/typescript/types/PageViewBlockNode.ts`
- `packages/client/dist/typescript/src/typescript/types/Schema0.ts`
- `packages/client/dist/typescript/src/typescript/zod/addBlockSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/apiErrorsSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/blockTypeSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/createPageSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/createWorkspaceSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/editBlockSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/getPageViewSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/getWorkspacePageTreeSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/listenEventsSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/pageChangeKindSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/pageTreeNodeSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/pageViewBlockNodeSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/schema0Schema.ts`
- `packages/contracts/db/migrations/meta/0052_snapshot.json`
- `packages/contracts/db/migrations/meta/_journal.json`
- `packages/contracts/generated/go/wire/enums.go`
- `packages/contracts/generated/go/wire/envelope.go`
- `packages/contracts/generated/go/wire/events.go`
- `packages/contracts/generated/typescript/src/wire/enums/block-type.ts`
- `packages/contracts/generated/typescript/src/wire/enums/index.ts`
- `packages/contracts/generated/typescript/src/wire/enums/page-change-kind.ts`
- `packages/contracts/generated/typescript/src/wire/events/_imports.ts`
- `packages/contracts/generated/typescript/src/wire/events/index.ts`
- `packages/contracts/generated/typescript/src/wire/events/page-content-changed.ts`
