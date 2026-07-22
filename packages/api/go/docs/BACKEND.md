# Backend Architecture Guide

## Overview

The Go API follows DDD/Clean Architecture with bounded contexts, using uber/fx for dependency injection and net/http (Go 1.22+) as the HTTP router.

## Layer Structure

```
Interface Layer    → Controllers (HTTP handlers, swag annotations)
Application Layer  → Use Cases (orchestration, DTOs, events)
Domain Layer       → Entities, Value Objects, Enums, Domain Events
Infrastructure     → Repositories (sqlc), Mediators (Kafka/channels), DB
```

## Error System

Single unified error constructor — layers are organizational only:

```go
// Anywhere — just use NewBaseError with the code
errors.NewBaseError(ctxerrors.CodeTodoNotFound, "todo not found")

// With cause (for wrapping infrastructure errors)
errors.NewBaseErrorWithCause(errors.CodeDatabaseError, "connection failed", err)
```

Each bounded context defines its own error codes in `errors/errors.go` and registers them via `init()` with HTTP status mappings:

```go
const (
    CodeTodoNotFound   errors.ErrorCode = "TODO_NOT_FOUND"
    CodeTodoAlreadyDone errors.ErrorCode = "TODO_ALREADY_DONE"
)

func init() {
    errors.RegisterErrorCodes(map[errors.ErrorCode]int{
        CodeTodoNotFound:   http.StatusNotFound,
        CodeTodoAlreadyDone: http.StatusConflict,
    })
}
```

## Entity Pattern

Entities embed `BaseEntity` which provides ID (`objects.ID`), timestamps, version, and domain events:

```go
type Todo struct {
    entities.BaseEntity
    Title    string
    TenantID string
    Status   enums.TodoStatus
}
```

- **`NewXxx(params)` factory** — struct params for autocomplete, fires creation event
- **`Reconstruct(params)`** — struct params, hydrates from DB, no events, no validation
- **Behavior methods** — validate preconditions, mutate state, call `IncrementVersion()`

### ID Options

```go
// Random ID (default)
entities.NewBaseEntity()

// Pre-determined ID
entities.NewBaseEntity(entities.NewBaseEntityParams{
    ID: objects.IDFromUUID(someUUID),
})

// Hashed ID (deterministic from business keys)
id, _ := objects.HashedID("tenant-123", "invoice-456")
entities.NewBaseEntity(entities.NewBaseEntityParams{ID: id})
```

## Event System

### Domain Events (In-Process)
- Dispatched via `InternalMediator` (buffered channel + goroutine)
- Generic: `DomainEvent[T]` with typed payload
- Handlers implement `DomainEventHandler` interface

### Integration Events (Kafka)
- Dispatched via `ExternalMediator` (Kafka producer/consumer)
- Generic: `IntegrationEvent[T]` with typed payload
- Handlers implement `IntegrationEventHandler` interface

Events are published AFTER persistence via `mediator.Publish()`. TenantID lives in the base event struct, not in context-specific payloads.

## Controller Pattern

Controllers implement the `types.Controller` interface:

```go
type Controller interface {
    Metadata() ControllerMetadata
    Handle(w http.ResponseWriter, r *http.Request)
}
```

- `Metadata()` defines path, method, tags, and per-controller middlewares
- `Handle()` uses standard net/http — `DecodeRequest[T]`, call handler, respond
- swag annotations on `Handle()` generate OpenAPI spec
- DTOs use `example:""` tags for OpenAPI examples

### Request Decoding

Use `httputil.DecodeRequest[T](r)` with a unified request struct:

```go
type CreateTodoRequest struct {
    TenantID string `from:"ctx"  name:"tenantId" validate:"required"`
    Title    string `from:"body" json:"title"     validate:"required,min=1,max=200" example:"Buy groceries"`
}
```

Supported `from:` tags:
- `from:"body"` — decoded from JSON body (uses `json:` tag for field name)
- `from:"param"` — read from path params via `r.PathValue()`
- `from:"query"` — read from query string
- `from:"header"` — read from request headers
- `from:"ctx"` — read from request context (auth data)

Validation happens automatically after decoding via `validator/v10` tags. Enums use `oneof`, dates use `datetime` + `format`:
```go
Status    string `from:"body" json:"status"    validate:"required,oneof=PENDING COMPLETED" example:"PENDING"`
StartDate string `from:"body" json:"startDate" format:"date-time" validate:"required,datetime=2006-01-02T15:04:05Z" example:"2026-02-19T10:30:00Z"`
```

