---
name: usecase
description: Create an application use case. Use when implementing business operations like CreateOrder, ProcessPayment, CancelBooking. Use this skill for any command/mutation that orchestrates domain logic, whether simple CRUD or complex multi-step transactions with sagas.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Create Application Use Case

Creates an application use case that orchestrates domain logic, repositories, and events.

## Why Use Cases Exist

Use cases represent application-level operations — they orchestrate entities, repositories, and events to fulfill a business action. They sit between controllers (HTTP boundary) and domain entities (business rules), keeping both layers clean. Use cases have simple primitive schemas because controllers already validated the input.

## When to Use This Skill

- Any business operation that changes state (create, update, delete, process)
- Operations that need transactions (multiple saves that must succeed or fail together)
- Orchestrating multiple entities and repositories within a single action
- Operations that publish domain or integration events after persistence

## When NOT to Use This Skill

- **Read queries for the UI** — use `/query` skill to create query use cases with direct ORM (Drizzle) access in the `ui` context. Use cases created with THIS skill are for **command/write operations only**
- **Format validation** (regex, length, email format) — belongs in controllers
- **Business rules on a single entity** (invariants, state transitions) — belongs in entity methods
- **Reacting to events** — use `/handler` skill, not a use case

## Prerequisites

- Context must exist (use `/context` first)
- Entity must exist (use `/entity` first)
- Repository must exist (use `/repository` first)
- Errors defined (use `/errors` first)
- Schema patterns for use cases are documented in the "Schema Patterns for Use Cases" section below

## Key Principles

1. **Value Object `.input()` Schemas**: When a field maps to a value object, use `VOSchema.input()` instead of raw `z.string()`/`z.object()`. Use plain `z.string()` only for simple IDs or fields without a corresponding VO
2. **Return DTOs, Not Entities**: Never expose domain objects outside the use case
3. **Events Persisted in Transaction**: Save domain events via `this.domainEventRepository.save(event, tx)` inside `this.withTransaction()` — the OutboxDispatcher handles dispatch asynchronously
4. **Repository Reads for Cross-Context Validation**: In `api`, use repository read methods for entity existence/data validation across contexts
5. **Snake_case Names**: Use case names use snake_case (`create_product`)

## Process

### Step 1: Generate Use Case Scaffold

```bash
bun cli usecase <context> <name> [--internal]
```

Use `--internal` for use cases not exposed via HTTP (called only by handlers).

### Step 2: Define Input/Output Schemas

Schemas are **exported** so controllers can import them:

```typescript
// <context>/usecases/CreateProduct.ts
import { Handler, z } from '@codedm/core-typescript'

// Input schema - EXPORTED for controller use
export const CreateProductInputSchema = z.object({
  name: z.string(),
  price: z.number(),
  stock: z.number().optional(),
  organizationId: z.string(), // Required for multi-tenant
})

// Output schema - EXPORTED for controller use
export const CreateProductOutputSchema = z.object({
  productId: z.string(),
})
```

### Schema Patterns for Use Cases [UC-P10, bp-09]

**Simplicity principle**: No format validation (`.regex()`, `.email()`, `.min()/.max()`) — the controller already validated. Use `VOSchema.input()` for VO fields, `z.string()` for simple IDs. Schemas are exported for controller reuse.

**Use case schemas are flat** — no `body`/`params`/`query`/`ctx`/`cookie` wrappers. Those are controller concerns:

```typescript
// WRONG — use case with controller wrappers
export const CreatePatientInputSchema = z.object({
  body: z.object({     // ← controller wrapper, NOT for use cases
    name: z.string(),
    email: z.string(),
  }),
})

// CORRECT — flat use case schema
export const CreatePatientInputSchema = z.object({
  name: PersonNameSchema.input(),
  email: EmailSchema.input(),
  clinicId: z.string(),
})
```

**`.omit()` composition pattern** — Controllers import use case schemas, `.omit()` fields injected from ctx/cookies, then merge in `.execute()`:

```typescript
// Use case exports flat schema
export const CreateProductInputSchema = z.object({
  name: z.string(),
  price: z.number(),
  organizationId: z.string(),  // Injected from ctx in controller
})

// Controller omits ctx-injected fields, wraps in body
const InputSchema = z.object({
  body: CreateProductInputSchema.omit({ organizationId: true }),
  ctx: z.object({ session: z.object({ actorId: z.string(), ownerId: z.string() }) }),
}).example([...])

// Controller .execute() merges back — use case's withTransaction ensures atomicity
await this.createProduct.execute({
  ...request.body,
  organizationId: request.ctx.session.ownerId,
})
```

