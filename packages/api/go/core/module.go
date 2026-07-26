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
	"template/core-go/db/sqlite"
	"template/core-go/middleware"
	"template/core-go/repositories"
	"template/core-go/services/httprouter"
	"template/core-go/services/mediator"
	"template/core-go/services/outbox"
	"template/core-go/services/unitofwork"
	"template/core-go/types"

	"go.uber.org/fx"
)

// integrationOutboxSource is this producer's discriminator in the shared_outbox
// table. The SqlExternalMediator claims only rows of this source whose event name
// has a registered ingress handler; the domain-event OutboxDispatcher polls its
// own ("gateway") slice, so the two never contend over the same rows.
const integrationOutboxSource = "integration"

var Module = fx.Module("shared",
	// Config
	fx.Provide(config.Load),

	// Database
	fx.Provide(sql.NewPostgresDB),

	// Infrastructure
	fx.Provide(fx.Annotate(unitofwork.NewNoopUnitOfWork, fx.As(new(unitofwork.UnitOfWork)))),

	// SQLite substrate + the outbox-as-transport external mediator (Redis retired).
	// The store owns its whole lifecycle behind NewSqliteStore; provideSqliteStore
	// only hands it the data-dir from config and closes it on shutdown.
	fx.Provide(provideSqliteStore),
	fx.Provide(fx.Annotate(provideSqlExternalMediator, fx.As(new(mediator.ExternalMediator)))),

	// Domain-event wake-up strategy for the SQLite substrate — SHARED between the
	// SqliteOutboxDispatcher (waits on it) and the SqliteUnitOfWork (nudges it on
	// commit). The integration SqlExternalMediator keeps its OWN strategy (built
	// inside provideSqlExternalMediator), so this is the only one in the fx graph.
	fx.Provide(provideDomainOutboxNotify),

	// SQLite domain-event OutboxDispatcher — claims the rows the dual-write stamps
	// (source = OutboxSource) and fans them to the InternalMediator, running the
	// write→claim→dispatch loop against the SqliteStore.
	fx.Provide(provideSqliteOutboxDispatcher),

	// Internal Mediator (domain events via channels)
	fx.Provide(fx.Annotate(mediator.NewChannelMediator, fx.As(new(mediator.InternalMediator)))),

	// Domain Event Repository (dual-writes to events + outbox)
	fx.Provide(fx.Annotate(
		repositories.NewPgDomainEventRepository,
		fx.As(new(repositories.DomainEventRepository)),
	)),

	// SQLite domain-event repository — the audit-log event store for the
	// SQLite-backed contexts (workspace/owner and the rest of the go-domain port).
	// Provided as its CONCRETE type, NOT bound to the DomainEventRepository
	// interface: that binding belongs to the pg impl above (channel), and a second
	// interface provider would collide. SQLite repos depend on the concrete type.
	fx.Provide(repositories.NewSqliteDomainEventRepository),

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
	fx.Invoke(startSqliteOutboxDispatcher),
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

// provideSqliteStore constructs the single WAL SQLite store the outbox-as-transport
// mediator rides on and registers its Close as an fx OnStop hook. Because the store
// is constructed while fx resolves the mediator (which startMediators depends on),
// its Close hook is appended BEFORE startMediators' hook — so on shutdown fx runs
// them in reverse: mediator.Stop (halts the claim loop) then store.Close (closes the
// db). The claim loop never queries a closed handle.
func provideSqliteStore(lc fx.Lifecycle, cfg *config.Config) (*sqlite.SqliteStore, error) {
	store, err := sqlite.NewSqliteStore(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	lc.Append(fx.Hook{
		OnStop: func(context.Context) error {
			slog.Info("sqlite store closing")
			return store.Close()
		},
	})
	return store, nil
}

// provideSqlExternalMediator builds the concrete ExternalMediator over the store's
// db. The SqliteWalPollingStrategy gives the single-binary target an in-process
// nudge (near-zero latency) and the interim multi-process desktop an adaptive WAL
// poll — one mechanism for both (go-domain-design.md §3(b)).
func provideSqlExternalMediator(store *sqlite.SqliteStore) *mediator.SqlExternalMediator {
	notify := mediator.NewSqliteWalPollingStrategy(0, 0) // package defaults (50ms → 2s)
	return mediator.NewSqlExternalMediator(store.DB(), integrationOutboxSource, notify)
}

// provideDomainOutboxNotify builds the SQLite domain-event wake-up strategy shared
// by the dispatcher (Wait) and the unit of work (Notify on commit). Package
// defaults: 50ms tight poll after activity → 2s during quiet periods.
func provideDomainOutboxNotify() *mediator.SqliteWalPollingStrategy {
	return mediator.NewSqliteWalPollingStrategy(0, 0)
}

// provideSqliteOutboxDispatcher builds the domain-event dispatcher over the store's
// db, fanning claimed rows to the InternalMediator. It shares the domain notify
// strategy so a committed unit's nudge wakes it with near-zero latency.
func provideSqliteOutboxDispatcher(
	store *sqlite.SqliteStore,
	internal mediator.InternalMediator,
	notify *mediator.SqliteWalPollingStrategy,
) *outbox.SqliteOutboxDispatcher {
	return outbox.NewSqliteOutboxDispatcher(store.DB(), internal, notify)
}

// startSqliteOutboxDispatcher runs the domain-event claim loop against the SQLite
// substrate for the process lifetime. Registered after the store (whose Close hook
// is appended first), so fx stops the dispatcher — which halts the claim loop —
// before the db handle closes.
func startSqliteOutboxDispatcher(lc fx.Lifecycle, dispatcher *outbox.SqliteOutboxDispatcher) {
	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			dispatcher.Start(ctx)
			slog.Info("sqlite outbox dispatcher started")
			return nil
		},
		OnStop: func(ctx context.Context) error {
			dispatcher.Stop()
			slog.Info("sqlite outbox dispatcher stopped")
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
