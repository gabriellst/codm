---
name: handler-go
description: Go variant of the `handler` skill. Covers domain event handlers (internal, DomainEventHandler interface) and integration event handlers (external, IntegrationEventHandler interface), registration via module.go, and idempotency patterns in the api-go workspace.
---

# handler — Go

> **Before implementing**: open [`registry.yaml`](./registry.yaml) and read every `when: always` pattern and every bad practice before writing a line of code.

Lang-agnostic philosophy: [`../SKILL.md`](../SKILL.md).

## Why Handlers Exist

Handlers process side effects triggered after the main operation succeeds. They run asynchronously after events are dispatched from the outbox, keeping use cases focused on their primary responsibility. Handlers must be idempotent — the outbox can re-deliver an event on retry.

---

## Handler interfaces (core-go)

```go
// mediator.DomainEventHandler — for internal (domain) event handlers
type DomainEventHandler interface {
    EventName() string
    Handle(ctx context.Context, event types.DomainEventI) error
}

// mediator.IntegrationEventHandler — for external (integration) event handlers
type IntegrationEventHandler interface {
    EventName() string
    Handle(ctx context.Context, event types.IntegrationEventI) error
}
```

---

## File naming convention

| Handler type | File name | Registers with |
|---|---|---|
| Reacts to a **domain** event in the same context | `<aggregate>_<past_verb>_handler.go` | `InternalMediator` |
| Reacts to an **integration** event from another service | `<source>_<event>_handler.go` | `ExternalMediator` |
| Publishes an integration event in response to a domain event | `<aggregate>_<past_verb>_handler.go` | `InternalMediator` |

The suffix `_integration_handler.go` is used by convention in the `dev` branch for handlers that consume incoming integration events (external → this service). The `_handler.go` suffix is used for internal domain event handlers and for integration-event-publishing handlers.

---

## Internal handler (domain event → side effect or integration event)

### Pattern A — logging/observability side effect

```go
// transcoding/handlers/transcoding_job_completed_handler.go
package handlers

import (
    "context"
    "log/slog"

    ctxevents "template/api-go/internal/transcoding/events"
    "template/core-go/services/mediator"
    "template/core-go/types"
)

// TranscodingJobCompletedHandler reacts to transcoding.transcoding_job.completed domain events.
type TranscodingJobCompletedHandler struct{}

// NewTranscodingJobCompletedHandler constructs the handler.
func NewTranscodingJobCompletedHandler() *TranscodingJobCompletedHandler {
    return &TranscodingJobCompletedHandler{}
}

// Compile-time interface check.
var _ mediator.DomainEventHandler = (*TranscodingJobCompletedHandler)(nil)

func (h *TranscodingJobCompletedHandler) EventName() string {
    return ctxevents.TranscodingJobCompletedEventName
}

func (h *TranscodingJobCompletedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
    typed, err := types.UnmarshalDomainEvent[ctxevents.TranscodingJobCompletedPayload](event)
    if err != nil {
        return err
    }
    slog.InfoContext(ctx, "transcoding: job completed",
        "jobId", typed.Payload.JobID,
        "videoId", typed.Payload.VideoID,
        "outputUrl", typed.Payload.OutputUrl,
    )
    return nil
}
```

### Pattern B — domain event → integration event (publish cross-service)

```go
// channel/handlers/message_received_handler.go
package handlers

import (
    "context"

    ctxevents "template/api-go/internal/channel/events"
    sharedevents "template/api-go/internal/shared/events"
    "template/core-go/services/mediator"
    "template/core-go/types"
)

// MessageReceivedHandler republishes channel.message_received as an integration event.
type MessageReceivedHandler struct {
    externalMediator mediator.ExternalMediator
}

func NewMessageReceivedHandler(ext mediator.ExternalMediator) *MessageReceivedHandler {
    return &MessageReceivedHandler{externalMediator: ext}
}

var _ mediator.DomainEventHandler = (*MessageReceivedHandler)(nil)

func (h *MessageReceivedHandler) EventName() string {
    return ctxevents.MessageReceivedEventName
}

func (h *MessageReceivedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
    e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageReceivedPayload](event)
    if err != nil {
        return err
    }
    integrationEvent := sharedevents.NewChannelMessageReceivedEvent(e.OwnerID, e.Payload)
    return h.externalMediator.Publish(ctx, integrationEvent)
}
```

---

## External handler (integration event → use case or side effect)

External handlers subscribe to events arriving from another service (Kafka/Redis Streams, or in-memory via `MemoryExternalMediator` in tests).

