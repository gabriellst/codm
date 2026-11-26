package triage

import (
	"log/slog"
	"os"

	"go.uber.org/fx"

	"template/core-go/config"
	"template/core-go/db/sqlite"
	"template/core-go/services/mediator"
)

// Options must be applied at the ROOT of the fx app (fx decorators only reach
// their own module scope and its children).
var Options = fx.Options(
	fx.Provide(LoadConfig),
	fx.Provide(NewSentLog),
	fx.Provide(NewWebhookForwarder),
	fx.Provide(NewPairing),
	fx.Provide(NewQRHandler),
	fx.Provide(NewSendEndpoint),
	fx.Provide(NewMediaEndpoint),

	// Upstream builds the integration mediator EGRESS-ONLY because the TS
	// daemon owns ingress on that lane. This box deployment runs no TS daemon,
	// so this process is the lane's only consumer: swap in a claiming mediator
	// so our handlers (webhook + QR) ride the outbox with its retry/dead-letter.
	fx.Decorate(func(_ mediator.ExternalMediator, store *sqlite.SqliteStore, cfg *config.Config) mediator.ExternalMediator {
		return mediator.NewSqlExternalMediator(store.DB(), string(cfg.IntegrationOutboxSource), mediator.NewSqliteWalPollingStrategy(0, 0))
	}),

	fx.Decorate(fx.Annotate(FilterControllers,
		fx.ParamTags(`group:"controllers"`),
		fx.ResultTags(`group:"controllers"`),
	)),

	fx.Invoke(func(ext mediator.ExternalMediator, wh *WebhookForwarder, qr *QRHandler, cfg *Config) error {
		if err := ext.Register(wh); err != nil {
			return err
		}
		if err := ext.Register(qr); err != nil {
			return err
		}
		if cfg.WebhookURL == "" {
			slog.Warn("triage: WEBHOOK_URL is not set — inbound messages are only logged")
		}
		if len(cfg.Allowlist) == 0 {
			slog.Warn("triage: ALLOWLIST_JIDS is empty — nothing will be forwarded")
		}
		if os.Getenv("SEND_ALLOWLIST_JIDS") != "" || os.Getenv("OWNER_SEND_JIDS") != "" {
			slog.Warn("triage: SEND_ALLOWLIST_JIDS and OWNER_SEND_JIDS are ignored; send access is granted only via scopes.json")
		}
		if cfg.Scopes != nil {
			slog.Info("triage: send scopes loaded", "file", cfg.ScopesFile, "scopes", cfg.Scopes.Summary())
		}
		return nil
	}),
	fx.Invoke(StartServer),
)
