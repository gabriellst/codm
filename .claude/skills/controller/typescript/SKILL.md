---
name: controller
description: Create an HTTP controller (API endpoint) with Zod schemas and validation. Use when adding endpoints like POST /products, GET /users/:id. Use this skill whenever implementing REST API routes, defining request/response schemas, or adding new HTTP endpoints to any bounded context.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Create HTTP Controller

Creates an HTTP controller with proper InputSchema, OutputSchema, and validation following the project patterns.

## Why Controllers Exist

Controllers are the system boundary — the only place where external HTTP input enters the application. They own expressive validation (format, regex, constraints) so that use cases can trust their input and stay simple. Controllers also define the contract (schemas) that generates the SDK for frontend consumption.

## When to Use This Skill

- You need an HTTP endpoint for the frontend or external consumers
- You need to expose a use case to the frontend via the API
- You need to define the API contract (InputSchema/OutputSchema) for SDK generation
- You need format validation (regex, length, email format) before data reaches the use case

## When NOT to Use This Skill

- **Internal use case orchestration** — one use case calls another directly, no controller needed
- **Event-driven processing** — use `/handler` skill to react to domain/integration events
- **Direct DB queries for UI** — use `/query` skill with `DrizzleDatabaseDriver` in the `ui` context
- **Business rule validation** — belongs in entities or use cases, not controllers

## Prerequisites

- Context must exist (use `/context` first if needed)
- Errors must be defined and registered in GlobalErrorMapper (use `/errors` first)
- Enums must be defined if used in schemas (use `/enum` first)
- Schema patterns for controllers are documented in the "Schema Patterns" section below

## Key Principles

1. **Expressive Validation**: Controllers have complex validation (regex, refine, format checks)
2. **Query Params are Strings**: Use `z.stringToNumber()`, `z.stringToBoolean()`, `z.stringToDate()` for query params
3. **Always Use z.enum()**: Never hardcode enum values with `z.literal()`
4. **Use Helpers**: `z.paginatedQuery()` for list endpoints, `z.paginatedResponse()` for responses
5. **Export in index.ts**: Controllers must be exported to be registered

## Process

### Step 1: Generate Controller Scaffold

```bash
bun cli controller <context> <name> [options]
```

**Options:**
- `--method <method>`: HTTP method (get, post, put, patch, delete, head, ws, sse)
- `--path <path>`: Custom path
- `--internal`: Internal endpoint (not exposed in SDK)

**Automatic Inference:**
- `Create*` → POST `/<context>`
- `Update*` → PUT `/<context>/:id`
- `Delete*` → DELETE `/<context>/:id`
- `Get*` → GET `/<context>/:id`
- `List*` → GET `/<context>`

### Step 2: Define InputSchema [CTRL-01, CTRL-C01, CTRL-C02, CTRL-C03]

Edit the controller file with proper Zod schema. **CRITICAL: Use `.example([...])` for examples!**

```typescript
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { CreateProductInputSchema, CreateProductOutputSchema } from '@product/usecases/CreateProduct'

// Option 1: Import from use case (preferred when use case has schemas)
export const CreateProductInputSchema = z
  .object({
    body: CreateProductInputSchema.omit({ userId: true }),
    ctx: z.object({
      session: z.object({
        actorId: z.string(),
        ownerId: z.string(),
      }),
    }),
  })
  .example([
    {
      body: { name: 'Product Name', price: 99.99 },
      ctx: { session: { actorId: 'actor-123', ownerId: 'owner-456' } },
    },
  ])

// Option 2: Define inline with value object schemas (for simple controllers)
// When a field maps to a value object, use VOSchema.input() instead of raw z.string()
export const [ControllerName]InputSchema = z
  .object({
    body: z.object({
      name: z.string().min(3).max(100),
      email: z.email(),                      // Use z.email() for email fields
      phone: PhonePlainSchema.input(),        // Reuse value object schema
      address: AddressSchema.input().optional(), // Complex VO schemas too
      status: z.enum(OrderStatus),            // Always z.enum for enums!
    }),
  })
  .example([
    {
      body: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '11999998888',
        status: 'ACTIVE',
      },
    },
  ])

// For query parameters (use z.paginatedQuery helper!)
// CRITICAL: z.paginatedQuery already includes page, limit, search - don't redefine them!
export const [ControllerName]InputSchema = z
  .object({
    query: z.paginatedQuery({
      startDate: z.stringToDate(),
      endDate: z.stringToDate(),
      status: z.enum(OrderStatus).optional(),  // Enum values are UPPERCASE: 'PENDING', 'CONFIRMED'
    }),
  })
  .example([
    {
      query: { page: 1, limit: 10, search: 'John', status: 'PENDING' },
    },
  ])

// For path parameters
export const [ControllerName]InputSchema = z
  .object({
    params: z.object({
      id: z.string(),
    }),
  })
  .example([{ params: { id: '123e4567-e89b-12d3-a456-426614174000' } }])
```

