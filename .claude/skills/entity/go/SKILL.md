---
name: entity-go
description: Create a domain entity in Go. Use when modeling core business objects with identity and lifecycle. Covers BaseEntity embedding, New<Name> constructor returning error, behavior methods with IncrementVersion, Reconstruct<Name> for rehydration, domain event emission, and optional private fields with accessor methods.
---

# Create Domain Entity — Go

## Why Entities Exist

Entities encapsulate business rules and invariants. By putting validation and state-transition logic inside entity methods, the rules are enforced regardless of how the entity is created or modified. Entities also emit domain events — the source of all downstream side effects.

## When to Use This Skill

- Modeling a business object with a stable identity (UUID) and lifecycle (created, updated)
- Objects with state that changes through behavior methods (`MarkRunning()`, `SetConnected()`)
- Aggregate roots that own other entities and define a transactional consistency boundary
- Objects that raise domain events when significant things happen

## When NOT to Use This Skill

- Concepts without identity — use `/value-object`
- Closed vocabularies of constants — use `/enum`
- Simple query results or DTOs — use a plain struct, no entity needed
- Projection rows (read-side) — those are free structs, no BaseEntity

## Key Principles

1. **Public constructor `New<Name>` returns error**: validates inputs, emits creation event.
2. **`Reconstruct<Name>` for rehydration**: skips events, called only from repositories.
3. **Behavior methods call `IncrementVersion()`**: version bump happens inside the entity on every state mutation — not in the repository `save`.
4. **Errors propagated, never swallowed**: behavior methods return `error`; callers check.
5. **Domain events via `AddDomainEvent`**: events are attached to the entity and pulled by the repository after `save`.

> Go diverges from TypeScript here: `IncrementVersion()` is called inside entity behavior methods, not in `repo.save()`.

## BaseEntity structure

Every entity embeds `entities.BaseEntity` from `template/core-go/entities`:

```go
type BaseEntity struct {
    ID        objects.ID    // UUID wrapper
    CreatedAt time.Time
    UpdatedAt time.Time
    Version   int
    domainEvents []types.DomainEventI  // private — pulled by repo after save
}
```

Key methods on `BaseEntity`:
- `IncrementVersion() error` — bumps `Version`, refreshes `UpdatedAt`. Return value is always nil; ignore with `_ = j.IncrementVersion()`.
- `AddDomainEvent(event types.DomainEventI)` — attaches a domain event.
- `PullDomainEvents() []types.DomainEventI` — drains the event list (called by repository after save to hand events to the mediator).

`NewBaseEntity()` generates a random UUID and sets timestamps. `ReconstructBaseEntity(params)` reconstructs from persistence without side effects.

## Process

### Step 1: Define the entity struct

Embed `entities.BaseEntity`. Public fields are the norm for aggregate-root entities. Private fields with getters are used when the dev branch `Remote` pattern applies — i.e., when invariants are complex enough to warrant encapsulation at the field level.

```go
// internal/transcoding/entities/transcoding_job.go
package entities

import (
    ctxerrors "template/api-go/internal/transcoding/errors"
    ctxevents "template/api-go/internal/transcoding/events"
    "template/api-go/internal/transcoding/enums"
    "template/core-go/entities"
    "template/core-go/errors"
    "template/core-go/objects"
)

// TranscodingJob is the aggregate root for the transcoding bounded context.
// It tracks the lifecycle of a video transcoding operation from PENDING through
// RUNNING to COMPLETED or FAILED.
type TranscodingJob struct {
    entities.BaseEntity
    VideoID       string
    Status        enums.JobStatus
    InputUrl      string
    OutputUrl     *string
    FailureReason *string
    OwnerID       string
}
```

### Step 2: Write the constructor — New<Name> returns (*T, error)

```go
// NewTranscodingJob creates a new TranscodingJob in PENDING status.
// Raises TranscodingJobStartedEvent on success.
func NewTranscodingJob(videoID, inputUrl, ownerID string) (*TranscodingJob, error) {
    if videoID == "" {
        return nil, errors.NewBaseError(ctxerrors.CodeInvalidVideoID, "videoID must not be empty")
    }
    if inputUrl == "" {
        return nil, errors.NewBaseError(ctxerrors.CodeInvalidInputUrl, "inputUrl must not be empty")
    }

    base := entities.NewBaseEntity()
    job := &TranscodingJob{
        BaseEntity: base,
        VideoID:    videoID,
        Status:     enums.JobStatusPending,
        InputUrl:   inputUrl,
        OwnerID:    ownerID,
    }

    job.AddDomainEvent(ctxevents.NewTranscodingJobStartedEvent(
        base.ID.UUID(),
        ownerID,
        ctxevents.TranscodingJobStartedPayload{
            JobID:    base.ID.UUID(),
            VideoID:  videoID,
            InputUrl: inputUrl,
            OwnerID:  ownerID,
        },
    ))

    return job, nil
}
```

