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
)

func main() {
	slog.SetDefault(slog.New(
		tint.NewHandler(os.Stderr, &tint.Options{
			Level:      slog.LevelDebug,
			TimeFormat: time.Kitchen,
		}),
	))

	fx.New(
		fx.StopTimeout(30*time.Second),

		// Framework infrastructure (core): DB, mediators, outbox dispatcher, HTTP router.
		core.Module,

		// api-go-local wiring: auth middlewares, SSE controller, docs + SPA.
		// Must come after core.Module so middleware order stays
		// Recovery → Logging → Session → APIKey.
		shared.Module,

		// Single bounded context module — channel absorbs messaging and remote.
		channel.Module,

		// Start HTTP server
		fx.Invoke(core.StartHTTPServer),
	).Run()
}
