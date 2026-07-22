---
name: schema
description: Create Zod DTO schemas for use cases and controllers. Use when defining input/output schemas, shared validation schemas, or context-specific reusable schemas. Use this skill for schema composition patterns, refinements, transforms, and shared schema extraction.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

# Create DTO Schema

Creates Zod schemas for controllers and use cases following the project's validation strategy.

> **Scope**: This skill covers Zod schema patterns, composition, and where schemas should live. For creating controllers that use schemas, see `/controller`. For use case input/output schemas, see `/usecase`.

## Why the Schema Split Exists

Schemas define the contract between layers. Controllers have expressive schemas (the system boundary -- validates format, regex, constraints), while use cases have simple primitive schemas (they trust controllers already validated). This split avoids duplicate validation and keeps each layer focused. Schemas also power SDK generation -- the frontend gets types, hooks, and validation from these schemas automatically.

## When to Use This Skill

- Defining input/output for a controller or use case (inline by default)
- A schema pattern repeats 3+ times in the same context (extract to `[context]/schemas/`)
- A schema is needed across multiple contexts (extract to `shared/schemas/`)

## When NOT to Use This Skill

- One-off validation — keep it inline in the controller or use case
- Frontend-only validation — use SDK-generated schemas instead
- Domain business rules — belong in entities or value objects, not schemas

## Where Schemas Live

| Location | When to Use |
|----------|-------------|
| **Inline in controller/use case** | Default. Keep InputSchema and OutputSchema in the same file |
| **`[context]/schemas/`** | When a schema is reused 3+ times within the same context |
| **`shared/schemas/`** | When a schema is reused across multiple contexts |

**Rule of thumb:** Don't extract schemas prematurely. Only create a separate schema file when the same schema appears in 3+ places. Keeping schemas inline in controllers and use cases improves readability.

## Schema Responsibility Split [SCH-01, SCH-C01, SCH-C02]

### Controllers: Expressive Validation

Controllers are the system boundary — they validate format, shape, and consistency of external input. **Prefer value object schemas** (primitive VO schemas referenced directly; composite/object VO schemas via `.input()`) over inline definitions or shared schema files. For email fields, always use `z.email()` instead of `EmailSchema`.

```typescript
// auth/controllers/SignUp.ts
import { z } from '@template/core-typescript'
import { DocumentSchema } from '@auth/schemas'
import { PhonePlainSchema } from '@shared/objects'

const InputSchema = z
  .object({
    body: z.object({
      name: z.string(),
      email: z.email(),
      password: z.string().min(8).max(32),
      confirmPassword: z.string().min(8).max(32),
      document: DocumentSchema,
      phone: PhonePlainSchema.input(),
    }),
  })
  .refine(data => data.body.password === data.body.confirmPassword, {
    error: 'PASSWORDS_DONT_MATCH',
    path: ['confirmPassword'],
  })
  .example([
    {
      body: {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Abc12345',
        confirmPassword: 'Abc12345',
        document: '123.456.789-09',
        phone: '11999998888',
      },
    },
  ])
```

### Use Cases: Value Object Schemas

Use cases are internal — they trust the caller already validated. **When a field maps to a value object, use the VO schema instead of raw `z.string()`/`z.object()`** — primitive (string-based) VO schemas referenced directly, composite (object) VO schemas via `.input()`. This ensures the schema stays in sync with the value object's validation rules and avoids duplication.

```typescript
// patient/usecases/CreatePatient.ts
import { z } from '@template/core-typescript'
import { RGSchema, CPFSchema, EmailSchema, PhonePlainSchema, AddressSchema, PersonNameSchema } from '@shared/objects'

export const CreatePatientInputSchema = z.object({
  fullName: PersonNameSchema,            // primitive VO schema — reference directly
  rg: RGSchema,
  cpf: CPFSchema,
  birthDate: z.stringToDate(),
  email: EmailSchema,
  phone: PhonePlainSchema.input(),       // composite (object) VO — .input() strips transforms
  address: AddressSchema.input().optional(),
  clinicId: z.string(),
})
```

For simple IDs and strings with no domain validation, plain `z.string()` is fine:

