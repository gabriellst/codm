---
name: entity
description: Create a domain entity with business logic. Use when modeling core business objects like Product, Order, User. Use this skill whenever creating aggregate roots or entities with identity, validation schemas, behavior methods, and domain invariants.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Create Domain Entity

Creates a domain entity following DDD patterns with proper validation and behavior methods.

## Why Entities Exist

Entities encapsulate business rules and invariants. By placing validation inside entity methods (not in use cases or controllers), the rules are enforced regardless of how the entity is created or modified. Entities receive primitives and create Value Objects internally, keeping the API surface simple.

## When to Use This Skill

- Modeling core business objects with identity and lifecycle (created, updated, deleted)
- Objects with business rules and invariants that must always be enforced
- Objects that change state through behavior methods (e.g., `confirm()`, `cancel()`)
- Aggregate roots that own other entities and coordinate consistency

## When NOT to Use This Skill

- **Concepts without identity** — use `/value-object` skill (e.g., Email, Money, Address)
- **Simple data containers with no business logic** — use plain schemas or types
- **Read-only query results** — use `/query` skill with inline mapping, no entity needed
- **Enums or status constants** — use `/enum` skill

## Prerequisites

- Context must exist (use `/context` first)
- Errors must be defined (use `/errors` first)
- Schema patterns for entities are documented in the "Schema Patterns for Entities" section below

## Key Principles

1. **Primitives In, Validation Inside**: `.create()` receives primitives, creates Value Objects internally
2. **Business Rules Only**: Entities validate business rules, not format (format validation in Controllers)
3. **DomainErrors Only**: Entities throw `BaseError<DomainErrors>`, never ApplicationErrors
4. **Version in Repository**: `incrementVersion()` is called in repository's `save()`, not in entity methods

## Entity vs Value Object

| Entity | Value Object |
|--------|--------------|
| Has identity (ID) | No identity |
| Mutable state | Immutable |
| Lifecycle (created, updated) | Stateless |
| Example: Order, User, Product | Example: Money, Address, Email |

### Rich Entity vs Data Record

- Has state transitions → Rich Entity with behavior methods
- Has multi-field invariants → Rich Entity
- Pure data container with no rules → can be a Data Record
- When in doubt → Rich Entity (always safer)

Anti-pattern — Anemic entity:
```typescript
// WRONG - Anemic entity, logic in use case
class Tool extends AggregateRoot<typeof ToolSchema> {
  // No behavior methods
}
// In use case: tool.status = ToolStatus.ACTIVE  // Direct mutation!

// CORRECT - Rich entity, encapsulated logic
class Tool extends AggregateRoot<typeof ToolSchema> {
  activate(): void {
    if (this.status === ToolStatus.ACTIVE)
      throw new BaseError<DomainErrors>('TOOL_ALREADY_ACTIVE')
    this.status = ToolStatus.ACTIVE
  }
}
```

## Process

### Step 1: Generate Entity Scaffold

```bash
bun cli entity <context> <name> [--aggregate]
```

Use `--aggregate` if this entity is an Aggregate Root (owns other entities).

### Step 2: Define Entity Structure

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

### Step 3: Export from Index

```typescript
// <context>/entities/index.ts
export { Organization } from './Organization'
export { Product } from './Product'
```

## BaseEntity Structure

Entities inherit from `BaseEntity<T>` (or `AggregateRoot<T>` which extends it). **Aggregate roots** (top-level entities with their own transactional boundary) extend `AggregateRoot`. **Child entities** (entities owned by an aggregate root, with no independent lifecycle) extend `BaseEntity` directly. For example, `ChatSession` extends `BaseEntity` because it is owned by the `Chat` aggregate root.