### Step 3: Write behavior methods

Each behavior method:
1. Guards the precondition with an early return error.
2. Mutates state.
3. Calls `_ = j.IncrementVersion()`.
4. Optionally attaches a domain event via `AddDomainEvent`.

```go
// MarkRunning transitions the job from PENDING to RUNNING.
func (j *TranscodingJob) MarkRunning() error {
    if j.Status != enums.JobStatusPending {
        return errors.NewBaseError(ctxerrors.CodeJobNotPending, "job must be in PENDING status to start running")
    }
    j.Status = enums.JobStatusRunning
    _ = j.IncrementVersion()
    return nil
}

// MarkCompleted transitions the job from RUNNING to COMPLETED.
// Raises TranscodingJobCompletedEvent.
func (j *TranscodingJob) MarkCompleted(outputUrl string) error {
    if j.Status != enums.JobStatusRunning {
        return errors.NewBaseError(ctxerrors.CodeJobNotRunning, "job must be in RUNNING status to complete")
    }
    j.Status = enums.JobStatusCompleted
    j.OutputUrl = &outputUrl
    _ = j.IncrementVersion()

    j.AddDomainEvent(ctxevents.NewTranscodingJobCompletedEvent(
        j.ID.UUID(),
        j.OwnerID,
        ctxevents.TranscodingJobCompletedPayload{
            JobID:     j.ID.UUID(),
            VideoID:   j.VideoID,
            OutputUrl: outputUrl,
        },
    ))

    return nil
}
```

### Step 4: Write the rehydration function — Reconstruct<Name>

The Reconstruct function takes explicit typed parameters (not a params struct, unless there are many fields). It must **not** call `NewBaseEntity()` — instead it uses `entities.ReconstructBaseEntity(params)` to restore the exact persisted timestamps and version.

```go
// ReconstructTranscodingJob rehydrates a TranscodingJob from persistence without raising events.
func ReconstructTranscodingJob(
    id objects.ID,
    videoID string,
    status enums.JobStatus,
    inputUrl string,
    outputUrl *string,
    failureReason *string,
    ownerID string,
    base entities.BaseEntity,
) *TranscodingJob {
    return &TranscodingJob{
        BaseEntity:    base,
        VideoID:       videoID,
        Status:        status,
        InputUrl:      inputUrl,
        OutputUrl:     outputUrl,
        FailureReason: failureReason,
        OwnerID:       ownerID,
    }
}
```

The repository calls `entities.ReconstructBaseEntity(entities.ReconstructBaseEntityParams{ID: row.ID, ...})` to build the `base` argument.

## Entity vs Value Object

| Entity | Value Object |
|--------|-------------|
| Has identity (BaseEntity with UUID) | No identity |
| Mutable state via behavior methods | Immutable after construction |
| Emits domain events | No events |
| Reconstruct from persistence | Reconstruct via constructor |
| Example: TranscodingJob, Channel | Example: Email, Address, JobOutputUrl |

## Private fields with getters (complex invariants)

When an entity has many invariants and direct field access is risky, use private fields + exported getters. This pattern is seen in `Remote`:

```go
type Remote struct {
    entities.BaseEntity
    channelID  uuid.UUID
    remoteID   string
    ownerID    string
    deletedAt  *time.Time
    // ...
}

// Exported read-only getters
func (r *Remote) ChannelID() uuid.UUID { return r.channelID }
func (r *Remote) RemoteID() string     { return r.remoteID }
func (r *Remote) DeletedAt() *time.Time { return r.deletedAt }
```

Use this when the entity has invariants that protect fields from being read as "deleted" while still being processed, or when multiple goroutines read the entity (though in this architecture, entities are single-threaded per request).

For simpler aggregates like `TranscodingJob`, public fields are fine.

## Import aliases

Always alias the context's own packages to avoid name clashes with the shared core:

```go
import (
    ctxerrors "template/api-go/internal/transcoding/errors"
    ctxevents "template/api-go/internal/transcoding/events"
    "template/api-go/internal/transcoding/enums"
    "template/core-go/entities"
    "template/core-go/errors"    // shared errors package
    "template/core-go/objects"
)
```

## Critical Rules

### IncrementVersion in entity methods, not in repo.save [ENT-GO-01]