The `format:"date-time"` tag tells swag to generate `"format": "date-time"` in the OpenAPI spec. The `validate:"datetime=..."` tag does runtime validation via `go-playground/validator`.

### Email Fields (BP-079)

All email string fields in Request/Output structs MUST have both tags:
```go
Email string `from:"body" json:"email" format:"email" validate:"required,email" example:"john@example.com"`
```
- `format:"email"` — swag generates `"format": "email"` in OpenAPI → SDK generates `z.email()` instead of `z.string()`
- `validate:"email"` — runtime validation via `go-playground/validator`

Applies to both Request and Output structs. Missing `format:"email"` causes the SDK to generate `z.string()`, forcing the frontend to add manual `.email()` validation.

### Cross-Field Validation (BP-078)

Fields that require cross-field validation (e.g., password confirmation) MUST exist in the backend Request DTO:
```go
type SignUpRequest struct {
    Password        string `from:"body" json:"password"        validate:"required,min=8" example:"securePass123"`
    ConfirmPassword string `from:"body" json:"confirmPassword" validate:"required,eqfield=Password" example:"securePass123"`
}
```
This ensures the SDK schema includes the field — the frontend should not define cross-field validation independently.

## Use Case Pattern

Use cases implement `Handler[I, O]`:

```go
func (h *CreateTodoHandler) Execute(ctx context.Context, input CreateTodoInput) (CreateTodoOutput, error) {
    todo := entities.NewTodo(entities.NewTodoParams{
        Title:    input.Title,
        TenantID: input.TenantID,
    })

    err := h.uow.Execute(ctx, func(txCtx context.Context) error {
        if err := h.repo.Save(txCtx, todo); err != nil {
            return err
        }

        for _, event := range todo.PullDomainEvents() {
            if err := h.mediator.Publish(txCtx, event); err != nil {
                return err
            }
        }

        return nil
    })
    if err != nil {
        return CreateTodoOutput{}, err
    }

    return CreateTodoOutput{
        ID:        todo.ID.String(),
        CreatedAt: todo.CreatedAt.Format("2006-01-02T15:04:05Z"),  // matches validate:"datetime=2006-01-02T15:04:05Z"
    }, nil
}
```

- **Write use cases**: Wrap persistence + event publishing in `uow.Execute()` for atomicity
- **Read use cases**: Repository only (no UoW, no mediator)
- **Return DTOs**, never entities
- **Input validation** is done by `DecodeRequest` before reaching the use case — IDs are already valid UUIDs, enums are already validated
- **Repository methods**: `Save` (create/update), `Find` (by ID), `FindByXxx` (by criteria)
- **No separate schema files** — Input/Output DTOs live in the same file as the Handler or Controller that uses them (BP-080)

### Shared Response Types

When multiple controllers in the same context share a response type (e.g., `SessionOutput` used by SignIn, SignUp, GetSession), define the shared type in the context's `objects/` package and import it:

```go
// internal/auth/objects/user.go — shared DTO value object
type User struct {
    ID    string `json:"id" example:"..."`
    Name  string `json:"name" example:"John Doe"`
    Email string `json:"email" format:"email" example:"john@example.com"`
}

// internal/auth/controllers/get_session.go — Output defined here, imports User
type SessionOutput struct {
    Token string       `json:"token" example:"..."`
    User  objects.User `json:"user"`
}
```

**Never** create standalone files for schemas/DTOs (`session_output.go`, `schemas.go`, `dtos.go`). The Output struct lives in the controller file that is its primary owner.

## Repository Pattern

- **Interface** in `repositories/<entity>_repository.go` (domain layer)
- **Implementation** in `repositories/<entity>_pg.go` (sqlc-backed)
- **Method naming**: `Save` (write), `Find` (read by ID), `FindByXxx` (read by criteria)
- `toDomain()` converts DB rows via `Reconstruct()` (no events)
- `toPersistence()` extracts primitives for DB persistence
- `getQuerier(ctx)` checks for UoW transaction in context

## FX Wiring

Each bounded context exports `fx.Module("<name>", ...)`:

```go
var Module = fx.Module("todos",
    fx.Provide(/* repositories, use cases */),
    fx.Provide(fx.Annotate(NewController, fx.As(new(types.Controller)), fx.ResultTags(`group:"controllers"`))),
    fx.Invoke(registerDomainEventHandlers),
)
```