```typescript
// From @template/core-typescript (BaseEntity/AggregateRoot)
export interface BaseEntityProps {
  id?: Id | string
  createdAt?: Date
  updatedAt?: Date
  version?: number
}

export abstract class BaseEntity<T extends ZodObject = ZodObject<ZodRawShape>> extends ValueObject {
  static schema?: ZodType

  id: Id = new Id()              // Auto-generated UUID
  createdAt: Date = new Date()   // Auto-set on creation
  updatedAt: Date = new Date()   // Updated via incrementVersion()
  version = 1                    // Optimistic locking

  constructor(props?: z.input<T> & BaseEntityProps) {
    super()
    if (!props) return

    const schema = (this.constructor as typeof BaseEntity).schema
    const result = schema?.safeParse(props)

    if (result && !result.success) {
      throw new BaseError<BaseDomainErrors>('INVALID_ENTITY', result.error.issues[0]?.message)
    }

    // Assign transformed domain props (schema applies .transform())
    Object.assign(this, result?.data ?? props)

    // Handle base entity props explicitly (id accepts string or Id)
    if (props.id != null) this.id = props.id instanceof Id ? props.id : new Id(props.id as string)
    if (props.createdAt != null) this.createdAt = props.createdAt
    if (props.updatedAt != null) this.updatedAt = props.updatedAt
    if (props.version != null) this.version = props.version
  }

  protected validate(): void {
    const schema = (this.constructor as typeof BaseEntity).schema
    if (!schema) return
    const result = schema.safeParse(this)
    if (!result.success) throw new BaseError(result.error.issues[0]!.message)
    Object.assign(this, result.data)
  }

  incrementVersion(): void {
    this.version++
    this.updatedAt = new Date()
  }
}
```

**`validate()` is `protected`** — it can be called from subclass behavior methods (e.g., `updateName()`) but not from outside the entity. It re-runs the static schema on the current entity state, re-applying transforms (like `.trim()`) and throwing `BaseError` on validation failure.

