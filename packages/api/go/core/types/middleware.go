package types

import "net/http"

// Middleware wraps an http.Handler, following the standard Go middleware convention.
type Middleware func(next http.Handler) http.Handler
