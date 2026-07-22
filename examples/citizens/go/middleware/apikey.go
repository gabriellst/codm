// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/shared/middleware/apikey.go
// Harvested verbatim for the middleware skill exemplar set — do not edit; re-harvest instead.
package middleware

import (
	"net/http"

	"monorepo/api/internal/shared/errors"
	"monorepo/api/pkg/httputil"
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