Key behaviors:
- **`z.instance(VO)`** in schema handles VO creation from primitives automatically (reads VO's static schema + constructor)
- **`Object.assign(this, result.data)`** assigns the transformed (VO) values to the entity
- **Base entity props** (`id`, `createdAt`, etc.) are handled explicitly after schema validation — `id` accepts both `string` and `Id`
- `new Entity(props)` both validates AND hydrates in a single call — used for both `.create()` and `toDomain()` in repositories

## Critical Rules

### Properties Declared via Interface Merging [ENT-06]

Because `Object.assign(this, props)` in the constructor populates properties, entity fields are NOT declared with `!` assertions on the class body — they are declared through the merging interface:

```typescript
// CORRECT - Props declared via interface merging; class body stays clean
export class Product extends AggregateRoot {
  static override schema = ProductSchema

  static create(...) { ... }
}

export interface Product extends ProductProps {}

// WRONG - Declaring fields with ! on the class body (redundant with merging)
export class Product extends AggregateRoot {
  name!: string
  price!: number
}
```

**Exception:** properties that are NOT in the Zod schema (e.g. extra derived fields) still use `!`.

### Constructor vs create() [ENT-05, bp-02]

```typescript
// create() - For NEW entities (business operation)
const organization = Organization.create({
  name: 'Acme Clinic',
  createdBy: userId,  // string — schema .transform() creates Id
})
// ID is auto-generated, timestamps set, schema validates + transforms, Object.assign populates

// Constructor directly - For REHYDRATION (from database), used ONLY in toDomain()
// Pass RAW PRIMITIVES — schema .transform() converts them to VOs
const organization = new Organization({
  id: dbData.id,            // string — BaseEntity handles string → Id conversion
  name: dbData.name,
  createdBy: dbData.createdBy,  // string — schema .transform() creates Id
  createdAt: dbData.createdAt,
  updatedAt: dbData.updatedAt,
  version: dbData.version,
})
// Schema validates + transforms domain fields (primitives → VOs);
// BaseEntity handles id (string → Id), createdAt, updatedAt, version explicitly
```

### Version Management in Repository

**IMPORTANT**: `incrementVersion()` must be called in the repository's `save()` method, NOT in entity behavior methods.

```typescript
// WRONG - Calling incrementVersion() in entity behavior method
updatePrice(newPrice: number): void {
  if (newPrice <= 0) {
    throw new BaseError<DomainErrors>('INVALID_PRODUCT_PRICE')
  }
  this.price = newPrice
  this.incrementVersion()  // DON'T do this here!
}

// CORRECT - Entity behavior only changes state
updatePrice(newPrice: number): void {
  if (newPrice <= 0) {
    throw new BaseError<DomainErrors>('INVALID_PRODUCT_PRICE')
  }
  this.price = newPrice
  // incrementVersion() is called in repository.save()
}

// CORRECT - Repository calls incrementVersion() on save
async save(entity: Product, transaction?: DrizzleClient): Promise<Product> {
  entity.incrementVersion()  // Version is incremented when persisting
  // ... persistence logic
}
```

### Schema Validation — Zod Schema + this.validate() [ENT-C04, ENT-C10, bp-04]

```typescript
// WRONG - Anemic if-checks that duplicate schema rules
static create(data: CreateProductInput): Product {
  if (!data.name || data.name.length === 0) {
    throw new BaseError<DomainErrors>('PRODUCT_NAME_REQUIRED')
  }
  if (data.name.length > 255) {
    throw new BaseError<DomainErrors>('INVALID_PRODUCT_NAME')
  }
  const product = new Product()
  product.name = data.name.trim()
  return product
}

// CORRECT - Schema validates + transforms, constructor populates
const ProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'PRODUCT_NAME_REQUIRED' as DomainErrors })
    .max(255, { error: 'INVALID_PRODUCT_NAME' as DomainErrors }),
})

static create(data: { name: string }): Product {
  return new Product({ name: data.name })  // Schema validates + trims; BaseEntity throws BaseError on failure
}

// CORRECT - Mutation methods assign + this.validate() (re-runs schema with trim, min, max)
updateName(name: string): void {
  this.name = name
  this.validate()
}

// WRONG - Manual safeParse + BaseError throw per field (deprecated pattern, see bp-10)
updateName(name: string): void {
  const result = ProductSchema.shape.name.safeParse(name.trim())
  if (!result.success) throw new BaseError<DomainErrors>(result.error.issues[0]!.message as DomainErrors)
  this.name = result.data
}
```

### Entities Use ONLY DomainErrors [ENT-08, bp-09]

Entity schemas must use `DomainErrors` only, never `ApplicationErrors`. All error codes must be defined in `DomainErrors` and registered in `GlobalErrorMapper`. See `bp-09` in registry.yaml for the wrong/right pattern.

### Always Use BaseError with Type for Non-Schema Errors

For business rule violations that aren't structural validation (e.g., state machine checks), use `BaseError`:

```typescript
import { BaseError } from '@template/core-typescript'
import { DomainErrors } from '../errors'

// WRONG
throw new Error('Cannot confirm order')
throw new BaseError('CANNOT_CONFIRM_ORDER')  // Missing type parameter

// CORRECT
throw new BaseError<DomainErrors>('ORDER_CANNOT_BE_CONFIRMED')
```

### Encapsulate State Changes [ENT-C08, ENT-P04]

```typescript
// WRONG - Direct property access from outside
order.status = OrderStatus.CONFIRMED

// CORRECT - Behavior method with validation
order.confirm()

// Implementation (note: enum values are lowercase like 'pending', 'confirmed')
confirm(): void {
  if (this.status !== OrderStatus.PENDING) {  // Compares with enum key
    throw new BaseError<DomainErrors>('ORDER_CANNOT_BE_CONFIRMED')
  }
  if (this.items.length === 0) {
    throw new BaseError<DomainErrors>('ORDER_HAS_NO_ITEMS')
  }
  this.status = OrderStatus.CONFIRMED  // Sets using enum key
  this.confirmedAt = new Date()
  // incrementVersion() is called in repository.save()
}
```

### Validation Location

```typescript
// WRONG - Format validation in entity
static create(data: CreateProductInput): Product {
  if (!/^[A-Z]{3}-\d{4}$/.test(data.sku)) {
    throw new BaseError<DomainErrors>('INVALID_SKU_FORMAT')
  }
}

// CORRECT - Format validation in Controller InputSchema
const InputSchema = z.object({
  body: z.object({
    sku: z.string().regex(/^[A-Z]{3}-\d{4}$/),
  }),
})

// CORRECT - Business rules in entity
static create(data: CreateProductInput): Product {
  const product = new Product()
  // Business rule: price must be positive
  if (data.price <= 0) {
    throw new BaseError<DomainErrors>('INVALID_PRODUCT_PRICE')
  }
  product.price = data.price
  return product
}
```

## Entity Patterns

### With Value Objects [ENT-C01, ENT-C02, ENT-P06]

Entity schemas use `z.instance(VO)` to handle VO creation from primitives. `z.instance()` reads the VO's static schema and constructor automatically — it works for both primitive VOs (Id, Email, CPF) and composite VOs (Address, CRM, WeeklySchedule). This means `create()` and `toDomain()` pass raw primitives — the schema handles VO creation:

```typescript
import { AggregateRoot, Id, z } from '@template/core-typescript'
import { Email, Phone, Address, CPF, RG, BirthDate, PersonName } from '@shared/objects'
import Z from 'zod'

const PatientSchema = z.object({
  clinicId: z.instance(Id),
  name: z.instance(PersonName),
  cpf: z.instance(CPF),
  rg: z.instance(RG),
  birthDate: z.instance(BirthDate),
  email: z.instance(Email),
  phone: z.instance(Phone),
  address: z.instance(Address).optional(),
})

export class Patient extends AggregateRoot<typeof PatientSchema> {
  static override schema = PatientSchema

  static create(data: {
    clinicId: string
    fullName: string
    cpf: string
    rg: string
    birthDate: Date | string
    email: string
    phone: { countryCode: string; areaCode: string; number: string }
    address?: { street: string; number: string; /* ... */ }
  }): Patient {
    return new Patient({
      clinicId: data.clinicId,       // string — z.instance(Id) creates Id
      name: data.fullName,           // string — z.instance(PersonName) creates PersonName
      cpf: data.cpf,                 // string — z.instance(CPF) creates CPF
      rg: data.rg,                   // string — z.instance(RG) creates RG
      birthDate: typeof data.birthDate === 'string' ? new Date(data.birthDate) : data.birthDate,
      email: data.email,             // string — z.instance(Email) creates Email
      phone: data.phone,             // object — z.instance(Phone) creates Phone
      address: data.address,         // object — z.instance(Address) creates Address
    })
  }

  updateName(fullName: string): void {
    this.name = new PersonName(fullName)  // Direct VO creation for mutations
  }

  updateEmail(newEmail: string): void {
    this.email = new Email(newEmail)
  }
}

export interface Patient extends Z.infer<typeof PatientSchema> {}
```

### With Status Enum [ENT-C03, ENT-P02]

```typescript
import { z } from '@template/core-typescript'
import Z from 'zod'
import { RoleType } from '@clinic/enums'

const CollaboratorSchema = z.object({
  organizationId: z.instance(Id),
  userId: z.instance(Id),
  role: z.enum(RoleType),
})

export type CollaboratorProps = Z.infer<typeof CollaboratorSchema>

export class Collaborator extends AggregateRoot<typeof CollaboratorSchema> {
  static override schema = CollaboratorSchema

  static create(data: { organizationId: string; userId: string; role: RoleType }): Collaborator {
    return new Collaborator({
      organizationId: data.organizationId,  // string — z.instance(Id) → Id
      userId: data.userId,                  // string — z.instance(Id) → Id
      role: data.role,
    })
  }

  updateRole(newRole: RoleType): void {
    this.role = newRole
    this.validate()
    // incrementVersion() is called in repository.save()
  }
}

export interface Collaborator extends CollaboratorProps {}
```

## Schema Patterns for Entities

### Entity-Level `.refine()` for Multi-Field Invariants [ENT-C06]

Use `.refine()` on the entity schema for cross-field validation:

```typescript
// WRONG — manual if-check for multi-field invariant
static create(data: { startDate: Date; endDate: Date }): Booking {
  if (data.startDate >= data.endDate) {
    throw new BaseError<DomainErrors>('INVALID_DATE_RANGE')
  }
  return new Booking(data)
}

// CORRECT — .refine() on entity schema
const BookingSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
}).refine(data => data.startDate < data.endDate, {
  error: 'INVALID_DATE_RANGE' as DomainErrors,
})
```

### VO Fields Use z.instance() [ENT-P06]

When an entity field maps to a value object, always use `z.instance(VO)`. It reads the VO's static schema and constructor automatically — works for both primitive VOs and composite VOs:

```typescript
// Primitive VOs
userId: z.instance(Id),
email: z.instance(Email),
name: z.instance(PersonName),

// Composite VOs
address: z.instance(Address),
crm: z.instance(CRM),
availability: z.instance(WeeklySchedule).optional(),

// Arrays of VOs
specialties: z.array(z.instance(DoctorSpecialty)).default([]),
dateOverrides: z.array(z.instance(DateOverride)),

// WRONG — manual transform (deprecated, see bp-07, bp-08, bp-12, bp-13)
email: z.string().transform(v => new Email(v)),
crm: CRMSchema.input().transform(v => new CRM(v)),
address: z.object({...}).transform(v => new Address(v)),
```

### No `.example()` on Entity Schemas

Entity schemas are internal domain objects, not OpenAPI-exposed. Only controller schemas need `.example()`.

> **Never register entity schemas to OpenAPI.** `registerSchemas` emits a schema's `.refine()` source + full field set into the public `openapi.json` + client SDK — entity write-model invariants and internal fields must stay server-side. Register only shared VOs/DTOs. Mechanical guardrail: bounded-context `bp-05`.

## Checklist

- [ ] All `when: always` patterns present (ENT-01 through ENT-08 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (ENT-C01 through ENT-C08 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-09 — verify against registry.yaml)
- [ ] Repository's `save()` method calls `incrementVersion()` before persisting
- [ ] Exported from `entities/index.ts`

## Complete Example

```typescript
// organization/entities/Organization.ts
import { AggregateRoot, BaseError, Id, z } from '@template/core-typescript'
import Z from 'zod'
import { DomainErrors } from '../errors'
import { OrganizationStatus } from '@organization/enums'

const OrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'ORGANIZATION_NAME_REQUIRED' as DomainErrors })
    .max(255, { error: 'INVALID_ORGANIZATION_NAME' as DomainErrors }),
  createdBy: z.instance(Id),
  status: z.enum(OrganizationStatus),
})

export type OrganizationProps = Z.infer<typeof OrganizationSchema>

export class Organization extends AggregateRoot<typeof OrganizationSchema> {
  static override schema = OrganizationSchema

  static create(data: { name: string; createdBy: string }): Organization {
    return new Organization({
      name: data.name,
      createdBy: data.createdBy,  // string — z.instance(Id) → Id
      status: OrganizationStatus.ACTIVE,
    })
  }

  updateName(newName: string): void {
    this.name = newName
    this.validate()  // Re-runs schema (trim, min, max) and throws BaseError on failure
    // incrementVersion() is called in repository.save()
  }

  deactivate(): void {
    if (this.status !== OrganizationStatus.ACTIVE) {
      throw new BaseError<DomainErrors>('ORGANIZATION_ALREADY_INACTIVE')
    }
    this.status = OrganizationStatus.INACTIVE
  }
}

export interface Organization extends OrganizationProps {}
```

## References

- `packages/api/typescript/src/shared/entities/` - Base entity classes
- `docs/BACKEND.md` - Architecture principles (why)
- `/value-object` skill - For creating Value Objects used by entities
- `/errors` skill - For defining DomainErrors
- `/repository` skill - For persisting entities
