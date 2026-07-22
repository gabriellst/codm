---
name: errors-go
description: Define and register error codes for a Go bounded context. Use when adding domain or application errors to a Go service. Covers const declarations, init() HTTP-status registration, NewBaseError usage, and anonymous import for side-effect wiring.
---

# Define Error Codes — Go

## Why Structured Errors Matter

Structured error codes enable consistent HTTP responses across all handlers. Every `AppError` carries a `Code` (string constant) that the `errors.MapErrorToHTTP` middleware maps to an HTTP status. The mapping is populated at startup via `init()` — each bounded context calls `errors.RegisterErrorCodes(...)` once. Any error code raised in a use case or entity that is not registered defaults to 500.

## When to Use This Skill

- Adding a new bounded context that has its own failure modes
- An entity method needs to reject an invalid state transition
- A use case needs to communicate "not found", "already exists", or a business rule violation
- You need a specific HTTP status for a new error scenario

## When NOT to Use This Skill

- Validation failures already covered by `validate` struct tags (handled automatically by `validation.ValidateWithCode`)
- Infrastructure panics or unhandled errors — those fall through to the generic 500 handler
- Error codes already defined in `template/core-go/errors/codes.go` (reuse them directly)

## Prerequisites

- Bounded context folder exists under `internal/<ctx>/`
- `template/core-go/errors` is already a module dependency

## Error Layers (for naming guidance only)

Go uses a single `AppError` struct for all layers. The layer distinction is only for organizing const names:

| Layer | Naming convention | Example |
|-------|------------------|---------|
| Domain | `CodeInvalid*`, `Code*Rule` | `CodeJobNotPending` |
| Application | `Code*NotFound`, `Code*Conflict`, `Code*AlreadyX` | `CodeJobNotFound` |
| Interface | `CodeInvalidSignature`, `CodeBadRequest` | `CodeInvalidSignature` |
| Infrastructure | `CodeDatabaseError`, `CodeExternalService` | `CodeExternalService` |

The struct has no layer field — layers are a mental model for naming clarity.

## Process

### Step 1: Create the errors file

Create `internal/<ctx>/errors/codes.go`:

```go
// Package errors defines error codes for the <ctx> bounded context.
package errors

import (
    "net/http"

    "template/core-go/errors"
)

const (
    // Domain errors — business rule violations raised by entities.
    CodeJobNotPending   errors.ErrorCode = "JOB_NOT_PENDING"
    CodeJobNotRunning   errors.ErrorCode = "JOB_NOT_RUNNING"
    CodeInvalidVideoID  errors.ErrorCode = "INVALID_VIDEO_ID"
    CodeInvalidInputUrl errors.ErrorCode = "INVALID_INPUT_URL"

    // Application errors — raised by use cases when preconditions fail.
    CodeJobNotFound errors.ErrorCode = "JOB_NOT_FOUND"
)

func init() {
    errors.RegisterErrorCodes(map[errors.ErrorCode]int{
        // Domain
        CodeJobNotPending:   http.StatusConflict,
        CodeJobNotRunning:   http.StatusConflict,
        CodeInvalidVideoID:  http.StatusBadRequest,
        CodeInvalidInputUrl: http.StatusBadRequest,

        // Application
        CodeJobNotFound: http.StatusNotFound,
    })
}
```

### Step 2: Wire the side-effect import in module.go

The `init()` in `codes.go` runs only when the package is imported. Import it anonymously in `module.go` so the registration happens at startup:

```go
// internal/<ctx>/module.go
import (
    _ "template/api-go/internal/<ctx>/errors" // register HTTP statuses via init()
)
```

**This blank import is mandatory.** Without it the `init()` never runs and all context errors return 500.

### Step 3: Use the error codes

In entities (domain errors — invalid state transitions):

```go
import (
    ctxerrors "template/api-go/internal/transcoding/errors"
    "template/core-go/errors"
)

func (j *TranscodingJob) MarkRunning() error {
    if j.Status != enums.JobStatusPending {
        return errors.NewBaseError(ctxerrors.CodeJobNotPending, "job must be in PENDING status to start running")
    }
    j.Status = enums.JobStatusRunning
    _ = j.IncrementVersion()
    return nil
}
```

In use cases (application errors — not found, already exists):

```go
import (
    ctxerrors "template/api-go/internal/transcoding/errors"
    "template/core-go/errors"
)

job, err := r.repo.FindByID(ctx, input.JobID)
if err != nil {
    return nil, err
}
if job == nil {
    return nil, errors.NewBaseError(ctxerrors.CodeJobNotFound, "transcoding job not found")
}
```

## HTTP Status Code Guidelines

| Pattern | Status | When |
|---------|--------|------|
| `CodeInvalid*` | 400 BAD_REQUEST | Malformed input, invalid field value |
| `Code*NotFound` | 404 NOT_FOUND | Resource does not exist |
| `Code*AlreadyX` | 409 CONFLICT | State already applied |
| `Code*Conflict` | 409 CONFLICT | Duplicate resource |
| `Code*Unauthorized` | 401 UNAUTHORIZED | Not authenticated |
| `Code*Forbidden` | 403 FORBIDDEN | Not authorized |
| `Code*Rule` / `Code*NotPending` | 409 CONFLICT | Business rule violation on state machine |
| `Code*Failed` | 500 INTERNAL_SERVER_ERROR | Unexpected infrastructure failure |
| `Code*InvalidSignature` | 401 UNAUTHORIZED | HMAC / auth failure |

## Core Error Codes (already registered — reuse directly)

