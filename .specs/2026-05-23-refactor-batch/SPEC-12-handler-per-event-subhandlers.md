# SPEC-12: Handler-per-event with sub-handlers + multi-event support

**Wave:** 5   **Stream:** B   **Depends on:** Wave 4 complete   **Status:** done

## Motivation

Three problems with today's handler shape:

1. **`On` prefix everywhere.** `OnOrderUpdatedExternal`, `OnPixelCheckoutCompletedLinkCart`, `OnSubscriptionCreatedPublishQuotaUpdated`. The prefix reads as overly abstracted scaffolding — like "On Event Do Thing" rather than naming the thing.

2. **Multiple handler classes in one file** with no orchestration anchor. `CampaignProductBindingPublisher.ts` has two `@injectable()` classes side-by-side (`OnCampaignProductBindingCreatedPublish` + `OnCampaignProductBindingRemovedPublish`) — neither belongs to a folder, neither knows about the other. When a third effect needs to fire on the same event, there's no obvious home.

3. **No multi-event subscription.** `EventHandler` requires exactly one `event = X`. The bk-dash `ProductCostHandler` (port target in SPEC-11) naturally subscribes to 4 events (OrderUpdated, ProductCostCreated, ProductCostDeleted, FixProductCosts). Without multi-event support, that's 4 separate classes hand-coordinating with a shared service. Ugly.

Refactor:

- Drop the `On` prefix. Handler class name = `<EventName>Handler`. For multi-event handlers, name by the dominant concern.
- For handlers with 2+ effects, use a folder layout with parent + sub-handlers.
- Extend `EventHandler` to accept `EventClass | readonly EventClass[]` so a single handler can subscribe to multiple events.
- Sub-handlers also `extends EventHandler` (or the multi-event form), but they are NOT re-exported from `handlers/internal.ts` / `handlers/external.ts` — barrel discipline keeps them out of mediator auto-registration.

## Scope

### Framework changes — `core/src/types/EventHandler.ts`

```ts
type EventClassOrArray = EventClass | readonly EventClass[]

export abstract class EventHandler<E extends EventClassOrArray> extends Handler<...> {
  abstract readonly event: E

  /** Event names this handler subscribes to. Mediator iterates this. */
  get events(): readonly string[] {
    return Array.isArray(this.event)
      ? (this.event as readonly EventClass[]).map(e => e.name)
      : [(this.event as EventClass).name]
  }

  /** @deprecated Use `events`. Returns `events[0]` for single-event handlers; throws for multi-event. */
  get name(): string {
    const ev = this.events
    if (ev.length > 1) {
      throw new Error('EventHandler.name is ambiguous for multi-event handlers; use .events')
    }
    return ev[0]!
  }

  // execute() narrows by event.name — agent decides per-handler whether to
  // expose a switch or to overload. Default: handle() receives the union.
}
```

### Mediator-side changes

`packages/api/typescript/core/src/services/Mediator/*Mediator.ts`:
- `register(handler: Handler): void` — for `EventHandler`s, iterate `handler.events` and register the same instance under each event-name key.
- `MockExternalMediator`, `EventEmitter2Mediator`, `RedisExternalMediator` — same update.

### BoundedContext registration

`BoundedContext.registerHandlers` already passes handler instances to `mediator.register(handler)`. The mediator handles the multi-event registration internally. No changes needed in `BoundedContext.ts` other than verifying the registered count logs correctly (one handler subscribing to N events still counts as 1 handler, not N).

### Sub-handler discipline (no framework change required)

The barrel-export pattern enforces the rule:

```ts
// sales/handlers/internal.ts
export { OrderUpdatedHandler } from './OrderUpdatedHandler/OrderUpdatedHandler'
// LinkCartSubHandler / NotifySubHandler stay UNEXPORTED.
```

Sub-handlers are imported directly by the parent:

```ts
// sales/handlers/OrderUpdatedHandler/OrderUpdatedHandler.ts
import { LinkCartSubHandler } from './LinkCartSubHandler'
import { NotifySubHandler } from './NotifySubHandler'

@injectable()
export class OrderUpdatedHandler extends EventHandler<typeof OrderUpdatedEvent> {
  readonly event = OrderUpdatedEvent
  constructor(
    private readonly linkCart: LinkCartSubHandler,
    private readonly notify: NotifySubHandler,
  ) { super() }
  async handle(event: this['input'], tx?: Transaction): Promise<void> {
    await this.linkCart.handle(event, tx)   // declared order = execution order
    await this.notify.handle(event, tx)
  }
}
```

Sub-handler:
```ts
@injectable()
export class LinkCartSubHandler extends EventHandler<typeof OrderUpdatedEvent> {
  readonly event = OrderUpdatedEvent  // same event, but not exported — barrel-gated.
  constructor(private readonly cartRepo: CartRepository) { super() }
  async handle(event: this['input'], tx?: Transaction): Promise<void> { /* effect */ }
}
```

