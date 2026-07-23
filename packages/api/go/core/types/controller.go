package types

import (
	"net/http"

	"template/core-go/errors"
)

// ControllerMetadata defines the declarative metadata for route registration
// and spec emission (OpenAPI 3.1). The new Request/Response/Status/Errors fields
// are read by the Go OpenAPI emitter at `channel/pkg/openapi/` to produce
// the spec directly from Go source, replacing swag annotations.
type ControllerMetadata struct {
	Context     string // bounded context name (e.g., "auth", "todos"); empty for shared
	Path        string // controller-local path (e.g., "/sign-up", "/{id}/complete")
	Method      string // "GET", "POST", "PUT", "PATCH", "DELETE"
	Description string
	Tags        []string // for grouping (mirrors swag tags)
	Middlewares []Middleware

	// Spec-emission fields (mirror TS `inputSchema` / `outputSchema`).
	//
	// Request is the zero value of the request struct (nil if no body/params).
	// Response is the zero value of the response struct (nil for 204 / no body).
	// Status is the default success status code (0 defaults to 200 when Response != nil,
	// or 204 when Response == nil).
	// Errors lists the domain/app error codes this endpoint may return; the emitter
	// turns each into a `4xx/5xx` response entry using shared/errors' ErrorResponse component.
	Request  any
	Response any
	Status   int
	Errors   []errors.ErrorCode
}

// ResolvedStatus returns the effective success status, applying the default rule.
func (m ControllerMetadata) ResolvedStatus() int {
	if m.Status != 0 {
		return m.Status
	}
	if m.Response == nil {
		return http.StatusNoContent
	}
	return http.StatusOK
}

// Controller is the interface every HTTP controller implements.
// The HttpRouter reads Metadata() to auto-register routes, then calls Handle.
// Each concrete controller MUST have swag annotations on the Handle method.
type Controller interface {
	Metadata() ControllerMetadata
	Handle(w http.ResponseWriter, r *http.Request)
}
