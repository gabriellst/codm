---
name: handler
description: "Create an event handler. Use when you need to react to domain events like sending notifications or updating related data. Use this skill for both internal handlers (same context) and external handlers (cross-context integration)."
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

# Create Event Handler

Creates an event handler that reacts to domain or integration events.

## Why Handlers Exist

Handlers process side effects triggered by events -- they run AFTER the main operation succeeds. By separating side effects into handlers, the core use case stays focused on its primary responsibility. Handlers must be idempotent because events can be delivered more than once.

## When to Use This Skill

- Reacting to domain events (e.g., send email after user created)
- Reacting to integration events from other contexts (e.g., create collaborator when clinic is created)
- Publishing integration events / triggering write-side effects after state changes (read-model updates belong to Projectors — see `/projector`)
- Triggering async workflows in response to completed operations

## When NOT to Use This Skill

- Core business logic -- belongs in use cases
- Synchronous validation -- belongs in entities or value objects
- Data fetching for the primary operation -- use the repository directly in the use case

## Prerequisites

- Context must exist (use `/context` first)
- Event must exist (use `/event` first)

## Key Principles

1. **Idempotent**: Handlers must handle duplicate events gracefully
2. **outputSchema is void**: Handlers don't return values
3. **Repository Reads for Cross-Context Validation**: In `api`, use repository read methods when handler needs cross-context validation data
4. **Export Location**: Internal handlers in `internal.ts`, external in `external.ts`
5. **Base class provides infrastructure**: `this.internalMediator`, `this.domainEventRepository`, and `this.unitOfWorkFactory` are available as lazy-resolved getters from the `Handler` base class — do NOT inject these in the handler constructor

## Handler Types

| Type | Location | Purpose |
|------|----------|---------|
| **Internal** | `handlers/internal.ts` | Handle events within same context |
| **External** | `handlers/external.ts` | Handle events from other contexts |

## Process

### Step 1: Generate Handler Scaffold

```bash
bun cli handler <context> <eventName> [--external]
```

Examples:
- `bun cli handler auth UserCreated` -> Internal handler
- `bun cli handler collaborator OrganizationCreated --external` -> External handler

### Step 2: Implement Handler

```typescript
// <context>/handlers/UserCreatedHandler.ts
import { EventHandler } from '@codm/core-typescript'
import { injectable } from 'tsyringe-neo'
import { UserCreatedEvent } from '@auth/events'
import { MailSender } from '@<ctx>/services/MailSender'
import { WelcomeEmail } from '@auth/services/MailSender'

@injectable()
export class UserCreatedHandler extends EventHandler<typeof UserCreatedEvent> {
  readonly event = UserCreatedEvent

  constructor(private readonly mailSender: MailSender) {
    super()
  }

  async handle(event: this['input']): Promise<this['output']> {
    const { user } = event.payload

    // Side effect: send welcome email
    const emailTemplate = new WelcomeEmail({ userName: user.name })
    await this.mailSender.sendMail(user.email, emailTemplate)

    return
  }
}
```

### Step 3: Export Handler

**For Internal Handlers:**
```typescript
// <context>/handlers/internal.ts
export * from './UserCreatedHandler'
export * from './UserUpdatedHandler'
```

**For External Handlers:**
```typescript
// <context>/handlers/external.ts
export * from './OrganizationCreatedHandler'
```

## Error Handling

Handlers should be resilient. The behavior depends on the handler's criticality:

**Non-critical handlers** (notifications, logging): Wrap in try-catch to prevent breaking the event chain:
```typescript
async handle(event: OrderCreatedEvent): Promise<void> {
  try {
    await this.emailService.sendOrderConfirmation(event.payload)
  } catch (error) {
    this.logger.error('Failed to send order confirmation', { error, eventId: event.id })
    // Don't rethrow — notification failure shouldn't block the order flow
  }
}
```

**Critical handlers** (data consistency, cross-context updates): Let errors propagate so the transaction rolls back:
```typescript
async handle(event: OrderCreatedEvent): Promise<void> {
  // If inventory update fails, the order creation should also fail
  await this.inventoryService.reserve(event.payload.items)
}
```

