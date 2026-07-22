package main

import (
	"log/slog"
	"os"
	"time"

	"github.com/lmittmann/tint"
	"go.uber.org/fx"

	"template/api-go/internal/channel"
	"template/api-go/internal/shared"
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

		shared.Module,

		// Single bounded context module — channel absorbs messaging and remote.
		channel.Module,

		// Start HTTP server
		fx.Invoke(shared.StartHTTPServer),
	).Run()
}
