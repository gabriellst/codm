package config

import (
	"testing"
)

func TestLoad_DatabaseURLDefault(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("WHATSMEOW_DATABASE_URL", "postgres://channel:channel@localhost:5432/channel?sslmode=disable")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.DatabaseURL != "postgres://channel:channel@localhost:5432/channel?sslmode=disable" {
		t.Errorf("expected DatabaseURL to be default postgres URL, got %q", cfg.DatabaseURL)
	}
}

func TestLoad_DatabaseURLCustom(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://custom:custom@remotehost:5432/mydb?sslmode=require")
	t.Setenv("WHATSMEOW_DATABASE_URL", "postgres://channel:channel@localhost:5432/channel?sslmode=disable")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.DatabaseURL != "postgres://custom:custom@remotehost:5432/mydb?sslmode=require" {
		t.Errorf("expected DatabaseURL to be custom URL, got %q", cfg.DatabaseURL)
	}
}

func TestLoad_EnvironmentDefault(t *testing.T) {
	t.Setenv("ENVIRONMENT", "")
	t.Setenv("DATABASE_URL", "postgres://channel:channel@localhost:5432/channel?sslmode=disable")
	t.Setenv("WHATSMEOW_DATABASE_URL", "postgres://channel:channel@localhost:5432/channel?sslmode=disable")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.Environment != "DEVELOPMENT" {
		t.Errorf("expected Environment to be 'DEVELOPMENT', got %q", cfg.Environment)
	}
}

func TestLoad_ServiceNameDefault(t *testing.T) {
	t.Setenv("SERVICE_NAME", "")
	t.Setenv("DATABASE_URL", "postgres://channel:channel@localhost:5432/channel?sslmode=disable")
	t.Setenv("WHATSMEOW_DATABASE_URL", "postgres://channel:channel@localhost:5432/channel?sslmode=disable")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.ServiceName != "channel" {
		t.Errorf("expected ServiceName to be 'channel', got %q", cfg.ServiceName)
	}
}
