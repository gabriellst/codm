// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/shared/errors/app_error.go
// Harvested verbatim for the errors skill exemplar set — do not edit; re-harvest instead.
package errors

import "fmt"

type ErrorCode string

// AppError is the unified error type used across all layers.
// Layers (domain, application, interface, infrastructure) are just for code organization —
// they don't appear in the error struct itself.
type AppError struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Details any       `json:"details,omitempty"`
	Cause   error     `json:"-"`
}

func (e *AppError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s (caused by: %v)", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error {
	return e.Cause
}

// NewBaseError creates an AppError with a code and message.
func NewBaseError(code ErrorCode, message string) *AppError {
	return &AppError{Code: code, Message: message}
}

// NewBaseErrorWithCause creates an AppError with a code, message, and underlying cause.
func NewBaseErrorWithCause(code ErrorCode, message string, cause error) *AppError {
	return &AppError{Code: code, Message: message, Cause: cause}
}
