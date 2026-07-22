---
name: value-object
description: Create an immutable value object. Use when modeling concepts without identity like Money, Email, Address. Use this skill for any domain concept defined by its attributes rather than identity — CPF, CRM, phone numbers, date ranges, or any value requiring validation and formatting.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Create Value Object

Creates an immutable value object following DDD patterns with schema-driven base classes.

## Prerequisites

- Context must exist (use `/context` first) for context-specific VOs
- Errors must be defined (use `/errors` first)
- Schema patterns for value objects are documented in the "Schema Patterns for Value Objects" section below

## Key Principles [VO-01, VO-02, VO-03, VO-04]

1. **Immutable**: Value objects don't change after creation
2. **Schema-driven**: Validation happens via `static override schema` — base class handles `safeParse` + `BaseError`
3. **Equality by Value**: Two VOs are equal if their values are equal
4. **No Identity**: VOs don't have IDs
5. **No manual constructor logic**: Base class does `Object.assign(this, { value: result.data })` (primitive) or `Object.assign(this, result.data)` (composite)

## Value Object Types

There are TWO schema-driven base classes for value objects:

| Type | Base Class | Use Case | Example |
|------|------------|----------|---------|
| **Primitive** | `BasePrimitiveValueObject<T>` | Wraps a single primitive value | Email, CPF, Id, Money |
| **Composite** | `BaseValueObject<T>` | Multiple properties / nested objects | Address, CRM, Phone |

### When to Use Each

**BasePrimitiveValueObject<T>** - When the value object:
- Wraps a single primitive (string, number, Date)
- Has a `value` property that holds the actual data
- Can be easily serialized to the primitive type
- Examples: `Email` (wraps string), `Money` (wraps number), `BirthDate` (wraps Date)

**BaseValueObject<T>** - When the value object:
- Has multiple related properties
- May contain nested value objects
- Represents a complex composite concept
- Examples: `CRM` (number + state), `Address` (street + city + state + zipCode)

**Note on `z.enum()` with `BasePrimitiveValueObject`**: `z.enum(EnumType)` is a valid schema for `BasePrimitiveValueObject`. This is used when a value object wraps an enum and adds domain behavior (e.g., permission checks). See `MemberRole` which uses `z.enum(MemberRoleType)` as its schema and adds `hasPermission()`, `isOwner()` methods.

## Value Object vs Entity

| Value Object | Entity |
|--------------|--------|
| No identity | Has identity (ID) |
| Immutable | Mutable state |
| Equality by value | Equality by ID |
| Example: Money, Email, Address | Example: Order, User, Product |

## When to Use Value Objects

- Representing measurements (Money, Weight, Distance)
- Representing descriptive aspects (Color, Status)
- Representing contact info (Email, Phone, Address)
- Grouping related attributes (DateRange, Coordinate)
- Ensuring validation at creation

## When NOT to Use Value Objects

- Simple strings with no domain logic or validation (e.g., a plain `name: string`)
- Values that need identity (use an entity instead)
- Frontend-only display values that don't participate in domain logic
- Values where the overhead of a VO class isn't justified (simple boolean flags, counters)

## Process

### Step 1: Determine Value Object Type

- **Primitive**: If it wraps a single value (string, number, date)
- **Composite**: If it has multiple related properties

### Step 2: Implement Value Object

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

### Step 3: Export from Index

```typescript
// <context>/objects/index.ts
export { Email, EmailSchema } from './Email'
export { Address, AddressSchema, type AddressProps } from './Address'
```

## How the Base Classes Work [VO-02, VO-03]

### BasePrimitiveValueObject<T>

```typescript
// From @shared/objects/BasePrimitiveValueObject.ts
export abstract class BasePrimitiveValueObject<T extends ZodType> extends PrimitiveValueObject<z.output<T>> {
  static schema?: ZodType
  declare readonly value: z.output<T>

  constructor(value: z.input<T>) {
    super()
    const schema = (this.constructor as typeof BasePrimitiveValueObject).schema
    const result = schema?.safeParse(value)

    if (result && !result.success) {
      throw new BaseError<BaseDomainErrors>(result.error.issues[0]!.message as BaseDomainErrors)
    }

    Object.assign(this, { value: result?.data ?? value })
  }
}
```

### BaseValueObject<T>

```typescript
// From @shared/objects/BaseValueObject.ts
export abstract class BaseValueObject<T extends ZodObject> extends ValueObject {
  static schema?: ZodType

  constructor(props: z.input<T>) {
    super()
    const schema = (this.constructor as typeof BaseValueObject).schema
    const result = schema?.safeParse(props)

    if (result && !result.success) {
      throw new BaseError<BaseDomainErrors>(result.error.issues[0]!.message as BaseDomainErrors)
    }

    Object.assign(this, result?.data ?? props)
  }
}
```