### Step 3: Define OutputSchema [CTRL-02, CTRL-P03, CTRL-P04, CTRL-P05]

```typescript
// Option 1: Import from use case
export const [ControllerName]OutputSchema = CreateProductOutputSchema.example([
  { productId: '123e4567-e89b-12d3-a456-426614174000' },
])

// Option 2: Use z.paginatedResponse helper for lists
export const [ControllerName]OutputSchema = z
  .paginatedResponse({
    id: z.string(),
    name: z.string(),
    price: z.number(),
  })
  .example([
    {
      items: [{ id: '1', name: 'Product 1', price: 99.99 }],
      total: 100,
      totalPages: 10,
    },
  ])

// Option 3: Define inline
export const [ControllerName]OutputSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: z.date(),
  })
  .example([
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'John Doe',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ])
```

### Step 4: Implement Controller Class [CTRL-03, CTRL-04, CTRL-05]

```typescript
@injectable()
export class CreateProductController extends Controller<typeof InputSchema, typeof OutputSchema> {
  // If the context name is already "product", then there's no need to repeat the route /product, just leave /
  readonly path = '/'
  readonly method = 'post'
  readonly description = 'Create a new product'
  readonly inputSchema = InputSchema
  readonly outputSchema = OutputSchema

  // Optional: Enable mock mode for frontend development
  // override mockController = true

  constructor(
    private createProduct: CreateProduct, // Use case injection
  ) {
    super()
  }

  async handle(request: this['input']): Promise<this['output']> {
    const { body, ctx } = request

    // Call .execute() — it validates input, auto-creates a transaction, then calls .execute()
    const result = await this.createProduct.execute({
      ...body,
      organizationId: ctx.session.ownerId,
    })

    return {
      status: HttpStatusCode.CREATED,
      data: result,
    }
  }
}
```

### Step 5: Export Controller [CTRL-06]

Edit `<context>/controllers/index.ts`:

```typescript
export { CreateProductController } from './CreateProduct'
export { UpdateProductController } from './UpdateProduct'
export { ListProductsController } from './ListProducts'
// Add your new controller export
```

**Without this export, the controller will NOT work!**

## Context Object (ctx) — Session Pattern [CTRL-C08, bp-09]

**Rule: `ctx.session` provides the authenticated actor's identity**, set by `AuthActorMiddleware`. It contains `actorId` and `actorType` which identify who is making the request. Controllers pass these directly to use cases — no remapping needed.

### Session Pattern

```typescript
// ✅ CORRECT — ctx.session for actor identity
const InputSchema = z.object({
  body: z.object({ name: z.string() }),
  ctx: z.object({
    session: z.object({
      actorId: z.string(),
      actorType: z.enum(MemberType),
    }),
  }),
})

async handle(request: this['input']): Promise<this['output']> {
  const { actorId, actorType } = request.ctx.session
  await this.useCase.execute({ ...request.body, actorId, actorType })
}
```

### Setting Cookies

Controllers that change operating context return cookies in the response.

## Middleware Architecture [CTRL-C07, CTRL-P10, CTRL-P11, bp-10]

### Context-Level Defaults

Each bounded context defines default middlewares in `middlewares/index.ts`:

```typescript
// clinic/middlewares/index.ts
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { AuthActorMiddleware } from '@auth/middlewares/AuthActorMiddleware'

export default [AuthAccountMiddleware, AuthActorMiddleware]
```

