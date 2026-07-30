---
name: query
description: Create UI query use cases (BFF pattern). Use when the frontend needs data for a route or section — personalized read queries using direct Drizzle access instead of orchestrating domain DTOs. Use this skill for any read-only data fetching that serves a specific UI view.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

# Create UI Query Use Case

Creates query use cases inside the `ui` context that serve as a BFF (Backend for Frontend). These use cases query data directly via Drizzle, shaping outputs specifically for what the frontend needs — no domain DTO orchestration in memory.

## Why the UI Context Exists

Each query is an independent use case file with direct ORM (Drizzle) access, following the same patterns as any other context but focused exclusively on **visualization concerns**.

**The UI context is a regular context** — it can have entities, repositories, enums, errors, middlewares. The difference is that its use cases are read-optimized and can call Drizzle directly.

## When to Use This Skill

- Frontend needs data for a **specific route** (e.g., dashboard, patient details page)
- Frontend needs data for a **specific section** (e.g., sidebar user info, stats grid)
- The output shape doesn't match any existing domain DTO
- You need to join data from multiple tables across contexts
- You need aggregated or computed data (counts, sums, status breakdowns)

## When NOT to Use This Skill

- **Write operations** (create, update, delete) — use domain context use cases
- **Data that maps 1:1 to a domain entity** — use domain context list/get use cases
- **Cross-context orchestration with writes** — use domain use cases with transactions

## Key Principles [QRY-01, QRY-02, QRY-P01]

1. **Direct Drizzle Access**: Inject `DrizzleClient`, query tables directly — no repository abstraction for reads
2. **Frontend-Shaped Output**: Output schemas match exactly what the UI component needs
3. **Cross-Schema Joins**: Freely join tables from any DB schema (`clinic`, `patient`, `authentication`, etc.)
4. **No Domain Coupling**: Don't import domain entities or value objects — work with raw DB rows and map inline
5. **Parallel Queries**: Use `Promise.all()` when queries are independent
6. **Repository Exception**: Only use repositories when you need entity hydration with business logic (e.g., Onboarding with state transitions)

## Process

### Step 1: Create the Use Case File

Create `packages/api/typescript/src/ui/usecases/<Name>.ts`. Follow `snake_case` for the use case name.

### Step 2: Define Output Schema (Frontend-Shaped) [QRY-03, QRY-04, QRY-P10]

Shape the output to match exactly what the frontend component needs:

```typescript
import { z } from '@codm/core-typescript'
import { MemberRoleType, UnitStatus } from '@clinic/enums'

const UnitSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.object({
    street: z.string(),
    number: z.string(),
    complement: z.string().nullable(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string().nullable(),
  }),
  status: z.enum(UnitStatus),
})

export const GetUserInfoOutputSchema = z.object({
  name: z.string(),
  picture: z.string().nullable(),
  currentClinic: z
    .object({
      id: z.string(),
      name: z.string(),
      role: z.enum(MemberRoleType),
    })
    .nullable(),
  units: z.array(UnitSchema),
})
```

Keep sub-schemas (like `UnitSchema`) **inline in the same file** unless reused 3+ times across other UI use cases.

### Step 3: Implement with Direct Drizzle Queries (Complete Example)