**`.refine()` uses `{ error }` not `{ message }`** — when needed in use case schemas:

```typescript
// WRONG
.refine(d => d.start < d.end, { message: 'INVALID_RANGE' })

// CORRECT
.refine(d => d.start < d.end, { error: 'INVALID_RANGE' as ApplicationErrors })
```

**Type inference** — use `Z.infer<typeof Schema>`, never `(typeof Schema)['_output']`.

### Step 3: Implement Use Case

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

### Step 4: Export from Index

```typescript
// <context>/usecases/index.ts
export { CreateProduct } from './CreateProduct'
export { UpdateProduct } from './UpdateProduct'
export { DeleteProduct } from './DeleteProduct'
```

## Event Flow — Transactional Outbox Pattern [UC-C05]

Use cases **never publish events directly**. Instead, they save domain events to the database via `this.domainEventRepository.save(event, tx)` inside the same transaction as the entity save. The `DomainEventRepository` dual-writes to:

1. **`events` table** — permanent audit log
2. **`outbox` table** — transient dispatch queue

The `OutboxDispatcher` service polls the outbox and dispatches events to handlers asynchronously via `InternalMediator.dispatch()`. Handlers that need to publish integration events (cross-context, fire-and-forget) inject `ExternalMediator` and call `externalMediator.publish()`.

```typescript
// Use case — save domain event in transaction (NO publish call)
await this.domainEventRepository.save(event, tx)

// Handler (reacts to domain event, publishes integration event)
// See /handler skill for the integration event publisher pattern
```

### Why No Direct Publishing?

- **Atomicity**: If the transaction rolls back, the event is also rolled back — no ghost events
- **Reliability**: Events are persisted and delivered even if the process crashes after commit
- **Decoupling**: Use cases don't need to know about mediators or handlers

## Transactions and the UnitOfWork Pattern [UC-C04, UC-P04, UC-P14]

### How `execute()` and `withTransaction()` Work

The `Handler` base class `execute()` method is a **pass-through** — it validates input and calls `handle(input, tx)` directly, forwarding the optional `tx`:

```typescript
// Handler.execute() (simplified):
async execute(input: unknown, tx?: Tx): Promise<this['output']> {
  const decodedInput = this.validatedRequest(input)
  return await this.handle(decodedInput, tx)  // pass-through — tx may be undefined
}
```

Transaction management is handled by **`this.withTransaction(tx, fn)`** inside `handle()`. It reuses the parent `tx` if provided, or creates a new one via `unitOfWorkFactory`:

```typescript
// Handler.withTransaction() (simplified):
protected async withTransaction<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (tx) return fn(tx)                                    // Reuse parent tx
  const uow = this.unitOfWorkFactory.create()
  return uow.transaction(async newTx => fn(newTx as Tx))   // Create new tx
}
```

**What this means for you:**
- **Controllers always call `.execute()`** — which validates input and calls `handle()` with `tx` as `undefined`
- **`handle(input, tx?)` receives an optional transaction** — wrap DB operations in `this.withTransaction(tx, async (tx) => { ... })`
- **`this.withTransaction()` manages the transaction** — creates a new one if `tx` is `undefined`, reuses it if provided
- **Use cases do NOT need `UnitOfWorkFactory` in their constructors** — `withTransaction` uses it internally via the Handler base class
- **External I/O before `withTransaction()`** — API calls, email sends, or other non-DB work can happen BEFORE `this.withTransaction()` without holding a DB transaction open, reducing lock contention and improving performance

```
Controller.handle()
  └── useCase.execute(input)             ← validates input, passes tx=undefined
        └── useCase.handle(input, tx?)   ← tx is undefined from controller
              └── this.withTransaction(tx, async (tx) => {  ← creates new tx
                    ├── repository.save(entity, tx)
                    └── this.domainEventRepository.save(event, tx)
                  })
```

### When Transactions Are Needed

All use cases wrap their DB operations in `this.withTransaction()`. The key scenarios to be aware of:

- **Multiple entities** must be saved atomically — all saves receive the same `tx` inside the `withTransaction` callback
- **Read-after-write** within the same operation — if you save entity A then need to find it, the find MUST use the same `tx` (uncommitted writes are invisible outside the transaction)
- **Orchestrating multiple use cases** — the PARENT wraps everything in `this.withTransaction()` and passes `tx` to children via `.execute(input, tx)`; each child's `withTransaction()` detects the existing `tx` and reuses it

### How UnitOfWork Works

The system provides a `UnitOfWorkFactory` that creates `UnitOfWork` instances wrapping Drizzle's native transactions:

```typescript
// Abstract types (packages/api/typescript/src/shared/types/UnitOfWork.ts)
export type Transaction = unknown

export abstract class UnitOfWorkFactory {
  abstract create(): UnitOfWork
}

export abstract class UnitOfWork<T = Transaction> {
  abstract transaction<Return>(fn: (tx: T) => Promise<Return>): Promise<Return>
}
```

### How `tx` Flows Through the System

Every repository method accepts an **optional** `transaction` parameter. When provided, all DB operations use the transaction client instead of the default connection:

```typescript
// Port (abstract repository): infra-agnostic — tx typed as Transaction
abstract save(entity: Entity, transaction?: Transaction): Promise<Entity>

// Drizzle impl: redeclares tx as DrizzleClient — type narrowing, never a cast (repository bp-11)
async save(entity: Entity, transaction?: DrizzleClient): Promise<Entity> {
  const dbClient = transaction ?? this.db  // tx if provided, else default
  await dbClient.insert(table).values(data)...
}

async findById(id: Id | string, transaction?: DrizzleClient): Promise<Entity | undefined> {
  const dbClient = transaction ?? this.db  // SAME pattern for reads
  const rows = await dbClient.select().from(table).where(...)
}
```

Handlers accept optional `tx` so they can be composed within a parent transaction:

```typescript
// Handler base signature (abstract)
protected abstract handle(input: this['input'], tx?: Transaction): Promise<this['output']>
```

### Simple Use Case — Multiple Saves

For use cases that save multiple entities atomically, use `this.withTransaction()` inside `handle()`:

```typescript
import type { Transaction } from '@codedm/core-typescript'

@injectable()
export class TransferFunds extends Handler<
  typeof TransferFundsInputSchema,
  typeof TransferFundsOutputSchema
> {
  readonly name = 'transfer_funds' as const
  readonly inputSchema = TransferFundsInputSchema
  readonly outputSchema = TransferFundsOutputSchema

  constructor(
    private accountRepository: AccountRepository,
    // No UnitOfWorkFactory needed — withTransaction uses it internally
  ) {
    super()
  }

  // tx is optional — use this.withTransaction() to manage transaction
  protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
    return this.withTransaction(tx, async (tx) => {
      // 1. Reads (pass tx for consistency — queries within tx see uncommitted writes)
      const sourceAccount = await this.accountRepository.findById(new Id(input.sourceAccountId), tx)
      const targetAccount = await this.accountRepository.findById(new Id(input.targetAccountId), tx)

      if (!sourceAccount || !targetAccount) {
        throw new BaseError<ApplicationErrors>('ACCOUNT_NOT_FOUND')
      }

      // 2. Domain logic
      sourceAccount.withdraw(input.amount)
      targetAccount.deposit(input.amount)

      // 3. All mutations use the tx from withTransaction
      await this.accountRepository.save(sourceAccount, tx)
      await this.accountRepository.save(targetAccount, tx)

      // 4. Persist domain event in same transaction (OutboxDispatcher handles delivery)
      const event = new FundsTransferredEvent({
        entityId: sourceAccount.id.value,
        ownerId: input.organizationId,
        payload: { sourceAccountId: sourceAccount.id.value, targetAccountId: targetAccount.id.value, amount: input.amount },
      })
      await this.domainEventRepository.save(event, tx)

      return { success: true }
    })
  }
}
```

### Orchestrating Multiple Use Cases (Saga Pattern)

When a parent use case orchestrates several child use cases atomically, the parent's `handle()` wraps everything in `this.withTransaction()` and passes `tx` to children via `.execute(input, tx)`. Each child's `withTransaction()` detects the existing `tx` and reuses it instead of creating a new one.

**CRITICAL**: If a child use case saves an entity, and a subsequent child use case needs to **find** that entity, the find MUST receive the same `tx` — uncommitted writes are invisible to queries outside the transaction.

Real example from `CompleteOnboarding`:

