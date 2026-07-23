// Package shared exposes the framework fx.Module that wires every
// context-agnostic infrastructure service. Bounded contexts compose
// this with their own modules in their app's fx.New() call.
package shared

import (
	"context"
	"log/slog"
	"net/http"

	"template/core-go/config"
	"template/core-go/db/sql"
	"template/core-go/middleware"
	"template/core-go/repositories"
	"template/core-go/services/httprouter"
	"template/core-go/services/mediator"
	"template/core-go/services/outbox"
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

	// HTTP Router
	fx.Provide(httprouter.NewHttpRouter),

	// Lifecycle hooks
	fx.Invoke(
		fx.Annotate(
			registerMiddlewares,
			fx.ParamTags(``, `group:"app_middlewares"`),
		),
	),
	fx.Invoke(
		fx.Annotate(
			registerControllers,
			fx.ParamTags(``, `group:"controllers"`),
		),
	),
	fx.Invoke(startMediators),
	fx.Invoke(startOutboxDispatcher),
)

// registerMiddlewares installs the framework middlewares and then every
// app-contributed middleware (value group "app_middlewares").
//
// Auth middlewares (session, api-key) are domain decisions, not framework
// defaults (template core/module.go) — each app contributes them through the
// group instead of calling router.Use from its own fx.Invoke: Use is
// registration-time, and an app invoke would only run AFTER
// registerControllers has already baked the per-route chains, silently
// dropping auth from every route (core-adequation plan, risk #6).
func registerMiddlewares(router *httprouter.HttpRouter, appMiddlewares []types.Middleware) {
	router.Use(middleware.Recovery)
	router.Use(middleware.Logging)
	for _, mw := range appMiddlewares {
		router.Use(mw)
	}
}

func registerControllers(router *httprouter.HttpRouter, controllers []types.Controller) {
	router.RegisterControllers(controllers)
}

type mediatorParams struct {
	fx.In

	Lifecycle fx.Lifecycle
	Internal  mediator.InternalMediator
	External  mediator.ExternalMediator
}

func startMediators(p mediatorParams) {
	p.Lifecycle.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			p.Internal.Start(ctx)
			slog.Info("internal mediator started")

			if err := p.External.Start(ctx); err != nil {
				slog.Error("failed to start external mediator", "error", err)
				return err
			}
			slog.Info("external mediator started")

			return nil
		},
		OnStop: func(ctx context.Context) error {
			if err := p.External.Stop(ctx); err != nil {
				slog.Error("failed to stop external mediator", "error", err)
			}
			p.Internal.Stop()
			slog.Info("mediators stopped")
			return nil
		},
	})
}

func startOutboxDispatcher(lc fx.Lifecycle, dispatcher *outbox.OutboxDispatcher) {
	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			dispatcher.Start(ctx)
			slog.Info("outbox dispatcher started")
			return nil
		},
		OnStop: func(ctx context.Context) error {
			dispatcher.Stop()
			slog.Info("outbox dispatcher stopped")
			return nil
		},
	})
}

// StartHTTPServer starts the HTTP server as an fx lifecycle hook.
//
// NOTE(core-adequation): unlike the template's core, the handler is wrapped in
// the CORS middleware — codedm's console talks to the gateway cross-origin.
func StartHTTPServer(lc fx.Lifecycle, router *httprouter.HttpRouter, cfg *config.Config) {
	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: middleware.CORS(cfg.AllowedOrigins, router.Handler()),
	}

	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			go func() {
				slog.Info("http server started", "addr", server.Addr)
				if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
					slog.Error("http server error", "error", err)
				}
			}()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			slog.Info("http server shutting down")
			return server.Shutdown(ctx)
		},
	})
}