Key takeaway: **You never write constructor logic in your VOs.** The base class handles validation (`safeParse`), error throwing (`BaseError`), and property assignment (`Object.assign`).

## Critical Rules [VO-03, VO-C01, VO-C04, VO-C05, bp-01, bp-02, bp-03]

### Use `static override schema` — NOT Manual Constructor Logic

See `bp-03` in registry.yaml for the wrong/right pattern.

### Extend Correct Base Class

See `bp-05` in registry.yaml for the wrong/right pattern.

### Put `.transform()` in the Schema — NOT in the Constructor

See `bp-06` in registry.yaml for the wrong/right pattern.

### Declaration Merging for Composite VOs [VO-C01, VO-C05]

```typescript
// REQUIRED for composite VOs — interface BELOW class, never above
export class CRM extends BaseValueObject<typeof CRMSchema> {
  static override schema = CRMSchema
  // ...methods
}

// Declaration merging gives the class its properties from the schema output
export interface CRM extends Z.infer<typeof CRMSchema> {}

// Input type for constructing (useful when schema has transforms)
export type CRMProps = Z.input<typeof CRMSchema>
```

### Export Schema for Reuse [VO-C04]

VOs should export their schema so controllers and use cases can use `.input()` to get the input-side schema (strips transforms):

```typescript
// In the VO file
export const AddressSchema = z.object({ ... })

// In a controller or use case — use .input() to get schema without transforms
const InputSchema = z.object({
  body: z.object({
    address: AddressSchema.input(),  // Strips .transform(), keeps validation
  }),
})
```

### `static isValid()` Uses `safeParse().success` [VO-C03]

```typescript
// For boolean validation checks (no exception thrown)
static isValid(cpf: string): boolean {
  return CPFSchema.safeParse(cpf).success
}
```

### Use BaseDomainErrors for Shared VOs

```typescript
// For value objects in @shared/objects
import type { BaseDomainErrors } from '@template/core-typescript'
// Error codes in schema: { error: 'INVALID_EMAIL' as BaseDomainErrors }

// For value objects in context-specific folders
import { DomainErrors } from '../errors'
// Error codes in schema: { error: 'INVALID_CRM' as DomainErrors }
```

## Common Value Object Examples

### CPF (Primitive — with transform in schema)

```typescript
import { BasePrimitiveValueObject, BaseDomainErrors, z } from '@template/core-typescript'

export const CPFSchema = z
  .string()
  .transform(v => v.replace(/\D/g, ''))  // Transform: strip non-digits
  .refine(
    cpf => {
      if (cpf.length !== 11) return false
      if (/^(\d)\1+$/.test(cpf)) return false
      // CPF validation algorithm...
      return true
    },
    { error: 'INVALID_CPF' as BaseDomainErrors },
  )

export class CPF extends BasePrimitiveValueObject<typeof CPFSchema> {
  static override schema = CPFSchema

  static isValid(cpf: string): boolean {
    return CPFSchema.safeParse(cpf).success
  }

  format(): string {
    return this.value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }

  equals(other: CPF): boolean {
    return this.value === other.value
  }

  override toString(): string {
    return this.value
  }
}
```

### CRM (Composite — context-specific)

```typescript
import { BaseValueObject, BaseError, z } from '@template/core-typescript'
import { BrazilianState } from '@<context>/enums'
import { DomainErrors } from '../errors'
import Z from 'zod'

// Separate schema for the CRM number field — validates the digit pattern
export const CRMNumberSchema = z.string().refine(value => /^\d{4,7}$/.test(value), {
  error: 'INVALID_CRM' as DomainErrors,
})

// Composite schema using CRMNumberSchema directly (not .input())
export const CRMSchema = z.object({
  number: CRMNumberSchema,
  state: z.enum(BrazilianState),
})

export class CRM extends BaseValueObject<typeof CRMSchema> {
  static override schema = CRMSchema

  static fromString(crm: string): CRM {
    const cleaned = crm.replace(/[.\-/\s]/g, '').toUpperCase()
    const match = cleaned.match(/^([A-Z]{2})(\d{4,7})$/)

    if (!match) {
      throw new BaseError<DomainErrors>('INVALID_CRM')
    }

    const state = match[1] as BrazilianState
    const number = match[2]!

    return new CRM({ number, state })
  }

  static isValid(crm: string): boolean {
    const cleaned = crm.replace(/[.\-/\s]/g, '').toUpperCase()
    if (!cleaned) return false
    const match = cleaned.match(/^([A-Z]{2})(\d{4,7})$/)
    if (!match) return false
    const validStates = Object.values(BrazilianState)
    return validStates.includes(match[1] as BrazilianState)
  }

  get value(): string {
    return `${this.state}${this.number}`
  }

  format(): string {
    return `CRM/${this.state} ${this.number}`
  }

  equals(other: CRM): boolean {
    return this.value === other.value
  }

  override toString(): string {
    return this.format()
  }
}

export interface CRM extends Z.infer<typeof CRMSchema> {}

export type CRMProps = Z.input<typeof CRMSchema>
```

