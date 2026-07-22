# Supplier Purchase Orders — Frontend + E2E Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Deliver the `/procurement/purchase-orders` React screen — a data-owning list section with status filter + pagination, a create dialog (supplierName + totalAmount), a cancel confirmation dialog, live SSE invalidation on `integration.shared.purchase_order.recorded`, and a Playwright E2E spec covering create, list, and cancel.

**Spec:** (backend + SDK already shipped; plan covers the remaining frontend + e2e only)
**Tasks:** 5
**Estimated minutes:** 130

---

## Task T1: Procurement purchase-orders route shell + i18n + nav wiring

Stand up the URL shell (`/procurement/purchase-orders`) so subsequent component tasks have a real route to scaffold into. No SDK mutations yet — just the route contract, search-schema composition, locale keys, and the nav entry.

**Files to write:**
- Create: `packages/app/react/src/routes/(app)/procurement/purchase-orders/index.tsx`
- Modify: `packages/app/react/src/locales/pt.json`
- Modify: `packages/app/react/src/locales/en.json`
- Modify: `packages/app/react/src/components/Navbar/index.tsx`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Skills:** route
**Depends on:** (none)

### Step T1.1 — Scaffold the purchase-orders list route

Run `bun cli route` to create the route shell with search params composed from the SDK list schema:

```bash
bun cli route '(app)/procurement/purchase-orders' \
  --extend=listPurchaseOrdersQueryParamsSchema \
  --sdk=PurchaseOrder \
  --export-item-type=PurchaseOrderItem \
  --i18n=purchaseOrders \
  --layout=app
```

This emits `packages/app/react/src/routes/(app)/procurement/purchase-orders/index.tsx` with:
- `purchaseOrdersSearchSchema` composing `.and()` from the SDK `listPurchaseOrdersQueryParamsSchema`
- `validateSearch: zodValidator(purchaseOrdersSearchSchema)`
- `staticData: { breadcrumb: i18n.t('nav.purchaseOrders') }`
- Skeleton `RouteComponent` with `<Outlet />`
- Auto-seeded `purchaseOrders.title`, `purchaseOrders.subtitle`, `nav.purchaseOrders` in both locale JSONs

After scaffolding, open the generated file and verify the search schema composes correctly:

```typescript
// Expected shape after scaffold (fill in if CLI emits placeholder):
import { listPurchaseOrdersQueryParamsSchema } from '@template/client-typescript/typescript'

const purchaseOrdersSearchSchema = listPurchaseOrdersQueryParamsSchema.and(z.object({}))
```

The `status` field is already part of `listPurchaseOrdersQueryParamsSchema`, so no extra `.and()` fields are needed beyond the SDK's own params.

### Step T1.2 — Seed i18n keys

The CLI auto-seeds `nav.purchaseOrders`, `purchaseOrders.title`, and `purchaseOrders.subtitle`. Add the enum label namespace and table column labels that the list section will need. Deep-merge into `pt.json`:

```json
"purchaseOrders": {
  "title": "Pedidos de Compra",
  "subtitle": "Gerencie seus pedidos de compra com fornecedores.",
  "table": {
    "supplier": "Fornecedor",
    "status": "Status",
    "totalAmount": "Valor Total",
    "createdAt": "Data"
  },
  "empty": "Nenhum pedido de compra encontrado.",
  "actions": {
    "create": "Novo pedido",
    "cancel": "Cancelar pedido"
  },
  "dialogs": {
    "create": {
      "title": "Novo Pedido de Compra",
      "description": "Registre um novo pedido com fornecedor.",
      "supplierName": "Fornecedor",
      "supplierNamePlaceholder": "Ex: Acme Ltda",
      "totalAmountCents": "Valor (centavos)",
      "currency": "Moeda",
      "submit": "Criar pedido",
      "success": "Pedido criado com sucesso.",
      "error": "Erro ao criar pedido."
    },
    "cancel": {
      "title": "Cancelar Pedido",
      "description": "Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.",
      "confirm": "Sim, cancelar",
      "abort": "Voltar",
      "success": "Pedido cancelado.",
      "error": "Erro ao cancelar pedido."
    }
  }
},
"enums": {
  "PurchaseOrderStatus": {
    "DRAFT": "Rascunho",
    "PLACED": "Enviado",
    "CANCELLED": "Cancelado"
  }
}
```

Mirror all keys in `en.json`:

