# NOTES — synthetic-fullstack-handoff / fullstack-handoff-iter1

## Provenance

- **task**: `synthetic-fullstack-handoff`
- **stamp**: `fullstack-handoff-iter1`
- **model**: `sonnet`
- **pass**: `false`
- **score**: not present on the scoreboard row (only `pass`/`failedGraders` were recorded for this row)
- **failedGraders**: `["judge#react-shell"]`
- **graded ts**: `2026-06-15T00:59:33.216Z`
- **docTreeHash**: `21385794902e`

Source row (`scripts/skill-evals/scoreboard/fullstack-handoff-iter1.jsonl`):
```json
{"ts":"2026-06-15T00:59:33.216Z","task":"synthetic-fullstack-handoff","mode":"agent","pass":false,"failedGraders":["judge#react-shell"],"docTreeHash":"21385794902e","model":"sonnet"}
```

## BASE REF reconstructed at

**`07929595c` — `feat(evals): synthetic-fullstack-handoff — the multi-agent path P0 pointed at`** (2026-06-14 21:32:48 -03:00), the commit that introduced this eval task's yaml + seed fixtures (`.handoff` HANDOFF.md, `phases-1-3.patch`) on `v1.9`. `git apply --check` of the patch is clean here with **zero rejects** across all 85 files.

### Why a plain `HEAD`-style / current-tree apply fails, and what fixed it

The patch on disk today (`scripts/skill-evals/scoreboard/fullstack-handoff-iter1--synthetic-fullstack-handoff.patch`) does **not** apply cleanly at any live commit reachable from `v1.9` HEAD as-is. Root cause found: the repo underwent a wholesale `@template` → `@template` rebrand sweep at commit `3d203d214` ("W4 rebrand — template.config.ts, de-hardcoded tooling, @template → @template", 2026-07-20), and that sweep mechanically rewrote **every tracked file containing the literal string `@template`** — including this already-frozen scoreboard patch file itself (and the task yaml, and the seed `phases-1-3.patch`), even though those are supposed to be immutable historical artifacts. At true build time (2026-06-14/15) the whole codebase was branded `@template/*` (confirmed: `packages/contracts/generated/typescript/package.json` name at `07929595c` is `@template/contracts-typescript`; the file `ListenEvents.ts` has used `@template/core-typescript` since its creation on 2026-06-10 up to the July rebrand). The current patch text says `@template/contracts-typescript` etc., so a plain `git apply --check` against the true `@template`-branded base fails on the one file where a diff hunk's *unchanged context line* embeds the package specifier (`packages/api/typescript/src/ui/controllers/ListenEvents.ts`, context line `} from '@template/contracts-typescript/wire/events'`), because the base file at `07929595c` still reads `@template/contracts-typescript` there.

Fix applied (no fabrication — pure git-history retrieval): recovered the **pristine pre-sweep bytes** of the same patch file directly from git history at `150ec9f6f` (`feat(skills): encode load-bearing-handoff rule from the measured handoff result`, 2026-06-14 22:24:46 -03:00 — the commit that originally added this scoreboard patch, ~25 min after the graded ts, and the last commit before `3d203d214` touched it):

```
git show 150ec9f6f:scripts/skill-evals/scoreboard/fullstack-handoff-iter1--synthetic-fullstack-handoff.patch > /tmp/original-fullstack-handoff-iter1.patch
```

`diff` against the current on-disk patch shows only `@template` ⇄ `@template` token substitutions (96 changed lines across 85-file diff, e.g. `@template/core-typescript` → `@template/core-typescript`, `@template/contracts-typescript` → `@template/contracts-typescript`, `@template/client-typescript/typescript` → `@template/client-typescript/typescript` inside the `.handoff/purchase-orders.md` prose) — confirming this is exactly the mechanical rebrand bleed-through and nothing else. Applying this **pre-sweep, git-history-original** patch at `07929595c`:

```
git worktree add --detach /tmp/recon-fullstack-handoff-iter1 07929595c
git -C /tmp/recon-fullstack-handoff-iter1 apply --check /tmp/original-fullstack-handoff-iter1.patch   # exit 0, zero errors
git -C /tmp/recon-fullstack-handoff-iter1 apply /tmp/original-fullstack-handoff-iter1.patch           # applied clean (only harmless trailing-whitespace warnings)
```

No `-3`, no manual hunk splitting, and no rejects were needed once the pre-sweep patch bytes were used — the patch is a normal single-document 85-file diff (not the legacy concatenated/duplicated-section format: `grep -c '^diff --git'` = 85, `grep -c '^From '` = 0, and every changed path appears exactly once).

No files were deleted by this patch (`grep -c '^deleted file mode'` = 0), so nothing is excluded from `GOT/`.

## What the exemplar shows

This is the **agent-B half of a multi-agent handoff probe** (`L5/P0 hybrid`): agent A's backend work (contracts, the TS `procurement` bounded context, the Go consumer, and a regenerated SDK — 77 files) was seeded into the worktree via `git apply` of `phases-1-3.patch`, harvested from a real prior P0 run whose backend graders all passed. A fresh agent B (sonnet) was then asked to read `.handoff/purchase-orders.md` and finish **only** phases 4–5 — the React route/list/dialog + realtime wiring + a real Playwright e2e spec — **without** re-deriving or redefining any of the frozen backend contract.

The build **failed** the `judge#react-shell` grader (the route-shell + list-ownership judge scoped to `packages/app/react/src/routes/(app)/procurement/purchase-orders/`), while every other grader on the row's `failedGraders` list was silent (i.e., passed) — this row is 1/many failing on exactly that one axis. `GOT/` therefore captures the exact route/list/dialog/e2e frontend implementation this agent produced, alongside the seeded backend files it left correctly untouched (present in `GOT/` because they're part of the patch's file universe, not because agent B built them).

## Files (GOT/)

85 files total, copied verbatim from the applied worktree at base `07929595c`:

**Handoff doc**
- `.handoff/purchase-orders.md`

**Contracts (TypeSpec + generated bindings + DB migration — seeded backend)**
- `packages/contracts/wire/main.tsp`
- `packages/contracts/wire/events/index.tsp`
- `packages/contracts/wire/events/purchase-order-recorded.tsp`
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

**React app — agent B's deliverable (this is the judged surface)**
- `packages/app/react/src/routes/(app)/procurement/purchase-orders/index.tsx` (route shell)
- `packages/app/react/src/routes/(app)/procurement/purchase-orders/-components/PurchaseOrderSection/index.tsx` (list section)
- `packages/app/react/src/routes/(app)/procurement/purchase-orders/-components/CreatePurchaseOrderDialog/index.tsx`
- `packages/app/react/src/routeTree.gen.ts`
- `packages/app/react/src/locales/{en.json,pt.json}`

**E2E — agent B's deliverable**
- `packages/e2e/tests/08-purchase-orders.spec.ts`

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