```typescript
// clinic/usecases/CreateClinic.ts
export const CreateClinicInputSchema = z.object({
  name: z.string().min(1).max(255),
  userId: z.uuid(),
})
```

Use case schemas are **exported** so controllers can import and compose them.

## Refinement Rules [SCH-C04, bp-01, bp-02]

**All `.refine()` logic MUST be inline.** Never import external functions — not from domain, not from utils, not even from the same file.

**All `.refine()` errors MUST use `{ error: 'ERROR_CODE' as ErrorType }`, never `{ message: '...' }`.** The error code must be a registered error from the context's error types (e.g., `DomainErrors`, `InterfaceErrors`). This ensures errors flow through `GlobalErrorMapper` and produce consistent HTTP responses.

See `bp-03` in registry.yaml for the wrong/right pattern.

```typescript
// CORRECT: Inline logic in .refine()
const CpfSchema = z
  .string()
  .min(11)
  .max(14)
  .refine(
    cpf => {
      const cleaned = cpf.replace(/\D/g, '')
      if (cleaned.length !== 11) return false
      if (/^(\d)\1+$/.test(cleaned)) return false

      const digits = cleaned.split('').map(Number)
      let sum = 0
      for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i)
      let remainder = (sum * 10) % 11
      if (remainder === 10) remainder = 0
      if (remainder !== digits[9]) return false

      sum = 0
      for (let i = 0; i < 10; i++) sum += digits[i] * (11 - i)
      remainder = (sum * 10) % 11
      if (remainder === 10) remainder = 0
      return remainder === digits[10]
    },
    { error: 'INVALID_CPF' },
  )
```

```typescript
// WRONG: Importing validation function
import { isValidCPF } from '../utils/validators'

const CpfSchema = z.string().refine(isValidCPF, { error: 'INVALID_CPF' })
```

```typescript
// WRONG: Referencing a function defined in the same file
function isValidCPF(cpf: string) { ... }

const CpfSchema = z.string().refine(isValidCPF, { error: 'INVALID_CPF' })
```

### Cross-field Refinement

For `.refine()` on objects that need to compare fields, keep it inline too:

```typescript
const InputSchema = z
  .object({
    body: z.object({
      newPassword: z.string().min(8).max(32),
      confirmNewPassword: z.string().min(8).max(32),
    }),
  })
  .refine(data => data.body.newPassword === data.body.confirmNewPassword, {
    error: 'PASSWORDS_DONT_MATCH',
    path: ['confirmNewPassword'],
  })
```

### Object-level Refinement with Path

```typescript
const AddressSchema = z
  .object({
    street: z.string().min(3).max(200),
    number: z.string().min(1).max(20),
    complement: z.string().max(100).optional(),
    neighborhood: z.string().min(2).max(100),
    city: z.string().min(2).max(100),
    state: z.enum(BrazilianState),
    zipCode: z.string().min(8).max(10),
    country: z.enum(Country)
  })
  .refine(
    data => {
      const cleaned = data.zipCode.replace(/\D/g, '')
      return cleaned.length === 8 && /^\d+$/.test(cleaned)
    },
    {
      error: 'INVALID_ZIP_CODE',
      path: ['zipCode'],
    },
  )
```

## Value Object Schemas (Preferred Source) [SCH-C01, SCH-P03, bp-04]

**Value objects are the single source of truth for domain validation.** When a field corresponds to a value object, always use the VO schema — referenced directly for primitive (string-based) VOs, via `.input()` for composite (object) VOs — instead of creating separate schema files or inline `z.string()`/`z.object()` definitions.

### Why `.input()` (composite VOs only)?

Composite (z.object) VO schemas often have field-level `.transform()`s that convert primitives into VO instances. `.input()` strips those transforms, returning a schema that accepts the raw input shape without transforming it. This is what controllers and use cases need — they pass primitives, not VO instances. **`.input()` exists only on z.object() schemas**: calling it on a primitive (z.string()-based) VO schema is a compile error (TS2551 — `.input()` does not exist on non-object schemas) and a fail-fast throw at runtime for dynamic callers — reference primitive VO schemas directly.

See `bp-06` in registry.yaml for the wrong/right pattern.

### How to find available schemas