**All controllers in that context automatically get these middlewares.** The context `index.ts` must use `import middlewares from './middlewares'` (default import, not `import * as`).

### Current Context Defaults

| Context | Default Middlewares |
|---------|---------------------|
| `clinic` | `[AuthAccountMiddleware, AuthActorMiddleware]` |
| `appointment` | `[AuthAccountMiddleware, AuthActorMiddleware]` |
| `patient` | `[AuthAccountMiddleware, AuthActorMiddleware]` |
| `doctor` | `[AuthAccountMiddleware, AuthActorMiddleware]` |
| `service` | `[AuthAccountMiddleware, AuthActorMiddleware]` |
| `unit` | `[AuthAccountMiddleware, AuthActorMiddleware]` |
| `ui` | `[AuthAccountMiddleware, OnboardingMiddleware]` |

### Per-Controller Overrides [CTRL-P10]

When a controller needs different middlewares than the context default:

```typescript
// ADD a middleware on top of defaults
override middlewares: (Middleware | MiddlewareClass)[] = [SomeExtraMiddleware]

// REMOVE a middleware from defaults
override skipMiddlewares: (Middleware | MiddlewareClass)[] = [AuthActorMiddleware]
```

Adding a middleware that's already in the context default creates a second instance — see `bp-10` in registry.yaml for the wrong/right pattern.

### When to Use skipMiddlewares [CTRL-P11]

Controllers that need fewer middlewares than the context default:

```typescript
// SwitchUnit only needs AuthAccount (no AuthActor — user hasn't picked a unit yet)
override skipMiddlewares: (Middleware | MiddlewareClass)[] = [AuthActorMiddleware]

// CreateClinic only needs AuthAccount (no AuthActor — user isn't a member yet)
override skipMiddlewares: (Middleware | MiddlewareClass)[] = [AuthActorMiddleware]
```

### Middleware Chain

```
AuthAccountMiddleware (validates BetterAuth session)
  ↓
AuthActorMiddleware (validates actor type — DOCTOR or COLLABORATOR — from session, sets ctx.actor)
  ↓
Controller.execute()
```

### Middleware Responsibilities

| Middleware | Validates | Sets |
|-----------|-----------|------|
| `AuthAccountMiddleware` | BetterAuth session | `ctx.session` (actorId, ownerId, actorType) |
| `AuthActorMiddleware` | Actor type (DOCTOR or COLLABORATOR) from session | `ctx.actor` |
| `OnboardingMiddleware` | User has completed onboarding | nothing (guard only) |

## MCP Exposure — `static mcpScopes` [CTRL-C17, bp-23]

A controller becomes callable by a model as an MCP tool by declaring `static override readonly mcpScopes`, right above `readonly path` — the same idiom `middlewares` already established: a cross-cutting property of an endpoint lives ON the endpoint, not in a list somewhere else.

```typescript
import { McpScope } from '@codm/contracts-typescript/wire/enums'

@injectable()
export class ForkIssueController extends Controller<typeof ForkIssueControllerInputSchema, typeof ForkIssueControllerOutputSchema> {
  /** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
  static override readonly mcpScopes = [McpScope.orchestration]
  readonly path = '/threads/:threadId/issues/fork'
  // ...
}
```

**ABSENT is the default and absent means NOT EXPOSED.** With no filter, `@kubb/plugin-mcp` turns every operation in the OpenAPI spec into a tool — the security property comes entirely from this being opt-in, per class, in the file a reviewer is already reading. Never a bare string literal: `McpScope` always comes from `@codm/contracts-typescript/wire/enums`.

A non-empty `mcpScopes` also makes `AgentIdentityMiddleware` **mandatory** — appended automatically by `Controller.executeMiddlewares` (core), WITHOUT a line in `override middlewares`. It resolves the caller's run identity, compares it against `params`/`body`, and stamps `ctx.agentIdentity`. Controllers that read the stamped identity compose the shared schema instead of re-declaring it:

```typescript
import { AgentRunIdentityCtxSchema } from '../types/AgentRunIdentity'

export const ForkIssueControllerInputSchema = z.object({
  ctx: z.object({ ownerId: z.uuid() }).extend(AgentRunIdentityCtxSchema.shape),
  // ...
})
```