```typescript
import { Handler, z, DrizzleClient } from '@codm/core-typescript'
import { injectable } from 'tsyringe-neo'
import { clinics } from '@codm/contracts/db'
import { memberships, units } from '@codm/contracts/db'
import { eq, and } from 'drizzle-orm'

@injectable()
export class GetUserInfo extends Handler<
  typeof GetUserInfoInputSchema,
  typeof GetUserInfoOutputSchema
> {
  readonly name = 'get_user_info' as const
  readonly inputSchema = GetUserInfoInputSchema
  readonly outputSchema = GetUserInfoOutputSchema

  constructor(private db: DrizzleClient) {
    super()
  }

  protected async handle(input: this['input']): Promise<this['output']> {
    const { userId, currentClinicId } = input

    // Query 1: membership + clinic via JOIN
    const [membership] = await this.db
      .select({
        clinicId: clinics.id,
        clinicName: clinics.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(clinics, eq(memberships.clinicId, clinics.id))
      .where(and(
        eq(memberships.userId, userId),
        eq(memberships.clinicId, currentClinicId),
      ))

    // Query 2: units for the clinic
    const clinicUnits = await this.db
      .select({
        id: units.id,
        name: units.name,
        status: units.status,
        addressStreet: units.addressStreet,
        addressNumber: units.addressNumber,
        addressComplement: units.addressComplement,
        addressNeighborhood: units.addressNeighborhood,
        addressCity: units.addressCity,
        addressState: units.addressState,
        addressZipCode: units.addressZipCode,
        addressCountry: units.addressCountry,
      })
      .from(units)
      .where(eq(units.clinicId, currentClinicId))

    // Map flat DB rows into nested frontend shape
    return {
      name: '',
      picture: null,
      currentClinic: membership
        ? {
            id: membership.clinicId,
            name: membership.clinicName,
            role: membership.role,
          }
        : null,
      units: clinicUnits.map(u => ({
        id: u.id,
        name: u.name,
        status: u.status,
        address: {
          street: u.addressStreet,
          number: u.addressNumber,
          complement: u.addressComplement,
          neighborhood: u.addressNeighborhood,
          city: u.addressCity,
          state: u.addressState,
          zipCode: u.addressZipCode,
          country: u.addressCountry,
        },
      })),
    }
  }
}
```

### Step 4: Export in Barrel

Add to `packages/api/typescript/src/ui/usecases/index.ts`:

```typescript
export * from './GetUserDetails'
```

## Patterns [QRY-P02, QRY-P04, QRY-P05, QRY-P13]

### Parallel Independent Queries

When queries don't depend on each other, run them in parallel:

```typescript
const [appointmentRows, patientRows] = await Promise.all([
  this.db
    .select({
      id: appointments.id,
      startDate: appointments.startDate,
      status: appointments.status,
    })
    .from(appointments)
    .where(and(
      eq(appointments.unitId, unitId),
      eq(appointments.doctorId, doctorId),
    ))
    .orderBy(desc(appointments.startDate))
    .limit(50),
  this.db
    .select({
      id: patients.id,
      name: patients.name,
      createdAt: patients.createdAt,
    })
    .from(patients)
    .where(eq(patients.ownerId, ownerId))
    .orderBy(desc(patients.createdAt))
    .limit(50),
])
```

### Mapping Flat Columns to Nested Objects

DB columns are flat (e.g., `addressStreet`, `addressNumber`). Map them to nested objects for the frontend:

```typescript
const address =
  patientRow.addressStreet && patientRow.addressNumber
    ? {
        street: patientRow.addressStreet,
        number: patientRow.addressNumber,
        complement: patientRow.addressComplement ?? undefined,
        neighborhood: patientRow.addressNeighborhood,
        city: patientRow.addressCity,
        state: patientRow.addressState,
        zipCode: patientRow.addressZipCode,
        country: patientRow.addressCountry ?? undefined,
      }
    : undefined
```

### Formatting Data for Display

Format dates, phones, etc. inline in the mapping:

```typescript
import { format } from 'date-fns'

const items = rows.map(row => ({
  phone: `+${row.phoneCountryCode} (${row.phoneAreaCode}) ${row.phoneNumber}`,
  birthDate: row.birthDate.toISOString(),
  scheduledDate: format(row.scheduledDate, 'yyyy-MM-dd'),
  updatedAt: row.updatedAt.toISOString(),
}))
```

### Orchestrating Domain Use Cases (Writes)

When a UI use case needs to **write** (rare — e.g., CompleteOnboarding), it orchestrates domain use cases within a transaction using the `withTransaction` method from the Handler base class:

```typescript
import { CreateDoctor } from '@doctor/usecases'
import { CreateClinic, CreateUnit } from '@clinic/usecases'

constructor(
  private createDoctor: CreateDoctor,
  private createClinic: CreateClinic,
  private createUnit: CreateUnit,
) { super() }

protected async handle(input: this['input']): Promise<this['output']> {
  return await this.withTransaction(undefined, async tx => {
    const doctorResult = await this.createDoctor.execute({ ... }, tx)
    const clinicResult = await this.createClinic.execute({ ... }, tx)
    const unitResult = await this.createUnit.execute({ ... }, tx)

    return { success: true, doctorId: doctorResult.doctorId }
  })
}
```

