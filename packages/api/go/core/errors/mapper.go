package errors

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sync"
)

type ErrorResponse struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Details any       `json:"details,omitempty"`
}

var (
	statusMap = map[ErrorCode]int{}
	mu        sync.RWMutex
)

// RegisterErrorCodes registers additional error codes with their HTTP status codes.
// Bounded contexts use this to register their own error codes.
func RegisterErrorCodes(codes map[ErrorCode]int) {
	mu.Lock()
	defer mu.Unlock()
	for code, status := range codes {
		statusMap[code] = status
	}
}

// StatusForCode returns the HTTP status code for a given error code.
func StatusForCode(code ErrorCode) int {
	mu.RLock()
	defer mu.RUnlock()
	if status, ok := statusMap[code]; ok {
		return status
	}
	return http.StatusInternalServerError
}

// MapErrorToHTTP writes a JSON error response based on the error type.
func MapErrorToHTTP(w http.ResponseWriter, err error) {
	var appErr *AppError
	if errors.As(err, &appErr) {
		status := StatusForCode(appErr.Code)
		writeJSON(w, status, ErrorResponse{
			Code:    appErr.Code,
			Message: appErr.Message,
			Details: appErr.Details,
		})
		return
	}

	slog.Error("unhandled error in HTTP mapper", "error", err)
	writeJSON(w, http.StatusInternalServerError, ErrorResponse{
		Code:    "INTERNAL_ERROR",
		Message: "an unexpected error occurred",
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}
