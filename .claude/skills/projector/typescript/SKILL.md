---
name: projector
description: "Create a Projector — the read-side counterpart of EventHandler. One per Projection. Subscribes to a union of events and dispatches via a plain switch (event.name). Async via outbox by default; opt-in inline within a use case for read-after-write. Canonical mutation flow is find → applyEvent → save."
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding.
> 2. **`bad_practices`** — keep these violations in mind throughout implementation.

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

# Create a Projector

A Projector is the **read-side counterpart of `EventHandler`**. Where an EventHandler reacts to domain events with write-side effects (calling use cases, publishing integration events), a Projector reacts to events by writing to a single Projection via its `ProjectionRepository`. **Async via outbox by default; opt-in inline** when the same request needs read-after-write consistency.

## Why Projectors Exist

The Projection citizen materializes a read-model row. The Projector is the **mechanism** that keeps that row fresh as events flow through the system. Without a Projector, the projection table is dead storage.

A Projector is a sibling citizen to the EventHandler, not a subtype:

| | Internal Handler | Projector |
|---|---|---|
| Folder | `<ctx>/handlers/internal.ts` | `<ctx>/projections/projectors/<Name>Projector.ts` |
| Writes | Aggregates (via use cases) **or** integration events | Projection tables only |
| Dependencies | Use cases, `ExternalMediator`, other repositories | One `ProjectionRepository` |
| Publishes integration events | **Yes** — the only place | **No** |
| Calls use cases | **Yes** | **No** |
| Default dispatch | Async via outbox | Async via outbox |
| Inline (sync) option | N/A | **Yes** — opt-in when a use case needs read-after-write |
| Failure semantics | Outbox row stays unprocessed; retried | Same (async path) — or transaction rolls back (inline path) |

## When to Use This Skill

- A Projection exists and needs to react to events to stay fresh.
- A cross-aggregate event needs to update a denormalized column (intra-context only — cross-context goes to `ui`).

## When NOT to Use This Skill

- The side effect is on the write side (call a use case, publish an integration event) — use `/handler` instead.
- The event has no projection to update — projectors only write to projections.
- The read need is satisfied by a query against aggregate tables — no projection, no projector.

## Prerequisites

- The Projection it serves must exist (use `/projection` first).
- The `ProjectionRepository` it uses must exist (same file pair as the projection) with the canonical methods.
- The events it subscribes to must exist (use `/event`).

## Key Principles

1. **One Projector per Projection.** Don't fan out one projector per event.
2. **The Projection owns its event union.** The Projector imports `<Name>ProjectionEvent` from the projection file and uses it as its generic. No duplicate union.
3. **Plain `switch (event.name)`.** No `ProjectorHandlers`, no mapped types, no record dispatch. TS narrows per case; `default: never` enforces exhaustiveness.
4. **Canonical mutation: `find → projection.applyEvent(event) → save`.** The Projection owns the transition logic. Atomic ops on the repo are **edge cases** for hot rows, bulk operations, monotonic, conditional, or cache-mirror.
5. **Creation: `repo.insertIfNew(Projection.create(event), tx)`.** `Projection.create` is overloaded per creating event; the projector just hands it the event.
6. **Async outbox is the default.** A use case wanting read-after-write may opt into inline by calling `projector.handle(event, tx)` inside its `UnitOfWork`. Documented; not the default.
7. **Single dependency.** The Projector's constructor takes one thing: its `ProjectionRepository`. No `ExternalMediator`, no use cases, no other projectors.

## The Three Call Sites per Event

For each event in the projection's union, the Projector picks one:

