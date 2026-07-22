# NOTES — synthetic-fullstack-crud-realtime / fullstack-composition-iter9

## Provenance

- **task**: `synthetic-fullstack-crud-realtime`
- **stamp**: `fullstack-composition-iter9`
- **model**: `sonnet`
- **mode**: `agent`
- **pass**: `false`
- **graded ts**: `2026-06-14T21:06:40.673Z`
- **docTreeHash**: `21385794902e`
- **failedGraders**: `e2e#not-stubbed`, `judge#backend-composition`, `judge#dialog-mutation`, `judge#e2e-discipline`

Source row: `scripts/skill-evals/scoreboard/fullstack-composition-iter9.jsonl`
Source patch: `scripts/skill-evals/scoreboard/fullstack-composition-iter9--synthetic-fullstack-crud-realtime.patch`

## Base reconstruction

The patch is a **plain single-document git diff** (not the legacy concatenated
format) — `grep -c '^diff --git'` = 83, all 83 file paths unique (no repeated
headers/sections, no `^From ` markers). So no split/last-wins merge was
needed; the patch applied as one unit.

**BASE REF**: `0935bec301422d01f66c2d7306e5c052fc5a6695`
("docs(verdict): L4 complete (3/3) — full ladder transfers; P0 reframed as
compound-rate", authored 2026-06-14T16:59:52-03:00 = 19:59:52Z).

Reasoning: the row's graded ts (2026-06-14T21:06:40.673Z = 18:06:40 local
-03:00) falls between `0935bec30` (16:59:52-03:00) and the next v1.9 commit
`b1170d04d` (18:49:12-03:00 = 21:49:12Z, i.e. *after* the graded ts). So
`0935bec30` is the HEAD the build ran against — `promote`'s implicit
HEAD-apply would already have worked here since it's literally the tip of
v1.9 history at grading time; no fallback (`-3`, chunk-splitting, `--reject`)
was required.

`git worktree add --detach $TMPDIR/recon-fullstack-composition-iter9 0935bec30`
then `git apply --check` against the raw patch returned **zero errors, zero
rejects**. Applied cleanly (`git apply`, 9 whitespace warnings only — cosmetic
trailing-whitespace in generated SDK hook files, not apply failures).

Patch stats: 52 new files, 31 modified files, 0 deleted files. No deletions
to report.

## What the exemplar shows

Per the task prompt (full text in `WANT.md`): this is a **P0 full-stack
composition probe** — build a supplier purchase-orders vertical slice
spanning the whole monorepo in one coherent pass: TypeSpec contract lock
(new `PurchaseOrderRecordedEvent` integration event + `PurchaseOrderStatus`
enum + `purchase_orders` Drizzle table/migration), a new `procurement`
bounded context in the TS backend (aggregate, use cases, domain events,
internal handler publishing the integration event, repository in all three
DI environments, controllers, a BFF list query use case), SDK regeneration,
a React route+list+create-dialog+cancel-action with **real-time SSE
list invalidation**, a Go consumer handler persisting an audit row via
hand-written SQL, and an e2e spec covering create/cancel/real-time-without-
reload. The build **failed** on 4 graders: `e2e#not-stubbed`,
`judge#backend-composition`, `judge#dialog-mutation`, `judge#e2e-discipline`
— i.e. the failure signal centers on the e2e layer being stubbed/undisciplined
and issues in backend composition + the dialog mutation pattern, despite
successfully producing all 83 files across every layer (contracts → api-ts →
api-go → app-react → e2e). Useful as a negative/near-miss exemplar for those
specific axes (E2E-DISCIPLINE, plus backend composition and dialog-mutation
axes) even though the broad multi-layer plumbing succeeded.

## Files (GOT/)

All 83 changed/created files from the patch, copied verbatim from the
applied temp worktree at BASE REF `0935bec30`, under
`scripts/skill-evals/candidates/synthetic-fullstack-crud-realtime/GOT/`
preserving relative paths:

```
packages/api/go/internal/sync/handlers/purchase_order_recorded_handler.go
packages/api/go/internal/sync/handlers/purchase_order_recorded_handler_test.go
packages/api/go/public/openapi.json
packages/api/typescript/public/docs/openapi.json
packages/api/typescript/scripts/emit-openapi.ts
packages/api/typescript/src/index.ts
packages/api/typescript/src/procurement/controllers/CancelPurchaseOrder.ts
packages/api/typescript/src/procurement/controllers/CreatePurchaseOrder.ts
packages/api/typescript/src/procurement/controllers/index.ts
packages/api/typescript/src/procurement/entities/PurchaseOrder.test.ts
packages/api/typescript/src/procurement/entities/PurchaseOrder.ts
packages/api/typescript/src/procurement/errors/index.ts
packages/api/typescript/src/procurement/events/PurchaseOrderCancelledEvent.ts
packages/api/typescript/src/procurement/events/PurchaseOrderCreatedEvent.ts
packages/api/typescript/src/procurement/events/index.ts
packages/api/typescript/src/procurement/handlers/PurchaseOrderRecordedHandler.ts
packages/api/typescript/src/procurement/handlers/internal.ts
packages/api/typescript/src/procurement/index.ts
packages/api/typescript/src/procurement/registry.ts
packages/api/typescript/src/procurement/repositories/PurchaseOrderRepository/DrizzlePurchaseOrderRepository.ts
packages/api/typescript/src/procurement/repositories/PurchaseOrderRepository/MockPurchaseOrderRepository.ts
packages/api/typescript/src/procurement/repositories/PurchaseOrderRepository/PurchaseOrderRepository.ts
packages/api/typescript/src/procurement/repositories/PurchaseOrderRepository/index.ts
packages/api/typescript/src/procurement/usecases/CancelPurchaseOrder.ts
packages/api/typescript/src/procurement/usecases/CreatePurchaseOrder.test.ts
packages/api/typescript/src/procurement/usecases/CreatePurchaseOrder.ts
packages/api/typescript/src/procurement/usecases/index.ts
packages/api/typescript/src/shared/registry.ts
packages/api/typescript/src/ui/controllers/ListPurchaseOrders.ts
packages/api/typescript/src/ui/controllers/ListenEvents.ts
packages/api/typescript/src/ui/controllers/index.ts
packages/api/typescript/src/ui/usecases/ListPurchaseOrders.ts
packages/api/typescript/src/ui/usecases/index.ts
packages/app/react/src/locales/en.json
packages/app/react/src/locales/pt.json
packages/app/react/src/routeTree.gen.ts
packages/app/react/src/routes/(app)/procurement/purchase-orders/-components/PurchaseOrderListSection/index.tsx
packages/app/react/src/routes/(app)/procurement/purchase-orders/index.tsx
packages/client/dist/go/pkg/go/client.gen.go
packages/client/dist/go/pkg/typescript/client.gen.go
packages/client/dist/typescript/src/go/index.ts
packages/client/dist/typescript/src/go/types/PurchaseOrderStatus.ts
packages/client/dist/typescript/src/go/zod/purchaseOrderStatusSchema.ts
packages/client/dist/typescript/src/typescript/Client.ts
packages/client/dist/typescript/src/typescript/client/cancelPurchaseOrder.ts
packages/client/dist/typescript/src/typescript/client/createPurchaseOrder.ts
packages/client/dist/typescript/src/typescript/client/index.ts
packages/client/dist/typescript/src/typescript/client/listPurchaseOrders.ts
packages/client/dist/typescript/src/typescript/hooks/useCancelPurchaseOrder.ts
packages/client/dist/typescript/src/typescript/hooks/useCreatePurchaseOrder.ts
packages/client/dist/typescript/src/typescript/hooks/useListPurchaseOrders.ts
packages/client/dist/typescript/src/typescript/hooks/useListPurchaseOrdersSuspense.ts
packages/client/dist/typescript/src/typescript/index.ts
packages/client/dist/typescript/src/typescript/types/ApiErrors.ts
packages/client/dist/typescript/src/typescript/types/CancelPurchaseOrder.ts
packages/client/dist/typescript/src/typescript/types/CreatePurchaseOrder.ts
packages/client/dist/typescript/src/typescript/types/ListPurchaseOrders.ts
packages/client/dist/typescript/src/typescript/types/ListenEvents.ts
packages/client/dist/typescript/src/typescript/types/PurchaseOrderStatus.ts
packages/client/dist/typescript/src/typescript/zod/apiErrorsSchema.ts
packages/client/dist/typescript/src/typescript/zod/cancelPurchaseOrderSchema.ts
packages/client/dist/typescript/src/typescript/zod/createPurchaseOrderSchema.ts
packages/client/dist/typescript/src/typescript/zod/listPurchaseOrdersSchema.ts
packages/client/dist/typescript/src/typescript/zod/listenEventsSchema.ts
packages/client/dist/typescript/src/typescript/zod/purchaseOrderStatusSchema.ts
packages/contracts/db/migrations/0052_faithful_yellowjacket.sql
packages/contracts/db/migrations/meta/0052_snapshot.json
packages/contracts/db/migrations/meta/_journal.json
packages/contracts/db/schema/index.ts
packages/contracts/db/schema/procurement.ts
packages/contracts/generated/go/wire/enums.go
packages/contracts/generated/go/wire/envelope.go
packages/contracts/generated/go/wire/events.go
packages/contracts/generated/typescript/src/wire/enums/index.ts
packages/contracts/generated/typescript/src/wire/enums/purchase-order-status.ts
packages/contracts/generated/typescript/src/wire/events/_imports.ts
packages/contracts/generated/typescript/src/wire/events/index.ts
packages/contracts/generated/typescript/src/wire/events/purchase-order-recorded.ts
packages/contracts/wire/enums/purchase-order-status.tsp
packages/contracts/wire/events/index.tsp
packages/contracts/wire/events/purchase-order-recorded.tsp
packages/contracts/wire/main.tsp
packages/e2e/tests/08-purchase-orders.spec.ts
```

No deleted files in this patch (0 `deleted file mode` headers; 52 new files,
31 modified files).

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