`template/core-go/errors/codes.go` provides the framework-generic codes. Core never re-declares context-specific codes — adding one is always a context job. Do not re-declare these:

```go
// Domain (framework-generic validation primitives)
errors.CodeInvalidID
errors.CodeBusinessRule
errors.CodeInvalidEntity

// Application
errors.CodeNotFound
errors.CodeEntityConflict
errors.CodeValidationFailed
errors.CodeUnauthorized
errors.CodeForbidden

// Interface
errors.CodeBadRequest
errors.CodeMethodNotAllowed

// Infrastructure
errors.CodeDatabaseError
errors.CodeExternalService
errors.CodeMissingEnvVar
errors.CodeOptimisticLockConflict
```

Domain-specific codes (`INVALID_EMAIL`, `INVALID_PHONE`, `INVALID_ADDRESS`, etc.) used to live in core during the early monorepo era; they have been removed. Now each context declares its own validation codes in `internal/<ctx>/errors/codes.go`.

## Critical Rules

### const type is always `errors.ErrorCode` [ERR-GO-01]

```go
// WRONG — bare string constant
const CodeJobNotFound = "JOB_NOT_FOUND"

// CORRECT — typed constant gives compile-time safety
const CodeJobNotFound errors.ErrorCode = "JOB_NOT_FOUND"
```

### Every const must appear in init() [ERR-GO-02]

```go
// WRONG — declared but not registered (will return 500)
const CodeJobNotPending errors.ErrorCode = "JOB_NOT_PENDING"

// CORRECT — declared AND registered
const CodeJobNotPending errors.ErrorCode = "JOB_NOT_PENDING"

func init() {
    errors.RegisterErrorCodes(map[errors.ErrorCode]int{
        CodeJobNotPending: http.StatusConflict,
    })
}
```

### Anonymous import in module.go [ERR-GO-03]

```go
// WRONG — context errors not imported, init() never runs
import "template/api-go/internal/transcoding/usecases"

// CORRECT — blank import triggers init()
import _ "template/api-go/internal/transcoding/errors"
```

### Raise via errors.NewBaseError, not fmt.Errorf [ERR-GO-04]

```go
// WRONG — plain error bypasses HTTP mapper
return fmt.Errorf("job not found")

// CORRECT — AppError carries code for mapper
return errors.NewBaseError(ctxerrors.CodeJobNotFound, "transcoding job not found")
```

### Splitting large contexts across multiple files [ERR-GO-C01]

When one context has many distinct aggregate error groups (e.g., channel errors vs. messaging errors), split into multiple files under the same package. Each file has its own `init()` — they all run.

```go
// errors/channel_errors.go — init() for channel aggregate codes
// errors/messaging_errors.go — init() for message aggregate codes
```

## Checklist

- [ ] File at `internal/<ctx>/errors/codes.go`
- [ ] All consts typed as `errors.ErrorCode`
- [ ] `init()` registers every const with an HTTP status
- [ ] `_ "template/api-go/internal/<ctx>/errors"` import in `module.go`
- [ ] No bare `fmt.Errorf` for domain/application errors — use `errors.NewBaseError`
- [ ] No re-declaration of core codes from `template/core-go/errors/codes.go`

## Complete Example

```go
// internal/transcoding/errors/codes.go
package errors

import (
    "net/http"

    "template/core-go/errors"
)

const (
    CodeJobNotFound         errors.ErrorCode = "JOB_NOT_FOUND"
    CodeJobNotPending       errors.ErrorCode = "JOB_NOT_PENDING"
    CodeJobNotRunning       errors.ErrorCode = "JOB_NOT_RUNNING"
    CodeInvalidVideoID      errors.ErrorCode = "INVALID_VIDEO_ID"
    CodeInvalidInputUrl     errors.ErrorCode = "INVALID_INPUT_URL"
    CodeInvalidJobOutputUrl errors.ErrorCode = "INVALID_JOB_OUTPUT_URL"
    CodeInvalidSignature    errors.ErrorCode = "INVALID_SIGNATURE"
)

func init() {
    errors.RegisterErrorCodes(map[errors.ErrorCode]int{
        CodeJobNotFound:         http.StatusNotFound,
        CodeJobNotPending:       http.StatusConflict,
        CodeJobNotRunning:       http.StatusConflict,
        CodeInvalidVideoID:      http.StatusBadRequest,
        CodeInvalidInputUrl:     http.StatusBadRequest,
        CodeInvalidJobOutputUrl: http.StatusBadRequest,
        CodeInvalidSignature:    http.StatusUnauthorized,
    })
}
```

```go
// internal/transcoding/module.go (excerpt)
import (
    _ "template/api-go/internal/transcoding/errors" // register HTTP statuses via init()
)
```

## Pattern parity with TS

Same architecture in both languages: core defines a runtime registry + a registration function, contexts register at startup. Core never imports from contexts.

| | TypeScript | Go |
|---|---|---|
| Registry function | `registerErrorCodes(codes)` | `RegisterErrorCodes(map)` |
| Triggered by | side-effect import in `<ctx>/registry.ts` | `init()` triggered by anonymous `_ "…/errors"` import in `<ctx>/module.go` |
| Lookup at runtime | `GlobalErrorMapper[code]` | `MapErrorToHTTP` middleware |

## References

- `packages/api/go/core/errors/` — `AppError`, `NewBaseError`, `RegisterErrorCodes`, `MapErrorToHTTP`
- `packages/api/go/core/errors/codes.go` — framework codes (reuse, do not re-declare)
- `packages/api/go/internal/transcoding/errors/codes.go` — canonical context example
- `packages/api/go/internal/transcoding/module.go` — anonymous import pattern