See `/middleware` MID-C06/MID-C07 for the middleware side of this pair. Never declare exposure in a central `MCP_SCOPES` record or similar — see `bp-23` in registry.yaml.

## Public Controllers — the empty middleware chain is a decision [CTRL-C18, bp-24]

A controller with no `override middlewares` and no `static mcpScopes` genuinely ships with an empty middleware chain — `Controller.effectiveMiddlewares` (core/src/types/Controller.ts) only auto-appends `AgentIdentityMiddleware` when `mcpScopes` is non-empty, and there is no context-default injection at this layer for a root-level controller. That absence is indistinguishable, by the compiler, from a controller nobody got around to protecting — so the ONE sanctioned way to ship one is to document why on the class.

```typescript
/**
 * O PRIMEIRO CONTROLLER PUBLICO DO REPO, e a ausencia de `middlewares` e a decisao, nao um
 * esquecimento. Quem pergunta se o daemon subiu e o supervisor da shell, ANTES de existir
 * qualquer sessao — exigir identidade para responder "eu terminei de subir" e exigir que o
 * app esteja pronto para descobrir se ele esta pronto.
 */
@injectable()
export class HealthController extends Controller<typeof HealthInputSchema, typeof HealthOutputSchema> {
  readonly path = '/health'
  readonly method = 'get' as const
  // no `override middlewares`, no `static mcpScopes`
  constructor(private readonly health: HealthService) { super() }
}
```

The only legitimate case today is process readiness (`shared/controllers/Health.ts`) — a caller (the shell supervisor) that structurally cannot hold a session yet. Review rejects a controller shipped with an empty chain and no docblock: see `bp-24` in registry.yaml for the wrong/right pattern. Do not invent a `PublicMiddleware` marker or `static mcpScopes = []` to signal this — the framework already treats absence as the mechanism.

## Schema Patterns [CTRL-C04, CTRL-C09, CTRL-P02, CTRL-P03, CTRL-P14]

### Schema Import Hierarchy

Before writing any inline schema, check these sources **in order**:

1. **Use case exported schemas** — import and compose with `.extend()`, `.pick()`, `.omit()`, wrap in `body`/`query`/`params`
2. **VO `.input()` schemas** — `AddressSchema.input()`, `CPFSchema.input()` (but use `z.email()` for email)
3. **Shared/context schemas** — `@shared/schemas`, `@[context]/schemas`
4. **Only then define inline** — for fields with no existing schema

### Reusing Use Case Schemas [CTRL-C04, CTRL-P02, CTRL-P03]

Controller and use case input/output schemas are structurally similar — the main difference is that controllers assemble data from **multiple sources** (body, cookies, params, ctx) while use cases receive a flat object. **Always start from the use case schema** and compose with `.extend()`, `.pick()`, `.omit()` instead of redefining fields inline.

#### Pattern 1: `.omit()` — Remove fields injected from cookies/ctx

When the use case needs fields that the controller gets from cookies or ctx (not from body):

```typescript
import { CreateOrderInputSchema } from '@order/usecases/CreateOrder'

// Use case expects: { name, price, memberId, unitId }
// Controller gets memberId/unitId from cookies, only name/price from body
export const InputSchema = z
  .object({
    body: CreateOrderInputSchema.omit({ memberId: true, unitId: true }),
    cookie: z.object({
      memberId: z.object({ value: z.string() }),
      unitId: z.object({ value: z.string() }),
    }),
  })
  .example([{
    body: { name: 'Order 1', price: 99.99 },
    cookie: { memberId: { value: 'member-1' }, unitId: { value: 'unit-1' } },
  }])
```

#### Pattern 2: `.pick()` — Use a subset of the use case schema

When the controller only needs a few fields from the use case:

```typescript
import { UpdateProductInputSchema } from '@product/usecases/UpdateProduct'

// Use case has many fields, but this endpoint only updates status
export const InputSchema = z
  .object({
    params: z.object({ id: z.string() }),
    body: UpdateProductInputSchema.pick({ status: true }),
  })
  .example([{
    params: { id: '123e4567-e89b-12d3-a456-426614174000' },
    body: { status: 'ACTIVE' },
  }])
```

#### Pattern 3: `.extend()` — Add controller-specific fields

