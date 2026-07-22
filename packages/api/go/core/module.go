// Package shared exposes the framework fx.Module that wires every
// context-agnostic infrastructure service. Bounded contexts compose
// this with their own modules in their app's fx.New() call.
package shared

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"log/slog"
	"net/http"

	"template/core-go/config"
	"template/core-go/db/sql"
	"template/core-go/middleware"
	"template/core-go/repositories"
	"template/core-go/services/httprouter"
	"template/core-go/services/mediator"
	"template/core-go/services/outbox"
	"template/core-go/services/tsclient"
	"template/core-go/services/unitofwork"
	"template/core-go/types"

	"go.uber.org/fx"
)

var Module = fx.Module("shared",
	// Config
	fx.Provide(config.Load),

	// Database
	fx.Provide(sql.NewPostgresDB),

	// Infrastructure
	fx.Provide(fx.Annotate(unitofwork.NewNoopUnitOfWork, fx.As(new(unitofwork.UnitOfWork)))),
	fx.Provide(fx.Annotate(mediator.NewRedisExternalMediator, fx.As(new(mediator.ExternalMediator)))),

	// Internal Mediator (domain events via channels)
	fx.Provide(fx.Annotate(mediator.NewChannelMediator, fx.As(new(mediator.InternalMediator)))),

	// Domain Event Repository (dual-writes to events + outbox)
	fx.Provide(fx.Annotate(
		repositories.NewPgDomainEventRepository,
		fx.As(new(repositories.DomainEventRepository)),
	)),

	// Outbox Dispatcher (polls outbox → dispatches to InternalMediator)
	fx.Provide(outbox.NewOutboxDispatcher),

	// TS API client (Go→TS, service-to-service with x-internal-service-key)
	fx.Provide(tsclient.NewClient),

	// HTTP Router
	fx.Provide(httprouter.NewHttpRouter),

	// Lifecycle hooks
	fx.Invoke(registerMiddlewares),
	fx.Invoke(
		fx.Annotate(
			registerControllers,
			fx.ParamTags(``, `group:"controllers"`),
		),
	),
	fx.Invoke(func(lc fx.Lifecycle, em mediator.ExternalMediator, ob *outbox.OutboxDispatcher) {
		lc.Append(fx.Hook{
			OnStart: func(ctx context.Context) error {
				if err := em.Start(ctx); err != nil {
					return err
				}
				ob.Start(ctx)
				return nil
			},
			OnStop: func(ctx context.Context) error {
				ob.Stop()
				return em.Stop(ctx)
			},
		})
	}),
)

func registerMiddlewares(router *httprouter.HttpRouter, cfg *config.Config, db *stdsql.DB) {
	router.Use(middleware.Recovery)
	router.Use(middleware.Logging)
	// Auth middlewares (session, api-key) are domain decisions, not framework
	// defaults — let each app wire them in its own fx module if needed.
}

func registerControllers(router *httprouter.HttpRouter, controllers []types.Controller) {
	router.RegisterControllers(controllers)
}

// StartHTTPServer is an fx.Invoke target that starts the HTTP server
// and registers a graceful-shutdown lifecycle hook.
// Usage: fx.Invoke(shared.StartHTTPServer)
func StartHTTPServer(lc fx.Lifecycle, router *httprouter.HttpRouter, cfg *config.Config) {
	addr := fmt.Sprintf(":%s", cfg.Port)
	srv := &http.Server{
		Addr:    addr,
		Handler: router.Handler(),
	}

	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			slog.Info("http server starting", "addr", addr)
			go func() {
				if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
					slog.Error("http server error", "error", err)
				}
			}()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			slog.Info("http server stopping")
			return srv.Shutdown(ctx)
		},
	})
}
