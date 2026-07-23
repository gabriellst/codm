package main

import (
	"log/slog"
	"os"
	"time"

	"github.com/lmittmann/tint"
	"go.uber.org/fx"

	"template/api-go/internal/app"
	"template/api-go/internal/channel"
	shared "template/core-go"
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

		// Shared infrastructure (core): DB, mediators, outbox dispatcher, HTTP router.
		shared.Module,

		// api-go-local wiring: auth middlewares, SSE controller, docs + SPA.
		// Must come after shared.Module so middleware order stays
		// Recovery → Logging → Session → APIKey.
		app.Module,

		// Single bounded context module — channel absorbs messaging and remote.
		channel.Module,

		// Start HTTP server
		fx.Invoke(shared.StartHTTPServer),
	).Run()
}
