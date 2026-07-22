---
name: bounded-context
description: Create a new bounded context (domain module) with full folder structure. Use when starting a new feature domain like 'product', 'order', 'user'. Use this skill whenever adding a new domain area that needs its own entities, use cases, controllers, and DI registration.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Create Bounded Context

Creates a new domain context with the complete folder structure following DDD patterns.

## Architecture

Every bounded context is bootstrapped via `BoundedContext.create()` — a shared abstraction in `@codedm/core-typescript` that encapsulates child container creation, tracing, mediator wiring, job scheduling, and router instantiation.

The **shared context** (`packages/api/typescript/src/shared/index.ts`) is special: it uses `root: true` to register on the root container and passes `ALL_REGISTRIES` (shared services + all repository bindings). Other contexts create child containers that inherit from root.

**Registry pattern**: Each context has a flat `registry.ts` file exporting `INSTANCE_REGISTRY` built with `expandBindings([...])` — one declaration per token, envs as columns. The shared registry (`packages/api/typescript/src/shared/registry.ts`) maps every context registry into `CONTEXT_REGISTRIES` (`satisfies Record<ContextModule, InstanceRegistry>`, compile-checked against the `CONTEXTS` manifest) and mechanically merges them into `ALL_REGISTRIES`. TestBed imports `ALL_REGISTRIES` directly for test DI.

## When to Use This Skill

- Starting a new business domain (e.g., "billing", "scheduling")
- A group of related entities and operations that share a common language
- Existing contexts are becoming too large or handling unrelated concerns

## When NOT to Use This Skill

- Adding features to an existing domain — add to the existing context instead
- Creating utility or helper code — use `shared/`
- UI-specific read queries — use the `ui` context

## Prerequisites

- Read `docs/BACKEND.md` — Bounded Contexts section + folder shape
- Ensure you're in the monorepo root directory

## Process

### Step 1: Validate Context Name

The context name should be:
- Lowercase, singular (e.g., `product`, `order`, `user`)
- A business domain concept
- Not already existing in `packages/api/typescript/src/`

### Step 2: Create Context Structure [CTX-01, CTX-05]

Run the CLI command:

```bash
bun cli context <name>
```

This creates the following structure:

```
packages/api/typescript/src/<context>/
├── controllers/        # HTTP controllers (endpoints)
│   └── index.ts       # Barrel export
├── entities/          # Domain entities
│   └── index.ts
├── enums/             # Domain enums (status, type, category)
│   └── index.ts
├── errors/            # Error types (DomainErrors, ApplicationErrors, Errors)
│   └── index.ts
├── events/            # Domain events
│   └── index.ts
├── handlers/          # Event handlers
│   ├── internal.ts    # Internal context handlers
│   └── external.ts    # Cross-context handlers
├── middlewares/       # HTTP middlewares
│   └── index.ts
├── objects/           # Value objects and enums
│   └── index.ts
├── repositories/      # Repository interfaces + implementations
│   └── index.ts
├── registry.ts        # DI bindings for mock/integration/real (flat file, not folder)
├── schemas/           # (optional) Zod schemas for shared domain validation
│   └── index.ts
├── services/          # Domain/Application services
│   └── index.ts
├── usecases/          # Application use cases
│   └── index.ts
└── index.ts           # BoundedContext.create() + exports
```

### Step 3: Create Context Index with BoundedContext.create() [CTX-02, BC-P01]

The context `index.ts` uses `BoundedContext.create()` to bootstrap the context declaratively:

```typescript
// packages/api/typescript/src/<context>/index.ts
import * as controllers from './controllers'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import middlewares from './middlewares'

import { BoundedContext } from '@codedm/core-typescript'

const ctx = await BoundedContext.create({
  name: '<context>',
  controllers,
  middlewares,
  internalHandlers,
  externalHandlers,
})

export const container = ctx.container
export default ctx.router
```

`BoundedContext.create()` handles:
- Child container creation (inherits from root)
- Auto-tracing
- Mediator resolution + handler registration
- Job scheduling (if `jobs` is provided)
- Custom setup callback (if `setup` is provided)
- Router instantiation

### Step 4: Create the Context Registry [CTX-06, CTX-07]

Every bounded context must have a flat `registry.ts` file (not a folder) exporting `INSTANCE_REGISTRY`:

```typescript
// packages/api/typescript/src/<context>/registry.ts
import { type InstanceRegistry, expandBindings } from '@codedm/core-typescript'
import { ExampleRepository, MockExampleRepository, DrizzleExampleRepository } from './repositories'

// One declaration per token — `integration` omitted mirrors `real`; `null` = declared absence.
export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
  { token: ExampleRepository, mock: MockExampleRepository, real: DrizzleExampleRepository },
])
```

Then add the context to `CONTEXT_REGISTRIES` in the shared registry (`packages/api/typescript/src/shared/registry.ts`). The map is `satisfies`-checked against the `CONTEXTS` manifest, and the mechanical merge derives `ALL_REGISTRIES` — never hand-spread env arrays:

```typescript
import { INSTANCE_REGISTRY as newContextRegistry } from '@<context>/registry'

const CONTEXT_REGISTRIES = {
  shared: CORE_REGISTRY,
  // ...existing contexts...
  <context>: newContextRegistry,
} satisfies Record<ContextModule, InstanceRegistry>
// ALL_REGISTRIES is derived mechanically from CONTEXT_REGISTRIES — do not edit it.
```

### Step 5: Declare the Context + Register Router (CRITICAL!) [CTX-03, BC-P12]

After creating the context, you MUST add it to the `CONTEXTS` manifest (`packages/api/typescript/src/shared/contexts.ts`) and wire its router into the `ROUTERS` map in `packages/api/typescript/src/routers.ts`. The map is checked with `satisfies Record<ContextModule, Router>` — a declared context without a wired router is a **compile error**, not a silent gap:

```typescript
// packages/api/typescript/src/shared/contexts.ts
export const CONTEXTS = {
  // ...existing contexts...
  <context>: { runtime: '<context>', pgSchema: '<context>' },
} as const satisfies Record<string, ContextDecl>

// packages/api/typescript/src/routers.ts
import NewContextRouter from '@<context>/index'

const ROUTERS = {
  // ...existing contexts...
  <context>: NewContextRouter,
} satisfies Record<ContextModule, Router>
```

Both `src/index.ts` (server boot) and `scripts/emit-openapi.ts` consume `ALL_ROUTERS` from `routers.ts` — no other file needs touching.

### Step 6: Register Enums in `shared/index.ts` [BC-P10]

Add the new context's enums import to `packages/api/typescript/src/shared/index.ts`:

```typescript
import * as newContextEnums from '@<context>/enums'

openapi.registerEnums({ ...enums, ..., ...newContextEnums })
```

### Step 7: Initialize Errors [BC-P06]

Edit `<context>/errors/index.ts` to add initial error types and the `Errors` union:

```typescript
import type { BaseDomainErrors, BaseApplicationErrors, BaseInterfaceErrors, BaseInfrastructureErrors } from '@codedm/core-typescript'

export type <Context>DomainErrors = '<CONTEXT>_NOT_FOUND'
export type DomainErrors = BaseDomainErrors | <Context>DomainErrors

export type <Context>ApplicationErrors = never
export type ApplicationErrors = BaseApplicationErrors | <Context>ApplicationErrors

export type <Context>InterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | <Context>InterfaceErrors

export type <Context>InfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | <Context>InfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors
```

### Step 8: Register Errors in GlobalErrorMapper

Edit `packages/api/typescript/src/shared/utils/GlobalErrorMapper.ts` — import from the errors barrel:

```typescript
import type { Errors as NewContextErrors } from '@<context>/errors'
```

Add error mappings to the `GlobalErrorMapper` record.

## BoundedContext Options Reference

| Option | Required | Description |
|--------|----------|-------------|
| `name` | yes | Context name (used as URL prefix: `/<name>`) |
| `root` | no | `true` for the shared context only — registers on root container |
| `controllers` | yes | Namespace import of controllers (`import * as controllers from './controllers'`) |
| `middlewares` | no | Default import of middlewares (`import middlewares from './middlewares'`) |
| `skipMiddlewares` | no | Middlewares to skip for this context |
| `internalHandlers` | no | Namespace import of internal event handlers |
| `externalHandlers` | no | Namespace import of cross-context event handlers |
| `registry` | no | `InstanceRegistry` with mock/integration/real DI entries |
| `jobs` | no | Array of `{ handler, repeat }` for scheduled jobs |
| `setup` | no | Async callback for custom initialization |

