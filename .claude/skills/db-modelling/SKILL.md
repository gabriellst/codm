---
name: db-modelling
description: Design database schemas, create Drizzle table definitions, map domain types to columns, and plan indexes. Use when creating new tables, adding columns, designing relationships, or modeling value object persistence strategies. Use this skill BEFORE running `/migrate`.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Database Modelling

Designs database schemas using Drizzle ORM with PostgreSQL. This skill focuses on **schema design decisions** — how to map domain entities to tables, choose column types, flatten value objects, and design indexes. Use `/migrate` after modelling to generate and apply the actual migration.

## Why This Skill Exists

Database schema does NOT directly mirror the domain model. The repository layer handles conversion between persistence and domain:

```
Database Row (flat columns, enums, JSONB)
    ↓ toDomain()  — Repository reconstructs Value Objects, Entities
Domain Entity (rich objects, value objects, behavior)
    ↓ toPersistence()  — Repository flattens to insert/update values
Insert/Update Values (flat columns for Drizzle)
```

Design the database for **query efficiency and data integrity**, not as a 1:1 copy of domain entities.

## When to Use This Skill

- Creating new database tables for a bounded context
- Adding/modifying columns on existing tables
- Designing relationships between tables (1:1, 1:N, N:M)
- Deciding how to persist value objects (flatten vs JSONB)
- Planning indexes for query performance
- Adding authentication-related fields (BetterAuth)

## When NOT to Use This Skill

- Generating/applying migrations — use `/migrate`
- Designing the domain model — use `/ddd-modeling` and `/entity` first
- Writing repository code — use `/repository`
- Query optimization in application code — use `/query`

## Prerequisites

- Domain model must be validated first (`/ddd-modeling`, `/entity`, `/value-object`)
- Enums must be defined (`/enum`)

## Key Principles

1. **Domain Model First**: Never design tables before entities are validated — the schema mirrors the domain, not the other way around
2. **Value Objects as Columns**: VOs are flattened into parent table columns, NOT separate tables (except arrays → JSONB)
3. **Index Foreign Keys**: Every FK column gets an index
4. **BaseEntity Fields**: Every table has `id`, `createdAt`, `updatedAt`, `version`
5. **pgSchema Namespaces**: Each bounded context gets its own PostgreSQL schema

## Technology Stack

- **ORM**: Drizzle ORM (`drizzle-orm`)
- **Database**: PostgreSQL
- **Config**: `packages/api/typescript/src/shared/db/drizzle/config.ts`
- **Schemas**: `packages/api/typescript/src/shared/db/drizzle/schema/`
- **Migrations**: `packages/api/typescript/src/shared/db/drizzle/migrations/`

## Process

### Step 1: Analyze Entity Requirements

From the validated domain model, identify:
- Entity attributes and types
- Required vs optional fields
- Default values
- Constraints (unique, not null)
- Value objects and their persistence strategy

### Step 2: Create or Update Schema File

Schema files live in `packages/api/typescript/src/shared/db/drizzle/schema/`. Each bounded context has its own schema file using a PostgreSQL schema namespace:

```typescript
import { pgSchema, text, timestamp, integer, boolean, index, unique } from 'drizzle-orm/pg-core'
import { jsonb } from '../types/jsonb'
import { relations, sql } from 'drizzle-orm'
import { enumValues } from '../utils'
import { MyStatus } from '@mycontext/enums/MyStatus'

// Each context gets its own PostgreSQL schema
const myContextSchema = pgSchema('my_context')

// Define enums FIRST (before tables that use them)
export const myStatusEnum = myContextSchema.enum('my_status_enum', enumValues(MyStatus))
```

### Step 3: Map Domain to Database Types

| Domain Type | Drizzle Type | Notes |
|-------------|-------------|-------|
| Id | `text('id').primaryKey()` | UUID string |
| String | `text('name')` | Text columns |
| Number | `integer('count')` | Integers |
| Boolean | `boolean('active')` | Booleans |
| Date | `timestamp('created_at')` | Timestamps |
| Enum | Custom pgEnum | Use TypeScript enum + `enumValues()` |
| Money | `integer('amount_cents')` | Store cents as integer, never floats |
| JSON/Array | `jsonb<Z.input<typeof VOSchema>[]>('data')` | Custom jsonb generic — import from `'../types/jsonb'` |

