---
name: query-go
description: Go ctx-local read use cases — same Handler[I,O] primitive, repository reads without UoW, no UI-shaped BFF queries (those belong to api-typescript).
---

# Query Use Case — Go

Go query use cases use the **same `types.Handler[I,O]` primitive** as write use cases. The difference is operational: query handlers read data from repositories (or execute raw SQL via `sqlc`-generated queries / direct `*pgxpool.Pool`) and return a DTO, without touching `UnitOfWork` or `DomainEventRepository`.

## Ownership boundary — critical rule

Per the polyglot ownership matrix (polyglot.md §3):

> **UI-shaped BFF queries belong to api-typescript, NOT api-go.**

Go query use cases are **ctx-local reads** only — they serve internal coordination, worker logic, or an internal HTTP endpoint consumed by another Go component. They do NOT expose aggregated cross-context joins shaped for a UI screen. If you need a `GetVideoFeed` or `GetChannelPage` query, that lives in `packages/api/typescript/src/ui/`.

Valid Go query use cases:
- `GetTranscodingJobStatus` — worker checks whether a job finished before re-queuing
- `ListPendingJobs` — scheduler lists jobs that need to be retried
- `GetChannelForOwner` — integration handler checks a channel exists before processing an event
- `ListChannels` / `GetChannel` — internal HTTP endpoint serving an admin panel or service-to-service call

Invalid in Go (implement in api-typescript instead):
- `GetVideoFeed` — cross-context join shaped for a React page
- `GetMyWatchHistory` — denormalized user-facing read
- `SearchVideos` — full-text search results for the UI (Go owns the FTS indexer, but api-typescript owns the read endpoint)

## Shape

Same `Handler[I,O]` interface, no `UnitOfWork`, no `DomainEventRepository`:

```go
type GetChannelInput struct {
    ID string `validate:"required,uuid"`
}

type GetChannelOutput struct {
    ID        string `json:"id"        example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
    Name      string `json:"name"      example:"my-channel"`
    Status    string `json:"status"    example:"CREATED"`
    CreatedAt string `json:"createdAt" format:"date-time" example:"2026-02-19T10:30:00Z"`
}

type GetChannelHandler struct {
    repo channelrepo.ChannelRepository
}

func NewGetChannelHandler(repo channelrepo.ChannelRepository) *GetChannelHandler {
    return &GetChannelHandler{repo: repo}
}

func (h *GetChannelHandler) Name() string { return "get_channel" }

func (h *GetChannelHandler) Execute(ctx context.Context, input GetChannelInput) (GetChannelOutput, error) {
    instance, err := h.repo.Find(ctx, input.ID)
    if err != nil {
        return GetChannelOutput{}, err
    }
    if instance == nil {
        return GetChannelOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotFound, "channel not found")
    }

    return GetChannelOutput{
        ID:        instance.ID.String(),
        Name:      instance.Name,
        Status:    string(instance.Status),
        CreatedAt: instance.CreatedAt.UTC().Format(time.RFC3339),
    }, nil
}
```

## List pattern with pagination

```go
type ListChannelsInput struct {
    OwnerID string `validate:"required"`
    Limit   int    `validate:"omitempty,min=1,max=100"`
    Offset  int    `validate:"omitempty,min=0"`
}

type ListChannelsItem struct {
    ID        string `json:"id"        example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
    Name      string `json:"name"      example:"my-channel"`
    Status    string `json:"status"    example:"CREATED"`
    CreatedAt string `json:"createdAt" format:"date-time"`
}

type ListChannelsOutput struct {
    Items []ListChannelsItem `json:"items"`
    Total int                `json:"total" example:"42"`
}

func (h *ListChannelsHandler) Execute(ctx context.Context, input ListChannelsInput) (ListChannelsOutput, error) {
    if input.Limit == 0 {
        input.Limit = 20 // default page size
    }

    results, total, err := h.repo.FindAll(ctx, input.OwnerID, input.Limit, input.Offset)
    if err != nil {
        return ListChannelsOutput{}, err
    }

    items := make([]ListChannelsItem, len(results))
    for i, e := range results {
        items[i] = ListChannelsItem{
            ID:        e.ID.String(),
            Name:      e.Name,
            Status:    string(e.Status),
            CreatedAt: e.CreatedAt.UTC().Format(time.RFC3339),
        }
    }

    return ListChannelsOutput{Items: items, Total: total}, nil
}
```

## When to use plain context vs txCtx

Query handlers use the `ctx` received by `Execute` directly — no UoW needed. Pass `ctx` to every repository call:

```go
func (h *GetChannelHandler) Execute(ctx context.Context, input GetChannelInput) (GetChannelOutput, error) {
    instance, err := h.repo.Find(ctx, input.ID) // plain ctx, no transaction
    // ...
}
```

If a query needs to run inside a parent transaction (rare — e.g., a saga step that reads then writes), the caller passes a `txCtx` from its own `uow.Execute` closure; the handler treats it as any other context.

## fx wiring

Query handlers are provided like write use cases — by concrete type, no `fx.As`:

```go
fx.Provide(usecases.NewGetChannelHandler),
fx.Provide(usecases.NewListChannelsHandler),
```

The controller that serves the query receives the handler by its concrete pointer type.

## Output mapping

The handler maps entity / VO fields to primitive types in the output struct. Use `time.RFC3339` for timestamps, `instance.ID.String()` for UUIDs, and `string(entity.Status)` for enum-typed strings:

```go
return GetChannelOutput{
    ID:        instance.ID.String(),
    Status:    string(instance.Status),
    CreatedAt: instance.CreatedAt.UTC().Format(time.RFC3339),
}, nil
```

Never return a domain entity or repository type directly — always map to the output struct.

## Checklist

- [ ] Input fields have `validate` tags
- [ ] No `uow.Execute` or `domainEventRepo.Save` calls (reads only)
- [ ] `ctx` (not `txCtx`) passed to repository calls
- [ ] Output struct fields carry `json` and `example`/`format` tags
- [ ] Default page size set when `Limit == 0` in list queries
- [ ] Registered via `fx.Provide` in `module.go`
- [ ] Query is ctx-local, not UI-shaped (BFF queries belong to api-typescript)
