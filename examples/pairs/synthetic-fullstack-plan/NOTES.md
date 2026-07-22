# NOTES — synthetic-fullstack-plan / fullstack-plan-iter1

## Provenance

- **task**: `synthetic-fullstack-plan`
- **stamp**: `fullstack-plan-iter1`
- **model**: `sonnet`
- **mode**: `agent`
- **pass**: `true`
- **failedGraders**: `[]` (all 8 graders passed, including the `judge#handoff-authoring` semantic grader)
- **graded ts**: `2026-06-15T02:48:26.737Z`
- **docTreeHash**: `dddf86ebbd27`

Source row (`scripts/skill-evals/scoreboard/fullstack-plan-iter1.jsonl`):
```json
{"ts":"2026-06-15T02:48:26.737Z","task":"synthetic-fullstack-plan","mode":"agent","pass":true,"failedGraders":[],"docTreeHash":"dddf86ebbd27","model":"sonnet"}
```

## BASE REF reconstructed at

**`5b907dfbd` — `feat(evals): synthetic-fullstack-plan — full-loop stage 1 (does the system WRITE handoffs?)`** (2026-06-14 23:35:04 -03:00) — the commit that introduced this eval task's yaml on `v1.9`, ~13 minutes before the graded ts. It also carries the seed fixture the task's `seedCommands` applies (`scripts/skill-evals/seeds/synthetic-fullstack-handoff/phases-1-3.patch`, added a few commits earlier at `07929595c` and unchanged in between). `git apply --check` of the reconstructed patch is clean here with **zero rejects** across all 78 files.

### Patch structure

Single-document diff, not the legacy concatenated format: `grep -c '^diff --git'` = 78, `grep -c '^From '` = 0, and every changed path appears exactly once (`sort -u` count also 78). No `deleted file mode` lines — nothing was deleted by this build.

### Why a plain apply at any live commit fails, and what fixed it

A direct `git apply --check` of the on-disk patch (`scripts/skill-evals/scoreboard/fullstack-plan-iter1--synthetic-fullstack-plan.patch`) against `5b907dfbd` fails on exactly one file: `packages/api/typescript/src/ui/controllers/ListenEvents.ts`, at the hunk whose unchanged context line reads `} from '@template/contracts-typescript/wire/events'`. The base file at `5b907dfbd` (confirmed via the patch's own `index c6e923748..` pre-image blob, which is present in the repo's object database) still reads `@template/contracts-typescript` there — same root cause already diagnosed on the sibling `synthetic-fullstack-handoff` candidate: the repo underwent a wholesale `@template → @template` rebrand sweep at commit `3d203d214` ("W4 rebrand", 2026-07-20) that mechanically rewrote **every tracked file containing the literal string `@template`**, including this frozen scoreboard patch (`grep -c '@template'` on the current on-disk patch = 0, `grep -c '@template'` = 49 — a 100%-consistent post-sweep rewrite, not partial).

Fix applied (no fabrication — pure git-history retrieval): recovered the pristine pre-sweep bytes of this same patch file from git history at `7f54066df` ("chore: scoreboard checkpoint before clean-branch work", the commit that added it, right before `3d203d214` later rewrote it and one commit before nothing else touched it):

```
git show 7f54066df:scripts/skill-evals/scoreboard/fullstack-plan-iter1--synthetic-fullstack-plan.patch > /tmp/original-fullstack-plan-iter1.patch
```

`diff` against the current on-disk patch: 98 changed lines, 100% `@template` ⇄ `@template` token substitutions (e.g. `@template/core-typescript` → `@template/core-typescript`, `@template/contracts-typescript` → `@template/contracts-typescript`) — confirming this is exactly the mechanical rebrand bleed-through and nothing else, no semantic drift.

Applying this pre-sweep, git-history-original patch at `5b907dfbd`:

```
git worktree add --detach /tmp/recon-fullstack-plan-iter1 5b907dfbd
git -C /tmp/recon-fullstack-plan-iter1 apply --check /tmp/original-fullstack-plan-iter1.patch   # exit 0, zero errors
git -C /tmp/recon-fullstack-plan-iter1 apply /tmp/original-fullstack-plan-iter1.patch           # applied clean (only harmless trailing-whitespace warnings)
```

No `-3`, no manual hunk splitting, and no rejects were needed once the pre-sweep patch bytes were used.

## What the exemplar shows

This is **stage 1 of the "full loop" pair** (`synthetic-fullstack-plan` / `synthetic-fullstack-handoff`): rather than executing a handoff, the agent must **author** one. The same iter8 backend (contracts + `procurement` TS bounded context + Go sync consumer + regenerated SDK, 77 files) was seeded into the worktree via `git apply` of `phases-1-3.patch` before the agent started. The agent's actual deliverable is the single new file `.plans/purchase-orders-frontend.md` — an implementation plan for the remaining frontend + e2e work, following the `/plan` Task grammar (`## Task T<N>:`, `**Files to write:**`, `**Agent:**`, `**Depends on:**`, `### Step T<N>.K`) with every non-Phase-0 Task carrying a load-bearing handoff (`**Consumes (frozen):**` naming exact SDK identifiers like `useListPurchaseOrders`/`useCreatePurchaseOrder`/`useCancelPurchaseOrder`/`PurchaseOrderRecordedEvent`, `**Scope fence:**`, `**Gate:**`).

The build **passed all 8 graders** on this row, including the file-exists, no-implementation-leaked, PR-28 mechanical validate-plan check, the three structural grep-musts (Consumes/Gate/Scope fence present), the exact-identifier grep, and the `judge#handoff-authoring` semantic judge. The written plan (`GOT/.plans/purchase-orders-frontend.md`) decomposes the work into 5 Tasks: T1 route shell + i18n + nav wiring, T2 `PurchaseOrderListSection` with SSE realtime invalidation, T3 create-purchase-order dialog, T4 cancel-purchase-order dialog + action wiring, T5 the Playwright e2e spec — matching the task prompt's suggested decomposition (route shell + data-owning list section, create/cancel dialog, realtime subscription, e2e spec) without collapsing into one mega-Task or splitting into raw horizontal layers.