## External Handler Example

Handling events from another context:

```typescript
// collaborator/handlers/OrganizationCreatedHandler.ts
import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { CollaboratorRepository } from '@collaborator/repositories'
import { Collaborator } from '@collaborator/entities'
import { RoleType } from '@shared/objects'
import { OrganizationCreatedEvent } from '@shared/events'

@injectable()
export class OrganizationCreatedHandler extends EventHandler<typeof OrganizationCreatedEvent> {
  readonly event = OrganizationCreatedEvent

  constructor(private collaboratorRepository: CollaboratorRepository) {
    super()
  }

  async handle(event: this['input']): Promise<void> {
    const { payload } = event
    const { userId, organizationId } = payload

    // Idempotency check - already processed?
    const existingCollaborator = await this.collaboratorRepository.findByOrganizationAndUser(
      organizationId,
      userId
    )
    if (existingCollaborator) {
      // Already exists, skip creation
      return
    }

    // Create initial OWNER collaborator
    const collaborator = Collaborator.create({
      organizationId: organizationId,
      userId: userId,
      role: RoleType.OWNER,
    })

    // Save collaborator
    await this.collaboratorRepository.save(collaborator)
  }
}
```

## Handler Patterns

### Send Email

```typescript
@injectable()
export class CollaboratorInvitedHandler extends EventHandler<typeof CollaboratorInvitedEvent> {
  readonly event = CollaboratorInvitedEvent

  constructor(private mailSender: MailSender) {
    super()
  }

  async handle(event: this['input']): Promise<this['output']> {
    const { email, token, role } = event.payload

    const template = new InvitationEmail({
      inviteLink: `${config.appUrl}/invite?token=${token}`,
      role: role,
    })

    await this.mailSender.sendMail(email, template)

    return
  }
}
```

### Update Read Model — that's a Projector, not a Handler

Read-model writes belong to the **read side**: one `Projector` per Projection, canonical
`find → projection.applyEvent(event) → save` flow (see `/projector`). A Handler reacting to an
event must NOT upsert read models directly — that splits read-model ownership across two artifact
types and bypasses the Projection's own transition logic (projector PRJTR-07/08/09).

The narrow exception is a **cache-mirror upsert** (an external system's state mirrored verbatim,
no domain transitions — e.g. `channel_remotes`): that atomic op lives on a ProjectionRepository
and must carry an inline comment naming its trigger (hot row / bulk / monotonic / conditional /
cache-mirror). If you are tempted to write `readModelRepository.upsert(...)` in a handler,
scaffold a Projector instead.

## Base Class Infrastructure

The `Handler` base class provides three lazy-resolved infrastructure getters. **Do NOT inject these in handler constructors** — they are already available via `this`:

| Getter / Method | Type | Use when |
|-----------------|------|----------|
| `this.internalMediator` | `Mediator` | Publishing domain events within the same context |
| `this.domainEventRepository` | `DomainEventRepository` | Persisting outbox events |
| `this.unitOfWorkFactory` | `UnitOfWorkFactory` | Creating manual transactions (rare) |
| `this.withTransaction(fn)` | `(fn: (tx) => Promise<T>) => Promise<T>` | Wrapping handler logic in a transaction via `unitOfWorkFactory` |

```typescript
// ✅ CORRECT — use base class getters directly, no injection needed
@injectable()
export class MessageReceivedHandler extends EventHandler<typeof MessageReceivedEvent> {
  readonly event = MessageReceivedEvent

  constructor(private chatRepository: ChatRepository) {
    super()
  }

  async handle(event: this['input']): Promise<void> {
    // this.domainEventRepository is available from base class
    // Save follow-up domain event to outbox (creates new outbox entry for next poll cycle)
    const pingEvent = new ChatPingDetectedEvent({ ... })
    await this.domainEventRepository.save(pingEvent)
  }
}

// ❌ WRONG — injecting mediator/domainEventRepository in constructor
@injectable()
export class MessageReceivedHandler extends EventHandler<typeof MessageReceivedEvent> {
  readonly event = MessageReceivedEvent

  constructor(
    private chatRepository: ChatRepository,
    private internalMediator: InternalMediator,       // ← remove this
    private domainEventRepository: DomainEventRepository, // ← remove this
  ) {
    super()
  }
}
```

