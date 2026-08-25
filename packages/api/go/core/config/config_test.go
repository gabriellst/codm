package config

import "testing"

// Config no longer carries a database URL — the store's only input is the data
// dir, and an unset one is legal (the store constructor resolves a per-platform
// default). These cover the remaining defaults.
//
// testSvc is a synthetic Service used across this file — NOT a real service's
// declared identity. Using a made-up prefix ("TESTSVC") instead of a real
// fork's own is deliberate: core's own tests must exercise the GENERIC prefix
// mechanism, never bake in one particular service's vocabulary (spec T11
// AC-1 — the exact regression the audit found: this file used to hardcode a
// real gateway service's own prefixed port key).
var testSvc = Service{Prefix: "TESTSVC", EventGroupIDDefault: "testsvc-default-group"}

func TestLoad_DataDirDefaultsToEmpty(t *testing.T) {
	t.Setenv("CODM_DATA_DIR", "")

	cfg, err := Load(testSvc)
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
	t.Setenv("CODM_DATA_DIR", "/tmp/codm-config-test")

	cfg, err := Load(testSvc)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.DataDir != "/tmp/codm-config-test" {
		t.Errorf("expected DataDir to be the custom path, got %q", cfg.DataDir)
	}
}

func TestLoad_EnvironmentDefault(t *testing.T) {
	t.Setenv("ENVIRONMENT", "")
	t.Setenv("TESTSVC_ENVIRONMENT", "")

	cfg, err := Load(testSvc)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.Environment != "DEVELOPMENT" {
		t.Errorf("expected Environment to be 'DEVELOPMENT', got %q", cfg.Environment)
	}
}

func TestLoad_PortDefault(t *testing.T) {
	t.Setenv("TESTSVC_PORT", "")
	t.Setenv("PORT", "")

	cfg, err := Load(testSvc)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.Port != "3032" {
		t.Errorf("expected Port to fall back to '3032', got %q", cfg.Port)
	}
}

// TestLoad_PrefixTakesPrecedenceOverBare is AC-1's core behavioral guarantee:
// <PREFIX>_PORT must win over a bare PORT when both are set — the whole
// reason Service.Prefix exists is to let two Go services of the same fork
// share one process environment without colliding on PORT/ENVIRONMENT/etc.
func TestLoad_PrefixTakesPrecedenceOverBare(t *testing.T) {
	t.Setenv("PORT", "9999")
	t.Setenv("TESTSVC_PORT", "4242")

	cfg, err := Load(testSvc)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.Port != "4242" {
		t.Errorf("expected prefixed TESTSVC_PORT to win over bare PORT, got %q", cfg.Port)
	}
}

// TestLoad_EventGroupIDDefaultComesFromService is the other half of AC-1: the
// service-specific default that used to live inside core/config now lives on
// the CALLER's Service value — Load itself never invents a default for
// EventGroupID.
func TestLoad_EventGroupIDDefaultComesFromService(t *testing.T) {
	t.Setenv("TESTSVC_EVENT_GROUP_ID", "")
	t.Setenv("EVENT_GROUP_ID", "")

	cfg, err := Load(testSvc)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.EventGroupID != "testsvc-default-group" {
		t.Errorf("expected EventGroupID to fall back to the Service-declared default, got %q", cfg.EventGroupID)
	}
}

// TestLoad_NoPrefixFallsBackToBareKeys covers the empty-prefix case: a
// service that declares no prefix at all still gets a working Load, reading
// bare keys directly (Service{} is a legal zero value, not just a testing
// convenience).
func TestLoad_NoPrefixFallsBackToBareKeys(t *testing.T) {
	t.Setenv("PORT", "5050")

	cfg, err := Load(Service{EventGroupIDDefault: "no-prefix-group"})
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	if cfg.Port != "5050" {
		t.Errorf("expected bare PORT to be read with no prefix declared, got %q", cfg.Port)
	}
}
