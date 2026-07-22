---

> **ONE projector per projection — never one per event.** The sibling sync HANDLERS are
> one-per-event; projectors are NOT handlers. A projector is the single event-driven
> writer of its projection: one struct, subscribing to EVERY event that mutates the read
> model, dispatching internally. Splitting per event scatters the read-model's transition
> logic and breaks the find → ApplyEvent → save cohesion (measured: go-projector iter1-3
> all split under sibling-handler gravity). Cross-language parity: the TS canon states
> "uma classe por Projection, escuta múltiplos eventos".
name: projector-go
description: "Create a Projector in Go — the read-side handler that keeps a Projection fresh. One concrete struct per event subscription. Canonical mutation flow is find → projection.ApplyX(event) → save. Async via the mediator by default."
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional before coding.
> 2. **`bad_practices`** — keep these violations in mind throughout implementation.

# Create a Projector (Go)

A Projector is the **mechanism that keeps a Projection fresh as events flow through the system**. It subscribes to one event name, unmarshals the event, and calls the appropriate `ApplyX` method on the projection struct, then saves. No base class; no generic supertype beyond the interface expected by the mediator.

The lang-agnostic philosophy (why projectors exist, when vs. EventHandler, inline vs. async) lives in [`../SKILL.md`](../SKILL.md). This playbook covers **Go idioms only**.

## Shape

In Go there is no generic `Projector[E]` supertype. Each projector is a **concrete struct** that implements the mediator's handler interface:

```go
// mediator.DomainEventHandler (for internal domain events)
type DomainEventHandler interface {
    EventName() string
    Handle(ctx context.Context, event types.DomainEventI) error
}

// mediator.IntegrationEventHandler (for cross-service integration events)
type IntegrationEventHandler interface {
    EventName() string
    Handle(ctx context.Context, event types.IntegrationEventI) error
}
```

A projector struct:
- Has **one field**: its `ProjectionRepository`.
- Implements `EventName() string` returning the event name constant.
- Implements `Handle(ctx, event) error` that unmarshals the event and calls the projection method.
- Is registered with the mediator inside the bounded context's fx module.

One concrete projector struct per event name is the idiomatic Go approach (rather than a single struct with a giant switch). Group closely related projectors in the same file with a clear section header.

## Canonical Mutation Flow

For mutating events (edit, delete, soft-delete, receipt acknowledgement):

```
repo.FindByKey(ctx, key)
  → if nil, log.Warn and return nil (missing row is non-fatal)
  → projection.ApplyX(eventData)
  → repo.Save(ctx, projection)
```

```go
func (p *MessageEditedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
    e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageEditedPayload](event)
    if err != nil {
        return err
    }
    pl := e.Payload
    row, err := p.repo.FindByPlatformID(ctx, pl.ChannelID.String(), pl.MessageID)
    if err != nil {
        return err
    }
    if row == nil {
        slog.Warn("message not found for edit projection",
            "channelId", pl.ChannelID, "messageId", pl.MessageID)
        return nil
    }
    editedAt := time.Unix(pl.Timestamp, 0).UTC()
    row.ApplyEdited(pl.Content, editedAt)
    return p.repo.Save(ctx, row)
}
```

## Creation Flow

For creation events, use `InsertIfNew`. Build the projection literal directly from the event payload — no projection constructor needed:

```go
func (p *MessageReceivedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
    e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageReceivedPayload](event)
    if err != nil {
        return err
    }
    pl := e.Payload
    msg := &projections.Message{
        ID:                pl.InternalMessageID.String(),
        ChannelID:         pl.ChannelID.String(),
        RemoteID:          pl.RemoteID,
        PlatformMessageID: pl.MessageID,
        Direction:         string(channelenums.DirectionReceived),
        Platform:          pl.Platform,
        SenderRemoteID:    pl.SenderID,
        Content:           pl.Content,
        OccurredAt:        pl.OccurredAt,
        ObservedAt:        pl.ObservedAt,
    }
    inserted, err := p.repo.InsertIfNew(ctx, msg)
    if err != nil {
        return err
    }
    if !inserted {
        slog.Debug("message_received already projected (duplicate)",
            "channelId", pl.ChannelID, "messageId", pl.MessageID)
    }
    return nil
}
```

`InsertIfNew` is idempotent — a duplicate is `(false, nil)`, not an error.

## Atomic Op Flow

For hot-row or bulk mutations, call the atomic repo op directly (no `find → ApplyX → save`):