> **Custom `jsonb` import**: This codebase uses a custom `jsonb` wrapper for the BunSQL driver, NOT the stock Drizzle `jsonb` from `'drizzle-orm/pg-core'`. Always import as:
> ```typescript
> import { jsonb } from '../types/jsonb'
> ```
> This wrapper fixes double-encoding on writes and raw-text passthrough on reads that occur with the stock Drizzle `jsonb` + BunSQL driver. See `packages/api/typescript/src/shared/db/drizzle/types/jsonb.ts` for details. The custom `jsonb` uses a generic parameter for typing: `jsonb<TData>('column_name')` instead of `jsonb('column_name').$type<TData>()`.

### Step 4: BaseEntity Pattern (REQUIRED for all tables) [DB-03, bp-03]

Every table MUST include these fields:

```typescript
export const myTable = myContextSchema.table('my_table', {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
    version: integer('version').default(1).notNull(),
    // ...domain fields
})
```

### Step 5: Value Object Persistence [DB-C04, DB-C05, DB-C06, bp-01, bp-06]

**CRITICAL RULE**: Value objects that are NOT arrays/lists are stored as **multiple columns** in the parent table, NOT as separate tables.

| Strategy | When to Use | Example |
|----------|-------------|---------|
| **Flattened Columns** | Structured VOs (Address, Phone) | `addressStreet`, `addressCity`, etc. as separate columns with prefix |
| **Single Column** | Simple VOs (Email, CRM) | `crm: text('crm')` — repository converts to/from VO |
| **JSONB** | ONLY for arrays/lists of VOs | `specialties: jsonb('specialties').$type<Z.input<typeof VOSchema>[]>()` |
| **Enum-Backed** | VO wrapping a single enum | `role: memberRoleEnum('role')` — repository wraps in VO |

```typescript
import { jsonb } from '../types/jsonb'
import type { PhoneProps } from '@shared/objects'

// Flattened Address VO → multiple columns with prefix
export const patients = mySchema.table('patients', {
    id: text('id').primaryKey(),
    // ...base fields...
    // Address VO flattened
    addressStreet: text('address_street'),
    addressCity: text('address_city'),
    addressState: text('address_state'),
    addressZipCode: text('address_zip_code'),
    // Simple VO as single column
    email: text('email').notNull(),
    // Array of VOs as JSONB — use custom jsonb with generic type parameter
    phones: jsonb<PhoneProps[]>('phones').default([]),
})
```

### Step 6: Design Relationships [DB-C01, DB-C07, DB-C08, DB-C09, DB-C10]

```typescript
// One-to-Many: Foreign key with index
export const appointments = mySchema.table('appointments', {
    id: text('id').primaryKey(),
    // ...base fields...
    patientId: text('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
}, table => [
    index('appointment_patient_idx').on(table.patientId),
])

// Many-to-Many: Junction table
export const unitDoctors = mySchema.table('unit_doctors', {
    id: text('id').primaryKey(),
    unitId: text('unit_id').notNull().references(() => units.id, { onDelete: 'cascade' }),
    doctorId: text('doctor_id').notNull().references(() => doctors.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
    unique('unique_unit_doctor').on(table.unitId, table.doctorId),
    index('unit_doctor_unit_idx').on(table.unitId),
    index('unit_doctor_doctor_idx').on(table.doctorId),
])

// One-to-One: Unique foreign key
export const doctors = mySchema.table('doctors', {
    id: text('id').primaryKey(),
    // ...base fields...
    userId: text('user_id').notNull().unique('unique_doctor_user').references(() => user.id, { onDelete: 'cascade' }),
}, table => [
    index('doctor_user_idx').on(table.userId),
])

// Drizzle Relations (for query building)
export const appointmentsRelations = relations(appointments, ({ one }) => ({
    patient: one(patients, {
        fields: [appointments.patientId],
        references: [patients.id],
    }),
}))
```

### Step 7: Index Design [DB-C02, DB-C11]