## Integration Event Publisher Handler

When a domain event needs to trigger a cross-context integration event, create a **handler** that reacts to the domain event and publishes the integration event via `ExternalMediator`. This decouples use cases from cross-context concerns.

```typescript
// clinic/handlers/ClinicCreatedHandler.ts
import { EventHandler } from '@codm/core-typescript'
import { injectable } from 'tsyringe-neo'
import { ClinicCreatedDomainEvent } from '@clinic/events'
import { ClinicCreatedEvent } from '@shared/events'
import { ExternalMediator } from '@codm/core-typescript'

@injectable()
export class ClinicCreatedHandler extends EventHandler<typeof ClinicCreatedDomainEvent> {
  readonly event = ClinicCreatedDomainEvent

  constructor(private externalMediator: ExternalMediator) {
    super()
  }

  async handle(event: this['input']): Promise<this['output']> {
    const { clinicId, name, userId } = event.payload

    // Publish integration event (fire-and-forget, no outbox)
    await this.externalMediator.publish(
      new ClinicCreatedEvent({
        ownerId: event.ownerId,
        payload: { clinicId, name, userId },
      }),
    )

    return
  }
}
```

**Key points:**
- Handler reacts to **domain event** (dispatched via outbox)
- Publishes **integration event** via `ExternalMediator` (fire-and-forget)
- Domain event payload must contain all data needed for the integration event (events are self-contained snapshots)
- Exported from `handlers/internal.ts` (it handles a domain event from the same context)

## Follow-Up Domain Events from Handlers

When a handler needs to emit another domain event (event chaining), save it to the outbox via `this.domainEventRepository.save()`. The `OutboxDispatcher` will pick it up in the next poll cycle:

```typescript
async handle(event: this['input']): Promise<void> {
  // ... process event ...

  // Save follow-up domain event to outbox
  const followUpEvent = new SomeFollowUpEvent({
    entityId: event.payload.entityId,
    ownerId: event.ownerId,
    payload: { ... },
  })
  await this.domainEventRepository.save(followUpEvent)
  // OutboxDispatcher picks this up in next poll cycle
}
```

## Critical Rules

### Handlers Must Be Idempotent [HDL-P06, bp-02]

