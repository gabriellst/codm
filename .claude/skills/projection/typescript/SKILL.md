---
name: projection
description: "Create a read-side projection — a free record class that materializes a domain view for a specific UI/query need. Schema-driven, no base class, no invariants. Pairs with a Projector that drives it from events via the canonical find → applyEvent → save flow."
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding.
> 2. **`bad_practices`** — keep these violations in mind throughout implementation.

> Canonical shape: see `snippet.skeleton` (projection class) and `snippet.skeletons.repository` (projection repository) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

# Create a Projection

A Projection is a **free record** — a flat, schema-driven class that materializes a denormalized view of one or more aggregates. **No base class** (no `BaseEntity`, no `AggregateRoot`), **no invariants**, **no domain events raised**. Projections are malleable read models, not entities.

## Why Projections Exist

CQRS in this project is **logical**, not physical — the same Postgres database holds both write-side aggregates and read-side projections. The split is at the type-system level: separate types, separate repositories, separate responsibilities. Aggregates enforce invariants on write; projections materialize fast reads.

A field belongs on the aggregate **only if a business rule reads it**. Otherwise it's projection-only. Counters, denormalised joins, last-event timestamps, derived ranks, cached external fields — those go on the projection.

## Modelling Decision Framework (mandatory reading before coding)

### Step 1 — Do you need a projection at all?

If your read need is satisfied by a **single Drizzle query against existing aggregate tables**, you don't need a projection. Write a query use case in `ui/usecases/` and return the joined shape directly.

Add a projection only when:
- The read shape is a **denormalisation** or aggregation that's expensive to compute on the fly.
- A **cross-service** consumer needs to read fields owned by another service (you mirror them locally).
- The read shape has **derived columns** (counters, ranks, last-of-X) updated by events from many aggregates.

### Step 2 — Where does it live?

| Scope | Home | Why |
|---|---|---|
| Single context, own aggregates | `<ctx>/projections/<Name>.ts` | Read shape derived from the context's own events. |
| Single context, intra-context cross-aggregate (e.g. `RemoteProjection` reacts to message events in `channel`) | Same as above. Allowed — both aggregates share the same `InternalMediator`. | Acceptable coupling within a context. |
| **Cross-context cross-aggregate** (read shape spans multiple bounded contexts) | **`ui/projections/<Name>.ts`** | The BFF (`ui`) is the architectural place where cross-context coupling is allowed. Domain contexts must NOT listen to events from other contexts. |

### Step 3 — Which archetype?

Every "thing" with identity sits on three axes:

1. **Identity + mutable state?** No → no projection (archetype D or nothing).
2. **Do other contexts care about each change?** No → archetype A. Yes → archetype B or C.
3. **State evolves or accumulates?** Evolves → A or B. Accumulates → C.

| Archetype | Shape | Has Projection | Has Projector | Emits events |
|---|---|---|---|---|
| **A — Pure projection** | Cached mirror only one feature reads (geo cache, emoji pack). | Yes | No | Never |
| **B1 — Cache-mirror** | Local mirror of an external system (e.g. WhatsApp contact name, avatar). | Yes | No (per-row) | One summary event per sync batch (`xs_synced`) |
| **B2 — Fact-emit** | We own the truth; consumers care about each change. | Yes | Yes | One event per real diff |
| **C — Event-primary** | Accumulating facts (messages, receipts, audit-log-like). | Yes | Yes | One event per fact |
| **D — Pure stream** | Ephemeral signals (typing, presence, QR scan). | **No** | — | Fires; nothing persists |

> Full archetype playbook: [`.specs/2026-04-17-event-sourcing-modeling-playbook.md`](../../../.specs/2026-04-17-event-sourcing-modeling-playbook.md).

### Step 4 — Pick the level of denormalization

A Projection always denormalizes — that's its reason to exist. But **how much** is a slider, not a binary.

