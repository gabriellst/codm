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
// and with it DATABASE_URL, any adapter-specific database URL, and the
// search_path ServiceName — is gone from the Go side entirely.
type Config struct {
	Port         string            `validate:"required"`
	EventGroupID string            `validate:"required"`
	Environment  enums.Environment `validate:"required,oneof=DEVELOPMENT STAGING PRODUCTION"`

	// Env is the WIRING axis (real | integration | e2e) — parsed from CODM_ENV,
	// the same var and column names the TS side uses (registry.ParseEnv). It is
	// a DISTINCT axis from Environment above: Environment is the deploy target
	// (DEVELOPMENT/STAGING/PRODUCTION), Env is which fx overlay a service
	// composes (core/registry). No collision, no shared meaning.
	Env registry.Env

	// DataDir is the SQLite substrate location — the ONE store the gateway rows,
	// the event log, the outbox and the adapter's own session tables all live in.
	// Empty selects a per-platform default resolved INSIDE the store constructor
	// (NewSqliteStore): the env is read once, here, and handed off in a single hop,
	// so the data-dir dance never leaks through the layers.
	DataDir string

	GlobalAPIKey   string
	AllowedOrigins []string
}

// Service is the caller-declared identity Load resolves env vars against — a
// service names ITSELF via this value so core never hardcodes a particular
// fork's vocabulary (spec T11 AC-1: core-go must stay reusable by ANY Go
// service). The composition root (a service's cmd/*/main.go, and any
// Go-internal test harness that mirrors it) builds exactly one Service value
// and passes it everywhere Load is called, so the identity is declared once.
type Service struct {
	// Prefix is tried ahead of every bare key Load reads: <PREFIX>_KEY wins
	// over bare KEY, which wins over the call's own default. Empty means "no
	// prefix" — every key resolves straight to its bare name.
	Prefix string

	// EventGroupIDDefault is EventGroupID's fallback when neither
	// <PREFIX>_EVENT_GROUP_ID nor bare EVENT_GROUP_ID is set. Empty means "no
	// default" — EventGroupID keeps its validate:"required" tag either way, so
	// an empty default just means the caller must supply the env var itself.
	// The VALUE is domain vocabulary (a service's own outbox-source tag) core
	// must not know — only the service that builds its own Service literal
	// knows it.
	EventGroupIDDefault string
}

// EnvKey resolves the fully-qualified env var name Load reads for a bare
// config key under svc's prefix — exported so a caller that must set the
// SAME variable Load will read (core/testenv, pinning an ephemeral test port
// before booting the fx app) derives it instead of re-declaring the
// precedence rule.
func EnvKey(prefix, key string) string {
	if prefix == "" {
		return key
	}
	return prefix + "_" + key
}

func Load(svc Service) (*Config, error) {
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
		Port:         resolveEnv(svc.Prefix, "PORT", "3032"),
		EventGroupID: resolveEnv(svc.Prefix, "EVENT_GROUP_ID", svc.EventGroupIDDefault),
		Environment:  enums.Environment(resolveEnv(svc.Prefix, "ENVIRONMENT", "DEVELOPMENT")),
		Env:          env,

		GlobalAPIKey:   resolveEnv(svc.Prefix, "GLOBAL_API_KEY", ""),
		AllowedOrigins: parseOrigins(resolveEnv(svc.Prefix, "ALLOWED_ORIGINS", "")),
		DataDir:        getEnvOrDefault("CODM_DATA_DIR", ""),
	}

	// FAIL-CLOSED — the template's generic version (registry.Refuse), not a
	// service-specific check: a non-real CODM_ENV column under a PRODUCTION
	// deploy must never boot, because its overlay swaps in test bindings (the
	// service's own overlay declares what those are — core does not know).
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

// resolveEnv is Load's single env-read mechanism: <PREFIX>_KEY (when a
// prefix is declared) → bare KEY → defaultValue. Every core config key goes
// through this — there is no other way to read an env var in this file — so
// AC-1 genericity is structural, not a convention someone can forget.
func resolveEnv(prefix, key, defaultValue string) string {
	if v := os.Getenv(EnvKey(prefix, key)); v != "" {
		return v
	}
	return getEnvOrDefault(key, defaultValue)
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