```go
func (p *MessageDeliveredProjector) Handle(ctx context.Context, event types.DomainEventI) error {
    e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageDeliveredPayload](event)
    if err != nil {
        return err
    }
    pl := e.Payload
    if len(pl.MessageIDs) == 0 {
        slog.Debug("message_delivered: watermark-only — skipping projection",
            "channelId", pl.ChannelID)
        return nil
    }
    deliveredAt := time.Unix(pl.Timestamp, 0).UTC()
    for _, platformMsgID := range pl.MessageIDs {
        row, err := p.repo.FindByPlatformID(ctx, pl.ChannelID.String(), platformMsgID)
        if err != nil {
            return err
        }
        if row == nil {
            slog.Debug("message not found for delivered projection",
                "channelId", pl.ChannelID, "messageId", platformMsgID)
            continue
        }
        if err := p.repo.UpdateDelivered(ctx, row.ID, deliveredAt); err != nil {
            return err
        }
    }
    return nil
}
```

Use atomic ops only when justified (see projection skill PROJ-GO-07).

## Integration Event Projectors

Projectors for cross-service events implement `IntegrationEventHandler` and call `types.UnmarshalIntegrationEvent`:

```go
type VideoSearchProjector struct {
    repo projections.VideoSearchProjectionRepository
}

func NewVideoSearchProjector(repo projections.VideoSearchProjectionRepository) *VideoSearchProjector {
    return &VideoSearchProjector{repo: repo}
}

func (p *VideoSearchProjector) EventName() string { return "integration.video.published" }

func (p *VideoSearchProjector) Handle(ctx context.Context, event fwtypes.IntegrationEventI) error {
    typed, err := fwtypes.UnmarshalIntegrationEvent[wire.VideoPublishedEvent](event)
    if err != nil {
        return err
    }
    proj := &projections.VideoSearchProjection{
        VideoID: typed.Payload.VideoID,
        Title:   typed.Payload.Title,
    }
    if err := p.repo.Upsert(ctx, proj); err != nil {
        slog.Error("search: failed to index video", "videoId", proj.VideoID, "err", err)
        return err
    }
    slog.Info("search: indexed video", "videoId", proj.VideoID)
    return nil
}
```

## Full Struct + Constructor Pattern

```go
type MessageReceivedProjector struct {
    repo messagerepo.MessageProjectionRepository
}

func NewMessageReceivedProjector(repo messagerepo.MessageProjectionRepository) *MessageReceivedProjector {
    return &MessageReceivedProjector{repo: repo}
}

func (p *MessageReceivedProjector) EventName() string { return ctxevents.MessageReceivedEventName }
```

Constructor always takes the **interface type** of the repository, not the concrete `*pg` struct.

## Registration in the fx Module

```go
var Module = fx.Module("search",
    fx.Provide(projections.NewPgVideoSearchProjectionRepository),
    fx.Provide(projectors.NewVideoSearchProjector),
    fx.Provide(projectors.NewVideoArchivedProjector),
    fx.Provide(handlers.NewIndexVideoHandler),
    fx.Provide(handlers.NewRemoveArchivedVideoHandler),
    fx.Invoke(registerHandlers),
)

func registerHandlers(
    ext mediator.ExternalMediator,
    indexH *handlers.IndexVideoHandler,
    archiveH *handlers.RemoveArchivedVideoHandler,
) {
    ext.Register(indexH)
    ext.Register(archiveH)
}
```

Projectors that wrap integration events register with `ExternalMediator.Register`; projectors that consume domain events register with `InternalMediator.Register`. The handler in this example wraps the projector — see the `search/handlers/` files for the adapter pattern where a thin handler delegates to the projector.

## Missing-Row Semantics

When `FindByKey` returns `nil`:
- Log a `slog.Warn` with enough context to trace the event.
- Return `nil` — a missing row is non-fatal (out-of-order delivery during replay).
- Do NOT return an error that would stall the mediator.

```go
if row == nil {
    slog.Warn("message not found for edit projection",
        "channelId", pl.ChannelID, "messageId", pl.MessageID)
    return nil
}
```

## Checklist

- [ ] One concrete struct per event subscription
- [ ] Single field: the projection's repository (interface type, not concrete)
- [ ] `EventName()` returns the event name constant — no magic strings
- [ ] Creation path uses `InsertIfNew`; logs duplicate as Debug, not error
- [ ] Mutation path: `FindByKey → ApplyX → Save`; missing row → Warn + nil
- [ ] Atomic op path used only when justified by a named trigger
- [ ] Registered with the correct mediator (`Internal` for domain events, `External` for integration events) inside the module's `registerHandlers` func
- [ ] Constructor accepts repository interface, not concrete pointer

## References

- `packages/api/go/internal/search/projections/projectors/` — VideoSearchProjector + VideoArchivedProjector
- `packages/api/go/internal/analytics/projections/projectors/` — ViewAnalyticsProjector (batch atomic op)
- `dev:packages/channel/internal/channel/projections/projectors/message_projector.go` — canonical canonical creation + mutation + atomic paths
- `dev:packages/channel/internal/channel/projections/projectors/remote_projector.go` — shared helper `applyToRemote`
- `packages/api/go/core/services/mediator/mediator.go` — DomainEventHandler / IntegrationEventHandler interfaces
- [`../SKILL.md`](../SKILL.md) — lang-agnostic philosophy and call-site decision table