## Common Imports

```typescript
// Drizzle client
import { DrizzleClient } from '@codm/core-typescript'

// Tables (import from the contracts package)
import { clinics } from '@codm/contracts/db'
import { memberships, units } from '@codm/contracts/db'
import { patients } from '@codm/contracts/db'
import { appointments } from '@codm/contracts/db'
import { onboarding } from '@codm/contracts/db'

// Drizzle operators
import { eq, and, or, ilike, desc, asc, sql, count } from 'drizzle-orm'

// Date formatting
import { format } from 'date-fns'
```

## Checklist

- [ ] All `when: always` patterns present (QRY-01 through QRY-04, QRY-P01, QRY-P10 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (QRY-C01, QRY-C02, QRY-P02 through QRY-P14 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-06 — verify against registry.yaml)
- [ ] Controller created in `packages/api/typescript/src/ui/controllers/` (use `/controller` skill)

## Composition Patterns

### Paginated read (list with filters)

**Behavior example.** Owner sees a list of clinic patients filtered by name and status.

**Recipe.**
- Frontend
  - `route` `/patients` with searchParams (`q`, `status`, `page`)
  - `component` `PatientList` — `useQuery(listPatientsQueryOptions(filters))`
- Backend (BFF — `ui` context)
  - `controller` `GET /patients` — input schema for filters
  - `query` `ListPatientsQuery` — direct Drizzle, returns flat DTO
  - `schema` `ListPatientsInput`, `PatientListItemOutput`

**No entity / usecase / repository in the read path.** Query is the BFF shortcut.

**Variations.**
- Complex joins (patient + last appointment + balance): the query does it in ONE Drizzle call. **Never** compose multiple calls from the frontend (BP-01).
- Pagination: cursor-based for large lists; offset-based for short lists.
- **Cross-context query.** A query in `/ui` can join tables across ≥2 contexts (e.g. `ListInvoiceableAppointmentsQuery` joining `billing.invoices` ⨯ `appointment.appointments`). That's fine in the BFF — `/ui` is the meta-context for UI-facing reads. It doesn't violate the bounded-context rule because NO entity is shared; only tables are read via Drizzle. The opposite stays forbidden: a `usecase` in context A loading entities from context B → use an integration event instead.

### Aggregated dashboard (multiple sources, one round-trip)

**Behavior example.** Owner opens the dashboard: sees total patients, today's appointments, monthly revenue, top 5 doctors.

**Recipe.** Never multiple frontend calls (BP-01).
- Frontend
  - `route` `/dashboard`
  - `component` `OwnerDashboard` — one query, receives everything
- Backend (BFF)
  - `query` `OwnerDashboardQuery` — joins everything in ONE Drizzle call (or `Promise.all` if a single SQL is genuinely impossible)
  - `controller` `GET /dashboard/owner`
  - `schema` `OwnerDashboardOutput` — single flat DTO

**Variations.**
- **Expose the breakdown the UI drills into, not just the rolled-up total.** If a card reveals
  per-row detail on hover/expand (chargeback → by-status; fees → gateway/checkout), the DTO must
  carry the nested `details` breakdown — a consumer can't reconstruct a breakdown from a total. Keep
  flat headline numbers (`stat`) AND the breakdown (`details`) in the same payload.
- **Multi-tenancy money shape.** When one read serves single-store and consolidated views, money
  leaves are `number` (mono) or a per-currency record `{ [CurrencyCode]: number }` (consolidated).
  Model the four modes as ONE `z.discriminatedUnion('kind', …)` so a single frontend renders both
  (composition-first discriminated BFF output); the `MoneyValue` consumer side is in `/component` (react).

## References

- `packages/api/typescript/src/ui/usecases/user/GetUserInfo.ts` - Direct Drizzle query with JOINs and nested mapping
- `packages/api/typescript/src/ui/usecases/onboarding/CompleteOnboarding.ts` - Orchestrating domain use cases in transaction
- `packages/api/typescript/src/ui/usecases/patients/ListPatients.ts` - Paginated listing with filters
- `packages/api/typescript/src/ui/usecases/appointments/ListAppointments.ts` - Paginated appointments with status counts
- `/controller` skill - For creating the HTTP endpoint
- `/schema` skill - For schema patterns