| Path | Shape | When |
|---|---|---|
| **Creation** | `repo.insertIfNew(Projection.create(event), tx)` | The event semantically creates the row. `Projection.create` is overloaded; pass the event directly. |
| **A — Read-modify-write (CANONICAL)** | `const m = await repo.findByKey(...); if (!m) return; m.applyEvent(event); await repo.save(m, tx)` | **Default for every mutating event.** The Projection owns the transition logic via `applyEvent`. |
| **B — Atomic repo op (edge case)** | `repo.atomicOp(key, …)` | One of these triggers applies: **hot-row contention** (concurrent writes), **bulk operation** (one event mutates N rows), **monotonic constraint** (`setIfGreater`), **conditional update** (needs SQL atomicity), or **cache-mirror upsert** (archetype A/B1). Each atomic method in the repo carries a comment justifying which trigger. |

## The Primitive

```ts
// packages/api/typescript/src/shared/types/Projector.ts
export abstract class Projector<E extends DomainEvent = DomainEvent> {
  /** Event names this projector listens to. Used by BoundedContext.create to register on InternalMediator. */
  abstract readonly events: readonly string[]

  /** Entry point. Implementations switch on event.name. */
  abstract handle(event: E, tx?: Transaction): Promise<void>
}
```

That's the whole base. Two abstract members, no dispatch shape prescribed.

## Canonical Implementation

```ts
// packages/api/typescript/src/channel/projections/projectors/MessageProjector.ts
import { injectable } from 'tsyringe-neo'
import type { Transaction, Projector } from '@codm/core-typescript'
import { MessageProjection, type MessageProjectionEvent } from '@channel/projections/Message'
import { MessageProjectionRepository } from '@channel/projections/MessageProjectionRepository'

@injectable()
export class MessageProjector extends Projector<MessageProjectionEvent> {
  constructor(private repo: MessageProjectionRepository) { super() }

  readonly events = [
    'channel.message_received',
    'channel.message_sent',
    'channel.message_edited',
    'channel.message_deleted',
    'channel.message_delivered',
    'channel.message_seen',
  ]

  async handle(event: MessageProjectionEvent, tx?: Transaction): Promise<void> {
    switch (event.name) {
      // Creation — Projection.create is overloaded; the right shape is chosen per event.
      case 'channel.message_received':
      case 'channel.message_sent':
        await this.repo.insertIfNew(MessageProjection.create(event), tx)
        return

      // Canonical mutation — find → applyEvent → save.
      case 'channel.message_edited':
      case 'channel.message_deleted': {
        const msg = await this.repo.findByPlatformId(event.payload.channelId, event.payload.messageId, tx)
        if (!msg) return  // replay-safe no-op
        msg.applyEvent(event)
        await this.repo.save(msg, tx)
        return
      }

      // Edge case: bulk atomic op.
      // Justification: each event carries up to ~20 message IDs.
      // Canonical find/apply/save would be N+1 round trips per receipt event.
      case 'channel.message_delivered':
        await this.repo.markDeliveredMany(event.payload.messageIds, event.payload.at, tx)
        return
      case 'channel.message_seen':
        await this.repo.markSeenMany(event.payload.messageIds, event.payload.at, tx)
        return

      default: {
        const _exhaustive: never = event
        return _exhaustive
      }
    }
  }
}
```

## Async vs Inline

### Async (default) — registered on the outbox

```ts
// <ctx>/index.ts
import * as projectors from './projections/projectors'

const ctx = await BoundedContext.create({
  name: 'channel',
  controllers,
  middlewares,
  internalHandlers,
  externalHandlers,
  projectors,  // ← projectors slot — registered on InternalMediator, dispatched by OutboxDispatcher
})
```

The OutboxDispatcher iterates each projector's `events` array, registers `projector.handle(event, tx)` against `InternalMediator`, and dispatches whenever an outbox row matches. One outbox row → all matching subscribers (handlers + projectors) for that event name run in their own transactions.

### Inline (opt-in) — invoked from a use case's `UnitOfWork`

When a use case must see the projection update in the same request, it takes the projector as a dependency and calls `projector.handle(event, tx)` inside its own transaction:

```ts
@injectable()
export class ConfirmAppointment {
  constructor(
    private appointmentRepository: AppointmentRepository,
    private domainEventRepository: DomainEventRepository,
    private patientProjector: PatientProjector,  // ← inline dependency
    private unitOfWorkFactory: UnitOfWorkFactory,
  ) {}

  async execute(input: { appointmentId: string }): Promise<void> {
    const uow = this.unitOfWorkFactory.create()
    await uow.transaction(async tx => {
      const appointment = await this.appointmentRepository.findById(new Id(input.appointmentId), tx)
      // ...
      appointment.confirm()
      await this.appointmentRepository.save(appointment, tx)
      const event = appointment.pullDomainEvent(AppointmentConfirmedEvent)
      await this.domainEventRepository.save(event, tx)

      // Inline projection — same transaction, read-after-write guaranteed.
      // Trade-off: this use case is coupled to PatientProjector. Use only
      // when the next read in this request MUST see the projection update.
      await this.patientProjector.handle(event, tx)
    })
  }
}
```

The same event also still flows through the outbox, so the Projector runs **twice** for the same event execution:
1. Synchronously in the use case's transaction.
2. Asynchronously, when the OutboxDispatcher gets to the row.

Idempotency guarantees this is safe:
- Creation goes through `insertIfNew` (ON CONFLICT DO NOTHING).
- `find → applyEvent → save` writes the same final state.
- Atomic ops are themselves idempotent or monotonic by construction.

**Decision rule:** if the response payload depends on a projection-backed read that must reflect this request's write, use inline. Otherwise (the vast majority) use async + frontend cache invalidation.

## Cross-Aggregate Projectors

A Projector for projection `X` MAY subscribe to events from aggregate `Y` **if `Y` lives in the same context**. Example: `RemoteProjector` listens to `MessageReceived` because it updates `Remote.unreadMessageCount` / `lastMessageAt`. The Projector imports the event class; it never imports `Y`'s entity or repository.

**Cross-context** projections — where the read shape spans aggregates from multiple bounded contexts — do **not** live in either context. They belong in `ui/projections/<Name>.ts` with their projector in `ui/projections/projectors/`. The BFF (`ui`) is the architectural place where cross-context coupling is allowed.

```
Cross-aggregate scope     | Coupling                                  | Projector lives in
--------------------------+-------------------------------------------+--------------------
Same context              | Intra-context InternalMediator. OK.       | <ctx>/projections/projectors/
Different contexts        | Cross-context. NOT OK in domain contexts. | ui/projections/projectors/
Different services        | Integration events via Kafka.             | Either, depending on consumer
```

## Process

### Step 0 — Scaffold (optional but recommended)

```bash
bun cli projector <context> <Name>           # writes the file
bun cli projector <context> <Name> --print   # prints to stdout (review first)
```

It produces:
- `packages/api/typescript/src/<context>/projections/projectors/<Name>Projector.ts` — `Projector<<Name>ProjectionEvent>` skeleton with `events = []`, `handle(event, tx?)` containing a `switch (event.name)` with commented case-stubs for Creation / Path A / Path B, and a `default: never` exhaustiveness branch.

Prereq: the Projection + ProjectionRepository must already exist. If not yet scaffolded, run `bun cli projection <context> <Name>` first.

For cross-context (BFF) projectors, scaffold in `ui` instead: `bun cli projector ui <Name>`.

After scaffolding, follow steps 1–6 below to fill in the dispatch logic.

### Step 1 — Confirm the Projection exists

Open `<ctx>/projections/<Name>.ts` (or `ui/projections/<Name>.ts` for cross-context). The file must export:

- `<Name>Projection` class with overloaded `static create(event)` and overloaded `applyEvent(event)`.
- `<Name>ProjectionEvent` type — the full union of events the projector subscribes to.

If either is missing, run `/projection` first.

### Step 2 — Confirm the `ProjectionRepository` has the canonical methods + any atomic ops you need

