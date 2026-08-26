---
name: event
description: "Create a domain or integration event. Use when something significant happens that other parts of the system need to know about. Use this skill for domain events (same context, InternalMediator) and integration events (cross-context, ExternalMediator)."
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

# Create Domain Event

Creates a domain event for communicating significant occurrences within or across bounded contexts.

## Why Events Exist

Events decouple contexts and enable side effects without direct dependencies. Domain events communicate within a context (e.g., "patient updated" triggers cache refresh), while integration events cross context boundaries (e.g., "clinic created" triggers collaborator setup). Events are published AFTER persistence to ensure data consistency.

## When to Use This Skill

- Something significant happened that other code needs to react to
- Triggering side effects after persistence (notifications, cache updates, read model updates)
- Cross-context communication without direct coupling between bounded contexts
- Building audit trails or maintaining eventual consistency across the system

## When NOT to Use This Skill

- **Simple data passing between functions** -- use parameters or return values
- **Synchronous validation** -- use entity methods or use case logic
- **Simple request-response existence/data validation across contexts** -- use repository read methods
- **Immediate data queries** -- use `/query` skill with direct Drizzle access

## Prerequisites

- Context must exist (use `/context` first)
- Errors must be defined (use `/errors` first) if using `.refine()` in event schemas

## Key Principles

1. **Past Tense Names**: Events describe what happened (`user.created`, not `user.create`)
2. **Immutable Snapshots**: Events contain data at time of occurrence, not references
3. **Publish After Persistence**: Always save to DB first, then publish event
4. **Domain vs Integration**: Domain events stay in context, Integration events cross contexts

## Event Types

| Type | Scope | Publisher | Subscriber |
|------|-------|-----------|------------|
| **Domain Event** | Within context | Use case | Internal handlers |
| **Integration Event** | Cross-context | Use case | External handlers |

## Schema Patterns for Events [EVT-02, EVT-P11, bp-01, bp-03, bp-04]

### What `z.domainEvent()` and `z.integrationEvent()` Do

`z.domainEvent(payloadShape)` takes a payload shape and merges it into the `BaseDomainEventSchema` structure (`{ entityId: z.string(), ownerId: z.string(), payload: z.object(yourShape) }`), returning a `DomainEventObjectSchema<T>`. Similarly, `z.integrationEvent(payloadShape)` builds from `BaseIntegrationEventSchema` (`{ ownerId: z.string(), payload: z.object(yourShape) }`).

### Payload Schema Rules

- **Use plain primitives** — `z.string()`, `z.number()`, `z.date()`, `z.enum(EnumType)`. Events carry data snapshots, not value objects.
- **No `.transform()` in event schemas** — events are serializable data, not domain objects.
- **No `.example()` needed** — events aren't OpenAPI-exposed (only controllers need examples).
- **Use `z.enum(EnumType)` for status fields** — never inline string literals.

```typescript
// WRONG — VO transform in event payload
export const OrderShippedEventSchema = z.domainEvent({
  orderId: z.string(),
  address: z.object({ street: z.string() }).transform(v => new Address(v)),
})

// CORRECT — plain primitives only
export const OrderShippedEventSchema = z.domainEvent({
  orderId: z.string(),
  status: z.enum(OrderStatus),
  shippingAddress: z.object({ street: z.string(), city: z.string() }),
})
```

### When `.refine()` Is Used

Rare in event schemas, but if needed, must follow the standard error format — see `bp-03` in registry.yaml for the wrong/right pattern.

### Type Inference

Use `Z.infer<typeof MyEventSchema>` — never `(typeof Schema)['_output']`. See `bp-04` in registry.yaml.

## Process

### Step 1: Generate Event Scaffold

```bash
bun cli event <context> <name> [--integration]
```

Examples:
- `bun cli event collaborator Invited` -> `CollaboratorInvitedEvent`
- `bun cli event order Confirmed` -> `OrderConfirmedEvent`
- `bun cli event organization Created --integration` -> Cross-context event

