package middleware

import (
	"net/http"

	"template/api-go/internal/shared/errors"
	"template/api-go/pkg/httputil"
)

// APIKey creates a middleware that validates the apikey header against the global API key.
// If the global API key is empty, all requests are allowed.
func APIKey(globalAPIKey string) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// If no global API key is configured, allow all requests
			if globalAPIKey == "" {
				next.ServeHTTP(w, r)
				return
			}

			apikey := r.Header.Get("apikey")
			if apikey == "" {
				httputil.RespondError(w, errors.NewBaseError(errors.CodeUnauthorized, "apikey header is required"))
				return
			}

			if apikey != globalAPIKey {
				httputil.RespondError(w, errors.NewBaseError(errors.CodeUnauthorized, "invalid API key"))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