Go entities call `_ = j.IncrementVersion()` inside every behavior method that mutates state. The TypeScript pattern (calling in repo.save) is NOT used in Go.

```go
// WRONG — version bumped in repo, not in entity
func (r *PgRepository) save(ctx context.Context, job *entities.TranscodingJob) error {
    job.IncrementVersion() // wrong place
    // ...
}

// CORRECT — version bumped in entity behavior method
func (j *TranscodingJob) MarkRunning() error {
    // ... guard ...
    j.Status = enums.JobStatusRunning
    _ = j.IncrementVersion() // correct place
    return nil
}
```

### Reconstruct never calls NewBaseEntity [ENT-GO-02]

Rehydration must restore exact persisted state. Using `NewBaseEntity()` generates a new UUID and fresh timestamps — that is only for brand-new aggregates.

```go
// WRONG — creates new ID and timestamps during rehydration
func ReconstructTranscodingJob(...) *TranscodingJob {
    return &TranscodingJob{
        BaseEntity: entities.NewBaseEntity(), // wrong!
    }
}

// CORRECT — restores persisted state
func ReconstructTranscodingJob(
    // ...
    base entities.BaseEntity,
) *TranscodingJob {
    return &TranscodingJob{BaseEntity: base, ...}
}
// Repository builds base via:
// base := entities.ReconstructBaseEntity(entities.ReconstructBaseEntityParams{ID: row.ID, ...})
```

### Constructor validates inputs explicitly [ENT-GO-03]

Guard every required input with an if-check and return `errors.NewBaseError(ctxerrors.Code..., "message")`. Do not rely on caller discipline.

```go
// WRONG — no validation
func NewTranscodingJob(videoID, inputUrl, ownerID string) *TranscodingJob {
    return &TranscodingJob{VideoID: videoID, ...}
}

// CORRECT
func NewTranscodingJob(videoID, inputUrl, ownerID string) (*TranscodingJob, error) {
    if videoID == "" {
        return nil, errors.NewBaseError(ctxerrors.CodeInvalidVideoID, "videoID must not be empty")
    }
    // ...
}
```

### Creation event raised in constructor [ENT-GO-04]

If the domain needs to know an entity was created (e.g., to enqueue a job), the constructor raises the event via `AddDomainEvent`. Behavior methods raise their own events. Reconstruct raises nothing.

```go
// Constructor — raises creation event
job.AddDomainEvent(ctxevents.NewTranscodingJobStartedEvent(...))

// Behavior method — raises transition event
j.AddDomainEvent(ctxevents.NewTranscodingJobCompletedEvent(...))

// ReconstructTranscodingJob — raises nothing
```

### Behavior methods return error, never panic [ENT-GO-05]

```go
// WRONG
func (j *TranscodingJob) MarkRunning() {
    if j.Status != enums.JobStatusPending { panic("invalid transition") }
    j.Status = enums.JobStatusRunning
}

// CORRECT
func (j *TranscodingJob) MarkRunning() error {
    if j.Status != enums.JobStatusPending {
        return errors.NewBaseError(ctxerrors.CodeJobNotPending, "job must be in PENDING status")
    }
    j.Status = enums.JobStatusRunning
    _ = j.IncrementVersion()
    return nil
}
```

## Checklist

- [ ] Struct embeds `entities.BaseEntity` from `template/core-go/entities`
- [ ] `New<Name>(...) (*T, error)` constructor validates inputs and raises creation event
- [ ] `Reconstruct<Name>(...)` uses `entities.ReconstructBaseEntity`, raises no events
- [ ] All behavior methods: guard → mutate → `_ = e.IncrementVersion()` → optional event
- [ ] All behavior methods return `error`
- [ ] Import aliases: `ctxerrors`, `ctxevents` for context packages; `"template/core-go/errors"` for shared
- [ ] File at `internal/<ctx>/entities/<snake_name>.go`

## Complete Example

