package httprouter

import (
	"fmt"
	"log/slog"
	"net/http"

	"template/core-go/config"
	"template/core-go/types"
)

const scalarHTML = `<!DOCTYPE html>
<html>
<head>
  <title>API Reference</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/api/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`

// HttpRouter wraps http.ServeMux and auto-registers controllers.
type HttpRouter struct {
	mux         *http.ServeMux
	version     string
	middlewares []types.Middleware
}

func NewHttpRouter(cfg *config.Config) *HttpRouter {
	return &HttpRouter{
		mux:     http.NewServeMux(),
		version: cfg.Version,
	}
}

// Use adds a global middleware applied to all routes.
func (r *HttpRouter) Use(mw types.Middleware) {
	r.middlewares = append(r.middlewares, mw)
}

// RegisterControllers registers all controllers by reading their metadata.
// Routes are built as: /api/{version}/{context}{path} (shared context has no prefix).
func (r *HttpRouter) RegisterControllers(controllers []types.Controller) {
	for _, c := range controllers {
		meta := c.Metadata()

		fullPath := "/api/" + r.version
		if meta.Context != "" {
			fullPath += "/" + meta.Context
		}
		fullPath += meta.Path

		pattern := meta.Method + " " + fullPath

		var handler http.Handler = http.HandlerFunc(c.Handle)

		// Apply controller-specific middlewares (innermost first)
		for i := len(meta.Middlewares) - 1; i >= 0; i-- {
			handler = meta.Middlewares[i](handler)
		}

		// Apply global middlewares (outermost first)
		for i := len(r.middlewares) - 1; i >= 0; i-- {
			handler = r.middlewares[i](handler)
		}

		r.mux.Handle(pattern, handler)
		slog.Info("registered route", "method", meta.Method, "path", fullPath, "description", meta.Description)
	}
}

// RegisterDocsRoutes registers /api/openapi.json and /api/docs (Scalar API Reference).
func (r *HttpRouter) RegisterDocsRoutes(openapiJSON []byte) {
	r.mux.HandleFunc("GET /api/openapi.json", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(openapiJSON)
	})

	r.mux.HandleFunc("GET /api/docs", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(scalarHTML))
	})

	slog.Info("registered docs routes", "openapi", "/api/openapi.json", "scalar", "/api/docs")
}

// Handler returns the underlying http.Handler for use with http.ListenAndServe.
func (r *HttpRouter) Handler() http.Handler {
	return r.mux
}

// PrintRoutes logs all registered route patterns (for debugging).
func (r *HttpRouter) PrintRoutes() {
	fmt.Println("Registered routes:")
	fmt.Println("  GET /api/openapi.json")
	fmt.Println("  GET /api/docs")
	fmt.Println("  GET / (SPA)")
}