```go
// transcoding/handlers/enqueue_transcoding_job_handler.go
package handlers

import (
    "context"
    "log/slog"

    "template/api-go/internal/transcoding/usecases"
    "template/contracts-go/wire"
    fwtypes "template/core-go/types"
)

const VideoUploadedEventName = "integration.video.uploaded"

// EnqueueTranscodingJobHandler subscribes to integration.video.uploaded and
// delegates to StartTranscodingJob.
type EnqueueTranscodingJobHandler struct {
    startJob *usecases.StartTranscodingJobHandler
}

func NewEnqueueTranscodingJobHandler(startJob *usecases.StartTranscodingJobHandler) *EnqueueTranscodingJobHandler {
    return &EnqueueTranscodingJobHandler{startJob: startJob}
}

func (h *EnqueueTranscodingJobHandler) EventName() string {
    return VideoUploadedEventName
}

func (h *EnqueueTranscodingJobHandler) Handle(ctx context.Context, event fwtypes.IntegrationEventI) error {
    typed, err := fwtypes.UnmarshalIntegrationEvent[wire.VideoUploadedEvent](event)
    if err != nil {
        return err
    }
    p := typed.Payload
    slog.InfoContext(ctx, "transcoding: received video.uploaded, starting job",
        "videoId", p.VideoID,
        "storageKey", p.StorageKey,
    )
    _, err = h.startJob.Execute(ctx, usecases.StartTranscodingJobInput{
        VideoID:  p.VideoID,
        InputUrl: p.StorageKey,
        OwnerID:  p.UploadedBy,
    })
    return err
}
```

---

## Registration in module.go

All handlers are registered in `registerHandlers` called via `fx.Invoke`:

```go
// transcoding/module.go
var Module = fx.Module("transcoding",
    fx.Provide(handlers.NewEnqueueTranscodingJobHandler),
    fx.Provide(handlers.NewTranscodingJobCompletedHandler),
    fx.Invoke(registerHandlers),
)

func registerHandlers(
    ext mediator.ExternalMediator,
    internal mediator.InternalMediator,
    enqueue *handlers.EnqueueTranscodingJobHandler,
    completed *handlers.TranscodingJobCompletedHandler,
) {
    ext.Register(enqueue)       // integration event from api-rs
    internal.Register(completed) // domain event within transcoding ctx
}
```

Rules:
- External handlers (consuming integration events from other services) → `ext.Register(handler)`.
- Internal handlers (consuming domain events from same context) → `internal.Register(handler)`.
- `fx.Invoke` runs after all `fx.Provide` constructors — safe to access fully wired dependencies.

---

## Idempotency

Handlers can be called more than once if the outbox retries. Design accordingly:

```go
// Idempotent create: check before inserting
func (h *SomeHandler) Handle(ctx context.Context, event types.DomainEventI) error {
    e, err := types.UnmarshalDomainEvent[events.SomePayload](event)
    if err != nil {
        return err
    }
    existing, err := h.repo.Find(ctx, e.Payload.EntityID.String())
    if err != nil {
        return err
    }
    if existing != nil {
        return nil // already processed — idempotent skip
    }
    // ... create and save
}
```

For integration-event-publishing handlers: `ExternalMediator.Publish` is fire-and-forget; publishing twice is harmless if the downstream consumer is also idempotent.

---

## Error handling

- **Critical handlers** (data consistency): return the error — the outbox will retry.
- **Non-critical handlers** (notifications, logging): log and return `nil` — do not block the event chain.

```go
// Non-critical: swallow error so outbox does not retry
func (h *NotifyHandler) Handle(ctx context.Context, event types.DomainEventI) error {
    if err := h.notify(ctx, event); err != nil {
        slog.ErrorContext(ctx, "notification failed", "error", err)
        // intentionally return nil — notification failure is non-critical
    }
    return nil
}
```

---

## Base class infrastructure (no injection needed)

Go handlers have no base class; the infrastructure they need is injected via constructor parameters. Unlike TypeScript, there is no inherited `this.internalMediator` — inject `mediator.InternalMediator` or `mediator.ExternalMediator` explicitly if a handler needs to publish follow-up events.

---

## Checklist

- [ ] `EventName()` returns the canonical event const from the events package.
- [ ] `Handle` calls `UnmarshalDomainEvent` or `UnmarshalIntegrationEvent` immediately.
- [ ] Compile-time interface check: `var _ mediator.DomainEventHandler = (*MyHandler)(nil)`.
- [ ] Handler registered in `module.go` via `fx.Invoke(registerHandlers)`.
- [ ] Internal handlers → `internal.Register`; external handlers → `ext.Register`.
- [ ] Handler is idempotent (guard before state-changing operations).
- [ ] Non-critical handlers swallow errors; critical handlers return errors for retry.