All other 77 files in `GOT/` are the seeded backend (contracts, TS `procurement` BC, Go consumer, regenerated SDK) — present because they're part of the patch's file universe (the build's diff against a pre-seed tree includes everything the seed step wrote), not because this agent authored them.

No files were deleted by this patch.

## Files (GOT/)

78 files total, copied verbatim from the applied worktree at base `5b907dfbd`:

**Plan — the agent's actual deliverable**
- `.plans/purchase-orders-frontend.md` (5 Tasks: T1 route shell, T2 list section + realtime, T3 create dialog, T4 cancel dialog, T5 e2e spec)

**Contracts (TypeSpec + generated bindings + DB migration — seeded backend)**
- `packages/contracts/wire/main.tsp`
- `packages/contracts/wire/events/{index.tsp,purchase-order-recorded.tsp}`
- `packages/contracts/wire/enums/purchase-order-status.tsp`
- `packages/contracts/generated/typescript/src/wire/events/{index.ts,_imports.ts,purchase-order-recorded.ts}`
- `packages/contracts/generated/typescript/src/wire/enums/{index.ts,purchase-order-status.ts}`
- `packages/contracts/generated/go/wire/{enums.go,envelope.go,events.go}`
- `packages/contracts/db/schema/{index.ts,procurement.ts}`
- `packages/contracts/db/migrations/0052_parched_malice.sql`
- `packages/contracts/db/migrations/meta/{_journal.json,0052_snapshot.json}`

**TS API — `procurement` bounded context + BFF + realtime union (seeded backend)**
- `packages/api/typescript/src/index.ts`
- `packages/api/typescript/src/shared/registry.ts`
- `packages/api/typescript/src/procurement/**` (entities, usecases, controllers, repositories, events, errors, handlers, registry, index — full BC)
- `packages/api/typescript/src/ui/controllers/{index.ts,ListenEvents.ts,ListPurchaseOrders.ts}`
- `packages/api/typescript/src/ui/usecases/{index.ts,ListPurchaseOrders.ts}`
- `packages/api/typescript/scripts/emit-openapi.ts`
- `packages/api/typescript/public/docs/openapi.json`

**Go — sync consumer (seeded backend)**
- `packages/api/go/internal/sync/module.go`
- `packages/api/go/internal/sync/handlers/{purchase_order_recorded_handler.go,purchase_order_recorded_handler_test.go,pg_purchase_order_audit_repository.go}`
- `packages/api/go/public/openapi.json`

**Client SDK — regenerated bindings (seeded backend)**
- `packages/client/dist/go/pkg/{go,typescript}/client.gen.go`
- `packages/client/dist/typescript/src/go/**` (index, types, zod for `PurchaseOrderStatus`)
- `packages/client/dist/typescript/src/typescript/**` (Client.ts, client/*, hooks/*, types/*, zod/*, index.ts)

No `packages/app/react` or `packages/e2e` files appear in `GOT/` — this is the PLAN-only task; the grader `plan#no-implementation` explicitly checks that no `.tsx` was written under `packages/app/react/src/routes/(app)/procurement/**`, and none was.

No files were deleted by this patch.

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
- `packages/client/dist/typescript/src/go/types/PurchaseOrderStatus.ts`
- `packages/client/dist/typescript/src/go/zod/purchaseOrderStatusSchema.ts`
- `packages/client/dist/typescript/src/typescript/Client.ts`
- `packages/client/dist/typescript/src/typescript/client/cancelPurchaseOrder.ts`
- `packages/client/dist/typescript/src/typescript/client/createPurchaseOrder.ts`
- `packages/client/dist/typescript/src/typescript/client/index.ts`
- `packages/client/dist/typescript/src/typescript/client/listPurchaseOrders.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useCancelPurchaseOrder.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useCreatePurchaseOrder.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useListPurchaseOrders.ts`
- `packages/client/dist/typescript/src/typescript/hooks/useListPurchaseOrdersSuspense.ts`
- `packages/client/dist/typescript/src/typescript/index.ts`
- `packages/client/dist/typescript/src/typescript/types/ApiErrors.ts`
- `packages/client/dist/typescript/src/typescript/types/CancelPurchaseOrder.ts`
- `packages/client/dist/typescript/src/typescript/types/CreatePurchaseOrder.ts`
- `packages/client/dist/typescript/src/typescript/types/ListPurchaseOrders.ts`
- `packages/client/dist/typescript/src/typescript/types/ListenEvents.ts`
- `packages/client/dist/typescript/src/typescript/types/PurchaseOrderStatus.ts`
- `packages/client/dist/typescript/src/typescript/zod/apiErrorsSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/cancelPurchaseOrderSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/createPurchaseOrderSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/listPurchaseOrdersSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/listenEventsSchema.ts`
- `packages/client/dist/typescript/src/typescript/zod/purchaseOrderStatusSchema.ts`
- `packages/contracts/db/migrations/meta/0052_snapshot.json`
- `packages/contracts/db/migrations/meta/_journal.json`
- `packages/contracts/generated/go/wire/enums.go`
- `packages/contracts/generated/go/wire/envelope.go`
- `packages/contracts/generated/go/wire/events.go`
- `packages/contracts/generated/typescript/src/wire/enums/index.ts`
- `packages/contracts/generated/typescript/src/wire/enums/purchase-order-status.ts`
- `packages/contracts/generated/typescript/src/wire/events/_imports.ts`
- `packages/contracts/generated/typescript/src/wire/events/index.ts`
- `packages/contracts/generated/typescript/src/wire/events/purchase-order-recorded.ts`