| Level | Shape | Read cost | Flexibility | When |
|---|---|---|---|---|
| **Full denormalization** | Every field the view needs lives on the projection. Zero joins at read time. | `SELECT * FROM projection WHERE …` | **Low** — serves exactly one view shape. | Hot read path, single dominant view, latency-sensitive (UI lists, sidebars, real-time feeds). |
| **Partial denormalization** | Projection carries heavy-lifted fields; read query joins 1–2 related tables for context-specific extras. | One projection + small joins | **Medium** — backs a family of related views; each adds a few fields. | Most BFF use cases. |
| **Minimal denormalization (normalized projection)** | Mostly a fast access pattern (proper indexes, optimized cursor columns) over data that mostly lives elsewhere. | Multiple joins at read time | **High** — many different views can read it. | Exploratory / analytical reads, cross-context queries, views that change often, low traffic. |

#### The trade-off, stated bluntly

```
Full denorm    ←——————————————————————————————————————→    Normalized
   ▲  Fastest read              Most flexible (one projection ▼
   |  Worst flexibility         serves many views)              |
   ▲  Highest storage cost      Lowest storage cost             ▼
   |  Highest write fan-out     Lowest write fan-out            |
   ▲  Hardest to maintain       Easiest to maintain             ▼
   |  (many projector branches)  (few projector branches)         |
```

#### Decision factors

1. **How many distinct UI/query views read it?** One → push toward full denorm. Many → push toward normalized.
2. **How often is it read vs. written?** Read-heavy → denorm pays for itself. Write-heavy with few reads → normalize.
3. **Latency budget?** Sub-100ms BFF → denorm. Admin tool / dashboard → normalize.
4. **View stability?** Stable for 12+ months → denorm safely. Likely to change every UX iteration → normalize so changes don't trigger backfills.
5. **Source-of-truth churn?** Rare-change fields (id, name, type) → cheap to denorm. Hot fields (last_message_at, unread_count) → plan atomic-op strategy.
6. **Cross-context joins?** Yes → favor partial/full denorm in the BFF projection so cross-context joins happen at write time.

#### Heuristics

- **Start denormalized; reduce later** if it becomes a maintenance burden. Denorm → normalized is a refactor; normalized → denorm under load is a migration emergency.
- **One projection per dominant view shape**. Two views diverge too much? Two projections.
- **Shared columns across multiple projections are a smell** — consider a smaller core projection both read from.
- **Atomic-op coverage is the cost of denorm** — every denormalized hot field needs its atomic op story.
- **Don't denorm "for someday"** — every column has a projector cost forever.

#### Examples on the current channel projection

| Projection | Level | Why |
|---|---|---|
| `channel_remotes` (sidebar list) | **Full denorm** — name, avatar, unread count, last message time, pinned state, mute state. | Sidebar is the hottest read path; one query renders the whole list. |
| `channel_messages` (chat history) | **Partial denorm** — content + denormalized `direction` + receipt timestamps, joins for sender display. | Chat view reads paginated messages; joining once per page render is cheap. |
| Hypothetical `appointment_calendar` | **Full denorm** for calendar UI (date, time, patient name, doctor name, status all on one row). | Calendar reads are very frequent; join surface is wide. |

## Citizen Definition

A Projection has four pieces, declared in one file (`<ctx>/projections/<Name>.ts` for own-context projections, `ui/projections/<Name>.ts` for cross-context ones):

1. **A Zod schema** — flat, no `.transform()`, no nested VO wrapping. Defines the row shape.
2. **A `Props` type** inferred from the schema via `z.infer<typeof Schema>`.
3. **An exported `<Name>ProjectionEvent` union type** — every event the projection reacts to. Used by the Projector's generic. The Projection is the **single source of truth**.
4. **A free record class** — plain class, `constructor(public props: <Name>ProjectionProps)`. No base class. Adds **method-overloaded** `static create(event)` (one signature per creating event) and instance `applyEvent(event)` (one signature per mutating event).

### Method overloading: why and how

