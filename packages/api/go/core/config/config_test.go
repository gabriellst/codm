package config

import (
	"testing"
)

func TestLoad_DatabaseURLDefault(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.DatabaseURL != "postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable" {
		t.Errorf("expected DatabaseURL to be default postgres URL, got %q", cfg.DatabaseURL)
	}
}

func TestLoad_DatabaseURLCustom(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://custom:custom@remotehost:5432/mydb?sslmode=require")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.DatabaseURL != "postgres://custom:custom@remotehost:5432/mydb?sslmode=require" {
		t.Errorf("expected DatabaseURL to be custom URL, got %q", cfg.DatabaseURL)
	}
}

func TestLoad_OtelServiceNameDefault(t *testing.T) {
	t.Setenv("OTEL_SERVICE_NAME", "")
	t.Setenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.OtelServiceName != "api-go" {
		t.Errorf("expected OtelServiceName to be 'api-go', got %q", cfg.OtelServiceName)
	}
}

func TestLoad_EventGroupIDDefault(t *testing.T) {
	t.Setenv("API_GO_EVENT_GROUP_ID", "")
	t.Setenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.EventGroupID != "api-go" {
		t.Errorf("expected EventGroupID to be 'api-go', got %q", cfg.EventGroupID)
	}
}