```typescript
@injectable()
export class CompleteOnboarding extends Handler<
  typeof CompleteOnboardingInputSchema,
  typeof CompleteOnboardingOutputSchema
> {
  readonly name = 'complete_onboarding' as const
  readonly inputSchema = CompleteOnboardingInputSchema
  readonly outputSchema = CompleteOnboardingOutputSchema

  constructor(
    private onboardingRepository: OnboardingRepository,
    // Child use cases injected as dependencies
    private createDoctor: CreateDoctor,
    private createClinic: CreateClinic,
    private createUnit: CreateUnit,
    private assignDoctorToUnit: AssignDoctorToUnit,
    // No UnitOfWorkFactory needed — withTransaction uses it internally
  ) {
    super()
  }

  // tx is optional — use this.withTransaction() to manage transaction
  protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
    const { userId, type, doctorInfo, clinicUnit } = input

    return this.withTransaction(tx, async (tx) => {
      // 1. Reads (pass tx for consistency — within the same transaction)
      const record = await this.onboardingRepository.findByUserId(userId, tx)
      if (!record) {
        throw new BaseError<ApplicationErrors>('ONBOARDING_NOT_FOUND')
      }
      if (record.isCompleted()) {
        throw new BaseError<ApplicationErrors>('ONBOARDING_ALREADY_COMPLETED')
      }

      let doctorId: string | undefined
      let clinicId: string | undefined
      let unitId: string | undefined

      if (type === MemberType.DOCTOR) {
        // 2a. CreateDoctor — passes tx so child's withTransaction reuses it
        const doctorResult = await this.createDoctor.execute({
          userId,
          specialties: doctorInfo.specialties,
          crmNumber: doctorInfo.crm,
          crmState: doctorInfo.crmState,
        }, tx)  // <-- child's withTransaction reuses parent tx
        doctorId = doctorResult.doctorId

        if (clinicUnit) {
          // 2b. CreateClinic — saves clinic + membership with tx
          const clinicResult = await this.createClinic.execute({
            name: clinicUnit.clinicName,
            userId,
          }, tx)  // <-- same tx
          clinicId = clinicResult.clinicId

          // 2c. CreateUnit — READS membership (saved in 2b) with tx, then saves unit
          // Without tx here, the findById inside CreateUnit would NOT find
          // the membership created in 2b because it hasn't been committed yet!
          const unitResult = await this.createUnit.execute({
            clinicId: clinicResult.clinicId,
            name: clinicUnit.unitName,
            address: clinicUnit.unitAddress,
            createdByMemberId: clinicResult.membershipId,
          }, tx)  // <-- same tx — critical for read-after-write!
          unitId = unitResult.unitId

          // 2d. AssignDoctorToUnit — needs to find unit + doctor saved above
          await this.assignDoctorToUnit.execute({
            unitId: unitResult.unitId,
            doctorId: doctorResult.doctorId,
            assignedByMemberId: clinicResult.membershipId,
          }, tx)  // <-- same tx
        }
      }

      // 3. Final save within same transaction
      record.complete()
      await this.onboardingRepository.save(record, tx)

      return { success: true, doctorId, clinicId, unitId }
      // Transaction commits when withTransaction's callback finishes.
      // If ANY step throws, ALL writes rollback.
    })
  }
}
```

**Transaction flow diagram:**
```
Controller → CompleteOnboarding.execute(input)    ← pass-through, tx=undefined
  └── CompleteOnboarding.handle(input, tx=undefined)
        └── this.withTransaction(undefined, ...)  ← creates new tx
              ├── onboardingRepository.findByUserId(userId, tx)
              ├── CreateDoctor.execute({...}, tx)        ← tx passed to child
              │   └── CreateDoctor.handle({...}, tx)
              │       └── this.withTransaction(tx, ...)  ← reuses parent tx
              │           └── doctorRepository.save(doctor, tx)
              ├── CreateClinic.execute({...}, tx)
              │   └── CreateClinic.handle({...}, tx)
              │       └── this.withTransaction(tx, ...)  ← reuses parent tx
              │           ├── clinicRepository.save(clinic, tx)
              │           └── membershipRepository.save(membership, tx)
              ├── CreateUnit.execute({...}, tx)
              │   └── CreateUnit.handle({...}, tx)
              │       └── this.withTransaction(tx, ...)  ← reuses parent tx
              │           ├── membershipRepository.findById(id, tx)   ← MUST use tx (read-after-write!)
              │           └── unitRepository.save(unit, tx)
              ├── AssignDoctorToUnit.execute({...}, tx)
              │   └── AssignDoctorToUnit.handle({...}, tx)
              │       └── this.withTransaction(tx, ...)  ← reuses parent tx
              │           └── ...save(..., tx)
              └── onboardingRepository.save(record, tx)
        All operations commit or rollback atomically
```

