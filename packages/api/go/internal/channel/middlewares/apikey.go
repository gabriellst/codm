// Package middlewares holds the channel gateway's HTTP middlewares.
package middlewares

import (
	"net/http"

	"template/core-go/errors"
	"template/core-go/pkg/httputil"
	"template/core-go/types"
)

// APIKey guards the gateway HTTP surface for service-to-service calls: the TS
// daemon sends the shared secret in the `apikey` header. When the configured
// key is empty (local single-operator), all requests are allowed — the same
// bypass the source gateway used.
func APIKey(globalAPIKey string) types.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if globalAPIKey == "" {
				next.ServeHTTP(w, r)
				return
			}

			key := r.Header.Get("apikey")
			if key == "" {
				httputil.RespondError(w, errors.NewBaseError(errors.CodeUnauthorized, "apikey header is required"))
				return
			}
			if key != globalAPIKey {
				httputil.RespondError(w, errors.NewBaseError(errors.CodeUnauthorized, "invalid API key"))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
