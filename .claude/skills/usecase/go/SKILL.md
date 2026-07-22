---
name: usecase-go
description: Go application use case — implements types.Handler[I,O], wires via fx.Provide, orchestrates repositories + domain events inside a UnitOfWork transaction.
---

# Use Case — Go

A Go use case is a plain struct that implements `types.Handler[I, O]` — a generic interface with two methods:

```go
type Handler[I any, O any] interface {
    Name() string
    Execute(ctx context.Context, input I) (O, error)
}
```

No inheritance, no base class, no decorators. The struct holds its dependencies as unexported fields and receives them through a constructor injected by uber-fx.

## When to Use This Skill

- Any command that changes state (create, start, complete, cancel, fail)
- Operations that need a transaction (multiple repository saves that must succeed atomically)
- Orchestrating an entity + repository + domain events inside a UnitOfWork

## When NOT to Use This Skill

- **Read queries for UI or internal coordination**: same `Handler[I,O]` primitive but see the `/query` skill for the ctx-local read pattern.
- **Reacting to events**: use the `/handler` skill for event-driven side effects.
- **Imperative format validation inside `Execute()`**: format rules are declarative — `validate` tags on the use-case Input struct (Step 1). Those tags are **required**, not redundant with the controller's: Go use cases are also invoked from non-HTTP paths (webhook choreography, integration-event handlers, sync workers) where no controller request struct sits in front, so the Input tags are the only format gate there. What never goes in `Execute()` is hand-written re-checks of formats the tags already cover. The controller request struct carries its own `validate` tags at the HTTP edge — this dual site is intentional; see the hub's "TS ↔ Go divergence" note.

## Prerequisites

- Context folder exists under `internal/<ctx>/`
- Entity exists (`internal/<ctx>/entities/<name>.go`)
- Repository interface exists (`internal/<ctx>/repositories/<name>/`)
- Error codes defined (`internal/<ctx>/errors/codes.go`)

## Process

### Step 1 — Define Input and Output structs

In `internal/<ctx>/usecases/<name>.go`, define plain structs with validate tags. No `from` tags here — those belong on controller request structs.

```go
// StartTranscodingJobInput holds the validated input for creating and starting a transcoding job.
type StartTranscodingJobInput struct {
    VideoID  string `validate:"required,uuid"`
    InputUrl string `validate:"required,url"`
    OwnerID  string `validate:"required"`
}

// StartTranscodingJobOutput is the response returned after a successful job creation.
type StartTranscodingJobOutput struct {
    JobID string `json:"jobId"`
}
```

Rules:
- All required fields: `validate:"required,..."`
- Optional fields: `validate:"omitempty,..."`
- Common built-in tags: `uuid`, `url`, `min=N`, `max=N`, `oneof=A B C`
- Output structs with no fields are valid (void mutation): `type CompleteJobOutput struct{}`

### Step 2 — Define the handler struct and constructor

```go
// StartTranscodingJobHandler implements types.Handler[StartTranscodingJobInput, StartTranscodingJobOutput].
type StartTranscodingJobHandler struct {
    repo            transcodingjob.TranscodingJobRepository
    uow             unitofwork.UnitOfWork
    domainEventRepo repositories.DomainEventRepository
    transcoder      services.TranscoderService
}

// NewStartTranscodingJobHandler constructs the StartTranscodingJobHandler.
func NewStartTranscodingJobHandler(
    repo transcodingjob.TranscodingJobRepository,
    uow unitofwork.UnitOfWork,
    domainEventRepo repositories.DomainEventRepository,
    transcoder services.TranscoderService,
) *StartTranscodingJobHandler {
    return &StartTranscodingJobHandler{
        repo:            repo,
        uow:             uow,
        domainEventRepo: domainEventRepo,
        transcoder:      transcoder,
    }
}
```

### Step 3 — Implement Name() and Execute()

`Name()` returns a snake_case identifier used for tracing and logging:

```go
func (h *StartTranscodingJobHandler) Name() string { return "start_transcoding_job" }
```

`Execute` wraps all DB mutations inside `h.uow.Execute`. Domain events are persisted inside the same transaction. External I/O (service calls, HTTP requests) runs **outside** `uow.Execute` to avoid holding the DB connection:

```go
func (h *StartTranscodingJobHandler) Execute(ctx context.Context, input StartTranscodingJobInput) (StartTranscodingJobOutput, error) {
    var job *entities.TranscodingJob

    err := h.uow.Execute(ctx, func(txCtx context.Context) error {
        // 1. Application-level guard (idempotency / conflict check)
        existing, err := h.repo.FindByVideoID(txCtx, input.VideoID)
        if err != nil {
            return err
        }
        if existing != nil {
            return errors.NewBaseError(ctxerrors.CodeInvalidVideoID, "a transcoding job for this video already exists")
        }

        // 2. Create entity (entity constructor validates invariants)
        newJob, err := entities.NewTranscodingJob(input.VideoID, input.InputUrl, input.OwnerID)
        if err != nil {
            return err
        }
        job = newJob

        // 3. Persist entity inside the transaction
        if err := h.repo.Save(txCtx, job); err != nil {
            return err
        }

        // 4. Persist domain events inside the SAME transaction (outbox pattern)
        for _, e := range job.PullDomainEvents() {
            if err := h.domainEventRepo.Save(txCtx, e); err != nil {
                return err
            }
        }
        return nil
    })
    if err != nil {
        return StartTranscodingJobOutput{}, err
    }

    // 5. External I/O after the transaction commits — never inside uow.Execute
    _ = h.transcoder.Start(ctx, services.TranscoderInput{
        VideoID:    input.VideoID,
        StorageKey: input.InputUrl,
    })

    return StartTranscodingJobOutput{JobID: job.ID.String()}, nil
}
```