### Step 2: Define Event Schema

```typescript
// <context>/events/CollaboratorInvitedEvent.ts
import { BaseDomainEvent, z } from '@codm/core-typescript'
import { RoleType } from '@shared/objects'

// Define the event payload schema using z.domainEvent()
export const CollaboratorInvitedEventSchema = z.domainEvent({
  invitationId: z.string(),
  organizationId: z.string(),
  email: z.email(),
  role: z.enum(RoleType),
  token: z.string(),
})

// Event class extends BaseDomainEvent with schema type
export class CollaboratorInvitedEvent extends BaseDomainEvent<typeof CollaboratorInvitedEventSchema> {
  static override readonly name = 'collaborator.collaborator.invited' as const  // 3-part: context.entity.action
  static readonly schema = CollaboratorInvitedEventSchema
}
```

### Step 3: Export from Index

Only export the class — consumers access the schema via `EventClass.schema`.

```typescript
// <context>/events/index.ts
export { CollaboratorInvitedEvent } from './CollaboratorInvitedEvent'
export { CollaboratorRemovedEvent } from './CollaboratorRemovedEvent'
export { InvitationAcceptedEvent } from './InvitationAcceptedEvent'
```

### Step 4: Register Integration Events (for Cross-Context Events)

For events that need to be consumed by other contexts, register them in `@shared/events/index.ts`. See the Complete Examples section below for the full OrganizationCreatedEvent pattern.

**Why register here?** Integration events are imported via `@shared/events` so other contexts can subscribe. The shared module imports all integration events to expose them as `IntegrationEvents` type:

```typescript
// @shared/index.ts
import * as integrationEvents from './events'

// Event Types
type IntegrationEventsInstances = InstancesOf<typeof integrationEvents, typeof BaseEvent<any>>
export type IntegrationEvents = IntegrationEventsInstances['name']
```

## Event Naming Convention [EVT-P01, EVT-P04]

- **Past tense**: Events describe something that already happened
- **Format**: `<context>.<entity>.<action>` — **3-part name, always** (e.g., `collaborator.collaborator.invited`, `identity.user.profile_updated`)
- Integration events are prefixed `integration.`: `integration.<entity>.<action>` (e.g., `integration.organization.created`)

| Action | Domain Event Name | Integration Event Name |
|--------|------|------|
| Invite collaborator | `collaborator.collaborator.invited` | `integration.collaborator.invited` |
| Accept invitation | `collaborator.invitation.accepted` | `integration.invitation.accepted` |
| Remove collaborator | `collaborator.collaborator.removed` | `integration.collaborator.removed` |
| Update role | `collaborator.collaborator.role_updated` | `integration.collaborator.role_updated` |

## Transactional Outbox Pattern

Domain events use the **transactional outbox pattern**. Use cases **never publish events directly**. Instead:

1. Use case saves domain event via `this.domainEventRepository.save(event, tx)` inside the same transaction as the entity save
2. `DomainEventRepository` dual-writes to `events` (permanent audit log) + `outbox` (transient dispatch queue)
3. `OutboxDispatcher` polls the outbox asynchronously and dispatches events to handlers via `InternalMediator.dispatch()`
4. If a handler needs to publish an integration event (cross-context), it injects `ExternalMediator` and calls `externalMediator.publish()` (fire-and-forget)

### Saving Domain Events (Use Cases)

```typescript
// Use case saves event in same transaction as entity — NO publish call
await this.entityRepository.save(entity, tx)

const event = new CollaboratorInvitedEvent({
  entityId: invitation.id.value,
  ownerId: input.organizationId,
  payload: {
    invitationId: invitation.id.value,
    organizationId: input.organizationId,
    email: input.email,
    role: input.role,
    token: invitation.token,
  },
})
await this.domainEventRepository.save(event, tx)
// OutboxDispatcher handles delivery — no publish() call needed
```

### Integration Events (Cross-Context via Handlers)