Controllers are collected via the `group:"controllers"` tag and registered on the router by the shared module.

## Value Objects

Immutable, self-validating types in `internal/shared/objects/`:
- `ID` — UUID wrapper with `NewID()`, `IDFromUUID()`, `IDFromString()`, `HashedID(values...)`
- `Email`, `Phone`, `CPF`, `CNPJ` — validated strings
- `Money` — cents + currency
- `PersonName` — first + last
- `Address` — full address

### Composite Value Object Params

Composite VOs (multiple fields) use a `NewXxxParams` struct instead of individual parameters:

```go
type Address struct {
    Street string `validate:"required"`
    State  string `validate:"required,len=2"`
}

type NewAddressParams struct {
    Street string
    State  string
}

func NewAddress(data NewAddressParams) (Address, error) {
    a := Address{Street: data.Street, State: data.State}
    if err := validation.ValidateWithCode(&a, errors.CodeInvalidAddress); err != nil {
        return Address{}, err
    }
    return a, nil
}
```

Primitive VOs (single value) keep a single parameter: `NewEmail(raw string)`, `NewCPF(raw string)`.

### Struct-Tag Validation

Use `validator/v10` struct tags for field-level validation instead of manual `if` checks. Call `validation.ValidateWithCode()` in the factory to return a domain-specific error code.

- **Do**: Use struct tags (`required`, `min`, `max`, `len`, `oneof`, `datetime`, etc.) for simple constraints
- **Do**: Use `format:"date-time"` + `validate:"datetime=2006-01-02T15:04:05Z"` for date/time string fields (`format` for OpenAPI, `datetime` for runtime validation)
- **Don't**: Replace custom validation logic (check digits, parsing, regex) with struct tags — CPF, CNPJ, Email keep their own validation

## Enums

Typed string constants with SCREAMING_SNAKE_CASE values. **No methods** (no `IsValid()`, no `String()`):

```go
type TodoStatus string

const (
    TodoStatusPending   TodoStatus = "PENDING"
    TodoStatusCompleted TodoStatus = "COMPLETED"
)
```

Validation in DTOs uses `oneof` validator tag:
```go
Status string `validate:"required,oneof=PENDING COMPLETED" example:"PENDING"`
```

## Middleware Stack

Applied globally via `HttpRouter.Use()`:
1. Recovery (panic → 500 JSON)
2. CORS
3. Logging (slog)

Per-controller middlewares (e.g., Auth) defined in `ControllerMetadata.Middlewares`.

## Authorization & Session Context

Auth middleware extracts session data from the request (JWT token, API key, etc.) and injects it into the request context. Controllers read tenant/user data via `from:"ctx"` tags:

```go
type CreateTodoRequest struct {
    TenantID string `from:"ctx" name:"tenantId" validate:"required"`
    UserID   string `from:"ctx" name:"userId"   validate:"required"`
    Title    string `from:"body" json:"title"    validate:"required" example:"Buy groceries"`
}
```

The middleware chain: Request → Recovery → CORS → Logging → Auth → Controller.

## Context Ownership Rules

1. **Write controllers** (create, update, delete) MUST live in the bounded context that owns the entity being mutated
2. **Read-only BFF queries** can live in a dedicated `ui` context for cross-schema aggregations
3. **Cross-context reads** are allowed by injecting another context's repository interface
4. **Cross-context writes** must use integration events (never import another context's entities)
5. **Never** put write controllers in the `ui` context — they belong in their domain context

## Feature Implementation Checklist

When implementing a new feature end-to-end:

1. [ ] Run CLI scaffold: `bun cli context <name>`
2. [ ] Define enums: `bun cli enum <ctx> <Name>`
3. [ ] Define error codes: `bun cli error-codes <ctx>`
4. [ ] Create entity: `bun cli entity <ctx> <Name>`
5. [ ] Create migration: `/migrate <ctx> create_<table>`
6. [ ] Run `bun sqlc` to generate query code
7. [ ] Create repository: `bun cli repository <ctx> <Name>`
8. [ ] Create use cases: `bun cli usecase <ctx> <Name>`
9. [ ] Create controllers: `bun cli controller <ctx> <Name>`
10. [ ] Register module in `cmd/api/main.go`
11. [ ] Run `bun swag` to generate OpenAPI spec
12. [ ] Run `bun sdk` to generate SDK
13. [ ] Write tests: `/test <ctx> entity <name>`
14. [ ] Verify: `go build ./api/cmd/api/ && go test ./api/internal/...`
