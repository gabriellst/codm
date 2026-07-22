package errors

import "net/http"

// Framework error codes — generic, not domain-specific. Bounded contexts add
// their own codes via RegisterErrorCodes (see internal/<ctx>/errors/codes.go).

// Domain-shape errors (validation primitives every domain re-uses).
const (
	CodeInvalidEntity ErrorCode = "INVALID_ENTITY"
	CodeBusinessRule  ErrorCode = "BUSINESS_RULE_VIOLATION"
	CodeInvalidID     ErrorCode = "INVALID_ID"
)

// Application error codes (use-case-layer failures).
const (
	CodeNotFound         ErrorCode = "NOT_FOUND"
	CodeEntityConflict   ErrorCode = "ENTITY_CONFLICT"
	CodeValidationFailed ErrorCode = "VALIDATION_FAILED"
	CodeUnauthorized     ErrorCode = "UNAUTHORIZED"
	CodeForbidden        ErrorCode = "FORBIDDEN"
)

// Interface error codes (HTTP/transport-layer failures).
const (
	CodeBadRequest       ErrorCode = "BAD_REQUEST"
	CodeMethodNotAllowed ErrorCode = "METHOD_NOT_ALLOWED"
)

// Infrastructure error codes.
const (
	CodeDatabaseError          ErrorCode = "DATABASE_ERROR"
	CodeExternalService        ErrorCode = "EXTERNAL_SERVICE_ERROR"
	CodeMissingEnvVar          ErrorCode = "MISSING_ENVIRONMENT_VARIABLE"
	CodeOptimisticLockConflict ErrorCode = "OPTIMISTIC_LOCK_CONFLICT"
)

func init() {
	RegisterErrorCodes(map[ErrorCode]int{
		CodeInvalidEntity:          http.StatusUnprocessableEntity,
		CodeBusinessRule:           http.StatusUnprocessableEntity,
		CodeInvalidID:              http.StatusUnprocessableEntity,
		CodeNotFound:               http.StatusNotFound,
		CodeEntityConflict:         http.StatusConflict,
		CodeValidationFailed:       http.StatusBadRequest,
		CodeUnauthorized:           http.StatusUnauthorized,
		CodeForbidden:              http.StatusForbidden,
		CodeBadRequest:             http.StatusBadRequest,
		CodeMethodNotAllowed:       http.StatusMethodNotAllowed,
		CodeDatabaseError:          http.StatusInternalServerError,
		CodeExternalService:        http.StatusBadGateway,
		CodeMissingEnvVar:          http.StatusInternalServerError,
		CodeOptimisticLockConflict: http.StatusConflict,
	})
}
