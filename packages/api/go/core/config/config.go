package config

import (
	"os"
	"strings"
	"template/core-go/enums"
	"template/core-go/errors"
	"template/core-go/registry"

	"github.com/go-playground/validator/v10"
	"github.com/joho/godotenv"
)

// Config is the process configuration. There is NO database URL: the service
// persists to the shared SQLite store, whose only input is DataDir. Postgres —
// and with it DATABASE_URL, WHATSMEOW_DATABASE_URL and the search_path
// ServiceName — is gone from the Go side entirely.
type Config struct {
	Port                string            `validate:"required"`
	ChannelEventGroupID string            `validate:"required"`
	Environment         enums.Environment `validate:"required,oneof=DEVELOPMENT STAGING PRODUCTION"`

	// Env is the WIRING axis (real | integration | e2e) — parsed from CODM_ENV,
	// the same var and column names the TS side uses (registry.ParseEnv). It is
	// a DISTINCT axis from Environment above: Environment is the deploy target
	// (DEVELOPMENT/STAGING/PRODUCTION), Env is which fx overlay a service
	// composes (core/registry). No collision, no shared meaning.
	Env registry.Env

	// DataDir is the SQLite substrate location — the ONE store the gateway rows,
	// the event log, the outbox and whatsmeow's session tables all live in. Empty
	// selects a per-platform default resolved INSIDE the store constructor
	// (NewSqliteStore): the env is read once, here, and handed off in a single hop,
	// so the data-dir dance never leaks through the layers.
	DataDir string

	// Channel
	GlobalAPIKey      string
	WhatsmeowLogLevel enums.LogLevel `validate:"omitempty,oneof=DEBUG INFO WARN ERROR"`
	AllowedOrigins    []string
}

func Load() (*Config, error) {
	// Load root .env first (monorepo single source of truth), then local override.
	// The service runs from packages/api/go, so the repo root is three levels up;
	// the two-level path is kept for callers launched from a nested cmd/ dir.
	_ = godotenv.Load("../../../.env")
	_ = godotenv.Load("../../.env")
	_ = godotenv.Overload(".env")

	env, err := registry.ParseEnv(getEnvOrDefault("CODM_ENV", ""))
	if err != nil {
		return nil, errors.NewBaseError(errors.CodeMissingEnvVar, err.Error())
	}

	cfg := &Config{
		Port:                getEnvOrDefault("CHANNEL_PORT", getEnvOrDefault("PORT", "3032")),
		ChannelEventGroupID: getEnvOrDefault("CHANNEL_EVENT_GROUP_ID", "codm-gateway"),
		Environment:         enums.Environment(getEnvOrDefault("CHANNEL_ENVIRONMENT", getEnvOrDefault("ENVIRONMENT", "DEVELOPMENT"))),
		Env:                 env,

		GlobalAPIKey:      getEnvOrDefault("CHANNEL_GLOBAL_API_KEY", os.Getenv("GLOBAL_API_KEY")),
		WhatsmeowLogLevel: enums.LogLevel(getEnvOrDefault("WHATSMEOW_LOG_LEVEL", "WARN")),
		AllowedOrigins:    parseOrigins(getEnvOrDefault("CHANNEL_ALLOWED_ORIGINS", os.Getenv("ALLOWED_ORIGINS"))),
		DataDir:           getEnvOrDefault("CODM_DATA_DIR", ""),
	}

	// FAIL-CLOSED — the template's generic version (registry.Refuse), not a
	// gateway-specific check: a non-real CODM_ENV column under a PRODUCTION
	// deploy must never boot, because its overlay swaps in test bindings
	// (channel.Overlays: the scripted mock.ChannelFactory instead of whatsmeow).
	// Mirrors src/boot.ts's falsifier on the TS side.
	if err := registry.Refuse(cfg.Env, cfg.Environment == enums.EnvironmentProduction); err != nil {
		return nil, errors.NewBaseError(errors.CodeMissingEnvVar, err.Error())
	}

	validate := validator.New()
	if err := validate.Struct(cfg); err != nil {
		return nil, errors.NewBaseError(errors.CodeMissingEnvVar, "invalid config: "+err.Error())
	}

	return cfg, nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func parseOrigins(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			origins = append(origins, trimmed)
		}
	}
	return origins
}
