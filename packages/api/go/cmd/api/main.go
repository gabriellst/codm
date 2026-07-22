// cmd/api — api-go entry point.
// Bootstraps the shared infrastructure module via fx.New.
//
// Bounded contexts add their own fx.Module here (e.g. activity.Module) as they
// are created.
package main

import (
	"log/slog"
	"os"
	"time"

	"template/api-go/internal/channel"
	shared "template/core-go"

	"go.uber.org/fx"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	})))

	fx.New(
		fx.StopTimeout(30*time.Second),

		// Shared infrastructure: DB, mediators, outbox dispatcher, HTTP router.
		shared.Module,

		// Bounded contexts.
		channel.Module,

		// Start the HTTP server.
		fx.Invoke(shared.StartHTTPServer),
	).Run()
}