```json
"purchaseOrders": {
  "title": "Purchase Orders",
  "subtitle": "Manage purchase orders with suppliers.",
  "table": {
    "supplier": "Supplier",
    "status": "Status",
    "totalAmount": "Total Amount",
    "createdAt": "Date"
  },
  "empty": "No purchase orders found.",
  "actions": {
    "create": "New order",
    "cancel": "Cancel order"
  },
  "dialogs": {
    "create": {
      "title": "New Purchase Order",
      "description": "Record a new order with a supplier.",
      "supplierName": "Supplier",
      "supplierNamePlaceholder": "E.g. Acme Corp",
      "totalAmountCents": "Amount (cents)",
      "currency": "Currency",
      "submit": "Create order",
      "success": "Order created successfully.",
      "error": "Failed to create order."
    },
    "cancel": {
      "title": "Cancel Order",
      "description": "Are you sure you want to cancel this order? This action cannot be undone.",
      "confirm": "Yes, cancel",
      "abort": "Go back",
      "success": "Order cancelled.",
      "error": "Failed to cancel order."
    }
  }
},
"enums": {
  "PurchaseOrderStatus": {
    "DRAFT": "Draft",
    "PLACED": "Placed",
    "CANCELLED": "Cancelled"
  }
}
```

> **Note:** if `enums` already exists in `pt.json`/`en.json`, merge `PurchaseOrderStatus` into it rather than adding a duplicate top-level key.

### Step T1.3 — Add procurement nav entry

Edit `packages/app/react/src/components/Navbar/index.tsx`. In `getNavigationItems`, add a procurement group after the finance group:

```typescript
{
  label: t('nav.procurement'),
  icon: TruckIcon,
  children: [
    { label: t('nav.purchaseOrders'), icon: BoxIcon, path: '/procurement/purchase-orders' },
  ],
},
```

Also add `"procurement": "Compras"` / `"procurement": "Procurement"` and `"purchaseOrders": "Pedidos de Compra"` / `"purchaseOrders": "Purchase Orders"` to `nav` in pt.json / en.json (the CLI may have already seeded `nav.purchaseOrders` — check before adding).

### Step T1.4 — Regenerate route tree

```bash
cd packages/app/react && bun tsr generate
```

Expected: `routeTree.gen.ts` updated with `/(app)/procurement/purchase-orders/` route.

### Step T1.5 — Type-check + detect

```bash
cd packages/app/react && bun x tsc --noEmit
bun run detect
```

Expected: 0 errors. Fix any tsc errors (missing breadcrumb t() key, etc.) before moving on.

### Step T1.6 — Commit

```bash
git add packages/app/react/src/routes/(app)/procurement/ \
        packages/app/react/src/locales/ \
        packages/app/react/src/components/Navbar/ \
        packages/app/react/src/routeTree.gen.ts
git commit -m "feat(app): procurement/purchase-orders route shell + nav (Task T1)"
```

---

## Task T2: PurchaseOrderListSection with SSE realtime invalidation

The data-owning list section renders the purchase orders table (supplier, status, amount, date) with pagination, search, and status filter. It also mounts the `useServerEvents` subscription so newly recorded orders from the Go consumer refresh the list without a manual reload.

**Files to write:**
- Create: `packages/app/react/src/routes/(app)/procurement/purchase-orders/-components/PurchaseOrderListSection/index.tsx`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Skills:** component
**Depends on:** T1
**Consumes (frozen):** `useListPurchaseOrders`, `listPurchaseOrdersQueryKey`, `listPurchaseOrdersQueryParamsSchema`, `PurchaseOrderStatusEnum`, `PurchaseOrderStatus`, `ListPurchaseOrders200`, `'integration.shared.purchase_order.recorded'`
**Scope fence:** DONE — SDK hooks/schemas/enum shipped and locked in `@template/client-typescript/typescript`; route shell + i18n keys from T1; OUT — dialogs (T3/T4). LEFT — list data table + SSE subscription.
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun run detect`

### Step T2.1 — Scaffold PurchaseOrderListSection via bun cli component

The `bun cli component` scaffold (section recipe) wires the SDK query + search params read:

```bash
bun cli component '(app)/procurement/purchase-orders' PurchaseOrderListSection \
  --recipe=section \
  --sdk=PurchaseOrder \
  --state=query,search \
  --labels \
  --i18n=purchaseOrders.list