Integration events are published by **handlers** that react to domain events, NOT by use cases directly. See the `/handler` skill for the integration event publisher handler pattern.

## Event Constructor Fields [EVT-P02, EVT-P03]

### Internal Events (InternalMediator)

```typescript
new CollaboratorInvitedEvent({
  entityId: invitation.id.value,    // ID of the entity that was affected
  ownerId: organizationId,           // Organization ID for multi-tenancy
  payload: {
    // Event-specific data (snapshot)
    ...
  },
})
```

### External Events (ExternalMediator)

```typescript
new OrganizationCreatedEvent({
  ownerId: organization.id.value,   // Owner/tenant identifier
  payload: {
    // Event-specific data (snapshot)
    ...
  },
})
```

## Common Event Patterns

### Domain Event (Internal - Within Context)

For *Created / *Updated events, embed the entity via `EntitySchema.input()` (wire-safe: `z.instance(Id)` → string). Do NOT hand-pick individual fields — they drift from the entity.

```typescript
// customer/events/CustomerCreatedEvent.ts
import { BaseDomainEvent, z } from '@codm/core-typescript'
import { CustomerSchema } from '../entities/Customer'

// Embed full entity via .input() — serializes Id/VO instances to plain strings
const CustomerCreatedEventSchema = z.domainEvent({
  customer: CustomerSchema.input(),
})

export class CustomerCreatedEvent extends BaseDomainEvent<typeof CustomerCreatedEventSchema> {
  static override readonly name = 'customer.customer.created' as const  // 3-part: context.entity.action
  static readonly schema = CustomerCreatedEventSchema
}
```

Usage in use case:
```typescript
const event = new CustomerCreatedEvent({
  entityId: customer.id.value,
  ownerId: input.organizationId,
  payload: { customer: customer.toJSON() },
})
await this.domainEventRepository.save(event, tx)
```

### Integration Event (External - Cross-Context)

Integration events go in `@shared/events/` so other contexts can import and subscribe to them. See the Complete Examples section for the full OrganizationCreatedEvent and UserRegisteredEvent implementations.

### State Change Event

```typescript
const CollaboratorRoleUpdatedEventSchema = z.domainEvent({
  collaboratorId: z.string(),
  organizationId: z.string(),
  previousRole: z.enum(RoleType),  // Include previous state for auditing
  newRole: z.enum(RoleType),
})

export class CollaboratorRoleUpdatedEvent extends BaseDomainEvent<typeof CollaboratorRoleUpdatedEventSchema> {
  static override readonly name = 'collaborator.collaborator.roleUpdated' as const
  static readonly schema = CollaboratorRoleUpdatedEventSchema
}
```

### Deleted/Revoked Event

```typescript
const InvitationRevokedEventSchema = z.domainEvent({
  invitationId: z.string(),
  organizationId: z.string(),
  email: z.email(),
})

export class InvitationRevokedEvent extends BaseDomainEvent<typeof InvitationRevokedEventSchema> {
  static override readonly name = 'collaborator.invitation.revoked' as const
  static readonly schema = InvitationRevokedEventSchema
}
```

## Integration Event vs Domain Event [EVT-C01, EVT-C02, EVT-P05, EVT-P06]

| Aspect | Domain Event | Integration Event |
|--------|--------------|-------------------|
| **Location** | `<context>/events/` | `@shared/events/` |
| **Scope** | Within same context | Across contexts |
| **Mediator** | `InternalMediator` | `ExternalMediator` |
| **Constructor field** | `entityId` | `ownerId` |
| **Subscribers** | Same context handlers | Any context handlers |
| **Export** | Context's `events/index.ts` | `@shared/events/index.ts` |

### When to Use Integration Events

- Other contexts need to react to changes in your context
- Building audit trails across the system
- Triggering workflows in other bounded contexts
- Maintaining eventual consistency between contexts

Example: When an Organization is created, the Collaborator context needs to add the creator as an admin collaborator.

