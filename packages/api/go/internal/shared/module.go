// Package shared is the api-go-local fx module: everything the codm gateway
// wires on top of the generic core (template/core-go) module.
//
// Auth middlewares, the SSE ListenEvents controller and the docs routes are
// domain decisions and live here (template core/module.go: "auth middlewares
// are domain decisions"); the core keeps context-agnostic infrastructure. This
// module was briefly split into an internal/app package by the core-adequation
// plan (Lote 6) and folded back here — the extra folder bought nothing.
//
// Auth is contributed through the core's "app_middlewares" value group (NOT a
// local fx.Invoke calling router.Use): Use is registration-time, so the core
// consumes the group inside registerMiddlewares before registerControllers
// bakes the per-route chains. Final order: Recovery → Logging → Session →
// APIKey, byte-compatible with the pre-split module.
package shared

import (
	"net/http"

	sharedcontrollers "template/api-go/internal/shared/controllers"
	"template/api-go/internal/shared/middleware"
	"template/api-go/public"
	"template/core-go/config"
	"template/core-go/db/sqlite"
	"template/core-go/services/httprouter"
	"template/core-go/types"

	"go.uber.org/fx"
)

var Module = fx.Module("shared",
	// SSE Events Controller
	fx.Provide(fx.Annotate(
		sharedcontrollers.NewListenEventsController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),

	// Readiness Controller — GET /api/health, PUBLIC (see the controller's
	// docblock): it is the one route the shell's supervisor can reach before any
	// session or API key exists.
	fx.Provide(fx.Annotate(
		provideHealthController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),

	// Global auth chain (sanção #18): Session + APIKey, contributed to the
	// core middleware group.
	fx.Provide(fx.Annotate(
		newAuthMiddleware,
		fx.ResultTags(`group:"app_middlewares"`),
	)),

	// Lifecycle hooks
	fx.Invoke(registerDocsRoutes),
)

// provideHealthController hands the readiness controller the shared store's db
// handle — the same *sql.DB every other consumer uses, so "SELECT 1 answers" is a
// statement about the connection the process actually serves traffic on.
func provideHealthController(store *sqlite.SqliteStore) *sharedcontrollers.HealthController {
	return sharedcontrollers.NewHealthController(store.DB())
}

// newAuthMiddleware composes Session → APIKey as a single middleware so the
// intra-chain order is deterministic (fx value groups have no ordering).
// The session lookup now runs against the SHARED SQLite store (the same file the
// TS daemon will own once its own phase lands), not a separate Postgres — which
// is the whole point of the split-DB fix.
func newAuthMiddleware(cfg *config.Config, store *sqlite.SqliteStore) types.Middleware {
	return func(next http.Handler) http.Handler {
		h := next
		if cfg.GlobalAPIKey != "" {
			h = middleware.APIKey(cfg.GlobalAPIKey)(h)
		}
		return middleware.Session(store.DB())(h)
	}
}

func registerDocsRoutes(router *httprouter.HttpRouter) {
	router.RegisterDocsRoutes(public.OpenAPIJSON)
}
