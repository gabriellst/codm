package shared

import (
	"context"
	stdsql "database/sql"
	"io/fs"
	"log/slog"
	"net/http"
	sharedcontrollers "template/api-go/internal/shared/controllers"
	"template/api-go/internal/shared/middleware"
	"template/api-go/public"
	"template/core-go/config"
	"template/core-go/db/sql"
	coremw "template/core-go/middleware"
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

	// SSE Events Controller
	fx.Provide(fx.Annotate(
		sharedcontrollers.NewListenEventsController,
		fx.As(new(types.Controller)),
		fx.ResultTags(`group:"controllers"`),
	)),

	// Lifecycle hooks
	fx.Invoke(registerMiddlewares),
	fx.Invoke(
		fx.Annotate(
			registerControllers,
			fx.ParamTags(``, `group:"controllers"`),
		),
	),
	fx.Invoke(registerDocsRoutes),
	fx.Invoke(registerSPA),
	fx.Invoke(startMediators),
	fx.Invoke(startOutboxDispatcher),
)

func registerMiddlewares(router *httprouter.HttpRouter, cfg *config.Config, db *stdsql.DB) {
	router.Use(coremw.Recovery)
	router.Use(coremw.Logging)
	router.Use(middleware.Session(db))
	if cfg.GlobalAPIKey != "" {
		router.Use(middleware.APIKey(cfg.GlobalAPIKey))
	}
}

func registerControllers(router *httprouter.HttpRouter, controllers []types.Controller) {
	router.RegisterControllers(controllers)
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
func StartHTTPServer(lc fx.Lifecycle, router *httprouter.HttpRouter, cfg *config.Config) {
	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: coremw.CORS(cfg.AllowedOrigins, router.Handler()),
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
