---
name: controller-go
description: Go HTTP controller — implements types.Controller (Metadata + Handle), auto-registered via fx group:"controllers", uses httputil.DecodeRequest + validator/v10, composes middlewares through ControllerMetadata.
---

# Controller — Go

A Go controller is a struct that implements `types.Controller`:

```go
type Controller interface {
    Metadata() ControllerMetadata
    Handle(w http.ResponseWriter, r *http.Request)
}
```

`Metadata()` returns the declarative route metadata. `Handle` decodes the request, calls one or more use case handlers, and writes the response. Controllers are thin — they do not contain business logic.

## Auto-registration via fx

Every controller is auto-registered by the HTTP router. In `module.go`, annotate the constructor with `fx.As(new(types.Controller))` and `fx.ResultTags(\`group:"controllers"\`)`:

```go
// Controller — auto-registered via group:"controllers"
fx.Provide(fx.Annotate(
    controllers.NewTranscoderCallbackController,
    fx.As(new(types.Controller)),
    fx.ResultTags(`group:"controllers"`),
)),
```

The HTTP router reads the `group:"controllers"` tag at startup, calls `Metadata()` on each controller to build the route, and chains `Metadata().Middlewares` before calling `Handle`.

Route pattern: `/api/{version}/{context}{path}` — e.g., `POST /api/v1/transcoding/webhooks/transcoder-callback`.

## ControllerMetadata

```go
type ControllerMetadata struct {
    Context     string          // bounded context ("transcoding", "channel") — empty for shared
    Path        string          // controller-local path ("/webhooks/transcoder-callback")
    Method      string          // "GET", "POST", "PUT", "PATCH", "DELETE"
    Description string          // shown in OpenAPI and router logs
    Tags        []string        // OpenAPI grouping (optional)
    Middlewares []types.Middleware // applied innermost-first before Handle

    // OpenAPI emitter fields
    Request  any               // zero value of the request struct (nil = no body/params)
    Response any               // zero value of the output struct (nil = 204 No Content)
    Status   int               // success status; 0 → 204 when Response==nil, 200 otherwise
    Errors   []errors.ErrorCode // domain/app codes this endpoint may return
}
```

## Process

### Step 1 — Define the request struct

In `internal/<ctx>/controllers/<name>.go`, define a request struct with `from` and `validate` tags (see the `/schema` skill for tag reference). Body fields need `json` tags. Infrastructure fields (session header, owner cookie) need `swaggerignore:"true"`.

```go
type TranscoderCallbackRequest struct {
    JobID         string  `from:"body" json:"jobId"         validate:"required,uuid"`
    Status        string  `from:"body" json:"status"        validate:"required,oneof=COMPLETED FAILED"`
    OutputUrl     *string `from:"body" json:"outputUrl,omitempty"`
    FailureReason *string `from:"body" json:"failureReason,omitempty"`
}
```

### Step 2 — Define the controller struct and constructor

```go
type TranscoderCallbackController struct {
    completeJob *usecases.CompleteTranscodingJobHandler
    failJob     *usecases.FailTranscodingJobHandler
    secret      string
}

func NewTranscoderCallbackController(
    completeJob *usecases.CompleteTranscodingJobHandler,
    failJob     *usecases.FailTranscodingJobHandler,
) *TranscoderCallbackController {
    secret := os.Getenv("TRANSCODER_SIGNATURE_SECRET")
    if secret == "" {
        secret = "stubbed-signature"
    }
    return &TranscoderCallbackController{
        completeJob: completeJob,
        failJob:     failJob,
        secret:      secret,
    }
}
```

### Step 3 — Implement Metadata()

```go
func (c *TranscoderCallbackController) Metadata() types.ControllerMetadata {
    return types.ControllerMetadata{
        Context:     "transcoding",
        Path:        "/webhooks/transcoder-callback",
        Method:      "POST",
        Description: "Receive completion or failure callback from the transcoder service",
        Middlewares: []types.Middleware{ctxmiddleware.VerifyTranscoderSignature(c.secret)},
        Request:     TranscoderCallbackRequest{},
        Response:    nil,           // 204 No Content
        Status:      http.StatusNoContent,
        Errors:      []errors.ErrorCode{ctxerrors.CodeInvalidSignature, ctxerrors.CodeJobNotFound},
    }
}
```

For endpoints that return a body, point `Response` at the use case output zero value:

```go
Request:  ListInstancesRequest{},
Response: usecases.ListChannelsOutput{},   // reuse use case output directly
Status:   http.StatusOK,
```

### Step 4 — Implement Handle()

```go
func (c *TranscoderCallbackController) Handle(w http.ResponseWriter, r *http.Request) {
    // 1. Decode and validate request (DecodeRequest calls validator/v10 internally)
    req, err := httputil.DecodeRequest[TranscoderCallbackRequest](r)
    if err != nil {
        httputil.RespondError(w, err)
        return
    }

    // 2. Dispatch to use case(s)
    switch req.Status {
    case "COMPLETED":
        outputUrl := ""
        if req.OutputUrl != nil {
            outputUrl = *req.OutputUrl
        }
        _, err = c.completeJob.Execute(r.Context(), usecases.CompleteTranscodingJobInput{
            JobID:     req.JobID,
            OutputUrl: outputUrl,
        })
    case "FAILED":
        reason := ""
        if req.FailureReason != nil {
            reason = *req.FailureReason
        }
        _, err = c.failJob.Execute(r.Context(), usecases.FailTranscodingJobInput{
            JobID:         req.JobID,
            FailureReason: reason,
        })
    }

    if err != nil {
        httputil.RespondError(w, err)
        return
    }

    // 3. Respond
    httputil.RespondJSON(w, http.StatusNoContent, nil)
}
```

