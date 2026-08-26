# Handoff — Supplier purchase-orders slice (backend DONE, frontend + e2e LEFT)

You are **agent B**. Agent A built the backend half of the supplier purchase-orders slice end to
end and stopped at the frontend. This document is the source of truth for what exists and what you
must finish. **Do not re-derive or restate the backend; do not redefine any contract** — consume
what is already on disk. Trust the SDK, not your memory of how these shapes "should" look.

## DONE — phases 1–3 (already on disk, do not touch except to read)

- **Contract (frozen).** Integration event `integration.shared.purchase_order.recorded` (TypeSpec
  at `packages/contracts/wire/events/purchase-order-recorded.tsp`), the `PurchaseOrderStatus` wire
  enum (`DRAFT | PLACED | CANCELLED`), the `purchase_orders` Drizzle table
  (`packages/contracts/src/db/sqlite/procurement.ts`) and its migration. Both-language bindings are
  regenerated and committed — **do not run `bun contracts` / edit generated files.**
- **TS backend.** A `procurement` bounded context (`packages/api/typescript/src/procurement/`):
  `PurchaseOrder` aggregate (invariant: a `CANCELLED` order cannot be placed/cancelled again →
  `PURCHASE_ORDER_ALREADY_CANCELLED`), `CreatePurchaseOrder` + `CancelPurchaseOrder` use cases,
  controllers, repository, projection + projector, all DI-wired. The BFF read lives at
  `ui/usecases/ListPurchaseOrders.ts` + `ui/controllers/ListPurchaseOrders.ts`.
- **Realtime registration.** `integration.shared.purchase_order.recorded` is already added to the
  `BROWSER_EVENTS` union in `ui/controllers/ListenEvents.ts` (it carries a direct `storeId`), so it
  is a typed `ServerEventName` your `useServerEvents` call can subscribe to — **no backend edit
  needed for realtime.**
- **Go consumer.** `PurchaseOrderRecordedHandler` under `internal/sync/handlers/` writes the audit
  row. Out of your scope.
- **SDK.** Regenerated and committed — the hooks/schemas/keys below are importable right now from
  `@codm/client-typescript/typescript`.

### The SDK surface you build against (exact names — import from `@codm/client-typescript/typescript`)

| Need | Identifier |
|---|---|
| List (BFF) hook | `useListPurchaseOrders({ storeId, status? })` → `GET /v1/ui/purchase-orders` |
| List query key (for invalidation) | `listPurchaseOrdersQueryKey({ storeId, status? })` |
| Create mutation hook | `useCreatePurchaseOrder()` → `POST /v1/procurement/purchase-orders` |
| Create body schema (form validator) | `createPurchaseOrderMutationRequestSchema` |
| Cancel mutation hook | `useCancelPurchaseOrder()` → cancel route, path-param `id` |
| Status enum + zod | `PurchaseOrderStatusEnum`, `purchaseOrderStatusSchema` |
| Realtime event name | `PurchaseOrderRecordedEventName` (= `integration.shared.purchase_order.recorded`) |
| Money shape | `Money` (`{ amountCents, currency }`), `MoneySchema` |

## LEFT — phases 4–5 (your deliverable). Build per `packages/app/react/CLAUDE.md` (read it END TO END, especially the Real-time section).

- **R1 — Route shell.** `packages/app/react/src/routes/(app)/procurement/purchase-orders/index.tsx` — a THIN
  shell. `validateSearch` composes the SDK list params with the **status filter typed by
  `purchaseOrderStatusSchema`** and `.default()`-ed; **no data fetching in the route.**
- **R2 — List section owns its data.** A `-components/…Section` that calls `useListPurchaseOrders`
  + `routeApi.useSearch()` itself, **threads the status filter INTO the hook call** (a filter
  defined in the schema but never read/applied is the most common miss — wire it), renders an
  inline skeleton while `data === undefined`, dispatches status badge styles via an **enum-keyed
  map** (`Record<PurchaseOrderStatus, …>`, no `switch`/ternary on status), and labels statuses ONLY
  via the typed `enums.PurchaseOrderStatus.*` catalog.
- **R3 — Realtime.** Exactly ONE `useServerEvents(PurchaseOrderRecordedEventName, …)` whose
  callback **invalidates `listPurchaseOrdersQueryKey`** — no `setQueryData`, no `refetchInterval`,
  no new `EventSource`/`fetchEventSource` outside the shared hooks, no second `useServerEventSource`
  mount (it is mounted once in the `(app)` layout already).
- **R4 — Create + cancel.** A create dialog opened via `useDialogStore().show(…)` whose form
  validates against `createPurchaseOrderMutationRequestSchema` (**no parallel `z.object` of the
  body**). The cancel action calls `useCancelPurchaseOrder()` keeping the mutation object whole — no
  `try/catch` around `mutate`, no `onError`.
- **R5 — i18n.** Add the `enums.PurchaseOrderStatus.*` labels and every new UI string to **BOTH**
  `src/locales/pt.json` and `en.json` (the keys are type-checked — both files or `tsc` fails).
- **R6 — E2E.** A REAL Playwright spec at `packages/e2e/tests/` (not absent, not `.skip`/all-fixme,
  no `expect(true).toBe(true)`): setup through the **API request context** (not UI click-paths),
  role/label selectors, **no `waitForTimeout`**, and a realtime assertion that creates a purchase
  order via the API while the list is open and asserts the new row appears **without
  reload/navigation** (a generous `expect` timeout for SSE latency is fine — that is not a sleep).

## Gates before you call it done
`cd packages/app/react && bun x tsc --noEmit` green · `cd packages/e2e && bun x tsc --noEmit` green ·
component-props detector clean · the backend you were handed still compiles
(`packages/api/typescript` tsc) — i.e. you did not break the seed.

## Left to your discretion (the handoff does not over-specify)
Component/file names, the exact badge palette, the dialog's field layout, empty-state copy, and how
many columns the table shows. Match the surrounding app's idioms; when in doubt, mirror an existing
`-components/…Section` + its dialog.
