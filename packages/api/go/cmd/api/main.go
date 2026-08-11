package main

import (
	"log/slog"
	"os"
	"time"

	"github.com/lmittmann/tint"
	"go.uber.org/fx"

	"template/api-go/internal/channel"
	"template/api-go/internal/shared"
	core "template/core-go"
	"template/core-go/config"
	"template/core-go/registry"
)

// base is the gateway's fx composition BEFORE any environment overlay — the
// SAME symbol main() and the wiring rail (main_test.go, spec AC-5) build
// against, so there is exactly one source for "what this service is made of".
// core.Module takes channel.ConfigService — the declared prefix/defaults
// THIS service names itself with; core carries none of that vocabulary on
// its own (spec T11 AC-1).
var base = fx.Options(
	// Framework infrastructure (core): DB, mediators, outbox dispatcher, HTTP router.
	core.Module(channel.ConfigService),

	// api-go-local wiring: auth middlewares, SSE controller, docs + SPA.
	// Must come after core.Module so middleware order stays
	// Recovery → Logging → Session → APIKey.
	shared.Module,

	// Single bounded context module — channel absorbs messaging and remote.
	channel.Module,
)

func main() {
	slog.SetDefault(slog.New(
		tint.NewHandler(os.Stderr, &tint.Options{
			Level:      slog.LevelDebug,
			TimeFormat: time.Kitchen,
		}),
	))

	// registry.App needs cfg.Env to pick the overlay BEFORE the fx graph is
	// built, so it cannot come from inside the graph — this pre-load learns it.
	// core.Module(channel.ConfigService) ALSO provides *config.Config via its
	// own fx.Provide (core/module.go, out of this task's scope fence): that
	// provider is left untouched and is what the graph actually resolves at
	// runtime. Reading the same env vars twice under the SAME
	// channel.ConfigService is pure (same input, same Config), so this costs
	// one extra parse at boot, not a second source of truth.
	cfg, err := config.Load(channel.ConfigService)
	if err != nil {
		slog.Error("config load failed", "error", err)
		os.Exit(1)
	}

	fx.New(
		fx.StopTimeout(30*time.Second),

		registry.App(cfg.Env, base, channel.Overlays),

		// Start HTTP server
		fx.Invoke(core.StartHTTPServer),
	).Run()
}