Events may be delivered multiple times. Handlers must handle this gracefully. **Prefer entity-level idempotency (Tell Don't Ask)** over external existence checks:

```typescript
// PREFERRED — Entity handles idempotency internally (Tell Don't Ask)
async handle(event: this['input']): Promise<void> {
  const { platform, message, chat } = event.payload

  let existingChat = await this.chatRepository.findById(new Id(chat.id))

  if (!existingChat) {
    existingChat = Chat.create({ platform })
    existingChat.id = new Id(chat.id)
  }

  // Entity method handles deduplication internally
  existingChat.addMessage({ author: message.author, content: message.content })
  // addMessage() internally checks for duplicates before adding

  await this.chatRepository.save(existingChat)
}

// ACCEPTABLE for simple create-or-skip patterns
async handle(event: this['input']): Promise<void> {
  let entity = await this.repository.findById(new Id(event.payload.entityId))
  if (!entity) {
    entity = Entity.create({ ... })
    await this.repository.save(entity)
  }
  // Already exists — idempotent, no duplicate created
}
```

### Repository Reads for Cross-Context Data

```typescript
import { CustomerRepository } from '@customer/repositories'

// Assume CustomerRepository is injected in constructor
async handle(event: this['input']): Promise<void> {
  // WRONG - pass-through use case for simple lookup
  // import { GetCustomer } from '@customer/usecases'
  // WRONG - SDK inside api
  // import { getCustomer } from '@codm/client-typescript/http'

  // CORRECT - repository read
  const customer = await this.customerRepository.findById(event.payload.customerId)
  // ...
}
```

### Output Schema Is Always void

`EventHandler` defaults `outputSchema` to `z.void()` — no declaration needed in handlers.

```typescript
async handle(event: this['input']): Promise<void> {
  // ...
  return  // Handlers don't return values
}
```

### Handler Name Convention

Name is derived automatically from `EventClass.name` — no manual declaration needed.

### Export from Correct File [HDL-04, HDL-C01, HDL-C02]

```typescript
// Internal handlers -> handlers/internal.ts
export * from './UserCreatedHandler'

// External handlers -> handlers/external.ts
export * from './OrganizationCreatedHandler'
```

## Checklist

- [ ] All `when: always` patterns present (HDL-01 through HDL-04 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (HDL-C01 through HDL-C03 — check which apply)
- [ ] No `bad_practices` violations (bp-01, bp-02 — verify against registry.yaml)
- [ ] Handler is idempotent (checks for duplicate processing)
- [ ] Exported from correct file (`internal.ts` or `external.ts`)

## Complete Example

```typescript
// auth/handlers/UserCreatedHandler.ts
import { EventHandler } from '@codm/core-typescript'
import { injectable } from 'tsyringe-neo'
import { UserCreatedEvent } from '@auth/events'
import { MailSender } from '@<ctx>/services/MailSender'
import { WelcomeEmail } from '@auth/services/MailSender'

@injectable()
export class UserCreatedHandler extends EventHandler<typeof UserCreatedEvent> {
  readonly event = UserCreatedEvent

  constructor(private readonly mailSender: MailSender) {
    super()
  }

  async handle(event: this['input']): Promise<this['output']> {
    const { user } = event.payload

    const emailTemplate = new WelcomeEmail({ userName: user.name })
    await this.mailSender.sendMail(user.email, emailTemplate)

    return
  }
}
```


## Composition Pattern — Background reaction (when X happens, do Y)

**Behavior example.** When an appointment is confirmed, send a confirmation message to the patient on WhatsApp.

**Recipe.**
- Source context (`appointment`)
  - `entity` `Appointment` — `confirm()` raises domain event `AppointmentConfirmed`
  - `event` domain `AppointmentConfirmed` (in `appointment/events/`)
  - `handler` `AppointmentConfirmedHandler` in `appointment` — publishes integration event `appointment.confirmed`
  - `event` integration `AppointmentConfirmedEvent` (in `shared/events/`)
- Reacting context (`messaging` or `channel`)
  - `handler` `SendConfirmationMessageHandler` — subscribes to `appointment.confirmed`
  - `usecase` `SendChannelMessage` — orchestrates the send
  - (optional) new `service` `MessageTemplateService` — composes the text

**Key rule.** The reacting context NEVER imports `Appointment`. It only knows the integration event's payload.

**Testing this pattern.** Cross-context behaviors are tested primarily as **flow tests** in `packages/api/tests/flows/` using `testBed.pipe(...).run()`:
1. Pipe seeds state (Appointment, Patient, Channel mock).
2. Pipe triggers the entry point (usecase or manual event).
3. Pipe asserts the chain: entity raises event → outbox → handler ran → integration event published (inspect the outbox table row).
4. Cross-service (TS → Go channel via Kafka): the TS flow only asserts the outbox publish; the consumer in Go is covered by Go's own suite.

Contract tests (assert the integration event payload's schema in isolation) are **complementary**, not substitutes. Flow validates end-to-end integration; contract validates the boundary. See `.claude/skills/test/SKILL.md` → "Flow Tests".

## References

- `packages/api/typescript/src/shared/types/Handler.ts` - Handler base class
- `packages/api/typescript/src/shared/events/` - Integration events to subscribe to
- `docs/BACKEND.md` - Architecture principles (why)
- `/event` skill - For creating events to handle
- `/usecase` skill - For calling use cases from handlers