## Critical Rules

### Save via Outbox, Never Publish Directly [bp-02]

Use cases save events via `domainEventRepository.save(event, tx)` inside the transaction. The `OutboxDispatcher` handles async delivery. **Never call `internalMediator.publish()` from use cases.**

### Events Are Immutable Snapshots [bp-05]

Events should contain all data needed by handlers as primitive snapshots, not entity references. See `bp-05` in registry.yaml for the wrong/right pattern.

### Use Past Tense Verbs and 3-Part Names

```typescript
// WRONG
'collaborator.invite'              // Present tense, 2-part
'invitation.accepting'             // Progressive, 2-part

// CORRECT — 3-part: context.entity.action
'collaborator.collaborator.invited'   // Past tense, 3-part
'collaborator.invitation.accepted'    // Past tense, 3-part
```

### Use Correct Mediator

```typescript
// Same-context events -> InternalMediator
private internalMediator: InternalMediator

// Cross-context events -> ExternalMediator
private externalMediator: ExternalMediator
```

## Checklist

- [ ] All `when: always` patterns present (EVT-01 through EVT-04, EVT-P01, EVT-P09, EVT-P11, EVT-P12 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (EVT-C01, EVT-C02, EVT-P02 through EVT-P08, EVT-P10 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-06 — verify against registry.yaml)

## Complete Examples

### Domain Event Example (Internal)

```typescript
// collaborator/events/CollaboratorInvitedEvent.ts
import { BaseDomainEvent, z } from '@codm/core-typescript'
import { RoleType } from '@shared/objects'

const CollaboratorInvitedEventSchema = z.domainEvent({
  invitationId: z.string(),
  organizationId: z.string(),
  email: z.email(),
  role: z.enum(RoleType),
  token: z.string(),
})

export class CollaboratorInvitedEvent extends BaseDomainEvent<typeof CollaboratorInvitedEventSchema> {
  static override readonly name = 'collaborator.collaborator.invited' as const  // 3-part: context.entity.action
  static readonly schema = CollaboratorInvitedEventSchema
}
```

```typescript
// collaborator/events/index.ts
export { CollaboratorInvitedEvent } from './CollaboratorInvitedEvent'
export { CollaboratorRemovedEvent } from './CollaboratorRemovedEvent'
export { CollaboratorRoleUpdatedEvent } from './CollaboratorRoleUpdatedEvent'
export { InvitationAcceptedEvent } from './InvitationAcceptedEvent'
export { InvitationRevokedEvent } from './InvitationRevokedEvent'
```

### Integration Event Example (Cross-Context)

```typescript
// @shared/events/OrganizationCreatedEvent.ts
import { BaseIntegrationEvent, z } from '@codm/core-typescript'

const OrganizationCreatedEventSchema = z.integrationEvent({
  organizationId: z.string(),
  name: z.string(),
  userId: z.uuid(),
  createdAt: z.date(),
})

export class OrganizationCreatedEvent extends BaseIntegrationEvent<typeof OrganizationCreatedEventSchema> {
  static override readonly name = 'integration.organization.created' as const
  static readonly schema = OrganizationCreatedEventSchema
}
```

```typescript
// @shared/events/UserRegisteredEvent.ts
import { BaseIntegrationEvent, z } from '@codm/core-typescript'

const UserRegisteredEventSchema = z.integrationEvent({
  userId: z.uuid(),
  email: z.string(),
  name: z.string(),
  language: z.string(),
})

export class UserRegisteredEvent extends BaseIntegrationEvent<typeof UserRegisteredEventSchema> {
  static override readonly name = 'integration.user.registered' as const
  static readonly schema = UserRegisteredEventSchema
}
```

```typescript
// @shared/events/index.ts
export { OrganizationCreatedEvent } from './OrganizationCreatedEvent'
export { UserRegisteredEvent } from './UserRegisteredEvent'
```

### Publishing Integration Events (via Handler, NOT Use Case)

**IMPORTANT**: Use cases never publish events directly. Instead, use cases save domain events to the outbox, and a **handler** reacts to the domain event and publishes the integration event via `ExternalMediator`. See the `/handler` skill for the full integration event publisher handler pattern.

```typescript
// Step 1: Use case saves domain event to outbox (NO publish call)
// organization/usecases/CreateOrganization.ts
await this.organizationRepository.save(organization, tx)

const event = new OrganizationCreatedDomainEvent({
  entityId: organization.id.value,
  ownerId: organization.id.value,
  payload: { organizationId: organization.id.value, name: organization.name, userId: input.userId },
})
await this.domainEventRepository.save(event, tx)
// OutboxDispatcher handles delivery to handlers

// Step 2: Handler reacts to domain event and publishes integration event
// organization/handlers/OrganizationCreatedHandler.ts
@injectable()
export class OrganizationCreatedHandler extends EventHandler<typeof OrganizationCreatedDomainEvent> {
  readonly event = OrganizationCreatedDomainEvent
  constructor(private externalMediator: ExternalMediator) { super() }

  async handle(event: this['input']): Promise<this['output']> {
    await this.externalMediator.publish(
      new OrganizationCreatedEvent({
        ownerId: event.ownerId,
        payload: {
          organizationId: event.payload.organizationId,
          name: event.payload.name,
          userId: event.payload.userId,
        },
      }),
    )
    return
  }
}
```

### Subscribing to Integration Event (in another context)

```typescript
// collaborator/handlers/OnOrganizationCreated.ts
import { EventHandler } from '@codm/core-typescript'
import { OrganizationCreatedEvent } from '@shared/events'

@injectable()
export class OnOrganizationCreated extends EventHandler<typeof OrganizationCreatedEvent> {
  readonly event = OrganizationCreatedEvent

  constructor(
    private collaboratorRepository: CollaboratorRepository,
  ) {
    super()
  }

  async handle(event: this['input']): Promise<this['output']> {
    // Create admin collaborator for the user who created the organization
    const collaborator = Collaborator.create({
      organizationId: event.payload.organizationId,
      userId: event.payload.userId,
      role: RoleType.ADMIN,
    })

    await this.collaboratorRepository.save(collaborator)
  }
}
```

## Composition Pattern — Saga across contexts (event chain)

**Behavior example.** A patient registers. Automatically: a profile is created on the channels system, a welcome appointment is scheduled, a welcome email is dispatched.

**Recipe.**
- `patient` context
  - `entity` `Patient.create()` raises `PatientCreated` (domain event)
  - `handler` in `patient` — publishes `patient.created` integration event
- `channel` context
  - `handler` `CreateChannelProfileHandler` — subscribes to `patient.created`, creates the profile
- `appointment` context
  - `handler` `ScheduleWelcomeAppointmentHandler` — subscribes to `patient.created`, calls `ScheduleAppointment` usecase
- Notification context
  - `handler` `SendWelcomeEmailHandler` — subscribes to `patient.created`

Each reaction is **independent**. One failing doesn't invalidate the others (the defining property of sagas — no distributed transaction, eventual consistency).

**Decision rule — domain vs integration event:**
- Same bounded context, same process → **domain event** (rich payload OK, dispatched in-process via `InternalMediator`).
- Crosses bounded contexts in the SAME service → **domain event** is still fine (they share the `InternalMediator`).
- Crosses services (TS ↔ Go channel via Kafka) → **integration event** (payload is primitives / DTOs only).

## References

- `packages/api/typescript/src/shared/types/` - BaseDomainEvent, BaseIntegrationEvent
- `packages/api/typescript/src/shared/events/` - Integration events location
- `packages/api/typescript/src/shared/services/` - InternalMediator, ExternalMediator
- `docs/BACKEND.md` - Architecture principles (why)
- `/handler` skill - For creating handlers that react to events
- `/usecase` skill - For publishing events from use cases