## Using in Entity Schemas (via `z.instance()`)

Entity schemas use `z.instance(VO)` to handle VO creation from raw primitives. `z.instance()` reads the VO's static schema and constructor automatically — it works for both primitive VOs and composite VOs:

```typescript
// In entity schema — z.instance() handles VO creation from raw input
const PatientSchema = z.object({
  clinicId: z.instance(Id),
  name: z.instance(PersonName),
  cpf: z.instance(CPF),
  email: z.instance(Email),
  phone: z.instance(Phone),
  address: z.instance(Address).optional(),
})

// WRONG — manual .transform() (deprecated, see entity registry bp-07, bp-08)
clinicId: z.string().transform(v => new Id(v)),
address: z.object({...}).transform(v => new Address(v)),
```

## Using in Repositories

```typescript
// toDomain: Pass RAW PRIMITIVES — entity schema transforms them to VOs
private toDomain(data: typeof patientTable.$inferSelect): Patient {
  return new Patient({
    id: data.id,             // string, not new Id()
    clinicId: data.clinicId, // string, not new Id()
    name: data.fullName,     // string, not new PersonName()
    cpf: data.cpf,           // string, not new CPF()
    email: data.email,       // string, not new Email()
    phone: {
      countryCode: data.phoneCountryCode,
      areaCode: data.phoneAreaCode,
      number: data.phoneNumber,
    },
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    version: data.version,
  })
  // Entity schema .transform() converts primitives → VOs automatically
}

// toPersistence: Extract primitives FROM VOs
private toPersistence(entity: Patient): typeof patientTable.$inferInsert {
  return {
    email: entity.email.value,  // Primitive VO
    cpf: entity.cpf.value,
    phoneCountryCode: entity.phone.countryCode,  // Composite VO properties
    phoneAreaCode: entity.phone.areaCode,
    phoneNumber: entity.phone.number,
  }
}
```

## Schema Patterns for Value Objects [VO-C04, VO-C11]

> **Wire-safe:** VO schemas (Money/Email/CPF/Phone) MAY be registered as named OpenAPI components — they're already on the wire and the client needs the same format rule. Entity schemas may NOT — see the `schema` skill's "Named schema export" section + bounded-context `bp-05`.

### The `.input()` Export

Every VO exports a named `XSchema`. Controllers and use cases call `.input()` on it to get the pre-transform schema — the schema that accepts raw primitives without converting them to VO instances. This is the primary mechanism for schema reuse across layers.

```typescript
// VO definition
export const EmailSchema = z.string().transform(v => v.toLowerCase().trim()).refine(...)

// Consumer (controller or use case) — strips .transform(), keeps validation
email: EmailSchema.input()  // accepts string, validates format, no VO transform
```

### Primitive vs Composite Schema Distinction

- **Primitive VO** (`BasePrimitiveValueObject`): Schema is `z.string()` / `z.number()` with transforms. `.input()` returns the raw primitive schema (`z.string()`).
- **Composite VO** (`BaseValueObject`): Schema is `z.object({...})` with transforms. `.input()` returns the raw object shape (`z.object({...})`).

```typescript
// Primitive — .input() returns z.string() with validations
CPFSchema.input()      // z.string() (pre-transform)

// Composite — .input() returns z.object({...}) with validations
AddressSchema.input()  // z.object({ street, number, ... }) (pre-transform)
```

### Type Inference

```typescript
import Z from 'zod'

// Output type (after transforms) — for entity Props
type AddressVO = Z.infer<typeof AddressSchema>  // Address instance (post-transform)

// Input type (before transforms) — for constructor params and XProps exports
type AddressInput = Z.input<typeof AddressSchema>  // { street: string, number: string, ... }

// WRONG — _output is deprecated in Zod v4
type AddressProps = (typeof AddressSchema)['_output']
```

## Checklist

- [ ] All `when: always` patterns present (VO-01 through VO-04 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (VO-C01 through VO-C14 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-09 — verify against registry.yaml)
- [ ] Exported from `objects/index.ts` (class + schema + types)

## References

- `packages/api/typescript/src/shared/objects/BasePrimitiveValueObject.ts` - Base class for primitive VOs
- `packages/api/typescript/src/shared/objects/BaseValueObject.ts` - Base class for composite VOs
- `packages/api/typescript/src/shared/objects/` - Shared value objects (Email, Phone, Id, Money, CPF, Address)
- `docs/BACKEND.md` - Architecture principles (why)
- `/entity` skill - For using VOs in entities
- `/repository` skill - For persisting/rehydrating VOs