### Step 4 — Register with fx in module.go

Use cases are provided by their constructor. They are consumed as concrete pointer types, not wrapped in `fx.As` — only repositories and controllers use `fx.As`. The module file is `internal/<ctx>/module.go`:

```go
// Use cases.
fx.Provide(usecases.NewStartTranscodingJobHandler),
fx.Provide(usecases.NewCompleteTranscodingJobHandler),
fx.Provide(usecases.NewFailTranscodingJobHandler),
```

Controllers that depend on a specific handler receive it by its concrete pointer type:

```go
func NewTranscoderCallbackController(
    completeJob *usecases.CompleteTranscodingJobHandler,
    failJob     *usecases.FailTranscodingJobHandler,
) *TranscoderCallbackController { ... }
```

## Transaction pattern — UnitOfWork

`unitofwork.UnitOfWork.Execute` provides a `txCtx context.Context` that carries the database transaction. Pass this context to every repository and `DomainEventRepository` call inside the closure. The transaction commits when the callback returns `nil` and rolls back on error.

```go
err := h.uow.Execute(ctx, func(txCtx context.Context) error {
    // all DB calls use txCtx
    if err := h.repo.Save(txCtx, entity); err != nil {
        return err // triggers rollback
    }
    for _, e := range entity.PullDomainEvents() {
        if err := h.domainEventRepo.Save(txCtx, e); err != nil {
            return err // triggers rollback
        }
    }
    return nil // commits
})
```

## Domain events — outbox pattern

Use cases never call a mediator directly. They persist events to the `DomainEventRepository` inside the same transaction as the entity save. The outbox dispatcher polls the table asynchronously and dispatches events to handlers.

```go
for _, e := range job.PullDomainEvents() {
    if err := h.domainEventRepo.Save(txCtx, e); err != nil {
        return err
    }
}
```

## Error handling

Use `errors.NewBaseError(code, message)` for application-level conditions. Domain-level failures are returned by entity constructors and behavior methods and propagate as-is.

```go
if job == nil {
    return errors.NewBaseError(ctxerrors.CodeJobNotFound, "transcoding job not found: "+input.JobID)
}
```

Error codes must be registered in `internal/<ctx>/errors/codes.go` via `init()` so the HTTP router can map them to status codes.

## Complete example — CompleteTranscodingJob

```go
package usecases

import (
    "context"

    ctxerrors "template/api-go/internal/transcoding/errors"
    transcodingjob "template/api-go/internal/transcoding/repositories/transcoding_job"
    "template/core-go/errors"
    "template/core-go/repositories"
    "template/core-go/services/unitofwork"
)

type CompleteTranscodingJobInput struct {
    JobID     string `validate:"required,uuid"`
    OutputUrl string `validate:"required,url"`
}

type CompleteTranscodingJobOutput struct{}

type CompleteTranscodingJobHandler struct {
    repo            transcodingjob.TranscodingJobRepository
    uow             unitofwork.UnitOfWork
    domainEventRepo repositories.DomainEventRepository
}

func NewCompleteTranscodingJobHandler(
    repo transcodingjob.TranscodingJobRepository,
    uow unitofwork.UnitOfWork,
    domainEventRepo repositories.DomainEventRepository,
) *CompleteTranscodingJobHandler {
    return &CompleteTranscodingJobHandler{repo: repo, uow: uow, domainEventRepo: domainEventRepo}
}

func (h *CompleteTranscodingJobHandler) Name() string { return "complete_transcoding_job" }

func (h *CompleteTranscodingJobHandler) Execute(ctx context.Context, input CompleteTranscodingJobInput) (CompleteTranscodingJobOutput, error) {
    err := h.uow.Execute(ctx, func(txCtx context.Context) error {
        job, err := h.repo.Find(txCtx, input.JobID)
        if err != nil {
            return err
        }
        if job == nil {
            return errors.NewBaseError(ctxerrors.CodeJobNotFound, "transcoding job not found: "+input.JobID)
        }

        if err := job.MarkCompleted(input.OutputUrl); err != nil {
            return err
        }

        if err := h.repo.Save(txCtx, job); err != nil {
            return err
        }

        for _, e := range job.PullDomainEvents() {
            if err := h.domainEventRepo.Save(txCtx, e); err != nil {
                return err
            }
        }
        return nil
    })
    if err != nil {
        return CompleteTranscodingJobOutput{}, err
    }

    return CompleteTranscodingJobOutput{}, nil
}
```

## Checklist

- [ ] `Name()` returns a non-empty snake_case string
- [ ] All input fields have `validate` tags
- [ ] All DB mutations run inside `h.uow.Execute`
- [ ] Domain events persisted via `h.domainEventRepo.Save(txCtx, e)` inside the UoW closure
- [ ] External I/O (service calls, HTTP) runs after `uow.Execute` returns
- [ ] Error return uses `errors.NewBaseError(code, message)` — never bare `fmt.Errorf` for domain errors
- [ ] Handler registered via `fx.Provide(usecases.NewXHandler)` in `module.go`
- [ ] Error codes registered in `errors/codes.go` via `init()`