### Child Use Case Pattern — `withTransaction` Reuses Parent `tx`

Every use case declares `tx?: Transaction` (optional) in `handle()` and wraps DB operations in `this.withTransaction(tx, ...)`. When called standalone (from a controller), `withTransaction` creates a new transaction. When called as a child (with `tx` passed from a parent), `withTransaction` reuses the parent's transaction:

```typescript
@injectable()
export class CreateUnit extends Handler<typeof CreateUnitInputSchema, typeof CreateUnitOutputSchema> {
  readonly name = 'create_unit' as const
  readonly inputSchema = CreateUnitInputSchema
  readonly outputSchema = CreateUnitOutputSchema

  constructor(
    private unitRepository: UnitRepository,
    private membershipRepository: MembershipRepository,
  ) {
    super()
  }

  // tx is optional — withTransaction reuses parent tx or creates new one
  protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
    const { clinicId, name, address, createdByMemberId } = input

    return this.withTransaction(tx, async (tx) => {
      // Read with tx — if membership was saved in the same transaction,
      // this find will only see it if using the same tx!
      const creator = await this.membershipRepository.findById(createdByMemberId, tx)
      if (!creator) {
        throw new BaseError<ApplicationErrors>('INVALID_PERMISSION')
      }

      // Permission checks...
      if (!creator.role.hasPermission(this.name)) {
        throw new BaseError<ApplicationErrors>('INVALID_PERMISSION')
      }

      const unit = Unit.create({ clinicId, name, address })
      await this.unitRepository.save(unit, tx)  // Pass tx through

      return { unitId: unit.id.value }
    })
  }
}
```

### Key Rules for Transactions

1. **`execute()` is a pass-through** — it validates input and calls `handle(input, tx)` directly; controllers call `.execute()`, never `.handle()` directly
2. **`handle()` declares `tx?: Transaction`** — optional; `undefined` when called from a controller, provided when called from a parent use case
3. **Wrap DB operations in `this.withTransaction(tx, async (tx) => { ... })`** — creates a new transaction if `tx` is `undefined`, reuses if provided
4. **Orchestrators pass `tx` to children via `.execute(input, tx)`** — the child's `withTransaction()` detects the existing `tx` and reuses it
5. **External I/O before `withTransaction()`** — API calls, email, or other non-DB work can happen BEFORE `this.withTransaction()` to avoid holding a DB transaction open unnecessarily
6. **Reads MUST use `tx`** when they depend on data saved within the same transaction (read-after-write) — uncommitted writes are invisible to queries outside `tx`
7. **Pass `tx` to every repository method** — both saves AND finds, inside the `withTransaction` callback
8. **Domain events persist inside `withTransaction()`** — save event via `this.domainEventRepository.save(event, tx)` within the transaction; if the transaction rolls back, the persisted event also rolls back. The `OutboxDispatcher` handles async delivery — **never call `internalMediator.publish()` from use cases**
9. **Do NOT inject `UnitOfWorkFactory` in constructors** — it's available via `this.unitOfWorkFactory` (inherited from Handler) and used internally by `withTransaction`

## Update Use Case with Conditional Entity Methods [UC-C03, UC-P11]

For update operations where fields are optional, call entity methods **conditionally** based on input presence:

```typescript
// patient/usecases/UpdatePatient.ts
import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { PatientRepository } from '@patient/repositories'
import { ApplicationErrors } from '@patient/errors'
// InternalMediator is inherited from Handler — no import needed
import { PatientUpdatedEvent } from '@patient/events'
import { Id, AddressSchema, EmailSchema, PhonePlainSchema, PersonNameSchema } from '@shared/objects'

// Input schema - use VOSchema.input() for fields that map to value objects
export const UpdatePatientInputSchema = z.object({
  patientId: z.string(),
  clinicId: z.string(),
  // Optional fields - only provided fields will be updated
  fullName: PersonNameSchema.input().optional(),
  email: EmailSchema.input().optional(),
  phone: PhonePlainSchema.input().optional(),
  address: AddressSchema.input().optional(),
})

export const UpdatePatientOutputSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  address: AddressSchema.input().optional(),
  updatedAt: z.string(),
})

@injectable()
export class UpdatePatient extends Handler<typeof UpdatePatientInputSchema, typeof UpdatePatientOutputSchema> {
  readonly name = 'update_patient' as const
  readonly inputSchema = UpdatePatientInputSchema
  readonly outputSchema = UpdatePatientOutputSchema

  constructor(
    private patientRepository: PatientRepository,
    // InternalMediator is inherited from Handler via this.internalMediator
  ) {
    super()
  }

  protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
    const { patientId, clinicId, fullName, email, phone, address } = input

    return this.withTransaction(tx, async (tx) => {
      // 1. Fetch entity and validate existence + ownership
      const patient = await this.patientRepository.findById(new Id(patientId), tx)

      if (!patient) {
        throw new BaseError<ApplicationErrors>('PATIENT_NOT_FOUND')
      }

      // Validate entity belongs to organization/tenant
      if (patient.clinicId.value !== clinicId) {
        throw new BaseError<ApplicationErrors>('PATIENT_NOT_FOUND')
      }

      // 2. CRITICAL: Call entity methods CONDITIONALLY based on input presence
      // Each entity method validates business rules and handles version increment

      if (fullName) {
        patient.updateName(fullName)
      }

      if (email) {
        patient.updateEmail(email)
      }

      if (phone) {
        patient.updatePhone(phone)
      }

      if (address) {
        patient.updateAddress(address)
      }

      // 3. Persist (tx provided by withTransaction)
      await this.patientRepository.save(patient, tx)

      // 4. Persist domain event in same transaction (OutboxDispatcher handles delivery)
      const event = new PatientUpdatedEvent({
        entityId: patient.id.value,
        ownerId: clinicId,
        payload: {
          patient: {
            id: patient.id.value,
          },
        },
      })
      await this.domainEventRepository.save(event, tx)

      // 5. Return updated data
      return {
        id: patient.id.value,
        fullName: patient.name.value,
        email: patient.email.value,
        phone: patient.phone.toString(),
        address: patient.address
          ? {
              street: patient.address.street,
              number: patient.address.number,
              complement: patient.address.complement,
              neighborhood: patient.address.neighborhood,
              city: patient.address.city,
              state: patient.address.state,
              zipCode: patient.address.zipCode.value,
              country: patient.address.country,
            }
          : undefined,
        updatedAt: patient.updatedAt.toISOString(),
      }
    })
  }
}
```

### Key Rules for Conditional Entity Updates

1. **Input fields are optional** - Use `.optional()` in schema for updatable fields
2. **Check before calling** - Only call entity method if field is provided:
   ```typescript
   // CORRECT - Conditional call
   if (fullName) {
     entity.updateName(fullName)
   }

   // WRONG - Always calls method
   entity.updateName(fullName)  // Will fail if fullName is undefined!
   ```
3. **Entity validates business rules** - Each `update*` method in the entity handles its own validation
4. **Single save at the end** - Call `repository.save()` once after all updates
5. **Return full entity state** - Output schema returns complete entity data, not just changed fields

### Entity Methods Pattern

> For detailed entity method patterns (behavior methods, state transitions, validation), see the `/entity` skill. Entity methods use `safeParse` + `BaseError` for validation and should never expose `this.props` directly.

## Use Case Validating Another Context [UC-P09, bp-03]

```typescript
import { CustomerRepository } from '@customer/repositories'
import { ProductRepository } from '@product/repositories'

@injectable()
export class CreateOrder extends Handler<...> {
  constructor(
    private orderRepository: OrderRepository,
    private customerRepository: CustomerRepository,
    private productRepository: ProductRepository,
    // InternalMediator is inherited from Handler — no constructor injection needed
  ) {
    super()
  }

  protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
    return this.withTransaction(tx, async (tx) => {
      // Validate by repository reads from other contexts
      const customer = await this.customerRepository.findById(input.customerId, tx)
      if (!customer) {
        throw new BaseError<ApplicationErrors>('CUSTOMER_NOT_FOUND')
      }

      const product = await this.productRepository.findById(input.productId, tx)
      if (!product) {
        throw new BaseError<ApplicationErrors>('PRODUCT_NOT_FOUND')
      }

      // Create order with data from other contexts
      const order = Order.create({
        customerId: customer.id,
        productId: product.id,
        price: product.price,
      })

      await this.orderRepository.save(order, tx)

      // Persist domain event in same transaction (OutboxDispatcher handles delivery)
      const event = new OrderCreatedEvent({
        entityId: order.id.value,
        ownerId: customer.id.value,
        payload: { orderId: order.id.value },
      })
      await this.domainEventRepository.save(event, tx)

      return { orderId: order.id.value }
    })
  }
}
```