### Migration of existing handlers

For every existing handler with the `On` prefix:

1. Rename file `OnXEvent.ts` → `XEventHandler.ts` (or `XEventHandler/XEventHandler.ts` if multi-effect).
2. Rename class `OnXEvent` → `XEventHandler`.
3. If the handler does 2+ effects, extract each effect into a `<Effect>SubHandler.ts` in the same folder. Parent orchestrates in declared order.
4. Update the barrel (`handlers/internal.ts` / `handlers/external.ts`) to export the new parent name only.

If a handler has exactly one effect, keep it as a flat file: `<EventName>Handler.ts`.

### Multi-event handler shape (for SPEC-11's ProductCostHandler)

```ts
@injectable()
export class ProductCostApplicationHandler extends EventHandler<
  readonly [typeof OrderUpdatedEvent, typeof ProductCostCreatedEvent, typeof ProductCostDeletedEvent]
> {
  readonly event = [OrderUpdatedEvent, ProductCostCreatedEvent, ProductCostDeletedEvent] as const
  // ... constructor with deps ...
  async handle(event: this['input'], tx?: Transaction): Promise<void> {
    switch (event.name) {
      case OrderUpdatedEvent.name:           return this.applyForOneOrder(event, tx)
      case ProductCostCreatedEvent.name:     return this.recomputeAffected(event, tx)
      case ProductCostDeletedEvent.name:     return this.recomputeAffected(event, tx)
    }
  }
}
```

(Same `event.name` narrowing limitation as Projector — explicit casts inside each branch are acceptable; see `OrderProjector.ts:25` for the existing rationale.)

## Affected files

### Framework
- `packages/api/typescript/core/src/types/EventHandler.ts` — array support + `events` getter + `name` deprecation
- `packages/api/typescript/core/src/services/Mediator/Mediator.ts` and impls — register loop over `events`
- `packages/api/typescript/core/src/types/BoundedContext.ts` — verify (likely no change)

### Existing handlers (migrations — non-exhaustive, audit during execution)
- `packages/api/typescript/src/sales/handlers/OnOrderUpdated*.ts`
- `packages/api/typescript/src/sales/handlers/OnPixelCheckoutCompletedLinkCart.ts`
- `packages/api/typescript/src/sales/handlers/OrderOverriddenPublisher.ts` — rename class `OnOrderOverriddenPublishIntegrationEvent` → `OrderOverriddenHandler`
- `packages/api/typescript/src/notifications/handlers/On*.ts`
- `packages/api/typescript/src/billing/handlers/On*Publish*.ts` — the `SubscriptionQuotaUpdatedPublisher.ts` group (4 publishers in one file)
- `packages/api/typescript/src/integration/handlers/OnIntegration*.ts`
- `packages/api/typescript/src/tenancy/handlers/StoreMemberInvitedHandler.ts` — verify shape
- Barrel files: `handlers/internal.ts`, `handlers/external.ts` in each BC
- All handler tests under `**/handlers/**/*.test.ts`

## Acceptance criteria

- [ ] `EventHandler` accepts `EventClass | readonly EventClass[]`; `events` getter works for both.
- [ ] All mediator impls register the handler under each event name when `events.length > 1`.
- [ ] `rg "class On[A-Z]" packages/api/typescript/src --type ts` returns zero matches.
- [ ] No multi-class-per-file handler modules (search: `@injectable()` declared more than once in a single `handlers/` file).
- [ ] `handlers/internal.ts` and `handlers/external.ts` in every BC export ONLY parent classes (sub-handlers not re-exported).
- [ ] Multi-effect handlers live in folders with parent + sub-handler files.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- SPEC-24 (split CampaignProductBindingPublisher) — uses the pattern, separate spec.
- Changing the in-process mediator vs outbox dispatch model — this spec only changes the handler shape.
- Adding new handlers — only existing ones get migrated.

## Notes

- For sub-handlers, the rule is "extends EventHandler, NOT exported from barrel." If a sub-handler is accidentally exported, the mediator registers it as a duplicate — same effect runs twice, not a crash. The review checklist should verify barrel exports.
- Sub-handlers might subscribe to a subset of the parent's events when the parent is multi-event. Parent's dispatch in `handle()` decides which sub-handler runs per branch.
- For single-effect single-event handlers (the majority), the migration is just a rename. Trivial.
- The `name` getter throwing for multi-event is a design choice — if any existing framework call relies on `handler.name`, it needs to switch to iterating `handler.events`. Audit during execution; the call sites are mostly inside the mediator impls.
- Memory rule: handler-per-event-name, sub-handlers under folder, barrel exports parents only.