Required: `findByKey` (or named finder) + `save` + `insertIfNew`. Optional: atomic ops per justified trigger. See `/projection` "Repository methods".

### Step 3 — Decide path per event

For every event in `<Name>ProjectionEvent`, pick Creation / canonical Path A / atomic Path B. **Canonical Path A is the default.** Only pick Path B if a trigger applies.

### Step 4 — Write the Projector

```ts
// packages/api/typescript/src/<ctx>/projections/projectors/<Name>Projector.ts  (or ui/...)
import { injectable } from 'tsyringe-neo'
import type { Transaction, Projector } from '@codm/core-typescript'
import { <Name>Projection, type <Name>ProjectionEvent } from '../<Name>'
import { <Name>ProjectionRepository } from '../<Name>ProjectionRepository'

@injectable()
export class <Name>Projector extends Projector<<Name>ProjectionEvent> {
  constructor(private repo: <Name>ProjectionRepository) { super() }

  readonly events = [
    /* list every event.name handled below */
  ]

  async handle(event: <Name>ProjectionEvent, tx?: Transaction): Promise<void> {
    switch (event.name) {
      // case 'context.creating_event':
      //   await this.repo.insertIfNew(<Name>Projection.create(event), tx)
      //   return

      // case 'context.mutating_event': {
      //   const row = await this.repo.findByKey(/* … */, tx)
      //   if (!row) return
      //   row.applyEvent(event)
      //   await this.repo.save(row, tx)
      //   return
      // }

      // case 'context.atomic_event':  // justify the trigger in a comment
      //   await this.repo.atomicOp(/* … */, tx)
      //   return

      default: {
        const _exhaustive: never = event
        return _exhaustive
      }
    }
  }
}
```

### Step 5 — Export through the barrel

```ts
// packages/api/typescript/src/<ctx>/projections/projectors/index.ts
export * from './<Name>Projector'
```

### Step 6 — Wire into the BoundedContext

In `<ctx>/index.ts`, ensure `projectors` is passed to `BoundedContext.create({...})`.

### Step 7 — (Only if needed) Wire as an inline dependency in a specific use case

If a use case needs read-after-write, inject the projector and call `projector.handle(event, tx)` inside its `UnitOfWork`. Document the reason in a comment.

## Testing

| Test | Mode | What it covers |
|---|---|---|
| Projector integration test | `integration` | For each `case` in `handle`, dispatch the event and assert projection row state. Cover replay-safety (running twice produces the same final state). |

```ts
// packages/api/typescript/src/<ctx>/projections/projectors/<Name>Projector.test.ts
describe('<Name>Projector', () => {
  let testBed: TestBed
  let repo: <Name>ProjectionRepository
  let projector: <Name>Projector

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer, ownerId: 'projector-test' })
    repo = testContainer.resolve(<Name>ProjectionRepository)
    projector = testContainer.resolve(<Name>Projector)
  })
  beforeEach(async () => { await testBed.reset() })
  afterAll(async () => { await testBed.destroy() })

  it('inserts on <EventName>', async () => {
    const event = new <EventName>({ /* payload */ })
    await projector.handle(event)
    const row = await repo.findByKey(/* … */)
    expect(row?.props).toMatchObject({ /* expected */ })
  })

  it('is replay-safe', async () => {
    const event = new <EventName>({ /* payload */ })
    await projector.handle(event)
    await projector.handle(event)  // second time
    const rows = await repo.listAllForOwner('projector-test')
    expect(rows).toHaveLength(1)
  })
})
```

## References

- [`.specs/2026-05-13-projection-first-class-citizen-design.md`](../../../.specs/2026-05-13-projection-first-class-citizen-design.md) — Source spec.
- `/projection` — the read-model record the projector writes to (overloaded `create` + `applyEvent`).
- `/event` — the events the projector subscribes to.
- `/handler` — the write-side sibling citizen.
- `/repository` — pattern for `ProjectionRepository` (canonical methods + edge-case atomic ops).
