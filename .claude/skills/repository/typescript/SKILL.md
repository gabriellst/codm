---
name: repository
description: Create a repository interface and implementation. Use when adding data persistence for entities. Use this skill whenever you need to define how domain entities are stored, retrieved, and queried from the database using Drizzle ORM.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

> Canonical shape: see `snippet.skeleton` (and `snippet.skeletons.drizzle`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

# Create Repository

Creates a repository abstract class (domain layer) and Drizzle implementation (infrastructure layer) for entity persistence.

## Why Repositories Exist

Repositories abstract data persistence so domain logic doesn't depend on the database. The abstract class defines the contract (domain layer), while the Drizzle implementation handles the actual SQL (infrastructure layer). This separation allows testing with mocks and switching implementations without changing domain code.

## When to Use This Skill

- Persisting domain entities (save, find, delete) with full entity hydration
- When entity reconstruction with business logic is needed (`toDomain` reconstructs value objects)
- Write operations that need transaction support (save/delete accept optional `tx`)
- Domain queries that return hydrated entities for use case orchestration

## When NOT to Use This Skill

- **Read-only UI queries** — use `/query` skill with direct Drizzle access (no repository abstraction needed for reads)
- **Cross-context business validation without new persistence needs** — reuse existing repository read methods from the target context; don't create duplicate repository abstractions
- **Simple key-value lookups without entity hydration** — use direct Drizzle queries in the `ui` context

## Prerequisites

- Context must exist (use `/context` first)
- Entity must exist (use `/entity` first)
- Database table must exist (use `/migrate` first)

## Key Principles

1. **toDomain Passes Raw Primitives**: Use `new Entity({...rawPrimitives})` — entity schema `.transform()` creates VOs
2. **incrementVersion on Save**: Always call `entity.incrementVersion()` in save method
3. **Transactions for Mutations Only**: Find methods don't have transaction param
4. **Return undefined, Not null**: Query methods return `undefined` when not found

## Process

### Step 1: Create Repository Abstract Class

Create `<context>/repositories/<Entity>Repository.ts`:

```typescript
// customer/repositories/CustomerRepository.ts
import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { Customer } from '../entities'

// Abstract class extending base Repository
// NOTE: save() and delete() come from the base Repository<T> — don't redefine them
export abstract class CustomerRepository extends Repository<Customer> {
  // Custom query methods — accept optional tx for read-after-write consistency
  abstract findById(id: string, tx?: Transaction): Promise<Customer | undefined>
  abstract findByCpfAndOrganizationId(cpf: string, organizationId: string, tx?: Transaction): Promise<Customer | undefined>
}
```

### Step 2: Create Drizzle Implementation

Create `<context>/repositories/Drizzle<Entity>Repository.ts`:

```typescript
// customer/repositories/DrizzleCustomerRepository.ts
import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codm/core-typescript'
import { CustomerRepository } from './CustomerRepository'
import { Customer } from '../entities'
import { customerTable } from '@codm/contracts/db'

@injectable()
export class DrizzleCustomerRepository extends CustomerRepository {
  // CRITICAL: db is injected via constructor (NOT imported as global)
  constructor(private db: DrizzleClient) {
    super()
  }

  // Find/query methods accept optional transaction for read-after-write consistency
  // Drizzle impl narrows tx to DrizzleClient — PORT uses Transaction (infra-agnostic)
  async findById(id: string, tx?: DrizzleClient): Promise<Customer | undefined> {
    const dbClient = tx ?? this.db
    // CRITICAL: tryCatchAsync wraps an async function
    const result = await tryCatchAsync(async () => {
      const rows = await dbClient
        .select()
        .from(customerTable)
        .where(eq(customerTable.id, id))
        .limit(1)
      return rows[0]
    })

    // CRITICAL: Check result.success and result.data
    if (!result.success || !result.data) {
      return  // Return undefined (NOT null)
    }

    return this.toDomain(result.data)
  }

  // Find/query methods accept optional transaction for read-after-write consistency
  async findByCpfAndOrganizationId(
    cpf: string,
    organizationId: string,
    tx?: DrizzleClient,
  ): Promise<Customer | undefined> {
    const cpfValue = cpf.replace(/\D/g, '') // Clean CPF

    const dbClient = tx ?? this.db
    const result = await tryCatchAsync(async () => {
      const rows = await dbClient
        .select()
        .from(customerTable)
        .where(and(eq(customerTable.cpf, cpfValue), eq(customerTable.organizationId, organizationId)))
        .limit(1)
      return rows[0]
    })

    if (!result.success || !result.data) {
      return
    }

    return this.toDomain(result.data)
  }

  // Save - insert or update
  // CRITICAL: Always call incrementVersion() before persisting
  async save(entity: Customer, tx?: DrizzleClient): Promise<Customer> {
    entity.incrementVersion()  // Version must be incremented on save

    const dbClient = tx ?? this.db
    const data = this.toPersistence(entity)

    await tryCatchAsync(async () => {
      await dbClient
        .insert(customerTable)
        .values(data)
        .onConflictDoUpdate({
          target: customerTable.id,
          set: {
            fullName: data.fullName,
            cpf: data.cpf,
            rg: data.rg,
            birthDate: data.birthDate,
            email: data.email,
            phoneCountryCode: data.phoneCountryCode,
            phoneAreaCode: data.phoneAreaCode,
            phoneNumber: data.phoneNumber,
            updatedAt: new Date(),
            version: (entity.version ?? 1) + 1,
          },
        })
    })

    return entity
  }

  // Delete
  async delete(id: string, tx?: DrizzleClient): Promise<void> {
    const dbClient = tx ?? this.db

    await tryCatchAsync(async () => {
      await dbClient.delete(customerTable).where(eq(customerTable.id, id))
    })
  }

  // CRITICAL: toDomain passes RAW PRIMITIVES — entity schema .transform() creates VOs
  private toDomain(data: typeof customerTable.$inferSelect): Customer {
    return new Customer({
      id: data.id,                     // string — BaseEntity handles string → Id
      organizationId: data.organizationId,  // string — schema .transform() → Id
      name: data.fullName,             // string — schema .transform() → PersonName
      cpf: data.cpf,                   // string — schema .transform() → CPF
      rg: data.rg,                     // string — schema .transform() → RG
      birthDate: data.birthDate,       // Date — schema .transform() → BirthDate
      email: data.email,               // string — schema .transform() → Email
      phone: {                         // object — schema .transform() → Phone
        countryCode: data.phoneCountryCode,
        areaCode: data.phoneAreaCode,
        number: data.phoneNumber,
      },
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      version: data.version,
    })
  }

  // Map entity to database format
  private toPersistence(entity: Customer): typeof customerTable.$inferInsert {
    return {
      id: entity.id.value,
      organizationId: entity.organizationId.value,
      fullName: entity.fullName,
      cpf: entity.cpf.value,
      rg: entity.rg.value,
      birthDate: entity.birthDate.value,
      email: entity.email.value,
      phoneCountryCode: entity.phone.countryCode,
      phoneAreaCode: entity.phone.areaCode,
      phoneNumber: entity.phone.number,
      version: entity.version ?? 1,
    }
  }
}
```

### Step 3: Register in the Registry System

Every repository must provide:

- a mock implementation for `mock`
- a true concrete implementation for `integration` and `real` (for example `DrizzleXRepository`)

For context-scoped repositories, register those bindings in `packages/api/typescript/src/<context>/registry.ts`:

```typescript
// packages/api/typescript/src/<context>/registry.ts
import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { CustomerRepository, MockCustomerRepository, DrizzleCustomerRepository } from '../repositories'

// One declaration per repo token — `integration` omitted mirrors `real`; `null` = declared absence.
export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
  { token: CustomerRepository, mock: MockCustomerRepository, real: DrizzleCustomerRepository },
])
```

Then ensure the context registry is composed in `packages/api/typescript/src/shared/registry.ts` — one entry in `CONTEXT_REGISTRIES` (compile-checked against the `CONTEXTS` manifest); the mechanical merge derives `ALL_REGISTRIES`, so never hand-spread env arrays:

```typescript
// packages/api/typescript/src/shared/registry.ts
import { INSTANCE_REGISTRY as customerRegistry } from '@customer/registry'

const CONTEXT_REGISTRIES = {
  shared: CORE_REGISTRY,
  // ...existing contexts...
  customer: customerRegistry,
} satisfies Record<ContextModule, InstanceRegistry>
// ALL_REGISTRIES is derived mechanically from CONTEXT_REGISTRIES — do not edit it.
```

If the repository itself lives under `packages/api/typescript/src/shared/repositories`, bind it directly in `packages/api/typescript/src/shared/registry.ts` (the `CORE_REGISTRY` declarations) instead of a context registry.

## Critical Rules

### Abstract Methods Return `undefined` (NOT `null`) [bp-08]

Query methods return `undefined` when not found, never `null`. See `bp-08` in registry.yaml for the wrong/right pattern.

### Abstract Class Does NOT Redefine save()/delete() [bp-01]

The abstract class only defines context-specific finder methods — `save()` and `delete()` come from the base `Repository<T>`. See `bp-01` in registry.yaml for the wrong/right pattern.

### Transaction Parameter on All Repository Methods [REPOI-06, REPO-P08]

Both find and mutation methods accept an optional transaction parameter. This is **required** because use cases pass `tx` to every repository call inside `withTransaction()` — including reads (for read-after-write consistency in saga patterns):

```typescript
// PORT (abstract class) — uses Transaction (infra-agnostic)
// import type { Transaction } from '@codm/core-typescript'
abstract findById(id: string, tx?: Transaction): Promise<Customer | undefined>

// DRIZZLE IMPL — narrows tx to DrizzleClient (the sanctioned override)
// CORRECT - Find methods accept optional DrizzleClient (overrides Transaction from port)
async findById(id: string, tx?: DrizzleClient): Promise<Customer | undefined> {
  const dbClient = tx ?? this.db
  const result = await tryCatchAsync(async () => {
    const rows = await dbClient
      .select()
      .from(customerTable)
      .where(eq(customerTable.id, id))
      .limit(1)
    return rows[0]
  })

  if (!result.success || !result.data) {
    return  // Return undefined (NOT null)
  }

  return this.toDomain(result.data)
}

// CORRECT - Mutation operations also have transaction parameter
async save(entity: Customer, tx?: DrizzleClient): Promise<Customer> {
  entity.incrementVersion()  // CRITICAL: Always increment version on save

  const dbClient = tx ?? this.db
  const data = this.toPersistence(entity)

  await tryCatchAsync(async () => {
    await dbClient.insert(customerTable).values(data)...
  })
  return entity
}

// CORRECT - Delete has transaction parameter
async delete(id: string, tx?: DrizzleClient): Promise<void> {
  const dbClient = tx ?? this.db
  await tryCatchAsync(async () => {
    await dbClient.delete(customerTable).where(eq(customerTable.id, id))
  })
}
```

**Why tx on reads too?** Use cases pass `tx` to EVERY repo call inside `withTransaction()` (see usecase skill UC-P14). When a parent use case saves entity A then a child use case reads entity A, the read MUST use the same `tx` — uncommitted writes are invisible outside the transaction.

### db is Injected via Constructor (NOT imported) [REPOI-02, bp-07]

The database client must be injected via constructor, never imported as a global. See `bp-07` in registry.yaml for the wrong/right pattern.

### tryCatchAsync Pattern with result.success [REPO-P02]

```typescript
// WRONG - Old pattern with destructuring
const [result] = await tryCatchAsync(
  client.select().from(customers).where(eq(customers.id, id.value))
)
if (!result || result.length === 0) {
  return null
}

// CORRECT - New pattern with async function and result object
const result = await tryCatchAsync(async () => {
  const rows = await this.db
    .select()
    .from(customerTable)
    .where(eq(customerTable.id, id.value))
    .limit(1)
  return rows[0]
})

if (!result.success || !result.data) {
  return  // Returns undefined
}

return this.toDomain(result.data)
```

### toDomain Passes Raw Primitives [REPOI-03, bp-02, bp-06]

```typescript
// WRONG - Uses create() for rehydration
private toDomain(data: typeof customerTable.$inferSelect): Customer {
  return Customer.create({  // WRONG! This is for NEW entities, triggers business logic
    fullName: data.fullName,
    cpf: data.cpf,
  })
}

// WRONG - Old property-assignment style (replaced by props constructor)
private toDomain(data: typeof customerTable.$inferSelect): Customer {
  const customer = new Customer()  // WRONG! No-arg constructor no longer exists
  customer.id = new Id(data.id)
  customer.fullName = data.fullName
  return customer
}

// WRONG - Manually creating VOs in toDomain (old pattern)
private toDomain(data: typeof customerTable.$inferSelect): Customer {
  return new Customer({
    id: new Id(data.id),           // WRONG! Don't create VOs here
    name: new PersonName(data.fullName),  // WRONG! Entity schema handles this
    cpf: new CPF(data.cpf),        // WRONG! Entity schema handles this
  })
}

// CORRECT - Pass RAW PRIMITIVES — entity schema .transform() creates VOs
private toDomain(data: typeof customerTable.$inferSelect): Customer {
  return new Customer({
    id: data.id,                   // string — BaseEntity handles string → Id
    organizationId: data.organizationId,  // string — schema .transform() → Id
    name: data.fullName,           // string — schema .transform() → PersonName
    cpf: data.cpf,                 // string — schema .transform() → CPF
    email: data.email,             // string — schema .transform() → Email
    phone: {                       // object — schema .transform() → Phone
      countryCode: data.phoneCountryCode,
      areaCode: data.phoneAreaCode,
      number: data.phoneNumber,
    },
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    version: data.version,
  })
  // BaseEntity constructor: schema.safeParse(props) validates + transforms domain fields,
  // Object.assign(this, result.data) sets transformed VOs,
  // BaseEntity explicitly handles id (string → Id), createdAt, updatedAt, version
}
```

### Have Both toDomain and toPersistence [REPOI-03, REPOI-04]

```typescript
// toDomain: DB row -> Domain entity
private toDomain(data: typeof customerTable.$inferSelect): Customer {
  // Reconstruct entity from database data
}

// toPersistence: Domain entity -> DB row
private toPersistence(entity: Customer): typeof customerTable.$inferInsert {
  // Extract primitives from entity and value objects
}
```

## Anti-Patterns

### Business logic in repositories [bp-05]

Repositories must not contain business logic like status changes or computed fields. Entity encapsulates the logic, repository only persists. See `bp-05` in registry.yaml for the wrong/right pattern.

### Queries that should go through the aggregate root [bp-09]

The database can have many-to-many relationships via junction tables, but in code these checks must go through the aggregate root. The repository loads the aggregate with its relationships, and the root entity decides. See `bp-09` in registry.yaml for the wrong/right pattern.

### Child-table repository with no entity behind it, and no justification on the parent [bp-12]

A bare `abstract class XRepository {` (no `extends Repository<T>`) over a table that has no entity in `<ctx>/entities/` is legitimate in exactly two cases: it's infra (idempotency ledger, outbox, queue — not a domain model), or it's a child table of an aggregate whose PARENT aggregate names, in its own docstring, the lifecycle/scale reason it stays out (`TerminalLineRepository` ← `Issue.ts`). Outside those two, the table is PART of the aggregate — the write goes through a method on it, and persistence through the aggregate's own repository, in the same transaction (`ThreadRepository.save` draining `Thread.pullPendingWrites()`). B4 killed two repositories that violated this (`TranscriptRepository`, `StopRepository`) plus one whose good justification lived in the wrong file (`StopPolicyConfigRepository`). See `bp-12` in registry.yaml for the three negative and three positive worked examples.

## Checklist

- [ ] All `when: always` patterns present (REPO-01 through REPO-04, REPOI-01 through REPOI-06 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (REPO-C01 through REPO-C03 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-10 — verify against registry.yaml)
- [ ] Repository exposes both `MockXRepository` and a true concrete implementation such as `DrizzleXRepository`
- [ ] Context repositories registered in `packages/api/typescript/src/<context>/registry.ts`
- [ ] Shared repositories registered in `packages/api/typescript/src/shared/registry.ts`

## Complete Example

```typescript
// customer/repositories/CustomerRepository.ts
import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { Customer } from '../entities'

export abstract class CustomerRepository extends Repository<Customer> {
  abstract findById(id: string, tx?: Transaction): Promise<Customer | undefined>
  abstract findByCpfAndOrganizationId(cpf: string, organizationId: string, tx?: Transaction): Promise<Customer | undefined>
}
```

## Variant: ProjectionRepository (read-side)

When the repository serves a **Projection** (read-model) instead of an aggregate, the shape changes:

| | Aggregate Repository | Projection Repository |
|---|---|---|
| File | `<ctx>/repositories/<Name>Repository.ts` | `<ctx>/projections/<Name>ProjectionRepository.ts` |
| Persists | An `AggregateRoot` rehydrated from the table | A free-record projection (plain class, no base class) |
| Shared base | Extends `Repository<T>` from `@codm/core-typescript` | **No shared base** — each repo declares its own surface |
| Canonical methods (mandatory) | `findById`, `save`, `delete` | **`findByKey`** (or named finder), **`save`**, **`insertIfNew`** — enough for the canonical `find → applyEvent → save` flow + replay-safe creation |
| Atomic ops | Generally no — aggregates persist as a whole entity | **Edge cases only.** Added when a canonical-flow trigger fails: hot row contention, bulk over N rows, monotonic constraint, conditional update, cache-mirror upsert. Each atomic method carries a comment naming the trigger that justifies it. |

The **canonical** flow for any projection mutation is `find → projection.applyEvent(event) → save`. Atomic ops (`incrementUnreadCount`, `markDeliveredMany`, `setIfGreaterLastMessageAt`, etc.) are NOT the default — they exist only when measurement or correctness demands them. Adding an atomic op without a justifying trigger fragments the API and tempts future readers to skip the canonical flow.

See `/projection` for the full Projection + ProjectionRepository pairing pattern (canonical methods + when to add atomic ops), and `/projector` for the consumer side.

## References

- `@codm/core-typescript` - Repository, DrizzleClient, Transaction, tryCatchAsync
- `@codm/contracts/db` - Drizzle table schemas
- `docs/BACKEND.md` - Architecture principles (why)
- `/entity` skill - For creating entities to persist
- `/migrate` skill - For creating database tables
- `/projection` skill - For projection-repository pairing (read side)
- `/projector` skill - For the event-driven consumer of projection repos