## Permission Checking [UC-P05]

For use cases that require permission verification:

```typescript
protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
  const { organizationId, collaboratorId, ...data } = input

  return this.withTransaction(tx, async (tx) => {
    // Fetch collaborator
    const collaborator = await this.collaboratorRepository.findById(collaboratorId, tx)
    if (!collaborator) {
      throw new BaseError<ApplicationErrors>('COLLABORATOR_NOT_FOUND')
    }

    // Verify permission using use case name
    if (!collaborator.role.hasPermission(this.name)) {
      throw new BaseError<ApplicationErrors>('INVALID_PERMISSION')
    }

    // Verify belongs to organization
    if (collaborator.organizationId.value !== organizationId) {
      throw new BaseError<ApplicationErrors>('INVALID_PERMISSION')
    }

    // Continue with use case...
  })
}
```

## Critical Rules

### Use Snake Case for Name [UC-04]

```typescript
// WRONG
readonly name = 'product.createProduct' as const
readonly name = 'CreateProduct' as const

// CORRECT
readonly name = 'create_product' as const
readonly name = 'invite_collaborator' as const
```

### Never Return Entities

```typescript
// WRONG - Returns entity
async handle(input): Promise<Product> {
  const product = Product.create(input)
  return product  // Exposes domain object!
}

// CORRECT - Returns DTO
async handle(input): Promise<{ productId: string }> {
  const product = Product.create(input)
  return { productId: product.id.value }
}
```

### Persist Events in Transaction — Never Publish Directly [UC-C05, bp-04]

Events are persisted in the same transaction as the entity save via `domainEventRepository.save(event, tx)`. The `OutboxDispatcher` handles async delivery. **Use cases never call `internalMediator.publish()` or `externalMediator.publish()`.**

```typescript
// WRONG - Publishing events directly from use case
await this.productRepository.save(product, tx)
await this.domainEventRepository.save(event, tx)
await this.internalMediator.publish(event)  // ← NEVER do this in a use case

// CORRECT - Save event in same tx, OutboxDispatcher delivers
await this.productRepository.save(product, tx)
const event = new ProductCreatedEvent({ entityId: product.id.value, ownerId, payload: { ... } })
await this.domainEventRepository.save(event, tx)  // dual-writes to events + outbox tables
// No publish call — OutboxDispatcher polls outbox and dispatches to handlers
```

### Use Repository Reads for Cross-Context Validation [UC-P09, bp-03]

```typescript
// WRONG - SDK HTTP client inside api
import { getCustomer } from '@codedm/client-typescript/http'

// WRONG - pass-through use case only for lookup
import { GetCustomer } from '@customer/usecases'

// CORRECT - repository read
import { CustomerRepository } from '@customer/repositories'
const customer = await this.customerRepository.findById(customerId)
```

### File Name Without "UseCase" Suffix [bp-06]

```typescript
// WRONG
// CreateProductUseCase.ts
export class CreateProductUseCase { }

// CORRECT
// CreateProduct.ts
export class CreateProduct { }
```

## Checklist

- [ ] All `when: always` patterns present (UC-01 through UC-05, UC-P01 through UC-P03 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (UC-C01 through UC-C07 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-11 — verify against registry.yaml)
- [ ] Exported from `usecases/index.ts`
- [ ] File name WITHOUT "UseCase" suffix

## References

- `@codedm/core-typescript` — Handler base class, BaseError, z, Transaction, HttpStatusCode
- `packages/api/typescript/src/patient/usecases/UpdatePatient.ts` - Reference for conditional entity updates
- `docs/BACKEND.md` - Architecture principles (why)
- `/entity` skill - For creating entities used by use cases
- `/repository` skill - For persisting entities
- `/event` skill - For creating events to publish
- `/controller` skill - For exposing use cases via HTTP
