---
name: sdk
description: Generate the typed SDK from backend controllers. Use after creating or modifying controllers to make them available to frontend. Use this skill whenever backend endpoints change and the frontend SDK needs regeneration.
---

# Generate SDK

Generates the typed SDK from backend OpenAPI specification, making hooks, types, and schemas available for frontend development.

## Why the SDK Is Auto-Generated

- The SDK is auto-generated from backend controller schemas (InputSchema/OutputSchema), producing typed React hooks, Zod validation schemas, TypeScript types, and query key functions — all derived from the single source of truth (the controller)
- The frontend never manually defines API types or validation — everything stays synchronized with the backend automatically
- Query key functions ensure cache invalidation is always correct and refactor-safe
- Zod schemas are reused for route `validateSearch` and form `validators.onSubmit`, so URL params and form inputs are validated against the same contract the backend enforces
- HTTP functions (from `@codm/client-typescript/typescript`) are for external consumers/integration boundaries, not for internal `api` cross-context orchestration

## When to Use This Skill

- After creating or modifying any controller (new endpoint, changed schema)
- After adding new enums or error types used in controllers
- When the frontend needs to call a new or updated API endpoint
- After changing HTTP methods, paths, or response shapes in controllers

## When NOT to Use This Skill

- No controller changes were made (only backend-internal changes)
- Changes are limited to use cases, entities, or repositories that don't affect controller schemas
- Only documentation or test changes were made

## Prerequisites

- Backend controllers created and exported
- Backend server must be running
- Router wired into the `ROUTERS` map in `packages/api/typescript/src/routers.ts`

## Process

### Step 1: Start Backend Server

In one terminal, start the backend:

```bash
# From monorepo root
bun dev

# Or backend only via Nx
bun x nx run api:dev
```

Wait for the server to start. You should see:
```
Server running on http://localhost:{PORT}
```

Port will be an arbitrary value defined on the .env, usually being the one included in .env.example

### Step 2: Generate SDK

In another terminal, generate the SDK:

```bash
# From monorepo root
bun sdk
```

This runs:
1. Go channel OpenAPI emitter (`go run ./cmd/openapi`) — produces `packages/channel/public/docs/openapi.json`
2. Kubb generation for both template + channel targets — reads OpenAPI specs, generates TypeScript code in `packages/client/src/`
3. `pluginZodRefinements` post-processor (AST-based) — applies `x-zod-refinements`, enum linking, `x-unknown`, event folders, discriminatedUnion rewrite, and variant accessors
4. Builds the SDK package

There are no pre/post-patches. Both pipelines are unified in `packages/client/scripts/sdk.ts`.

### Step 3: Verify Generation

Check that the SDK was generated correctly:

```bash
# Check generated files
ls -la packages/client/src/app/
```

You should see:
```
packages/client/src/
├── api/           # Backend-only functions
│   ├── http/      # HTTP client functions
│   └── index.ts   # Barrel export
├── app/           # Frontend hooks and types
│   ├── hooks/     # React Query hooks
│   ├── types/     # TypeScript types
│   ├── zod/       # Zod schemas
│   └── index.ts   # Barrel export
└── http.ts        # Base HTTP client
```

### Step 4: Verify OpenAPI Spec (Optional)

Open the docs UI to see all endpoints:

```
http://localhost:{PORT}/v1/shared/internal/docs
```

## What Gets Generated

### Hooks (Frontend)

```typescript
// Import from @codm/client-typescript/typescript
import {
  useCreateProduct,      // POST /product
  useUpdateProduct,      // PUT /product/:id
  useDeleteProduct,      // DELETE /product/:id
  useGetProduct,         // GET /product/:id
  useListProducts,       // GET /product
} from '@codm/client-typescript/typescript'
```

### Types (Frontend & Backend)

```typescript
import type {
  CreateProductMutationRequest,   // Input type
  CreateProductMutationResponse,  // Output type
  ListProductsQueryParams,        // Query params
  ListProductsQueryResponse,      // List response
} from '@codm/client-typescript/typescript'
```

### Zod Schemas (Frontend)

```typescript
import {
  createProductMutationRequestSchema,  // For form validation
  listProductsQueryParamsSchema,        // For URL validation
} from '@codm/client-typescript/typescript'
```

### Query Keys (Frontend)

```typescript
import {
  createProductMutationKey,
  listProductsQueryKey,
  getProductQueryKey,
} from '@codm/client-typescript/typescript'

// Usage for cache invalidation
queryClient.invalidateQueries({ queryKey: listProductsQueryKey() })
```

### HTTP Functions (External Consumers)

```typescript
// Import from @codm/client-typescript/typescript
import {
  createProduct,
  getProduct,
  listProducts,
} from '@codm/client-typescript/typescript'

// Use in external consumers (outside api/)
const product = await getProduct({ id: productId })
```

Inside `api/`, prefer repository reads for cross-context validations and/or integration events instead of SDK calls.

## Troubleshooting

### "Connection refused" Error

Backend server is not running. Start it first:
```bash
bun x nx run api:dev
```

### Controllers Not Appearing in SDK

1. Check controller is exported in `controllers/index.ts`
2. Check router is wired into the `ROUTERS` map in `packages/api/typescript/src/routers.ts`
3. Restart backend and regenerate SDK

### Type Errors After Regeneration