TS method overloading lets callers see N narrow signatures while the class has one implementation. Each `static create(event)` overload says "this specific event class is accepted"; the implementation switches on `event.name` and constructs accordingly.

```ts
static create(event: MessageReceivedEvent): MessageProjection
static create(event: MessageSentEvent): MessageProjection
static create(event: MessageReceivedEvent | MessageSentEvent): MessageProjection {
  switch (event.name) {
    case 'channel.message_received': return new MessageProjection({ ... })
    case 'channel.message_sent':     return new MessageProjection({ ... })
  }
}
```

- Callers get precise type narrowing per call: `MessageProjection.create(messageEditedEvent)` fails compilation because no overload accepts it.
- The class doesn't carry N near-identical `fromMessageReceived` / `fromMessageSent` methods.
- Adding a new creating event = one more overload + one more case.

Same pattern for `applyEvent(event)` per mutating event.

### Canonical flow (mandatory mental model)

The **canonical** flow for any projection event is one of two:

| Event role | Projector calls |
|---|---|
| **Creates the row** (semantic creation events — e.g. `MessageReceived`, `MessageSent`) | `repo.insertIfNew(Projection.create(event), tx)` |
| **Mutates an existing row** | `find → projection.applyEvent(event) → save` |

That's it. Two flows. Both go through the Projection's overloaded methods.

**Atomic ops on the repo are edge cases**, not the default. See "Repository Methods" below for when each kind of atomic op is justified.

## Repository methods (pair this Projection ships with)

The companion `<Name>ProjectionRepository.ts` exposes three canonical methods plus any atomic ops the workload justifies:

### Canonical (mandatory)

| Method | Purpose |
|---|---|
| `findByKey(key, tx?): Promise<<Name>Projection \| null>` (or named `findBy<NaturalKey>`) | Read half of `find → applyEvent → save`. |
| `save(projection, tx?): Promise<void>` | Write half. Upsert by natural key. |
| `insertIfNew(projection, tx?): Promise<boolean>` | Replay-safe creation. `ON CONFLICT DO NOTHING`. |

### Atomic ops (only when justified)

Add an atomic method **only** when one of the canonical-flow triggers fails:

| Trigger | Example | Why canonical fails |
|---|---|---|
| Hot row contention | `incrementUnreadCount(channelId, remoteId, +1)` | Read-modify-write loses races under concurrency. |
| Bulk operation | `markDeliveredMany(messageIds, at)` | N find/apply/save round-trips is N+1. |
| Monotonic update | `setIfGreaterLastMessageAt(channelId, remoteId, at)` | Out-of-order delivery overwrites newer with older. |
| Conditional update | `recomputePreviewIfLatest(channelId, remoteId, deletedMessageId)` | App-code read-then-decide-then-write is racy. |
| Cache-mirror bulk upsert (archetype A / B1) | `upsertMany(rows)` | ACL syncs hundreds of rows at once. |

The atomic vocabulary is an **optimisation toolbox**, not the default API. Each atomic method should carry a comment justifying which trigger it solves.

## When NOT to Use This Skill

- **One Drizzle query against aggregate tables would do it** — write a query use case in `ui/usecases/`, no projection.
- **The data is ephemeral** (typing, presence, QR codes) — archetype D, no projection.
- **You're tempted to validate something on the projection** — invariants belong on the aggregate.

## Prerequisites

- Context exists (use `/bounded-context` first).
- Domain events the projection reacts to exist (use `/event`).
- For Path A: the migration adding the projection's columns is planned (use `/db-modelling` then `/migrate`).

## Key Principles

