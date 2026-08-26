// Package shared exposes the framework fx.Module that wires every
// context-agnostic infrastructure service. Bounded contexts compose
// this with their own modules in their app's fx.New() call.
package shared

import (
	"context"
	"log/slog"
	"net"
	"net/http"

	"template/core-go/config"
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

// Module returns the framework's fx module, parameterized by the caller's
// declared config.Service (spec T11 AC-1): the env-var prefix — and any
// default core itself can't know, like EventGroupID's — belongs to the
// SERVICE composing this module, not to core. Every provider below this
// parameter is already completely service-agnostic; svc only threads through
// to the single config.Load call.
func Module(svc config.Service) fx.Option {
	return fx.Module("shared",
		// Config
		fx.Provide(func() (*config.Config, error) { return config.Load(svc) }),

		// Database — the SINGLE shared SQLite store. Postgres is gone: there is no
		// *sql.DB provider in the graph any more, so the process boots with no server
		// to reach and no Ping to fail. The store owns its whole lifecycle behind
		// NewSqliteStore; provideSqliteStore only hands it the data-dir from config
		// (the single boot hop) and closes it on shutdown.
		fx.Provide(provideSqliteStore),

		// Unit of Work — the REAL SQLite one (BEGIN IMMEDIATE), replacing the Noop.
		// An aggregate's row writes, its shared_events audit rows and its shared_outbox
		// dispatch rows now commit (or roll back) atomically, and a successful commit
		// nudges the domain notify strategy so the dispatcher drains without poll latency.
		fx.Provide(fx.Annotate(provideSqliteUnitOfWork, fx.As(new(unitofwork.UnitOfWork)))),

		// Outbox-as-transport external mediator over the same store (Redis retired).
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

		// Domain Event Repository — the SQLite dual-write (shared_events audit log +
		// shared_outbox dispatch queue) is now THE implementation for every context.
		// Provided once as its concrete type and re-exposed as the interface, so the
		// repos that ask for either get the SAME instance over the SAME store.
		fx.Provide(provideSqliteDomainEventRepository),
		fx.Provide(asDomainEventRepository),

		// HTTP Router
		fx.Provide(httprouter.NewHttpRouter),

		// Effective server address — populated synchronously by StartHTTPServer
		// (below): fx.Invoke functions run eagerly while fx.New builds the graph,
		// and net.Listen binds before Serve is deferred into the OnStart hook
		// goroutine, so by the time fx.New(...) returns this already holds the
		// REAL port even when cfg.Port was "0" (ephemeral). main.go only needs
		// the log line StartHTTPServer already emits; a caller that builds the
		// app itself (core/testenv, T5) fx.Populate's this to learn which port
		// got picked.
		fx.Provide(provideServerAddr),

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
		fx.Invoke(startSqliteOutboxDispatcher),
	)
}

// asDomainEventRepository re-exposes the concrete SQLite repository under the
// interface every context depends on. A plain widening provider (not a second
// constructor) so there is exactly ONE repository instance in the graph.
func asDomainEventRepository(r *repositories.SqliteDomainEventRepository) repositories.DomainEventRepository {
	return r
}

// provideSqliteUnitOfWork builds the real UnitOfWork over the store's db, sharing
// the domain notify strategy with the SqliteOutboxDispatcher: committing a unit
// wakes the dispatcher immediately instead of waiting out its poll interval.
func provideSqliteUnitOfWork(
	store *sqlite.SqliteStore,
	notify *mediator.SqliteWalPollingStrategy,
) *unitofwork.SqliteUnitOfWork {
	return unitofwork.NewSqliteUnitOfWork(store.DB(), notify)
}

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
//
// EGRESS-ONLY, declared rather than incidental. The gateway publishes into the
// `integration` lane and never claims from it — the TS daemon owns ingress on that
// lane. Before this phase that was merely TRUE (no handler was registered, so the
// claim's name filter was empty); now it is ENFORCED, because both processes share
// one shared_outbox table and two claimants on one lane would race for rows. If the
// gateway ever needs ingress it gets its own lane — see the constructor's docblock.
func provideSqlExternalMediator(store *sqlite.SqliteStore, cfg *config.Config) *mediator.SqlExternalMediator {
	notify := mediator.NewSqliteWalPollingStrategy(0, 0) // package defaults (50ms → 2s)
	// The cross-process lane is the SERVICE's too (config.Service.IntegrationOutboxSource) — the
	// sibling of the domain-event lane above, and the second half of upstream-prep T2. core once
	// held this as a package const, which is the same defect: a portable kernel naming a lane that
	// only THIS topology uses.
	return mediator.NewSqlExternalMediatorWithoutIngress(store.DB(), string(cfg.IntegrationOutboxSource), notify)
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
	cfg *config.Config,
	internal mediator.InternalMediator,
	notify *mediator.SqliteWalPollingStrategy,
) *outbox.SqliteOutboxDispatcher {
	// The lane is the SERVICE's, not core's: cfg.OutboxSource comes from the caller's
	// config.Service declaration (upstream-prep T2). core claims whichever lane it is
	// handed and never names one itself.
	return outbox.NewSqliteOutboxDispatcher(store.DB(), internal, string(cfg.OutboxSource), notify)
}

// provideSqliteDomainEventRepository stamps every dual-written row with the SERVICE's declared
// domain-event lane — the same value provideSqliteOutboxDispatcher claims from, so a row written
// here is always the dispatcher's to see. Both read it from config rather than from a constant in
// core, which is the whole of upstream-prep T2: the lane set is a cross-boundary contract, and
// WHICH lane a given service writes is that service's decision.
func provideSqliteDomainEventRepository(store *sqlite.SqliteStore, cfg *config.Config) *repositories.SqliteDomainEventRepository {
	return repositories.NewSqliteDomainEventRepository(store, string(cfg.OutboxSource))
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

// ServerAddr reports the HTTP server's effective port once StartHTTPServer has
// bound its listener. A caller that composes its own fx app (core/testenv)
// fx.Populate's this to learn the port it got back for cfg.Port="0" — the
// listener binds synchronously inside StartHTTPServer's fx.Invoke, which runs
// eagerly during fx.New(...), so Port is already set by the time fx.New
// returns (well before app.Start/the OnStart hook that calls Serve).
type ServerAddr struct {
	Port int
}

// provideServerAddr hands out the single mutable holder StartHTTPServer fills
// in. fx memoizes providers, so every consumer in the graph (including a
// fx.Populate call site) shares this exact instance.
func provideServerAddr() *ServerAddr {
	return &ServerAddr{}
}

// StartHTTPServer starts the HTTP server as an fx lifecycle hook.
//
// NOTE(core-adequation): unlike the template's core, the handler is wrapped in
// the CORS middleware — codm's console talks to the gateway cross-origin.
//
// cfg.Port accepts "0" — an ephemeral port, the mechanism testenv (T5) and the
// cross-service harness need to run many instances without a fixed port
// colliding. The listener binds up front (so a bind failure surfaces before
// OnStart, not inside the goroutine), and the EFFECTIVE port — which is what
// callers must use when they asked for 0 — is read back off the listener,
// stamped onto addr (see ServerAddr) and logged. Returning an error from an
// fx.Invoke function is the idiomatic fx way to abort boot on a bind failure;
// nothing else references StartHTTPServer directly (grepped: only
// cmd/api/main.go's fx.Invoke call site) — adding the addr parameter is
// resolved by fx reflection, not a breaking change to that call site.
func StartHTTPServer(lc fx.Lifecycle, router *httprouter.HttpRouter, cfg *config.Config, addr *ServerAddr) error {
	listener, err := net.Listen("tcp", ":"+cfg.Port)
	if err != nil {
		return err
	}
	effectivePort := listener.Addr().(*net.TCPAddr).Port
	addr.Port = effectivePort

	server := &http.Server{
		Handler: middleware.CORS(cfg.AllowedOrigins, router.Handler()),
	}

	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			go func() {
				slog.Info("http server started", "addr", listener.Addr().String(), "port", effectivePort)
				if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
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

	return nil
}