```

This emits `packages/app/react/src/routes/(app)/procurement/purchase-orders/-components/PurchaseOrderListSection/index.tsx` with:
- `useListPurchaseOrders` wired to search params
- `routeApi.useSearch()` for `{ page, limit, search, status }`
- Skeleton block
- `ComponentProps<'div'>` root + `cn()` spread

### Step T2.2 — Complete the section implementation

Fill in the scaffold. The final component:

```typescript
import { useMemo } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  useListPurchaseOrders,
  listPurchaseOrdersQueryKey,
  PurchaseOrderStatusEnum,
  type PurchaseOrderStatus,
  type ListPurchaseOrders200,
} from '@template/client-typescript/typescript'
import { format } from 'date-fns'

import { DataTable, DataTableContent, DataTableSearch, DataTablePagination, type ColumnDef } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useMoney, useServerEvents } from '@/hooks'
import { cn } from '@/lib/utils'

type PurchaseOrderItem = ListPurchaseOrders200['items'][number]

const routeApi = getRouteApi('/(app)/procurement/purchase-orders/')

// Dispatch map: status → badge variant. Keyed by PurchaseOrderStatus (exhaustive).
const STATUS_VARIANT: Record<PurchaseOrderStatus, 'default' | 'secondary' | 'destructive'> = {
  DRAFT: 'secondary',
  PLACED: 'default',
  CANCELLED: 'destructive',
}