When the controller needs everything from the use case schema plus additional fields:

```typescript
import { CreateServiceInputSchema } from '@service/usecases/CreateService'

// Use case schema is the base, but controller adds a controller-only field
export const InputSchema = z
  .object({
    body: CreateServiceInputSchema.omit({ doctorId: true }).extend({
      notes: z.string().optional(), // controller-specific, not in use case
    }),
    cookie: z.object({
      doctorId: z.object({ value: z.string() }),
    }),
  })
  .example([{
    body: { name: 'Consultation', price: 150, notes: 'Optional note' },
    cookie: { doctorId: { value: 'doc-1' } },
  }])
```

#### Pattern 4: Output schema reuse

Output schemas are often identical to use case output — just add `.example()`:

```typescript
import { CreateProductOutputSchema } from '@product/usecases/CreateProduct'

// Reuse directly, just add example for OpenAPI
export const OutputSchema = CreateProductOutputSchema.example([
  { id: '123e4567-e89b-12d3-a456-426614174000' },
])
```

Never redefine fields that already exist in the use case schema — see `CTRL-C04` in registry.yaml for the wrong pattern and `CTRL-P02` for the correct pattern.

### VO `.input()` in Controllers [CTRL-C09, CTRL-C11, bp-13, bp-19]

Controllers should use `VOSchema.input()` for any field that maps to a value object — both primitive VOs (CPF) AND composite VOs (Address, Phone). **Exception: For email fields, always use `z.email()` — never `EmailSchema.input()`** (see bp-19).

```typescript
// CORRECT
email: z.email(),                         // Always z.email() for email fields
phone: PhonePlainSchema.input(),          // VO .input() for non-email VOs
address: AddressSchema.input().optional(), // Composite VO .input()
cpf: CPFSchema.input(),                   // Primitive VO .input()

// WRONG
email: EmailSchema.input(),              // Never use EmailSchema in controllers (bp-19)
```

See `bp-13` and `bp-19` in registry.yaml for wrong/right patterns, and `CTRL-C11` for the email rule.

### Reuse Checklist

Before defining any nested `z.object()`, search in order:
1. `@[context]/usecases/` — use case exported schemas (`.omit()`, `.pick()`, `.extend()` + wrap in body/query/params)
2. `@shared/objects` / `@[context]/objects` — VO schemas (`.input()`)
3. `@shared/schemas` / `@[context]/schemas` — shared schemas
4. Define inline only if no match exists

**The default assumption is that the controller body schema derives from the use case input schema.** Only define fields inline when:
- The field doesn't exist in any use case schema
- The controller shape is fundamentally different from the use case (rare)

### Controller-Specific Schema Rules

- **`.example([...])`** required on InputSchema and OutputSchema (for OpenAPI/SDK generation)
- **Query params** use `z.stringTo*()` converters (`z.stringToNumber()`, `z.stringToBoolean()`, `z.stringToDate()`)
- **`.refine()`** uses `{ error: '...' as InterfaceErrors }`, not `{ message: '...' }` — see `CTRL-P09` and `bp-15` in registry.yaml
- **Enums** use `z.enum(EnumType)`, never inline string literals — see `bp-04` in registry.yaml
- **Type inference**: `Z.infer<typeof Schema>`, never `(typeof Schema)['_output']` — see `bp-14` in registry.yaml

### Query/List Filters Are Controller-Local — Never a Contract Enum

A toggle/filter that only narrows *one list screen* (e.g. "show product costs that sold without a registered cost") is a **UI concern of that endpoint**, not a cross-boundary wire contract. Define it **inline on the controller's `query` schema** — do **not** promote it to a `packages/contracts` enum.

`packages/contracts` is the cross-*language*/cross-*service* source of truth: a value belongs there only when **another backend (Go) or a persisted row** has to agree on it. A list filter is read by exactly one controller, consumed by exactly one frontend screen via the generated SDK, and never persisted — so a contract enum buys nothing and adds a frozen, hard-to-change global symbol plus generated TS+Go bindings nobody uses.

