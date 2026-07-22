---
name: schema-go
description: Go input/output struct conventions — validate tags, from-source binding, JSON tags, and reflection-based OpenAPI emission. No standalone schema artifact; shapes live inside use case and controller files.
---

# Schema — Go

Go has no standalone schema artifact. Request/response shapes are plain Go structs with `validate:"..."` tags validated by `go-playground/validator/v10`. The OpenAPI spec is emitted at build time by the reflection-based emitter in `packages/api/go/core/pkg/openapi/` — it walks struct fields, reads `json`/`validate`/`example`/`format`/`swaggerignore` tags, and produces OpenAPI 3.1 schemas without annotations in production code.

## The two struct kinds

| Kind | Defined in | Purpose |
|---|---|---|
| **Input struct** | Same file as the use case or controller | Describes what Execute / Handle receives after parsing and validation |
| **Output struct** | Same file as the use case | Describes what Execute returns; controllers pass it directly to `httputil.RespondJSON` |

## Input struct — validation tags

Every field carries a `validate:"..."` tag consumed by `go-playground/validator/v10`. The `from:"..."` tag tells `httputil.DecodeRequest` where to read the value.

### Source tags (`from`)

| Tag value | Source |
|---|---|
| `from:"body"` | JSON request body (decoded then assigned) |
| `from:"param"` | URL path parameter via `r.PathValue(name)` |
| `from:"query"` | URL query string |
| `from:"header"` | HTTP request header |
| `from:"cookie"` | HTTP cookie |

Fields extracted from path/query/header/cookie are always strings at the HTTP boundary; `DecodeRequest` coerces them to `int`, `bool`, or `float64` as needed. Fields marked `swaggerignore:"true"` are excluded from the emitted OpenAPI schema — use this for infrastructure fields (owner ID from session header) that consumers should not see.

### Common validator expressions

```go
validate:"required"                    // non-zero value required
validate:"required,uuid"               // non-zero + valid UUID v4
validate:"required,url"                // non-zero + parseable URL
validate:"required,min=1,max=255"      // string length bounds
validate:"required,oneof=A B C"        // one of a fixed set of strings
validate:"omitempty,min=1,max=100"     // optional but bounded if present
validate:"omitempty,min=0"             // optional non-negative integer
```

### Example — use case input struct

```go
// StartTranscodingJobInput holds the validated input for creating and starting a transcoding job.
type StartTranscodingJobInput struct {
    VideoID  string `validate:"required,uuid"`
    InputUrl string `validate:"required,url"`
    OwnerID  string `validate:"required"`
}
```

Input structs in use cases carry no `from` tags — they are populated by the controller after it calls `httputil.DecodeRequest` on the controller-level request struct.

### Example — controller request struct

```go
// TranscoderCallbackRequest defines the shape of POST /webhooks/transcoder-callback.
type TranscoderCallbackRequest struct {
    JobID         string  `from:"body" json:"jobId"         validate:"required,uuid"`
    Status        string  `from:"body" json:"status"        validate:"required,oneof=COMPLETED FAILED"`
    OutputUrl     *string `from:"body" json:"outputUrl,omitempty"`
    FailureReason *string `from:"body" json:"failureReason,omitempty"`
}

// ListInstancesRequest shows query-param and header binding.
type ListInstancesRequest struct {
    Limit   int    `from:"query"  name:"limit"       validate:"omitempty,min=1,max=100"`
    Offset  int    `from:"query"  name:"offset"      validate:"omitempty,min=0"`
    OwnerID string `from:"header" name:"X-Owner-Id"  validate:"required,uuid" swaggerignore:"true"`
}
```

## Output struct — JSON and OpenAPI tags

Output structs use standard `json:"..."` tags for wire encoding. The OpenAPI emitter also reads `example` and `format` tags:

```go
type GetChannelOutput struct {
    ID        string    `json:"id"        example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
    Name      string    `json:"name"      example:"my-channel"`
    Status    string    `json:"status"    example:"CREATED"`
    CreatedAt string    `json:"createdAt" format:"date-time" example:"2026-02-19T10:30:00Z"`
}
```

Pointer fields become nullable in OpenAPI (`oneOf: [ref, {type: null}]` or `type: [T, null]`):

```go
type CompleteTranscodingJobOutput struct{}          // empty — 204 No Content

type StartTranscodingJobOutput struct {
    JobID string `json:"jobId"`
}

// Pointer → nullable in OpenAPI
OutputUrl *string `json:"outputUrl,omitempty"`
```

## How the emitter resolves types

The `packages/api/go/core/pkg/openapi/` emitter is reflection-based and operates at build time:

- Named structs → `$ref` to `#/components/schemas/<TypeName>`
- `uuid.UUID` → `{ "type": "string", "format": "uuid" }`
- `time.Time` → `{ "type": "string", "format": "date-time" }`
- Pointer fields → nullable via `oneOf` or type array
- `swaggerignore:"true"` fields → excluded from schema
- `validate:"required"` fields → appear in the `required` array
- `omitempty` on the json tag makes a field NOT required

The `Metadata()` method on a controller sets `Request` and `Response` to zero values of the respective structs:

```go
func (c *TranscoderCallbackController) Metadata() types.ControllerMetadata {
    return types.ControllerMetadata{
        Request:  TranscoderCallbackRequest{},
        Response: nil,              // 204 No Content
        Status:   http.StatusNoContent,
        Errors:   []errors.ErrorCode{ctxerrors.CodeInvalidSignature, ctxerrors.CodeJobNotFound},
    }
}
```

## Where structs live

There is no `schema/` folder. Structs belong in the file that defines their consumer:

| Struct role | File location |
|---|---|
| Use case input/output | `usecases/<name>.go` (same file as the handler) |
| Controller request | `controllers/<name>.go` (same file as the controller) |
| Controller response | Either the use case output struct (reused directly) or a dedicated response struct in `controllers/<name>.go` |

Reusing the use case output struct as the controller response is the preferred pattern — it eliminates duplication and keeps the emitter contract consistent:

```go
// Metadata references the use case Output directly as the response shape.
Response: usecases.ListChannelsOutput{},
```

## Validation errors

`validation.Validate` returns an `*errors.AppError` with code `CodeValidationFailed` (HTTP 422). Field-level detail is carried in `AppError.Details []FieldError`. Controllers surface this automatically through `httputil.RespondError`.

## Checklist before opening a PR

- [ ] Every input field has a `validate` tag (or `validate:"omitempty,..."` if optional)
- [ ] Body fields carry `from:"body"` and `json:"..."` tags
- [ ] Infrastructure/session fields carry `swaggerignore:"true"`
- [ ] Output struct fields carry `json:"..."` tags
- [ ] `Metadata().Request` is set to the controller request zero value
- [ ] `Metadata().Response` is set to the use case output zero value (or `nil` for 204)
- [ ] `Metadata().Errors` lists every domain error code the endpoint may return
