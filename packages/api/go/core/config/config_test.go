package config

import (
	"testing"
)

// Config no longer carries a database URL — the store's only input is the data
// dir, and an unset one is legal (the store constructor resolves a per-platform
// default). These cover the remaining defaults.

func TestLoad_DataDirDefaultsToEmpty(t *testing.T) {
	t.Setenv("CODEDM_DATA_DIR", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	// Empty is the sentinel for "resolve the per-platform default inside
	// NewSqliteStore" — config must NOT invent a path of its own.
	if cfg.DataDir != "" {
		t.Errorf("expected DataDir to stay empty so the store resolves it, got %q", cfg.DataDir)
	}
}

func TestLoad_DataDirCustom(t *testing.T) {
	t.Setenv("CODEDM_DATA_DIR", "/tmp/codedm-config-test")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.DataDir != "/tmp/codedm-config-test" {
		t.Errorf("expected DataDir to be the custom path, got %q", cfg.DataDir)
	}
}

func TestLoad_EnvironmentDefault(t *testing.T) {
	t.Setenv("ENVIRONMENT", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.Environment != "DEVELOPMENT" {
		t.Errorf("expected Environment to be 'DEVELOPMENT', got %q", cfg.Environment)
	}
}

func TestLoad_PortDefault(t *testing.T) {
	t.Setenv("CHANNEL_PORT", "")
	t.Setenv("PORT", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.Port != "3032" {
		t.Errorf("expected Port to fall back to '3032', got %q", cfg.Port)
	}
}
