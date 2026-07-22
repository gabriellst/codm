package middleware

import (
	"log/slog"
	"net/http"

	"template/api-go/internal/shared/errors"
)

func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic recovered", "panic", rec, "path", r.URL.Path, "method", r.Method)
				errors.MapErrorToHTTP(w, errors.NewBaseError("PANIC", "internal server error"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}