Check value objects in `@shared/objects` and `@[context]/objects` — any exported schema can be used: primitive VO schemas (e.g., `EmailSchema`, `CRMSchema`) referenced directly, composite/object VO schemas (e.g., `AddressSchema`) via `.input()`.

### When to use plain `z.string()` vs the VO schema

- **Use the VO schema** when the field maps to an existing value object — directly for primitive VOs (email, CPF, CRM, etc.), via `.input()` for composite/object VOs (address, phone)
- **Use `z.string()`** for simple IDs, names with no domain VO, or fields without a corresponding value object

## Context-Specific Schemas (`[context]/schemas/`)

Only create here when a schema does NOT correspond to a value object and is reused 3+ times **within the same context**.

## Shared Schemas (`shared/schemas/`)

Only create here when a schema does NOT correspond to a value object and is reused across **multiple contexts**. Most validation schemas now live in value objects (`@shared/objects`, `@[context]/objects`), not in `shared/schemas/`. Prefer value object schemas (direct reference, or `.input()` for composite/object VOs) over creating new shared schemas.

## Named schema export to OpenAPI (`registerSchemas`)

Shapes that cross the wire can be exposed as **reusable named OpenAPI components** instead of being re-inlined per endpoint (which spawns Kubb per-endpoint duplicate types and tempts hand-rolled frontend shapes). The mechanism mirrors `registerEnums`:

- A barrel is registered once: `openapi.registerSchemas({ ...sharedObjects, ...sharedSchemas })` (in `src/shared/index.ts`).
- **The component name is the export key minus `Schema`** — `export const MoneySchema = …` registers as `Money`. No `.meta({ id })` at the definition site; registration is external (`z.globalRegistry.add(schema, { id })`), keeping the schema clean. (`z.toJSONSchema` reads `globalRegistry` by default; the emitter lifts `definitions` into `components.schemas`.)
- **Only wire-referenced schemas get named.** Registering a schema the wire never references is inert (no `$ref` → not emitted). To name a VO, a controller/DTO must actually *reference* its schema.

### Security boundary — what may be registered

Register **only shared value objects + contract DTO schemas** (`shared/objects`, `shared/schemas`). **NEVER entity (write-model) schemas.** The real test is **not** "does it have business logic" — it's:

1. Is the shape already on the wire?
2. Does the client legitimately need the rule (symmetric validation)?
3. Is the rule sensitive/internal?

VOs (`Money`/`Email`/`CPF`/`Phone`) — self-validation/format the client already receives and needs → ✅. Entities — cross-field domain invariants + internal fields, server-authoritative → ❌.

**Why it matters:** a registered schema's `.refine()` **source code** is emitted verbatim (`fn.toString()` → `x-tpl-zod-refinements`) into the *public* `openapi.json` **and** the *client* SDK, along with its full field set. Keep sensitive invariants in the entity/use-case, never in a wire schema. Mechanical guardrail: bounded-context `bp-05`.

### Non-wire markers

- `z.instance(...)` fields serialize as `{}` (→ `any`) — internal, not wire candidates.
- `z.historical(z.discriminatedUnion(...))` hides the union from discriminator lifting — also internal.

> Reference: `packages/api/typescript/core/src/utils/OpenAPI.ts`.

## Schema Composition Patterns [SCH-C03, SCH-P04, SCH-P05]

### Controller Importing from Use Case

```typescript
// clinic/controllers/CreateClinic.ts
import { CreateClinicInputSchema, CreateClinicOutputSchema } from '@clinic/usecases/CreateClinic'

const InputSchema = z
  .object({
    body: CreateClinicInputSchema.omit({ userId: true }),
    ctx: z.object({
      session: z.object({ actorId: z.string(), ownerId: z.string() }),
    }),
  })
  .example([...])

const OutputSchema = CreateClinicOutputSchema.example([...])
```

### Controller Composing from Value Object Schemas

```typescript
// patient/controllers/CreatePatient.ts
import { PersonNameSchema, RGSchema, CPFSchema, EmailSchema, PhonePlainSchema, AddressSchema } from '@shared/objects'

const BodySchema = z.object({
  fullName: PersonNameSchema,            // primitive VO schema — reference directly
  rg: RGSchema,
  cpf: CPFSchema,
  birthDate: z.stringToDate(),
  email: EmailSchema,
  phone: PhonePlainSchema.input(),       // composite (object) VO — .input() strips transforms
  address: AddressSchema.input().optional(),
})
```