Clear TypeScript cache and restart IDE:
```bash
rm -rf node_modules/.cache
# Restart VS Code / IDE
```

### SDK Not Updating

1. Stop backend server
2. Delete generated files: `rm -rf packages/client/src/app packages/client/src/api`
3. Restart backend
4. Regenerate SDK

## When to Regenerate

Regenerate the SDK when:
- Creating new controllers
- Modifying InputSchema or OutputSchema
- Adding new errors (they appear in response types)
- Changing HTTP methods or paths
- Adding new contexts

## Checklist

- [ ] Backend server running
- [ ] Controllers exported in index.ts
- [ ] Router wired into the ROUTERS map in packages/api/typescript/src/routers.ts
- [ ] `bun sdk` completed successfully
- [ ] Hooks available in `@codm/client-typescript/typescript`
- [ ] Types available for import
- [ ] OpenAPI docs show all endpoints

## Example Workflow

```bash
# 1. Create controller
bun cli controller product CreateProduct

# 2. Edit controller with schemas
# ... edit product/controllers/CreateProduct.ts ...

# 3. Export controller
# ... edit product/controllers/index.ts ...

# 4. Start backend (in terminal 1)
bun x nx run api:dev

# 5. Generate SDK (in terminal 2)
bun sdk

# 6. Use in frontend
import { useCreateProduct } from '@codm/client-typescript/typescript'
```

## Frontend Usage Example

```typescript
import { createFileRoute } from '@tanstack/react-router'
import {
  useListProducts,
  useCreateProduct,
  listProductsQueryParamsSchema,
  createProductMutationRequestSchema,
  listProductsQueryKey,
  type CreateProductMutationRequest,
} from '@codm/client-typescript/typescript'
import { useQueryClient } from '@tanstack/react-query'

export const Route = createFileRoute('/products/')({
  validateSearch: search => listProductsQueryParamsSchema.parse(search),
  component: ProductsPage,
})

function ProductsPage() {
  const search = Route.useSearch()
  const queryClient = useQueryClient()

  const { data, isLoading } = useListProducts({ params: search })
  const createProduct = useCreateProduct()

  const handleCreate = async (data: CreateProductMutationRequest) => {
    await createProduct.mutateAsync({ data })
    await queryClient.invalidateQueries({ queryKey: listProductsQueryKey() })
  }

  // ...
}
```

## Bad Practices

### bp-01: Re-exporting SDK schemas unnecessarily
Import directly from `@codm/client-typescript/typescript`. Never re-export SDK schemas.

```typescript
// ❌ WRONG
export { listPatientsQueryParamsSchema }
```

```typescript
// ✅ CORRECT - Importar diretamente da SDK
import { listPatientsQueryParamsSchema } from '@codm/client-typescript/typescript'
```

### bp-02: Creating local types that should come from the SDK
Never duplicate types locally that are already available in the SDK.

```typescript
// ❌ WRONG
export type PatientStatus = 'ativo' | 'inativo' | 'novo' | 'cancelado'
```

```typescript
// ✅ CORRECT
import { type PatientStatusEnum } from '@codm/client-typescript/typescript'
```

### bp-03: Creating local interface instead of inferring from SDK
Infer types from SDK response types instead of creating manual interfaces.

```typescript
// ❌ WRONG
interface ConsultationItem {
  readonly scheduledDate: string
  readonly service: string
  readonly status: string
}
```

```typescript
// ✅ CORRECT
import type { ListPatientDetails200 } from '@codm/client-typescript/typescript'
type ConsultationItem = ListPatientDetails200['consultations'][number]
```

### bp-04: Type assertion to access fields that don't exist in the type
If the field is needed, it must be in the SDK type. Fix the backend contract instead of casting.

```typescript
// ❌ WRONG
const updatedAt = (patient as { updatedAt?: string }).updatedAt
```

### bp-05: Hardcoding tabs/options instead of using SDK enums
Derive options from SDK enums with `Object.values()`, don't create manual arrays.

```typescript
// ❌ WRONG
const tabs = [
  { id: 'todos', label: 'Todos' },
  { id: 'recentes', label: 'Recentes' },
]
```

```typescript
// ✅ CORRECT
import { patientTabEnum } from '@codm/client-typescript/typescript'
const tabs = Object.entries(patientTabEnum).map(([key, value]) => ({
  id: value,
  label: tabLabels[value],
}))
```

### bp-06: Using indexed access type on SDK types instead of enum directly
When the cast involves an SDK enum, always use the enum directly. Never use indexed access on request/response types as a shortcut for enums.

```typescript
// ❌ AVOID
field.handleChange(val as CreateServiceMutationRequest['specialty'])
```

```typescript
// ✅ CORRECT
import { SpecialtyEnum } from '@codm/client-typescript/typescript'
field.handleChange(val as SpecialtyEnum)
```

### bp-07: SDK bundling its own copy of global dependencies (Zod, React Query)
Libraries that the app needs to configure globally (Zod, React, React Query) must be `peerDependencies` in the SDK to ensure a single instance. If in `dependencies`, rslib bundles a separate copy, causing issues like Zod i18n not applying to SDK schemas and MutationCache.onError not capturing SDK mutation errors.

## References

- `docs/BACKEND.md` — SDK Generation section
- `docs/FRONTEND.md` — SDK Usage section
