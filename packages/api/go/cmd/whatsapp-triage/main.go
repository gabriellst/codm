// whatsapp-triage is the standalone box entrypoint: the codm whatsmeow gateway
// as a WhatsApp BRIDGE only — no TS daemon, no agent tasks/sessions, no MCP.
// Inbound allowlisted messages → HMAC-signed webhook; outbound only through
// the loopback-bound, bearer-authenticated POST /send.
package main

import (
	"log/slog"
	"os"
	"time"

	"github.com/lmittmann/tint"
	"go.uber.org/fx"

	"template/api-go/internal/channel"
	"template/api-go/internal/shared"
	"template/api-go/internal/triage"
	core "template/core-go"
	"template/core-go/config"
	"template/core-go/registry"
)

func main() {
	// `whatsapp-triage bootstrap-receive`: migration upload receiver, run by
	// the entrypoint guard only while codm.db does not exist.
	bootstrap := len(os.Args) > 1 && os.Args[1] == "bootstrap-receive"
	level := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		level = slog.LevelDebug
	}
	slog.SetDefault(slog.New(tint.NewHandler(os.Stderr, &tint.Options{
		Level: level, TimeFormat: time.DateTime, NoColor: true,
	})))

	if bootstrap {
		os.Exit(triage.RunBootstrapReceiver())
	}

	cfg, err := config.Load(channel.ConfigService)
	if err != nil {
		slog.Error("config load failed", "error", err)
		os.Exit(1)
	}

	base := fx.Options(
		core.Module(channel.ConfigService),
		shared.Module,
		channel.Module,
	)

	fx.New(
		fx.StopTimeout(30*time.Second),
		registry.App(cfg.Env, base, channel.Overlays),
		triage.Options,
	).Run()
}
