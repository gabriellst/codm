---
name: event-go
description: Go variant of the `event` skill. Covers domain events (DomainEvent[T] generic alias), integration events (IntegrationEvent[T]), naming conventions, and the transactional outbox pattern in the api-go workspace.
---

# event — Go

> **Before implementing**: open [`registry.yaml`](./registry.yaml) and read every `when: always` pattern and every bad practice before writing a line of code.

Lang-agnostic philosophy: [`../SKILL.md`](../SKILL.md).

## Why Events Exist

Events decouple bounded contexts and enable side effects without direct dependencies. **Domain events** stay within one bounded context; the outbox dispatcher delivers them to internal handlers on the same process. **Integration events** cross context or service boundaries; an internal handler publishes them via `ExternalMediator` (Redis Streams or log-stub).

---

## Event types

| Type | Go generic alias | Transport | Scope |
|---|---|---|---|
| Domain event | `types.DomainEvent[T]` | `InternalMediator` via outbox | Within one context |
| Integration event | `types.IntegrationEvent[T]` | `ExternalMediator` (Redis / log) | Across services |

---

## Domain event

### 1. Payload struct + type alias + constructor

One file per event in `<ctx>/events/`:

```go
// Package events defines domain events for the transcoding bounded context.
package events

import (
    "github.com/google/uuid"

    "template/core-go/types"
)

// TranscodingJobStartedEventName is the canonical event name.
// Format: "<ctx>.<aggregate>.<past_tense_action>"
const TranscodingJobStartedEventName = "transcoding.transcoding_job.started"

// TranscodingJobStartedPayload carries data at the moment the event occurred.
// Use plain primitives only — no domain VOs, no pointers to mutable structs.
type TranscodingJobStartedPayload struct {
    JobID    uuid.UUID `json:"jobId"`
    VideoID  string    `json:"videoId"`
    InputUrl string    `json:"inputUrl"`
    OwnerID  string    `json:"ownerId"`
}

// TranscodingJobStartedEvent is a type alias (not a new type) so it satisfies
// types.DomainEventI automatically via the embedded DomainEvent[T] methods.
type TranscodingJobStartedEvent = types.DomainEvent[TranscodingJobStartedPayload]

// NewTranscodingJobStartedEvent is the only constructor.
// entityID: UUID of the affected aggregate (e.g. job.ID.UUID()).
// ownerID:  tenant/owner identifier for multi-tenancy filtering.
func NewTranscodingJobStartedEvent(entityID uuid.UUID, ownerID string, payload TranscodingJobStartedPayload) TranscodingJobStartedEvent {
    return types.NewDomainEvent(TranscodingJobStartedEventName, entityID, ownerID, payload)
}
```

### 2. How entities raise domain events

Entities accumulate events in a slice and the repository drains them on `Save`:

```go
// In entity:
func (j *TranscodingJob) Start(inputUrl string) error {
    if j.Status != enums.JobStatusPending {
        return errors.New("job already started")
    }
    j.Status = enums.JobStatusRunning
    j.InputUrl = inputUrl
    j.AppendDomainEvent(events.NewTranscodingJobStartedEvent(
        j.ID.UUID(),
        j.OwnerID,
        events.TranscodingJobStartedPayload{
            JobID:    j.ID.UUID(),
            VideoID:  j.VideoID,
            InputUrl: inputUrl,
            OwnerID:  j.OwnerID,
        },
    ))
    return nil
}

// In repository Save:
return r.domainEventRepo.SaveAll(ctx, entity.PullDomainEvents())
```

`SaveAll` dual-writes: one row to `shared.events` (permanent audit) + one row to `shared.outbox` (transient dispatch queue). The `OutboxDispatcher` polls the outbox and calls `InternalMediator.Dispatch()`.

### 3. Transactional outbox — save, never publish directly

Use cases **never** call `InternalMediator.Publish` or `ExternalMediator.Publish` directly. They call a use case that calls `entity.SomeMethod()` which appends events, and `repository.Save` drains them into the outbox — all inside the same `SQLUnitOfWork.Execute` callback:

```go
// Use case — CORRECT
func (h *StartTranscodingJobHandler) Execute(ctx context.Context, input StartTranscodingJobInput) (StartTranscodingJobOutput, error) {
    return h.uow.Execute(ctx, func(ctx context.Context) (StartTranscodingJobOutput, error) {
        job, err := entities.NewTranscodingJob(input.VideoID, input.InputUrl, input.OwnerID)
        if err != nil {
            return StartTranscodingJobOutput{}, err
        }
        if err := h.repo.Save(ctx, job); err != nil {  // ← domain events drained here
            return StartTranscodingJobOutput{}, err
        }
        return StartTranscodingJobOutput{JobID: job.ID.String()}, nil
    })
}

// WRONG — direct publish from use case
h.internalMediator.Publish(ctx, someEvent) // Never do this
```