For a simple single-handler controller:

```go
func (c *ListChannelsController) Handle(w http.ResponseWriter, r *http.Request) {
    req, err := httputil.DecodeRequest[ListInstancesRequest](r)
    if err != nil {
        httputil.RespondError(w, err)
        return
    }

    output, err := c.handler.Execute(r.Context(), usecases.ListChannelsInput{
        OwnerID: req.OwnerID,
        Limit:   req.Limit,
        Offset:  req.Offset,
    })
    if err != nil {
        httputil.RespondError(w, err)
        return
    }

    httputil.RespondJSON(w, http.StatusOK, output)
}
```

## Middleware composition

Middlewares are `func(next http.Handler) http.Handler`. Attach them to a controller via `ControllerMetadata.Middlewares` — no global middleware registration per controller needed. The HTTP router applies them innermost-first (last entry in the slice runs first around `Handle`):

```go
Middlewares: []types.Middleware{ctxmiddleware.VerifyTranscoderSignature(c.secret)},
```

For context-owned middleware that needs constructor parameters (e.g., a secret), create a closure in the context's middleware package:

```go
// middleware/verify_transcoder_signature.go
func VerifyTranscoderSignature(secret string) func(next http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            sig := r.Header.Get("X-Transcoder-Signature")
            if sig == "" || sig != secret {
                httputil.RespondError(w, errors.NewBaseError(ctxerrors.CodeInvalidSignature, "invalid signature"))
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

Global middlewares (auth, tracing, CORS) are applied to all routes via `HttpRouter.Use(mw)` in `cmd/api/main.go`.

## Auth extraction

When authentication is required, the auth middleware injects identity into the request context. Controllers read it via a typed key:

```go
ownerID, _ := r.Context().Value(auth.OwnerIDKey).(string)
```

For non-authenticated endpoints (webhooks), the signature verification middleware guards before `Handle` is ever called.

## Complete example — CreateWhatsAppChannel

```go
package controllers

import (
    "net/http"

    "template/api-go/internal/channel/usecases"
    "template/core-go/pkg/httputil"
    "template/core-go/types"
)

type CreateWhatsAppChannelRequest struct {
    Name    string `from:"body" json:"name"    validate:"required,min=1,max=100" example:"My WhatsApp"`
    OwnerID string `from:"header" name:"X-Owner-Id" validate:"required,uuid" swaggerignore:"true"`
}

type CreateWhatsAppChannelController struct {
    handler *usecases.CreateChannelHandler
}

func NewCreateWhatsAppChannelController(handler *usecases.CreateChannelHandler) *CreateWhatsAppChannelController {
    return &CreateWhatsAppChannelController{handler: handler}
}

func (c *CreateWhatsAppChannelController) Metadata() types.ControllerMetadata {
    return types.ControllerMetadata{
        Context:     "channel",
        Path:        "/channels/whatsapp",
        Method:      "POST",
        Description: "Create a new WhatsApp channel",
        Tags:        []string{"Channel"},
        Request:     CreateWhatsAppChannelRequest{},
        Response:    usecases.CreateChannelOutput{},
        Status:      http.StatusCreated,
    }
}

func (c *CreateWhatsAppChannelController) Handle(w http.ResponseWriter, r *http.Request) {
    req, err := httputil.DecodeRequest[CreateWhatsAppChannelRequest](r)
    if err != nil {
        httputil.RespondError(w, err)
        return
    }

    output, err := c.handler.Execute(r.Context(), usecases.CreateChannelInput{
        Name:    req.Name,
        OwnerID: req.OwnerID,
    })
    if err != nil {
        httputil.RespondError(w, err)
        return
    }

    httputil.RespondJSON(w, http.StatusCreated, output)
}
```

And in `module.go`:

```go
fx.Provide(fx.Annotate(
    controllers.NewCreateWhatsAppChannelController,
    fx.As(new(types.Controller)),
    fx.ResultTags(`group:"controllers"`),
)),
```

## Checklist

- [ ] Request struct has `from`, `validate`, and `json`/`name` tags on every field
- [ ] Infrastructure fields carry `swaggerignore:"true"`
- [ ] `Metadata()` sets `Context`, `Path`, `Method`, `Description`, `Request`, `Response`, `Status`, `Errors`
- [ ] `Handle` calls `httputil.DecodeRequest` first and returns on error
- [ ] `Handle` calls `httputil.RespondError(w, err)` on use case error
- [ ] `Handle` calls `httputil.RespondJSON(w, status, output)` on success
- [ ] Controller registered in `module.go` via `fx.Annotate` with `fx.As(new(types.Controller))` and `fx.ResultTags(\`group:"controllers"\`)`
- [ ] Middlewares listed in `Metadata().Middlewares`, not injected into `Handle` manually