```typescript
// ✅ CORRECT — filter defined inline on the controller's query schema.
//    The SDK still gets a type-safe enum (generated from this controller's OpenAPI),
//    so the frontend multi-select is fully typed — without touching contracts.
export const ListProductCostsInputSchema = z
  .object({
    query: z.paginatedQuery({
      filters: z.array(z.enum(['SOLD_WITHOUT_COST'])).optional(),
    }),
  })
  .example([{ query: { page: 1, limit: 20, filters: ['SOLD_WITHOUT_COST'] } }])

// ❌ WRONG — a list-screen filter living in packages/contracts/src/wire/enums.
//    Cross-language bindings + a Phase-0-frozen global for a single-screen toggle.
import { ProductCostListFilter } from '@codm/contracts-typescript/wire/enums'
filters: z.array(z.enum(ProductCostListFilter)).optional()
```

Rule of thumb: if the only consumer is **this controller + its SDK hook**, keep the literal set inline. Promote to a contract enum **only** when a Go worker, an integration event, or a DB column must share the exact same values. The same test applies to ad-hoc `sortBy`/`groupBy`/`status`-filter literals on read endpoints.

## Critical Rules

### Examples [CTRL-01]

Always use `.example([...])`, never `.meta({ examples })` — see `CTRL-01` in registry.yaml for the rule and wrong pattern.

### Schema Types by Location [CTRL-C15, bp-05]

**Query params** come as strings from the URL, so they need coercion transforms:
```typescript
// Query params - use z.stringToX() transforms
query: z.paginatedQuery({
  startDate: z.stringToDate(),
  endDate: z.stringToDate(),
  active: z.stringToBoolean().optional(),
  count: z.stringToInteger().optional(),
  minPrice: z.stringToNumber().optional(),
  status: z.enum(OrderStatus).optional(),  // Enums work directly
})
```

**Body and Response** use native Zod types (already parsed as JSON):
```typescript
// Body - use native Zod types
body: z.object({
  name: z.string().min(3),
  price: z.number().min(0),       // NOT z.stringToNumber()
  active: z.boolean(),            // NOT z.stringToBoolean()
  createdAt: z.coerce.date(),     // Date fields in body use z.coerce.date()
})

// Response - use native Zod types
const OutputSchema = z.object({
  id: z.string(),
  price: z.number(),              // NOT z.stringToNumber()
  active: z.boolean(),            // NOT z.stringToBoolean()
  createdAt: z.coerce.date(),     // Date fields in response use z.coerce.date()
  updatedAt: z.coerce.date(),     // Date fields in response use z.coerce.date()
})
```

### Query Params [CTRL-C01, CTRL-C15, bp-05]

Query params are always strings — use `z.paginatedQuery()` for list endpoints and `z.stringTo*()` converters for non-string types. See `bp-05` in registry.yaml for the wrong/right pattern, and `CTRL-C01` for the correct paginatedQuery usage.

### Enums [bp-04]

Never use `z.union([z.literal(...)])` or `z.nativeEnum()` — always use `z.enum(EnumRef)`. See `bp-04` in registry.yaml for the wrong/right pattern.

### Never Use z.string() for Fixed Values [bp-04]

Never use `z.string()` for a field with fixed values — the frontend won't know the valid values. Use `z.enum(EnumRef)` so the SDK generates a type-safe enum. See `bp-04` in registry.yaml.

### Validation Location

- **Format validation** (regex, length, format) → InputSchema (Controller)
- **Business rules** (uniqueness, permissions) → Domain/Use Case

## Complete Example

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

## Checklist

- [ ] All `when: always` patterns present (CTRL-01 through CTRL-06 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (CTRL-C01 through CTRL-C18 — check which apply)
- [ ] No `bad_practices` violations (bp-02 through bp-24 — verify against registry.yaml)
- [ ] Controller exported in `controllers/index.ts`

## Next Steps

After creating controllers:
1. Run `bun x nx run api:dev` to generate the OpenAPI Spec
2. Use `/sdk` to generate the SDK
3. Frontend can start working with the generated hooks
4. Use `/usecase` to implement the backend logic

## References

- `@codm/core-typescript` — Controller, HttpStatusCode, z, BaseError (all framework types)
- `docs/BACKEND.md` - Architecture principles (why)
- `/usecase` skill - For implementing the business logic
- `/errors` skill - For defining and registering errors
- `/sdk` skill - For generating the frontend SDK
