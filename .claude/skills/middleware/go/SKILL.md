---
name: middleware-go
description: "Create an HTTP middleware in Go. Use for cross-cutting concerns that run before a controller: signature verification, API key auth, session resolution, rate limiting. Middlewares are plain func(http.Handler) http.Handler values wired via ControllerMetadata.Middlewares."
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional before coding.
> 2. **`bad_practices`** — keep these violations in mind throughout implementation.

# Create HTTP Middleware (Go)

Creates an HTTP middleware — a cross-cutting concern that runs **before** a controller executes. Middlewares enforce authentication, guard context (session, signature, API key), or gate flows. They reject the request early with a typed error or pass through to the next handler.

## Why Middlewares Exist

Controllers stay narrow and business-focused. Middlewares carry cross-cutting concerns that must run for every endpoint in a class of routes. In Go, a middleware is simply a function that wraps an `http.Handler`:

```go
type Middleware func(next http.Handler) http.Handler
```

This is the canonical `types.Middleware` type in `template/core-go/types`.

## When to Use This Skill

- Validating a shared secret / HMAC signature on webhook endpoints
- Checking an API key header
- Resolving a session cookie into an owner ID and injecting it as a request header
- Rate limiting or audit logging applied to a class of routes
- Enforcing an operating-context guard (e.g. must be an authenticated channel owner)

## When NOT to Use This Skill

- Business validation that belongs in a use case or entity invariant
- Per-endpoint input validation — handled by the controller's struct + validate tags
- Side effects after the operation succeeds — use event handlers

## Two Placement Patterns

### 1. Shared middleware (`internal/shared/middleware/` or `core/middleware/`)

Applies to many contexts. Examples: session resolution, CORS, logging, global API key.

```
packages/api/go/
└── internal/
    └── shared/
        └── middleware/
            ├── session.go             # Session cookie → X-Owner-Id header
            ├── apikey.go              # apikey header validation
            ├── logging.go             # structured request/response logging
            └── recovery.go            # panic recovery → 500
```

### 2. Context-local middleware (`internal/<ctx>/middleware/`)

Applies only to one bounded context. Example: transcoder signature verification.

```
internal/transcoding/
└── middleware/
    └── verify_transcoder_signature.go
```

## The Middleware Function

A middleware is a factory function that returns a `func(next http.Handler) http.Handler`:

```go
// VerifyTranscoderSignature validates the X-Transcoder-Signature header against
// a shared secret. Rejects with CodeInvalidSignature (401) on mismatch.
//
// Usage in ControllerMetadata:
//
//	Middlewares: []types.Middleware{middleware.VerifyTranscoderSignature(secret)},
func VerifyTranscoderSignature(secret string) func(next http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            sig := r.Header.Get("X-Transcoder-Signature")
            if sig == "" || sig != secret {
                httputil.RespondError(w, errors.NewBaseError(
                    ctxerrors.CodeInvalidSignature,
                    "invalid or missing X-Transcoder-Signature header",
                ))
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

Key points:
- If the check fails, call `httputil.RespondError(w, err)` and **return** — do not call `next.ServeHTTP`.
- If the check passes, call `next.ServeHTTP(w, r)` and return.
- Use `errors.NewBaseError(errorCode, msg)` from `template/core-go/errors` to produce a structured error with the right HTTP status.

## Session Middleware (Header Injection Pattern)

When the middleware resolves an identity and injects it for downstream controllers:

```go
// Session reads the BetterAuth session cookie, resolves the ownerID from the
// DB, and injects it as the X-Owner-Id request header.
func Session(db *sql.DB) func(next http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            rawToken := extractCookie(r, "better-auth.session_token")
            if rawToken == "" {
                next.ServeHTTP(w, r)
                return
            }

            token := stripSignature(rawToken)

            var ownerID sql.NullString
            _ = db.QueryRowContext(r.Context(),
                `SELECT owner_id FROM authentication.session WHERE token = $1 AND expires_at > NOW()`,
                token,
            ).Scan(&ownerID)

            if ownerID.Valid && ownerID.String != "" {
                r.Header.Set("X-Owner-Id", ownerID.String)
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

This middleware never rejects — it enriches and passes through. The controller reads `r.Header.Get("X-Owner-Id")` or the `from:"header"` struct tag.

## API Key Middleware

```go
// APIKey validates the `apikey` request header against a configured global key.
// If globalAPIKey is empty, all requests are allowed (useful in dev).
func APIKey(globalAPIKey string) func(next http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            if globalAPIKey == "" {
                next.ServeHTTP(w, r)
                return
            }
            apikey := r.Header.Get("apikey")
            if apikey == "" || apikey != globalAPIKey {
                httputil.RespondError(w, errors.NewBaseError(
                    errors.CodeUnauthorized, "invalid or missing API key"))
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

## Wiring via ControllerMetadata

Middlewares are attached per controller via `ControllerMetadata.Middlewares`. The `httprouter` service reads this slice and wraps the controller's `Handle` method before registering the route:

```go
// In the controller file:
func (c *TranscoderCallbackController) Metadata() types.ControllerMetadata {
    return types.ControllerMetadata{
        Context:     "transcoding",
        Path:        "/webhooks/transcoder-callback",
        Method:      "POST",
        Description: "Receives transcoding completion callbacks from the external transcoder service",
        Middlewares: []types.Middleware{
            middleware.VerifyTranscoderSignature(c.secret),
        },
    }
}
```

The `Middlewares` slice is applied in order: `middlewares[0](middlewares[1](...(handler)))`. Earlier middlewares run first.

For global middlewares (logging, recovery, CORS), wire them at the router level inside the shared module rather than per controller.

## Error Codes

Each middleware uses error codes defined in the relevant `errors/` package:

```go
// Context-local error code
errors.NewBaseError(ctxerrors.CodeInvalidSignature, "...")

// Shared error code
errors.NewBaseError(errors.CodeUnauthorized, "...")
```

Error codes are registered in the context's `errors/` package init function, which maps them to HTTP status codes. The `httputil.RespondError` function serialises the error as JSON and sets the status code.

## Checklist

- [ ] Middleware is a factory function returning `func(next http.Handler) http.Handler`
- [ ] On failure: `httputil.RespondError(w, err)` then `return` — never fall through to `next`
- [ ] On success: call `next.ServeHTTP(w, r)` at the end
- [ ] Uses `errors.NewBaseError(code, msg)` with a registered error code
- [ ] Wired via `ControllerMetadata.Middlewares` (context-local) or router level (global)
- [ ] Shared middlewares live in `internal/shared/middleware/`; context-local in `internal/<ctx>/middleware/`

## References

- `packages/api/go/internal/transcoding/middleware/verify_transcoder_signature.go` — canonical context-local shape
- `dev:packages/channel/internal/shared/middleware/apikey.go` — global API key guard
- `dev:packages/channel/internal/shared/middleware/session.go` — header injection pattern
- `packages/api/go/core/types/middleware.go` — `types.Middleware` type alias
- `packages/api/go/core/types/controller.go` — `ControllerMetadata.Middlewares` field
