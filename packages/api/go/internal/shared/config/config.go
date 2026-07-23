package config

import (
	"os"
	"strings"
	"template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/errors"

	"github.com/go-playground/validator/v10"
	"github.com/joho/godotenv"
)

type Config struct {
	Port                 string            `validate:"required"`
	DatabaseURL          string            `validate:"required"`
	WhatsmeowDatabaseURL string            `validate:"required"`
	RedisURL             string            `validate:"required"`
	ChannelEventGroupID  string            `validate:"required"`
	Environment          enums.Environment `validate:"required,oneof=DEVELOPMENT STAGING PRODUCTION"`

	// Channel
	ServiceName       string `validate:"required"`
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

	cfg := &Config{
		Port:                 getEnvOrDefault("CHANNEL_PORT", getEnvOrDefault("PORT", "3032")),
		DatabaseURL:          getEnvOrDefault("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/codedm?sslmode=disable"),
		WhatsmeowDatabaseURL: getEnvOrDefault("WHATSMEOW_DATABASE_URL", "postgres://postgres:postgres@localhost:5432/codedm?sslmode=disable"),
		RedisURL:             getEnvOrDefault("REDIS_URL", "redis://localhost:6379"),
		ChannelEventGroupID:  getEnvOrDefault("CHANNEL_EVENT_GROUP_ID", "codedm-gateway"),
		Environment:          enums.Environment(getEnvOrDefault("CHANNEL_ENVIRONMENT", getEnvOrDefault("ENVIRONMENT", "DEVELOPMENT"))),

		// Schema-namespace retarget (classification §D.0/§E.1): channel projections
		// live under the contracts `gateway` pgSchema; ServiceName drives search_path.
		ServiceName:       getEnvOrDefault("CHANNEL_SERVICE_NAME", getEnvOrDefault("SERVICE_NAME", "gateway")),
		GlobalAPIKey:      getEnvOrDefault("CHANNEL_GLOBAL_API_KEY", os.Getenv("GLOBAL_API_KEY")),
		WhatsmeowLogLevel: enums.LogLevel(getEnvOrDefault("WHATSMEOW_LOG_LEVEL", "WARN")),
		AllowedOrigins:    parseOrigins(getEnvOrDefault("CHANNEL_ALLOWED_ORIGINS", os.Getenv("ALLOWED_ORIGINS"))),
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