## Jobs

For recurring background work, use the `jobs` option:

```typescript
import { ChatLoopHandler } from './handlers/ChatLoopHandler'

const ctx = await BoundedContext.create({
  name: 'agent',
  controllers,
  middlewares,
  internalHandlers,
  externalHandlers,
  jobs: [{ handler: ChatLoopHandler, repeat: { every: 30_000 } }],
})
```

Supports `{ every: milliseconds }` for intervals or `{ pattern: '* * * * *' }` for cron expressions.

## Checklist

- [ ] All `when: always` patterns present (CTX-01 through CTX-07, BC-P01, BC-P06, BC-P12 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (CTX-C01, CTX-C02, BC-P03 through BC-P05, BC-P10, BC-P11 — check which apply)
- [ ] No `bad_practices` violations (bp-01, bp-02 — verify against registry.yaml)

## Example

Creating a `product` context:

```bash
# 1. Create context
bun cli context product

# 2. Edit product/index.ts — BoundedContext.create({ name: 'product', ... })

# 3. Create product/registry.ts with expandBindings([{ token, mock, real }]) declarations

# 4. Add product registry to CONTEXT_REGISTRIES in packages/api/typescript/src/shared/registry.ts

# 5. Declare product in CONTEXTS (src/shared/contexts.ts) + wire router in ROUTERS (src/routers.ts)

# 6. In packages/api/typescript/src/shared/index.ts, add enum registration

# 7. Edit product/errors/index.ts with initial errors + Errors type

# 8. Register errors in GlobalErrorMapper
```

## Next Steps

After creating a context, typically you will:
1. Use `/errors` to define all error types
2. Use `/enum` to define domain enums
3. Use `/controller` to create HTTP endpoints
4. Use `/sdk` to generate the SDK

## Composition Pattern — Greenfield context (full feature shape)

When you stand up an entire new domain — this is the shape, in order. Example: adding billing capability (`billing`) — issue invoices, record payments, send reminders.

**Per-context one-time work**
- `bounded-context` `billing` (folder + `registry.ts` + entries in `CONTEXTS`, `ROUTERS`, and `CONTEXT_REGISTRIES`)

**First slice (issue invoice — pick the smallest end-to-end behavior)**
- `entity` `Invoice` (id, customer, items, status, dueDate)
- `entity` `Payment` (separate aggregate)
- `value-object` `Money` (currency + amount)
- `value-object` `LineItem` (description + amount + quantity)
- `enum` `InvoiceStatus = DRAFT | ISSUED | PAID | OVERDUE | CANCELED`
- `enum` `PaymentMethod = PIX | CARD | BANK_SLIP`
- `errors` entry — `InvoiceNotFound`, `InvoiceAlreadyPaid`, `InvalidAmount` (single typed-union file per `/errors` skill)
- `db-modelling` + `migration` for both tables
- `repository` `DrizzleInvoiceRepository`, `DrizzlePaymentRepository`
- `usecase` `IssueInvoice`, `RecordPayment`, `CancelInvoice`
- `controller` `POST /invoices`, `POST /invoices/:id/payments`, `PATCH /invoices/:id/cancel`
- `schema` per input/output
- `event` domain `InvoiceIssued`, `PaymentRecorded`, `InvoiceOverdue`
- `handler` `InvoiceOverdueReminderHandler` (sends reminder)
- Integration events when other contexts react: `billing.invoice.paid` → patient updates balance.
- Frontend
  - `route` `/billing/invoices`, `/billing/invoices/:id`
  - `component` `InvoiceList`, `InvoiceDetail`
  - `form` `IssueInvoiceForm`, `RecordPaymentForm`
  - `query` `ListInvoicesQuery`, `GetInvoiceDetailQuery`

**Typical wave layout for a context this size:**
- W1: entity + value-object + enum + errors (parallel)
- W2: db-modelling + migration
- W3: repository
- W4: usecase + controller + schema (parallel)
- W5: SDK contract lock
- W6: frontend (parallel)

If you discover the new context exceeds ~8 entities, stop and invoke `/ddd-modeling` to evaluate splitting it.

## References

- `docs/BACKEND.md` — Bounded Contexts section + folder shape
- `packages/api/typescript/src/shared/types/BoundedContext.ts` — BoundedContext class
