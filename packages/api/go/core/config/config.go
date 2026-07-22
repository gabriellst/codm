package config

import (
	"os"
	"strings"
	"template/core-go/errors"

	"github.com/go-playground/validator/v10"
	"github.com/joho/godotenv"
)

// Config holds all runtime configuration for the api-go service.
// Variables are domain-agnostic: API_GO_PORT, DATABASE_URL, API_GO_EVENT_GROUP_ID.
type Config struct {
	Port            string `validate:"required"`
	Version         string `validate:"required"`
	DatabaseURL     string `validate:"required"`
	RedisURL        string `validate:"required"`
	EventGroupID    string `validate:"required"`
	OtelServiceName string `validate:"required"`

	// InternalServiceKey is the shared secret for service-to-service calls.
	// Sent as the x-internal-service-key header when the Go worker calls TS endpoints.
	InternalServiceKey string

	// TypescriptAPIURL is the base URL of the TypeScript API service.
	TypescriptAPIURL string `validate:"required"`

	AllowedOrigins []string

	// ── Channel gateway (BC1) ──────────────────────────────────────────────
	// GatewayAPIKey guards the gateway HTTP surface (service-to-service). When
	// empty, the api-key middleware allows all requests (local single-operator).
	GatewayAPIKey string
	// WhatsmeowDatabaseURL is the DB URL for the whatsmeow session store. Empty
	// falls back to DatabaseURL (the whatsmeow-owned tables live in their own
	// schema). File-backed SQLite under DataDir is a follow-up (needs a
	// pure-Go sqlite driver dependency).
	WhatsmeowDatabaseURL string
	// DataDir is the root for file-backed gateway state on the local daemon.
	DataDir string
}

func Load() (*Config, error) {
	// Load root .env first (monorepo single source of truth), then local override.
	// The service runs from packages/api/go, so the repo root is three levels up;
	// the two-level path is kept for callers launched from a nested cmd/ dir.
	_ = godotenv.Load("../../../.env")
	_ = godotenv.Load("../../.env")
	_ = godotenv.Overload(".env")

	cfg := &Config{
		Port:            getEnvOrDefault("API_GO_PORT", "3032"),
		Version:         getEnvOrDefault("API_VERSION", "v1"),
		DatabaseURL:     getEnvOrDefault("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable"),
		RedisURL:        getEnvOrDefault("REDIS_URL", "redis://localhost:6379"),
		EventGroupID:    getEnvOrDefault("API_GO_EVENT_GROUP_ID", "api-go"),
		OtelServiceName: getEnvOrDefault("OTEL_SERVICE_NAME", "api-go"),

		InternalServiceKey: getEnvOrDefault("INTERNAL_SERVICE_KEY", ""),
		TypescriptAPIURL:   getEnvOrDefault("API_URL", "http://localhost:3030"),

		AllowedOrigins: parseOrigins(os.Getenv("CORS_ALLOWED_ORIGINS")),

		GatewayAPIKey:        getEnvOrDefault("CODEDM_GATEWAY_API_KEY", ""),
		WhatsmeowDatabaseURL: getEnvOrDefault("CODEDM_GATEWAY_WHATSMEOW_URL", ""),
		DataDir:              getEnvOrDefault("CODEDM_DATA_DIR", ""),
	}

	validate := validator.New()
	if err := validate.Struct(cfg); err != nil {
		return nil, errors.NewBaseError(errors.CodeMissingEnvVar, "invalid config: "+err.Error())
	}

	return cfg, nil
}

func getEnvOrDefault(key, defaultValue string) string {
	// A trailing inline comment on an empty-value line (e.g. `KEY=  # note`) is
	// parsed by godotenv as the literal value `# note`. Treat any value that is
	// only a comment (starts with `#` after trimming) as empty so the documented
	// `empty = ...` defaults hold from a scratch `cp .env.example .env`.
	if value := strings.TrimSpace(os.Getenv(key)); value != "" && !strings.HasPrefix(value, "#") {
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