1. **Schema-driven, no base class.** Zod schema → `z.infer` → plain class with `constructor(public props: Props)`. No `BaseEntity`, no `AggregateRoot`, no marker base.
2. **No invariants.** Projections never validate; they materialize. Rules live on the aggregate.
3. **Method overloading for `create` and `applyEvent`.** One method per concern, N signatures, one implementation that switches on `event.name`.
4. **Canonical = `find → applyEvent → save`.** Atomic ops are edge cases for hot rows, bulk, monotonic, conditional, cache-mirror.
5. **The Projection exports its event union.** Single source of truth for "what events affect me".
6. **Cross-context projections live in `ui` (BFF).** Domain contexts only host projections for their own aggregates.
7. **No DI on the projection itself.** Plain class, no `@injectable()`. The repository is `@injectable()`; the projection is constructed by it.

## Process

### Step 0 — Scaffold (optional but recommended)

The CLI emits both files in one shot:

```bash
bun cli projection <context> <Name>           # writes the files
bun cli projection <context> <Name> --print   # prints to stdout (review first)
```

It produces:
- `packages/api/typescript/src/<context>/projections/<Name>.ts` — class with TODO comments for the event union, `static create(event)` overloads, and `applyEvent(event)` overloads.
- `packages/api/typescript/src/<context>/projections/<Name>ProjectionRepository.ts` — abstract + Drizzle impl + Mock impl with `findByKey` / `save` / `insertIfNew` stubs.

After scaffolding, follow steps 1–7 below to fill in the domain-specific content.

### Step 1 — Modelling decisions

Before code:
1. Do I need a projection at all? Where does it live (domain context vs `ui`)?
2. Which archetype?
3. Which level of denormalization?
4. Which events create rows? Which mutate via canonical `find → applyEvent → save`? Which justify atomic ops (state the trigger explicitly)?

### Step 2 — Define the schema

```ts
// packages/api/typescript/src/<ctx>/projections/<Name>.ts  (or ui/projections/<Name>.ts)
import { z } from '@template/core-typescript'

export const MessageProjectionSchema = z.object({
  channelId: z.string(),
  remoteId: z.string(),
  platformMessageId: z.string(),
  direction: z.enum(Direction),
  content: MessageContentSchema,
  occurredAt: z.date(),
  observedAt: z.date(),
  deliveredAt: z.date().nullable(),
  seenAt: z.date().nullable(),
  editedAt: z.date().nullable(),
  deletedAt: z.date().nullable(),
})

export type MessageProjectionProps = z.infer<typeof MessageProjectionSchema>
```

### Step 3 — Event union (single source of truth)

```ts
import type {
  MessageReceivedEvent, MessageSentEvent,
  MessageEditedEvent, MessageDeletedEvent,
  MessageDeliveredEvent, MessageSeenEvent,
} from '@channel/events'

export type MessageProjectionEvent =
  | MessageReceivedEvent
  | MessageSentEvent
  | MessageEditedEvent
  | MessageDeletedEvent
  | MessageDeliveredEvent
  | MessageSeenEvent
```

### Step 4 — Write the class

```ts
export class MessageProjection {
  constructor(public props: MessageProjectionProps) {}

  // ── Creation: typed overloads, one signature per creating event ──────
  static create(event: MessageReceivedEvent): MessageProjection
  static create(event: MessageSentEvent): MessageProjection
  static create(event: MessageReceivedEvent | MessageSentEvent): MessageProjection {
    switch (event.name) {
      case 'channel.message_received':
        return new MessageProjection({
          channelId: event.payload.channelId,
          remoteId: event.payload.remoteId,
          platformMessageId: event.payload.messageId,
          direction: Direction.RECEIVED,
          content: event.payload.content,
          occurredAt: event.payload.occurredAt,
          observedAt: event.payload.observedAt,
          deliveredAt: null,
          seenAt: null,
          editedAt: null,
          deletedAt: null,
        })
      case 'channel.message_sent':
        return new MessageProjection({
          channelId: event.payload.channelId,
          remoteId: event.payload.remoteId,
          platformMessageId: event.payload.messageId,
          direction: Direction.SENT,
          content: event.payload.content,
          occurredAt: event.payload.occurredAt,
          observedAt: event.payload.observedAt,
          deliveredAt: null,
          seenAt: null,
          editedAt: null,
          deletedAt: null,
        })
    }
  }

  // ── Mutation: typed overloads, one signature per mutating event ──────
  applyEvent(event: MessageEditedEvent): void
  applyEvent(event: MessageDeletedEvent): void
  applyEvent(event: MessageEditedEvent | MessageDeletedEvent): void {
    switch (event.name) {
      case 'channel.message_edited':
        this.props.content = event.payload.content
        this.props.editedAt = event.payload.editedAt
        return
      case 'channel.message_deleted':
        this.props.deletedAt = event.payload.at
        return
    }
  }
}
```

