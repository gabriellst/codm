---
name: service-go
description: Go variant of the `service` skill. Covers context-local services (interface + stub/real implementations), cross-context infra services (core/services/), and fx wiring patterns in the api-go workspace.
---

# service — Go

> **Before implementing**: open [`registry.yaml`](./registry.yaml) and read every `when: always` pattern and every bad practice before writing a line of code.

Lang-agnostic philosophy: [`../SKILL.md`](../SKILL.md).

## When to Use Services

Use a service when:
- Logic doesn't belong in a single entity (cross-aggregate calculation, external API call).
- The operation coordinates infrastructure (storage, transcoder, email, push notifications).
- Multiple implementations exist and are switched at wire-up time (stub for dev/test, real for prod).

Do **not** create a service for:
- Logic that fits in an entity method — put it on the entity.
- Simple repository pass-throughs — call the repository directly from the use case.

---

## Two service scopes

| Scope | Location | Registered in |
|---|---|---|
| Context-local | `<ctx>/services/<name>/` | `<ctx>/module.go` |
| Cross-context infra | `core/services/` or `internal/shared/services/` | `cmd/api/main.go` shared module |

---

## Context-local service

### 1. Interface (`<name>/<name>_service.go`)

```go
// Package services defines the TranscoderService interface and its stub implementation.
package services

import "context"

// TranscoderInput describes a video that needs transcoding.
type TranscoderInput struct {
    VideoID    string
    StorageKey string
    MimeType   string
    ByteSize   int64
}

// TranscoderService starts an async transcoding job and fires a callback
// to api-rs once the job completes (or fails).
// Interface justified: stub (offline) vs real (Mux API) implementations.
type TranscoderService interface {
    Start(ctx context.Context, input TranscoderInput) error
}
```

**Interface is only justified when there are — or will be — multiple implementations** (stub vs real, or swappable external providers). If there is one permanent implementation, skip the interface and provide the concrete struct directly.

### 2. Stub / concrete implementation

```go
// services/stub_transcoder_service.go
package services

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "log/slog"
    "net/http"
    "time"
)

// StubTranscoderService sleeps SleepDuration, then fires the api-rs callback.
// In production swap for a real Mux/FFmpeg integration via client-go SDK.
type StubTranscoderService struct {
    APIRSURL      string
    SleepDuration time.Duration
    client        *http.Client
}

func NewStubTranscoderService(apirsURL string, sleepDuration time.Duration) *StubTranscoderService {
    return &StubTranscoderService{
        APIRSURL:      apirsURL,
        SleepDuration: sleepDuration,
        client:        &http.Client{Timeout: 10 * time.Second},
    }
}

// Compile-time check.
var _ TranscoderService = (*StubTranscoderService)(nil)

func (s *StubTranscoderService) Start(ctx context.Context, input TranscoderInput) error {
    go func() {
        timer := time.NewTimer(s.SleepDuration)
        defer timer.Stop()
        select {
        case <-timer.C:
        case <-ctx.Done():
            slog.Info("stub transcoder: context cancelled", "videoId", input.VideoID)
            return
        }
        // ... POST callback to api-rs
    }()
    return nil
}
```

### 3. Factory-pattern alternative (when switching at runtime, not at wire-up)

If the concrete implementation must be selected at **runtime** (e.g., based on platform enum), use a factory struct instead of an interface:

```go
// gateway/factory.go
type GatewayFactory struct {
    whatsapp *WhatsAppGateway
    internal *InternalGateway
}

func NewGatewayFactory(wa *WhatsAppGateway, ig *InternalGateway) *GatewayFactory {
    return &GatewayFactory{whatsapp: wa, internal: ig}
}

func (f *GatewayFactory) Get(platform enums.Platform) Gateway {
    switch platform {
    case enums.PlatformWhatsApp:
        return f.whatsapp
    default:
        return f.internal
    }
}
```

With a factory, concrete structs are injected by **concrete type** into the factory constructor. No `fx.As` needed for the concrete structs — only for the factory itself if consumers depend on `*GatewayFactory`.

### 4. fx wiring in `module.go`

Single implementation selected at wire-up time — pass interface via `fx.As`:

```go
// module.go
fx.Provide(func() services.TranscoderService {
    transcoderURL := os.Getenv("TRANSCODER_URL")
    if transcoderURL == "" {
        transcoderURL = "http://localhost:3031"
    }
    return services.NewStubTranscoderService(transcoderURL, 10*time.Second)
}),
```

When the concrete type implements the interface, `fx.As` is the canonical pattern:

```go
fx.Provide(fx.Annotate(
    services.NewRealTranscoderService,
    fx.As(new(services.TranscoderService)),
)),
```

For factory pattern (no interface needed on concrete structs):

```go
fx.Provide(services.NewWhatsAppGateway),
fx.Provide(services.NewInternalGateway),
fx.Provide(services.NewGatewayFactory),
// Consumers inject *GatewayFactory directly.
```

---

## Cross-context infra services (`core/services/`)

Infrastructure services shared by all bounded contexts live in `core/services/`:

```
core/services/
├── httprouter/   # HTTP router + middleware chain
├── mediator/     # InternalMediator + ExternalMediator interfaces + impls
├── outbox/       # OutboxDispatcher
└── unitofwork/   # SQLUnitOfWork
```

These are wired at the application root (`cmd/api/main.go`), not in individual context modules:

```go
// cmd/api/main.go
fx.New(
    fx.Provide(db.NewSQLDB),
    fx.Provide(fx.Annotate(mediator.NewChannelMediator, fx.As(new(mediator.InternalMediator)))),
    fx.Provide(fx.Annotate(mediator.NewRedisExternalMediator, fx.As(new(mediator.ExternalMediator)))),
    fx.Provide(unitofwork.NewSQLUnitOfWork),
    transcoding.Module,
    search.Module,
    analytics.Module,
)
```

---

## Service vs domain entity method

| Scenario | Use |
|---|---|
| Logic only involves one entity's data | Entity method |
| Logic involves calling an external API | Service |
| Logic coordinates 2+ aggregates | Service called from use case |
| Logic involves infrastructure (storage, email) | Service |

---

## Checklist

- [ ] Interface defined only when multiple implementations exist or are planned.
- [ ] Compile-time interface check: `var _ FooService = (*StubFooService)(nil)`.
- [ ] Concrete struct receives dependencies via constructor parameters (no globals).
- [ ] Context-local services registered in `<ctx>/module.go`.
- [ ] Infra services registered in `cmd/api/main.go` shared module.
- [ ] `fx.As(new(FooService))` used when consumers depend on the interface.
- [ ] Factory pattern used when implementation switches at runtime, not wire-up.