```go
// internal/transcoding/entities/transcoding_job.go
package entities

import (
    ctxerrors "template/api-go/internal/transcoding/errors"
    ctxevents "template/api-go/internal/transcoding/events"
    "template/api-go/internal/transcoding/enums"
    "template/core-go/entities"
    "template/core-go/errors"
    "template/core-go/objects"
)

// TranscodingJob is the aggregate root for the transcoding bounded context.
// It tracks the lifecycle of a video transcoding operation from PENDING through
// RUNNING to COMPLETED or FAILED.
type TranscodingJob struct {
    entities.BaseEntity
    VideoID       string
    Status        enums.JobStatus
    InputUrl      string
    OutputUrl     *string
    FailureReason *string
    OwnerID       string
}

// NewTranscodingJob creates a new TranscodingJob in PENDING status.
// Raises TranscodingJobStartedEvent on success.
func NewTranscodingJob(videoID, inputUrl, ownerID string) (*TranscodingJob, error) {
    if videoID == "" {
        return nil, errors.NewBaseError(ctxerrors.CodeInvalidVideoID, "videoID must not be empty")
    }
    if inputUrl == "" {
        return nil, errors.NewBaseError(ctxerrors.CodeInvalidInputUrl, "inputUrl must not be empty")
    }

    base := entities.NewBaseEntity()
    job := &TranscodingJob{
        BaseEntity: base,
        VideoID:    videoID,
        Status:     enums.JobStatusPending,
        InputUrl:   inputUrl,
        OwnerID:    ownerID,
    }

    job.AddDomainEvent(ctxevents.NewTranscodingJobStartedEvent(
        base.ID.UUID(),
        ownerID,
        ctxevents.TranscodingJobStartedPayload{
            JobID:    base.ID.UUID(),
            VideoID:  videoID,
            InputUrl: inputUrl,
            OwnerID:  ownerID,
        },
    ))

    return job, nil
}

// MarkRunning transitions the job from PENDING to RUNNING.
func (j *TranscodingJob) MarkRunning() error {
    if j.Status != enums.JobStatusPending {
        return errors.NewBaseError(ctxerrors.CodeJobNotPending, "job must be in PENDING status to start running")
    }
    j.Status = enums.JobStatusRunning
    _ = j.IncrementVersion()
    return nil
}

// MarkCompleted transitions the job from RUNNING to COMPLETED and records the output URL.
// Raises TranscodingJobCompletedEvent.
func (j *TranscodingJob) MarkCompleted(outputUrl string) error {
    if j.Status != enums.JobStatusRunning {
        return errors.NewBaseError(ctxerrors.CodeJobNotRunning, "job must be in RUNNING status to complete")
    }
    j.Status = enums.JobStatusCompleted
    j.OutputUrl = &outputUrl
    _ = j.IncrementVersion()

    j.AddDomainEvent(ctxevents.NewTranscodingJobCompletedEvent(
        j.ID.UUID(),
        j.OwnerID,
        ctxevents.TranscodingJobCompletedPayload{
            JobID:     j.ID.UUID(),
            VideoID:   j.VideoID,
            OutputUrl: outputUrl,
        },
    ))

    return nil
}

// MarkFailed transitions the job from RUNNING to FAILED.
// Raises TranscodingJobFailedEvent.
func (j *TranscodingJob) MarkFailed(reason string) error {
    if j.Status != enums.JobStatusRunning {
        return errors.NewBaseError(ctxerrors.CodeJobNotRunning, "job must be in RUNNING status to fail")
    }
    j.Status = enums.JobStatusFailed
    j.FailureReason = &reason
    _ = j.IncrementVersion()

    j.AddDomainEvent(ctxevents.NewTranscodingJobFailedEvent(
        j.ID.UUID(),
        j.OwnerID,
        ctxevents.TranscodingJobFailedPayload{
            JobID:         j.ID.UUID(),
            VideoID:       j.VideoID,
            FailureReason: reason,
        },
    ))

    return nil
}

// ReconstructTranscodingJob rehydrates a TranscodingJob from persistence without raising events.
func ReconstructTranscodingJob(
    id objects.ID,
    videoID string,
    status enums.JobStatus,
    inputUrl string,
    outputUrl *string,
    failureReason *string,
    ownerID string,
    base entities.BaseEntity,
) *TranscodingJob {
    return &TranscodingJob{
        BaseEntity:    base,
        VideoID:       videoID,
        Status:        status,
        InputUrl:      inputUrl,
        OutputUrl:     outputUrl,
        FailureReason: failureReason,
        OwnerID:       ownerID,
    }
}
```

## References

- `packages/api/go/core/entities/base_entity.go` — BaseEntity, NewBaseEntity, ReconstructBaseEntity
- `packages/api/go/internal/transcoding/entities/transcoding_job.go` — canonical aggregate root
- `dev:packages/channel/internal/channel/entities/channel.go` — aggregate with Apply() for event sourcing
- `dev:packages/channel/internal/channel/entities/remote.go` — private-fields pattern with accessor methods
- `/errors` skill (Go) — error code constants and NewBaseError
- `/event` skill (Go) — domain event types and constructors
- `/repository` skill (Go) — how Reconstruct is called from toDomain
