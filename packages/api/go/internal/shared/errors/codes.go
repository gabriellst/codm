package errors

import "net/http"

// Domain error codes
const (
	CodeInvalidID     ErrorCode = "INVALID_ID"
	CodeBusinessRule  ErrorCode = "BUSINESS_RULE_VIOLATION"
	CodeInvalidEntity ErrorCode = "INVALID_ENTITY"
)

// Application error codes
const (
	CodeNotFound         ErrorCode = "NOT_FOUND"
	CodeEntityConflict   ErrorCode = "ENTITY_CONFLICT"
	CodeValidationFailed ErrorCode = "VALIDATION_FAILED"
	CodeUnauthorized     ErrorCode = "UNAUTHORIZED"
	CodeForbidden        ErrorCode = "FORBIDDEN"
)

// Interface error codes
const (
	CodeBadRequest       ErrorCode = "BAD_REQUEST"
	CodeMethodNotAllowed ErrorCode = "METHOD_NOT_ALLOWED"
)

// Infrastructure error codes
const (
	CodeDatabaseError          ErrorCode = "DATABASE_ERROR"
	CodeExternalService        ErrorCode = "EXTERNAL_SERVICE_ERROR"
	CodeMissingEnvVar          ErrorCode = "MISSING_ENVIRONMENT_VARIABLE"
	CodeOptimisticLockConflict ErrorCode = "OPTIMISTIC_LOCK_CONFLICT"
)

func init() {
	RegisterErrorCodes(map[ErrorCode]int{
		CodeInvalidID:     http.StatusUnprocessableEntity,
		CodeBusinessRule:  http.StatusUnprocessableEntity,
		CodeInvalidEntity: http.StatusUnprocessableEntity,
		CodeNotFound:         http.StatusNotFound,
		CodeEntityConflict:   http.StatusConflict,
		CodeValidationFailed: http.StatusBadRequest,
		CodeUnauthorized:     http.StatusUnauthorized,
		CodeForbidden:        http.StatusForbidden,
		CodeBadRequest:       http.StatusBadRequest,
		CodeMethodNotAllowed: http.StatusMethodNotAllowed,
		CodeDatabaseError:          http.StatusInternalServerError,
		CodeExternalService:        http.StatusBadGateway,
		CodeMissingEnvVar:          http.StatusInternalServerError,
		CodeOptimisticLockConflict: http.StatusConflict,
	})
}
