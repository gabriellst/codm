package config

import (
	"template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/errors"
	"os"
	"strings"

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
	// Load root .env first (monorepo single source of truth), then local override
	_ = godotenv.Load("../../.env")
	_ = godotenv.Overload(".env")

	cfg := &Config{
		Port:                 getEnvOrDefault("CHANNEL_PORT", getEnvOrDefault("PORT", "3031")),
		DatabaseURL:          getEnvOrDefault("DATABASE_URL", "postgres://channel:channel@localhost:5432/channel?sslmode=disable"),
		WhatsmeowDatabaseURL: getEnvOrDefault("WHATSMEOW_DATABASE_URL", "postgres://channel:channel@localhost:5432/channel?sslmode=disable"),
		RedisURL:             getEnvOrDefault("REDIS_URL", "redis://localhost:6379"),
		ChannelEventGroupID:  getEnvOrDefault("CHANNEL_EVENT_GROUP_ID", "medscall-channel"),
		Environment:          enums.Environment(getEnvOrDefault("CHANNEL_ENVIRONMENT", getEnvOrDefault("ENVIRONMENT", "DEVELOPMENT"))),

		ServiceName:       getEnvOrDefault("CHANNEL_SERVICE_NAME", getEnvOrDefault("SERVICE_NAME", "channel")),
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
