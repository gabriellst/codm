package whatsapp

import (
	"os"

	"github.com/go-playground/validator/v10"

	"template/core-go/enums"
	"template/core-go/errors"
)

// Config is this adapter's OWN declared env read. The underlying client
// library's log verbosity is this gateway adapter's vocabulary, not core's —
// core/config lost this field (and its env key) entirely (spec T11: "core
// loses the [adapter] word entirely"). Colocated with the adapter it
// configures, same rule as internal/channel/config.go and overlay.go: each
// module declares its own divergence from generic core.
type Config struct {
	LogLevel enums.LogLevel `validate:"omitempty,oneof=DEBUG INFO WARN ERROR"`
}

// LoadConfig reads WHATSMEOW_LOG_LEVEL directly — a bare key, no prefix
// precedence: it never had one (core's config used to read this exact same
// bare name), because the client library's own log verbosity isn't a
// gateway-IDENTITY concern the way Port/EventGroupID are.
func LoadConfig() (*Config, error) {
	cfg := &Config{
		LogLevel: enums.LogLevel(getEnvOrDefault("WHATSMEOW_LOG_LEVEL", "WARN")),
	}

	if err := validator.New().Struct(cfg); err != nil {
		return nil, errors.NewBaseError(errors.CodeMissingEnvVar, "invalid whatsmeow adapter config: "+err.Error())
	}

	return cfg, nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