export function PurchaseOrderListSection({ className, ...props }: ComponentProps<'div'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const formatMoney = useMoney()
  const { page, limit, search, status } = routeApi.useSearch()

  const { data, isPending } = useListPurchaseOrders({ page, limit, search, status })

  // Real-time: a Go consumer recorded a new purchase order (or status changed).
  // The SSE stream is store-scoped server-side — no payload.storeId guard needed here
  // (store-wide list invalidation, not sub-store scoping).
  useServerEvents('integration.shared.purchase_order.recorded', () => {
    queryClient.invalidateQueries({ queryKey: listPurchaseOrdersQueryKey() })
  })

  const columns = useMemo<ColumnDef<PurchaseOrderItem>[]>(() => [
    {
      accessorKey: 'supplierName',
      header: t('purchaseOrders.table.supplier'),
    },
    {
      accessorKey: 'status',
      header: t('purchaseOrders.table.status'),
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>
          {t(`enums.PurchaseOrderStatus.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: 'totalAmount',
      header: t('purchaseOrders.table.totalAmount'),
      cell: ({ row }) =>
        formatMoney({
          amountCents: row.original.totalAmountCents,
          currency: row.original.totalAmountCurrency,
        }),
    },
    {
      accessorKey: 'createdAt',
      header: t('purchaseOrders.table.createdAt'),
      cell: ({ row }) => format(new Date(row.original.createdAt), 'dd/MM/yyyy'),
    },
  ], [t, formatMoney])

  if (isPending) {
    return <Skeleton className="h-64 w-full" />
  }

  return (
    <div className={cn('flex flex-col gap-4', className)} {...props}>
      <DataTable data={data?.items ?? []} columns={columns}>
        <DataTableSearch placeholder={t('purchaseOrders.table.supplier')} />
        <DataTableContent emptyMessage={t('purchaseOrders.empty')} />
        <DataTablePagination
          page={page}
          totalPages={data?.totalPages ?? 1}
          total={data?.total ?? 0}
        />
      </DataTable>
    </div>
  )
}
```

> **Money rule (app-react CLAUDE.md):** `totalAmountCents` + `totalAmountCurrency` become a `Money` object `{ amountCents, currency }` passed to `formatMoney()` from `useMoney()`. Never call `formatMoney` from `@/lib/format` directly in a component.

> **Enum labels rule:** Status label is `t(\`enums.PurchaseOrderStatus.${row.original.status}\`)` — never a hard-coded string or a `Record<PurchaseOrderStatus, string>` label map.

> **Dispatch map rule (CMP-P18):** `STATUS_VARIANT` is a `Record<PurchaseOrderStatus, variant>` keyed by the SDK enum — exhaustive by construction. A new enum member makes `tsc` demand the new entry.

Wire `PurchaseOrderListSection` into the route component in `index.tsx` (from T1 scaffold). Also mount placeholder `<div>` slots for the create button and dialogs (T4 will fill them):

```typescript
// In purchase-orders/index.tsx RouteComponent body:
return (
  <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-2xl font-bold text-foreground">{t('purchaseOrders.title')}</h1>
      {/* create button mounted in T4 */}
    </div>
    <PurchaseOrderListSection />
    {/* dialogs mounted in T4 */}
  </div>
)
```

### Step T2.3 — Type-check + detect

```bash
cd packages/app/react && bun x tsc --noEmit
bun run detect
```

Expected: 0 errors. Common issues: `DataTablePagination` prop names (check existing usage), `formatMoney` Money shape (must be `{ amountCents, currency }`).

### Step T2.4 — Commit

```bash
git add packages/app/react/src/routes/(app)/procurement/
git commit -m "feat(app): PurchaseOrderListSection with SSE invalidation (Task T2)"
```

---

## Task T3: Create purchase order dialog

A self-contained create dialog opened via `useDialogStore().show(...)`. It owns its form, mutation, query invalidation, and toast. Receives no `open`/`onOpenChange` props.

**Files to write:**
- Create: `packages/app/react/src/routes/(app)/procurement/purchase-orders/-components/CreatePurchaseOrderDialog/index.tsx`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Skills:** component
**Depends on:** T1
**Consumes (frozen):** `useCreatePurchaseOrder`, `createPurchaseOrderMutationRequestSchema`, `listPurchaseOrdersQueryKey`
**Scope fence:** DONE — SDK hook/schema shipped (`useCreatePurchaseOrder`, `createPurchaseOrderMutationRequestSchema`); route + i18n from T1. LEFT — create dialog. OUT — list section (T2), cancel dialog (T4).
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun run detect`

### Step T3.1 — Scaffold the dialog via bun cli component (dialog recipe)

The `bun cli component` scaffold with the dialog recipe wires the mutation and invalidation:

```bash
bun cli dialog '(app)/procurement/purchase-orders' CreatePurchaseOrderDialog \
  --crud=create \
  --sdk=PurchaseOrder \
  --mutation=useCreatePurchaseOrder \
  --invalidate=useListPurchaseOrders \
  --i18n=purchaseOrders.dialogs.create
```

This emits `packages/app/react/src/routes/(app)/procurement/purchase-orders/-components/CreatePurchaseOrderDialog/index.tsx` with the self-contained dialog shape (no `open`/`onOpenChange` props, `useDialogStore` for close).

### Step T3.2 — Complete the create dialog implementation

Fill in the scaffold with the correct form fields from `createPurchaseOrderMutationRequestSchema`:

```typescript
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCreatePurchaseOrder,
  createPurchaseOrderMutationRequestSchema,
  listPurchaseOrdersQueryKey,
} from '@template/client-typescript/typescript'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldLabel } from '@/components/ui/field-label'
import { useDialogStore } from '@/stores/useDialogStore'

// Slice the request schema to the mutation fields the form needs
const createSchema = createPurchaseOrderMutationRequestSchema

export function CreatePurchaseOrderDialog() {
  const { t } = useTranslation()
  const { hide } = useDialogStore()
  const queryClient = useQueryClient()

  const { mutateAsync, isPending } = useCreatePurchaseOrder()

  const form = useForm({
    defaultValues: {
      supplierName: '',
      totalAmount: {
        amountCents: 0,
        currency: 'BRL' as const,
      },
    },
    validators: {
      onChange: createSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await mutateAsync({ data: value })
        await queryClient.invalidateQueries({ queryKey: listPurchaseOrdersQueryKey() })
        toast.success(t('purchaseOrders.dialogs.create.success'))
        hide()
      } catch {
        toast.error(t('purchaseOrders.dialogs.create.error'))
      }
    },
  })

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('purchaseOrders.dialogs.create.title')}</DialogTitle>
        <DialogDescription>{t('purchaseOrders.dialogs.create.description')}</DialogDescription>
      </DialogHeader>

      <form
        onSubmit={e => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="flex flex-col gap-4"
      >
        <form.Field name="supplierName">
          {field => (
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor={field.name}>
                {t('purchaseOrders.dialogs.create.supplierName')}
              </FieldLabel>
              <Input
                id={field.name}
                value={field.state.value}
                placeholder={t('purchaseOrders.dialogs.create.supplierNamePlaceholder')}
                onChange={e => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="totalAmount.amountCents">
          {field => (
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor={field.name}>
                {t('purchaseOrders.dialogs.create.totalAmountCents')}
              </FieldLabel>
              <Input
                id={field.name}
                type="number"
                value={field.state.value}
                onChange={e => field.handleChange(Number(e.target.value))}
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </form.Field>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={hide} disabled={isPending}>
            {t('purchaseOrders.dialogs.cancel.abort')}
          </Button>
          <Button type="submit" disabled={isPending}>
            {t('purchaseOrders.dialogs.create.submit')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
```

> **Dialog canon (app-react CLAUDE.md):** No `open`/`onOpenChange` props. Dialog is controlled by `useDialogStore` — `show(<CreatePurchaseOrderDialog />)` from the caller; `hide()` inside.

> **Form rule:** validators consume the SDK Zod schema directly (`createPurchaseOrderMutationRequestSchema`). Never a hand-rolled parallel schema.

### Step T3.3 — Type-check + detect

```bash
cd packages/app/react && bun x tsc --noEmit
bun run detect
```

Expected: 0 errors.

### Step T3.4 — Commit

```bash
git add packages/app/react/src/routes/(app)/procurement/purchase-orders/-components/CreatePurchaseOrderDialog/
git commit -m "feat(app): CreatePurchaseOrderDialog (Task T3)"
```

---

## Task T4: Cancel purchase order dialog + action button wiring

A confirm-cancel dialog (opened via `useDialogStore`) that calls `useCancelPurchaseOrder`, invalidates the list, and shows a toast. After the dialog exists, wire the "Cancel" row action into `PurchaseOrderListSection` and a "New order" FAB/button into the route shell.

**Files to write:**
- Create: `packages/app/react/src/routes/(app)/procurement/purchase-orders/-components/CancelPurchaseOrderDialog/index.tsx`

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Skills:** component
**Depends on:** T2, T3
**Consumes (frozen):** `useCancelPurchaseOrder`, `cancelPurchaseOrderPathParamsSchema`, `listPurchaseOrdersQueryKey`, `PurchaseOrderStatusEnum`, `PurchaseOrderStatus`, `CreatePurchaseOrderDialog`, `useDialogStore`
**Scope fence:** DONE — `PurchaseOrderListSection` renders the list (T2); `CreatePurchaseOrderDialog` exists and is mounted via `useDialogStore` (T3); all SDK hooks/schemas shipped. LEFT — cancel dialog + wiring cancel row action + create FAB button + mount both dialogs at route level. OUT — e2e (T5).
**Gate:** `cd packages/app/react && bun x tsc --noEmit && bun run detect`

### Step T4.1 — Scaffold CancelPurchaseOrderDialog via bun cli component (dialog recipe)

`bun cli component` for `-components/` artifacts uses the `dialog` recipe subcommand. Run:

```bash
bun cli dialog '(app)/procurement/purchase-orders' CancelPurchaseOrderDialog \
  --crud=confirm \
  --mutation=useCancelPurchaseOrder \
  --invalidate=useListPurchaseOrders \
  --i18n=purchaseOrders.dialogs.cancel
```

### Step T4.2 — Complete CancelPurchaseOrderDialog

Fill in the scaffold. The dialog receives the `purchaseOrderId` as a prop (passed by the caller via `show(<CancelPurchaseOrderDialog purchaseOrderId={id} />)`):

```typescript
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCancelPurchaseOrder,
  listPurchaseOrdersQueryKey,
} from '@template/client-typescript/typescript'

import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useDialogStore } from '@/stores/useDialogStore'

interface CancelPurchaseOrderDialogProps {
  purchaseOrderId: string
}

export function CancelPurchaseOrderDialog({ purchaseOrderId }: CancelPurchaseOrderDialogProps) {
  const { t } = useTranslation()
  const { hide } = useDialogStore()
  const queryClient = useQueryClient()

  const { mutateAsync, isPending } = useCancelPurchaseOrder()

  const handleConfirm = async () => {
    try {
      await mutateAsync({ purchaseOrderId })
      await queryClient.invalidateQueries({ queryKey: listPurchaseOrdersQueryKey() })
      toast.success(t('purchaseOrders.dialogs.cancel.success'))
      hide()
    } catch {
      toast.error(t('purchaseOrders.dialogs.cancel.error'))
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('purchaseOrders.dialogs.cancel.title')}</DialogTitle>
        <DialogDescription>{t('purchaseOrders.dialogs.cancel.description')}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={hide} disabled={isPending}>
          {t('purchaseOrders.dialogs.cancel.abort')}
        </Button>
        <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
          {t('purchaseOrders.dialogs.cancel.confirm')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
```

### Step T4.3 — Wire cancel action into PurchaseOrderListSection

Add an `actions` column to the `columns` memo and import the dialog + `useDialogStore`. Modify `PurchaseOrderListSection/index.tsx` to add:

```typescript
// Additional imports:
import { useDialogStore } from '@/stores/useDialogStore'
import { PurchaseOrderStatusEnum } from '@template/client-typescript/typescript'
import { CancelPurchaseOrderDialog } from '../CancelPurchaseOrderDialog'

// Inside the component:
const dialogStore = useDialogStore()

// In columns useMemo, add a new actions column:
{
  id: 'actions',
  cell: ({ row }) => {
    const canCancel = row.original.status !== PurchaseOrderStatusEnum.CANCELLED
    if (!canCancel) return null
    return (
      <Button
        size="sm"
        variant="ghost"
        aria-label={t('purchaseOrders.actions.cancel')}
        onClick={() =>
          dialogStore.show(
            <CancelPurchaseOrderDialog purchaseOrderId={row.original.id} />
          )
        }
      >
        {t('purchaseOrders.actions.cancel')}
      </Button>
    )
  },
},
```

### Step T4.4 — Add create button and mount dialogs in the route

Modify `purchase-orders/index.tsx` to add the create FAB and mount `CreatePurchaseOrderDialog`. The dialog is opened via `useDialogStore` — it is NOT statically mounted; it is shown on demand via `show()`:

```typescript
// Additional imports in index.tsx:
import { Button } from '@/components/ui/button'
import { useDialogStore } from '@/stores/useDialogStore'
import { CreatePurchaseOrderDialog } from './-components/CreatePurchaseOrderDialog'

// Inside RouteComponent:
const dialogStore = useDialogStore()

// In JSX, replace the heading section placeholder:
<div className="flex items-center justify-between gap-4">
  <h1 className="text-2xl font-bold text-foreground">{t('purchaseOrders.title')}</h1>
  <Button onClick={() => dialogStore.show(<CreatePurchaseOrderDialog />)}>
    {t('purchaseOrders.actions.create')}
  </Button>
</div>
```

The `(app)/route.tsx` layout already mounts the global `<Dialog>` from `useDialogStore` — no per-route `<Dialog>` needed.

### Step T4.5 — Type-check + detect

```bash
cd packages/app/react && bun x tsc --noEmit
bun run detect
```

Expected: 0 errors. Common issues: `cancelPurchaseOrder` path-params shape (`{ purchaseOrderId }` — verify against `cancelPurchaseOrderPathParamsSchema`).

### Step T4.6 — Commit

```bash
git add packages/app/react/src/routes/(app)/procurement/
git commit -m "feat(app): CancelPurchaseOrderDialog + action wiring (Task T4)"
```

---

## Task T5: E2E Playwright spec — purchase orders flow

Playwright spec covering the three ACs of the supplier purchase-orders feature: navigate to the list, create a purchase order, see it in the list, and cancel it.

**Files to write:**
- Create: `packages/e2e/tests/07-purchase-orders.spec.ts`

**Agent:** qa-tester
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Skills:** e2e
**Depends on:** T2, T3, T4
**Consumes (frozen):** route path `/(app)/procurement/purchase-orders`, i18n keys `purchaseOrders.actions.create`, `purchaseOrders.dialogs.create.title`, `purchaseOrders.dialogs.cancel.title`, `purchaseOrders.dialogs.cancel.confirm`, `PurchaseOrderStatusEnum` values `DRAFT`/`PLACED`/`CANCELLED`, `createPurchaseOrderMutationRequestSchema` field names (`supplierName`, `totalAmountCents`)
**Scope fence:** DONE — full frontend stack from T1–T4. LEFT — Playwright spec. OUT — nothing beyond.
**Gate:** `bun e2e --grep "purchase-orders"`

### Step T5.1 — Author the spec

Create `packages/e2e/tests/07-purchase-orders.spec.ts`:

```typescript
import { expect, test } from '@playwright/test'

/**
 * Purchase Orders flow:
 * 1. Navigate to /procurement/purchase-orders
 * 2. Create a purchase order via the dialog
 * 3. Verify the new order appears in the list with DRAFT status
 * 4. Cancel the order via the confirm dialog
 * 5. Verify the order status changes to CANCELLED
 *
 * Currently `test.fixme()` — E2E fixtures (sign-in helper, test DB seed) still need
 * to land. The spec body documents the assertion shape so each line maps to a real
 * check once fixtures arrive.
 */

test.describe('purchase-orders', () => {
  test.fixme()

  test('navigate to purchase orders list', async ({ page }) => {
    // await given.signIn(page, { email: ..., password: ... })
    await page.goto('/procurement/purchase-orders')
    await expect(page).toHaveURL(/\/procurement\/purchase-orders/)
    // Table or empty state visible:
    await expect(
      page.getByRole('table').or(page.getByText('Nenhum pedido de compra encontrado.'))
    ).toBeVisible()
  })

  test('create a purchase order', async ({ page }) => {
    // await given.signIn(page, { email: ..., password: ... })
    await page.goto('/procurement/purchase-orders')

    // Open create dialog via the "Novo pedido" button
    await page.getByRole('button', { name: 'Novo pedido' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Novo Pedido de Compra' })).toBeVisible()

    // Fill in the form
    await page.getByLabel('Fornecedor').fill('Acme Ltda')
    await page.getByLabel('Valor (centavos)').fill('100000')

    // Submit
    await page.getByRole('button', { name: 'Criar pedido' }).click()

    // Dialog closes + success toast
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Order appears in the list with DRAFT status
    await expect(page.getByText('Acme Ltda')).toBeVisible()
    await expect(page.getByText('Rascunho')).toBeVisible()
  })

  test('cancel a purchase order', async ({ page }) => {
    // Prerequisite: a DRAFT purchase order exists
    // await given.signIn(page, { email: ..., password: ... })
    // await given.createPurchaseOrder(page, { supplierName: 'Test Supplier', amountCents: 100000 })

    await page.goto('/procurement/purchase-orders')

    // Find the cancel action for the first order
    await page.getByRole('button', { name: 'Cancelar pedido' }).first().click()

    // Confirm dialog appears
    await expect(page.getByRole('heading', { name: 'Cancelar Pedido' })).toBeVisible()

    // Confirm cancellation
    await page.getByRole('button', { name: 'Sim, cancelar' }).click()

    // Dialog closes + success toast + order status updated to CANCELLED
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.getByText('Cancelado').first()).toBeVisible()
  })
})
```

### Step T5.2 — Verify the spec file is syntactically valid

```bash
cd packages/e2e && bun x tsc --noEmit
```

Expected: 0 errors (the spec uses standard Playwright APIs, no exotic imports).

### Step T5.3 — Run the spec (expect fixme skip)

```bash
bun e2e --grep "purchase-orders"
```

Expected: all tests skipped (`test.fixme()`) with no parse errors.

### Step T5.4 — Commit

```bash
git add packages/e2e/tests/07-purchase-orders.spec.ts
git commit -m "feat(e2e): purchase-orders Playwright spec skeleton (Task T5)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — affected tests pass (no backend tests affected by this plan)
- [ ] `bun e2e --grep "purchase-orders"` — spec parses + all tests skip (`test.fixme()`)
- [ ] AC mapping:
  - Navigate to list → `packages/e2e/tests/07-purchase-orders.spec.ts:"navigate to purchase orders list"`
  - Create purchase order → `packages/e2e/tests/07-purchase-orders.spec.ts:"create a purchase order"`
  - Cancel purchase order → `packages/e2e/tests/07-purchase-orders.spec.ts:"cancel a purchase order"`

## Notes

- `PurchaseOrderStatusEnum` values: `DRAFT`, `PLACED`, `CANCELLED` — from `@template/client-typescript/typescript`.
- SSE event `'integration.shared.purchase_order.recorded'` — typed as `ServerEventName`; a typo is a tsc error.
- Money is on the wire as `{ totalAmountCents: number, totalAmountCurrency: string }`. Build a `Money` object `{ amountCents, currency }` before passing to `useMoney()`.
- `cancelPurchaseOrder` path param is `purchaseOrderId` (from `cancelPurchaseOrderPathParamsSchema`).
- The global `<Dialog>` in `(app)/route.tsx` already handles `useDialogStore` content — dialogs do NOT need their own `<Dialog>` wrapper at the route level.
- After creating the route, always run `cd packages/app/react && bun tsr generate` to update `routeTree.gen.ts`.