### Step 5 — Pair with `<Name>ProjectionRepository.ts`

Three canonical methods + any atomic ops the workload justifies. See "Repository methods" above.

### Step 6 — Register in `<ctx>/registry.ts`

```ts
import { type InstanceRegistry, expandBindings } from '@template/core-typescript'
import { MessageProjectionRepository, DrizzleMessageProjectionRepository, MockMessageProjectionRepository } from './projections/MessageProjectionRepository'

// One declaration per token — `integration` omitted mirrors `real`.
export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
  { token: MessageProjectionRepository, mock: MockMessageProjectionRepository, real: DrizzleMessageProjectionRepository },
])
```

### Step 7 — Write a Projector for it

See `/projector` skill.

## Testing

| Test | Mode | What it covers |
|---|---|---|
| Projection class unit test | none | Direct instantiation. Call each `create(event)` overload and assert resulting `props`. Call `applyEvent(event)` for each mutating event and assert state transitions. No I/O. |
| `Drizzle<Name>ProjectionRepository.test.ts` | `integration` | Canonical methods + atomic ops. Concurrency on atomic ops (two parallel `incrementX` end at +2; `insertIfNew` idempotent; `setIfGreater` rejects regressions). |
| Projector test | `integration` | Feed each event in `events` and assert projection row state. See `/projector`. |

## Smell tests (signs you're modelling wrong)

| Symptom | What it usually means | Fix |
|---|---|---|
| Event named `x_synced` | Missing a Projection — using event-name as dedup. | Replace with `_created` / `_updated` / `_deleted` per diff + optional summary `xs_synced` for UI invalidation. |
| Empty diffs firing events | Missing ACL diff step. | Add a diff check before emitting (B2 archetype rule). |
| Projection and event log disagreeing | Mutating projection outside the projector. | Enforce "event → projection, never reverse". |
| Consumers filtering by event name when they should filter by a field | Over-split events. | Collapse. |
| Consumers filtering by a field when they should filter by event name | Under-split events. | Separate. |
| Projector has `find → mutate → save` for a column-set update where one of the atomic triggers applies | Missing atomic op. | Add the atomic method to the repo with a comment naming the trigger. |
| Projector subscribing to events from another bounded context (cross-context) | Coupling across contexts. | Move the projection to `ui/projections/`. |

## Known gaps (forward-compat assumed)

- **No projection rebuild / replay mechanism yet.** Schema changes that need backfill are handled ad hoc.
- **No event versioning / upcasters.** Forward compatibility assumed on payloads. Breaking event changes need explicit migration plan.

Both are deferred to future passes; see `.specs/2026-05-13-projection-first-class-citizen-design.md` §6d.

## References

- [`.specs/2026-05-13-projection-first-class-citizen-design.md`](../../../.specs/2026-05-13-projection-first-class-citizen-design.md) — Source spec.
- [`.specs/2026-04-17-event-sourcing-modeling-playbook.md`](../../../.specs/2026-04-17-event-sourcing-modeling-playbook.md) — Full archetype framework.
- [`.specs/2026-04-17-aggregate-projection-architecture.md`](../../../.specs/2026-04-17-aggregate-projection-architecture.md) — Channel applied case.
- `/projector` — the reactive primitive that drives a Projection from events.
- `/repository` — pattern for the `ProjectionRepository` (canonical methods + atomic-op edge cases).
- `/event` — the events the Projection reacts to.