### Optional Fields for Updates

```typescript
// Use case: all fields optional for partial update
export const UpdatePatientInputSchema = z.object({
  patientId: z.string(),
  clinicId: z.string(),
  fullName: PersonNameSchema.optional(),         // primitive VO schema — reference directly
  email: EmailSchema.optional(),
  phone: PhonePlainSchema.input().optional(),    // composite (object) VO — .input() strips transforms
  address: AddressSchema.input().optional(),
})
```

## Quick Reference

| Pattern | Where | Example |
|---------|-------|---------|
| `VOSchema` (primitive) | Both | Reference string-based VO schemas directly (no `.input()` — TS2551) |
| `VOSchema.input()` (composite) | Both | Reuse z.object() VO schema without field transforms |
| `z.string()` | Both | Simple strings with no domain VO |
| `z.enum(MyEnum)` | Both | Always use for enums |
| `z.stringToNumber()` | Controller query only | Query params arrive as strings |
| `z.stringToDate()` | Controller query params | Query param date fields (strings from URL) |
| `z.coerce.date()` | Use case schemas / body / response | Date fields in JSON body or use case input |
| `z.paginatedQuery({})` | Controller query | Includes page, limit, search |
| `z.paginatedResponse({})` | Controller output | Wraps items with total, totalPages |
| `.refine()` | Shared/Controller schemas | Inline validation logic only |
| `.example([...])` | Controller schemas | Required for OpenAPI docs |
| `.omit({ field: true })` | Controller importing use case | Remove fields injected from ctx |

## Checklist

- [ ] All `when: always` patterns present (SCH-01, SCH-02 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (SCH-C01 through SCH-C05 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-06 — verify against registry.yaml)

## Transform Patterns

### `z.instance(VO)` for VO Creation in Entity Schemas

Entity schemas use `z.instance(VO)` to handle VO creation from primitives. `z.instance()` reads the VO's static schema and constructor automatically. This ensures both `create()` and `toDomain()` pass primitives — the schema handles conversion.

```typescript
// CORRECT - z.instance() handles primitive -> VO via the VO's static schema
const ProductSchema = z.object({
  createdBy: z.instance(Id),
  email: z.instance(Email),
  phone: z.instance(Phone),
})

// In create() and toDomain(): pass strings, z.instance() creates VOs
return new Product({ createdBy: data.createdBy })  // string -> Id via z.instance()

// WRONG - manual .transform() (deprecated, see entity registry bp-07)
createdBy: z.string().transform(v => new Id(v)),
email: z.string().transform(v => new Email(v)),
```

### `.input()` for Stripping Transforms (composite VOs only)

When importing a **composite (z.object) VO schema** into a controller, use `.input()` to get the schema **without** field transforms (accepts the raw input shape). Primitive (z.string()-based) VO schemas have no `.input()` — calling it is a compile error (TS2551) and a fail-fast runtime throw for dynamic callers; reference them directly:

```typescript
import { CPFSchema, AddressSchema } from '@shared/objects'

const InputSchema = z.object({
  body: z.object({
    cpf: CPFSchema,                    // Primitive VO schema — reference directly (no .input())
    address: AddressSchema.input(),    // Composite (object) VO — accepts raw shape (no transform to Address VO)
  }),
})
```

### Type Inference with `Z.infer<>` [SCH-02, bp-05]

Always use `Z.infer<typeof Schema>` for type inference, never access internal `_output` property:

See `bp-04` in registry.yaml for the wrong/right pattern.

**Note:** `z` from `@template/core-typescript` is a custom runtime value — it doesn't expose `z.infer<T>`. Use `import Z from 'zod'` for type-level utilities.

## References

- `packages/api/typescript/src/shared/schemas/` - Existing shared schemas
- `packages/api/typescript/src/shared/utils/schema/ExtraTypes.ts` - Zod helpers
- `/controller` skill - Full controller creation flow
- `/usecase` skill - Full use case creation flow
- `docs/BACKEND.md` - Architecture principles
