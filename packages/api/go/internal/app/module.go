// Package app is the api-go-local fx module: everything the codedm gateway
// wires on top of the generic core (template/core-go) module.
//
// Split out of the old internal/shared/module.go by the core-adequation plan
// (Lote 6): the core keeps context-agnostic infrastructure; auth middlewares,
// the SSE ListenEvents controller, the docs routes and the embedded SPA are
// domain decisions and live here (template core/module.go: "auth middlewares
// are domain decisions").
//
// Auth is contributed through the core's "app_middlewares" value group (NOT a
// local fx.Invoke calling router.Use): Use is registration-time, so the core
// consumes the group inside registerMiddlewares before registerControllers
// bakes the per-route chains. Final order: Recovery → Logging → Session →
// APIKey, byte-compatible with the pre-split module.
package app

import (
	stdsql "database/sql"
	"io/fs"
	"log/slog"
	"net/http"

	sharedcontrollers "template/api-go/internal/shared/controllers"
	"template/api-go/internal/shared/middleware"
	"template/api-go/public"
	"template/core-go/config"
	"template/core-go/services/httprouter"
	"template/core-go/types"

	"go.uber.org/fx"
)

var Module = fx.Module("app",
	// SSE Events Controller
	fx.Provide(fx.Annotate(
		sharedcontrollers.NewListenEventsController,
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
	fx.Invoke(registerSPA),
)

// newAuthMiddleware composes Session → APIKey as a single middleware so the
// intra-chain order is deterministic (fx value groups have no ordering).
func newAuthMiddleware(cfg *config.Config, db *stdsql.DB) types.Middleware {
	return func(next http.Handler) http.Handler {
		h := next
		if cfg.GlobalAPIKey != "" {
			h = middleware.APIKey(cfg.GlobalAPIKey)(h)
		}
		return middleware.Session(db)(h)
	}
}

func registerDocsRoutes(router *httprouter.HttpRouter) {
	router.RegisterDocsRoutes(public.OpenAPIJSON)
}

func registerSPA(router *httprouter.HttpRouter) {
	appFS, err := fs.Sub(public.AppFS, "app")
	if err != nil {
		slog.Error("failed to access embedded app filesystem", "error", err)
		return
	}
	router.RegisterSPA(appFS)
}