---

## Integration event

Integration events cross service boundaries. They live in `contracts-go/wire/` (generated from TypeSpec) when shared across both backends, or in `<ctx>/events/` when owned by a single service and consumed by an external handler in the same binary.

```go
// contracts-go/wire/video_uploaded.go (generated — do not hand-edit)
package wire

import "template/core-go/types"

const VideoUploadedEventName = "integration.video.uploaded"

type VideoUploadedEvent struct {
    VideoID     string `json:"videoId"`
    StorageKey  string `json:"storageKey"`
    MimeType    string `json:"mimeType"`
    UploadedBy  string `json:"uploadedBy"`
}

// VideoUploadedIntegrationEvent is a type alias for IntegrationEvent[VideoUploadedEvent].
type VideoUploadedIntegrationEvent = types.IntegrationEvent[VideoUploadedEvent]
```

For service-local integration events (raised inside api-go, consumed by a handler in the same api-go binary before crossing to api-rs):

```go
// <ctx>/events/transcoding_job_completed_integration.go
package events

import "template/core-go/types"

const TranscodingJobCompletedIntegrationEventName = "integration.transcoding.job_completed"

type TranscodingJobCompletedIntegrationPayload struct {
    VideoID   string `json:"videoId"`
    OutputUrl string `json:"outputUrl"`
}

type TranscodingJobCompletedIntegrationEvent = types.IntegrationEvent[TranscodingJobCompletedIntegrationPayload]

func NewTranscodingJobCompletedIntegrationEvent(ownerID string, payload TranscodingJobCompletedIntegrationPayload) TranscodingJobCompletedIntegrationEvent {
    return types.NewIntegrationEvent(TranscodingJobCompletedIntegrationEventName, ownerID, payload)
}
```

An internal handler publishes it via `ExternalMediator.Publish(ctx, integrationEvent)`.

---

## Naming convention

| Concept | Format | Example |
|---|---|---|
| Domain event const | `"<ctx>.<aggregate>.<past_verb>"` | `"transcoding.transcoding_job.started"` |
| Integration event const | `"integration.<ctx>.<past_verb>"` | `"integration.video.uploaded"` |
| Payload struct | `<Aggregate><PastVerb>Payload` | `TranscodingJobStartedPayload` |
| Type alias | `<Aggregate><PastVerb>Event` | `TranscodingJobStartedEvent` |
| Constructor | `New<Aggregate><PastVerb>Event(...)` | `NewTranscodingJobStartedEvent(...)` |

**Always use past tense.** Events describe facts that already happened.

---

## Payload rules

- Plain primitives only: `string`, `uuid.UUID`, `int64`, `bool`, `time.Time`.
- No domain entity pointers, no value objects, no interface{}/any fields.
- JSON tags mandatory on every field.
- `validate` struct tags only when the event payload is received over the wire (integration events parsed from Kafka/Redis).

---

## UnmarshalDomainEvent / UnmarshalIntegrationEvent

Handlers receive events as the non-generic interface (`DomainEventI` / `IntegrationEventI`). Use the core helpers to re-type them:

```go
// Domain event handler
typed, err := types.UnmarshalDomainEvent[events.TranscodingJobStartedPayload](event)
if err != nil {
    return err
}
// typed.Payload is TranscodingJobStartedPayload

// Integration event handler
typed, err := types.UnmarshalIntegrationEvent[wire.VideoUploadedEvent](event)
if err != nil {
    return err
}
// typed.Payload is wire.VideoUploadedEvent
```

`UnmarshalDomainEvent` fast-paths when the event is already the correct concrete type (direct in-memory dispatch) and falls back to JSON unmarshalling for outbox-dispatched events.

---

## Checklist

- [ ] One file per event in `<ctx>/events/`.
- [ ] Type alias (`=`) not a new type — satisfies `DomainEventI`/`IntegrationEventI` automatically.
- [ ] Const name follows `"<ctx>.<aggregate>.<past_verb>"` format.
- [ ] Payload uses plain primitives with JSON tags; no entity refs.
- [ ] Domain events raised inside entity methods via `AppendDomainEvent`.
- [ ] Repository `Save` calls `domainEventRepo.SaveAll(ctx, entity.PullDomainEvents())`.
- [ ] No direct mediator calls from use cases — outbox handles delivery.
- [ ] Integration events published only from handlers via `ExternalMediator.Publish`.