From use cases, identify:
- Filter conditions (WHERE clauses)
- Sort requirements (ORDER BY)
- Unique constraints (for lookups)
- Foreign key access patterns

Index guidelines:
- ALWAYS index foreign keys
- Index columns used in WHERE clauses
- Composite indexes for multi-column queries (most selective first)
- Unique constraints create implicit indexes
- Don't over-index (impacts write performance)

### Step 8: Enum Strategy [DB-C03, DB-05]

**ALWAYS use TypeScript enums and create them as PostgreSQL enum types.**

```typescript
import { enumValues } from '../utils'
import { MyStatus } from '@mycontext/enums/MyStatus'

export const myStatusEnum = myContextSchema.enum('my_status_enum', enumValues(MyStatus))

// Use in table definition
export const myTable = myContextSchema.table('my_table', {
    status: myStatusEnum('status').default(MyStatus.ACTIVE).notNull(),
})
```

### Step 9: Authentication Changes (BetterAuth)

When a feature requires changes to authentication-related data:

**Step 1: Modify BetterAuth Config** (`packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts`)

```typescript
user: {
    additionalFields: {
        myNewField: {
            type: 'string',
            unique: false,
            required: false,
            input: true,
            defaultValue: 'default',
        },
    },
},
```

**Step 2: Update Drizzle Schema Manually**

BetterAuth does NOT auto-generate the Drizzle schema. You MUST manually update `packages/api/typescript/src/shared/db/drizzle/schema/authentication.ts`:

```typescript
export const user = authenticationSchema.table('user', {
    // ...existing fields...
    myNewField: text('my_new_field'),
})
```

**IMPORTANT**: Both configurations must stay in sync manually.

### Step 10: Export from Schema Index

After creating a new schema file, export it from `packages/api/typescript/src/shared/db/drizzle/schema/index.ts`:

```typescript
export * from './authentication'
export * from './myNewContext'  // Add new schema export
```

## Quality Gates

Before handing off to `/migrate`, verify:
- [ ] All `when: always` patterns present (DB-01 through DB-05 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (DB-C01 through DB-C12 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-06 — verify against registry.yaml)
- [ ] Schema exported from `schema/index.ts`
- [ ] Auth changes update both BetterAuth config and Drizzle schema

## Naming Conventions

```typescript
// Table: plural, snake_case
export const customers = mySchema.table('customers', { ... })

// Columns: snake_case in DB, camelCase in TypeScript
organizationId: text('organization_id')  // DB: organization_id
fullName: text('full_name')              // DB: full_name

// Indexes: <table>_<column>_idx
index('customers_org_id_idx').on(table.organizationId)

// Unique constraints: unique_<table>_<column(s)>
unique('unique_unit_doctor').on(table.unitId, table.doctorId)
```

## Common Patterns

### Add Unique Constraint

```typescript
export const customers = mySchema.table('customers', {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    cpf: text('cpf').notNull(),
}, (table) => [
    uniqueIndex('customers_cpf_org_unique').on(table.cpf, table.organizationId),
])
```

### Safe Column Additions

```typescript
// Adding nullable column — safe, no data loss
newField: text('new_field'),

// Adding required column with default — safe for existing rows
status: text('status').default('ACTIVE').notNull(),
```

### Other Patterns

- **Composite unique constraints** — Use `unique('name').on(col1, col2)` in the table's third argument
- **Optional value object columns** — When the entire VO is optional, make all its columns nullable (no `.notNull()`)
- **JSONB with default empty array** — Use `.default(sql\`'[]'::jsonb\`).notNull()`
- **Upsert pattern** — Use `.onConflictDoUpdate({ target, set })` with `sql\`excluded.col\`` references

## References

- `.claude/skills/migrate/SKILL.md` - For generating and applying migrations after modelling
- `.claude/skills/entity/SKILL.md` - Entity patterns that drive schema design
- `.claude/skills/repository/SKILL.md` - Repository `toDomain`/`toPersistence` patterns
- `docs/BACKEND.md` - Architecture principles
- `packages/api/typescript/src/shared/db/drizzle/schema/` - Existing schema examples
- `packages/api/typescript/src/shared/db/drizzle/utils.ts` - `enumValues` utility
