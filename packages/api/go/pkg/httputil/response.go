package httputil

import (
	"encoding/json"
	"net/http"

	"template/api-go/internal/shared/errors"
)

// ErrorResponse is an alias for errors.AppError used in swag annotations.
// Controllers already import httputil, so swag can resolve httputil.ErrorResponse
// without needing --parseDependency (which collides with the stdlib "errors" package).
type ErrorResponse = errors.AppError

// RespondJSON writes a JSON response with the given status code.
func RespondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			http.Error(w, "failed to encode response", http.StatusInternalServerError)
		}
	}
}

// RespondError maps an error to the appropriate HTTP response.
func RespondError(w http.ResponseWriter, err error) {
	errors.MapErrorToHTTP(w, err)
}
