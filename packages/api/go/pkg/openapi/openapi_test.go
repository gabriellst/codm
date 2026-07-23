package openapi

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEmitterHappyPath runs the real emitter against the channel module and
// asserts a small set of load-bearing invariants on the produced spec.
// Acts as a golden-file test for Phase 4: if the spec structure changes in a
// way that breaks these invariants, this test fails fast.
func TestEmitterHappyPath(t *testing.T) {
	tmp := t.TempDir()
	out := filepath.Join(tmp, "openapi.json")

	// Walk up to find channel module root (where go.mod lives).
	root := findModuleRoot(t)

	if err := Generate(root, out); err != nil {
		t.Fatalf("Generate: %v", err)
	}

	body, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}

	var spec map[string]any
	if err := json.Unmarshal(body, &spec); err != nil {
		t.Fatalf("parse spec: %v", err)
	}

	// 1. OpenAPI version is 3.0.3 (codedm SDK pipeline requires 3.0 — R-01).
	if got, want := spec["openapi"], "3.0.3"; got != want {
		t.Errorf("openapi: got %q, want %q", got, want)
	}

	components := spec["components"].(map[string]any)
	schemas := components["schemas"].(map[string]any)

	// 2. Required components are present.
	for _, name := range []string{
		"ErrorResponse",
		"ServerEvent",
		"ServerEventName",
		"Platform",
		"MessageType",
	} {
		if _, ok := schemas[name]; !ok {
			t.Errorf("missing component: %s", name)
		}
	}

	// 3. ServerEvent has oneOf + discriminator.
	sse := schemas["ServerEvent"].(map[string]any)
	if _, ok := sse["oneOf"]; !ok {
		t.Error("ServerEvent missing oneOf")
	}
	if d, ok := sse["discriminator"].(map[string]any); ok {
		if d["propertyName"] != "name" {
			t.Errorf("ServerEvent discriminator propertyName: %v", d["propertyName"])
		}
		if _, ok := d["mapping"].(map[string]any); !ok {
			t.Error("ServerEvent discriminator missing mapping")
		}
	} else {
		t.Error("ServerEvent missing discriminator")
	}

	// 4. Platform enum has x-enum-varnames.
	platform := schemas["Platform"].(map[string]any)
	if _, ok := platform["x-enum-varnames"]; !ok {
		t.Error("Platform missing x-enum-varnames")
	}

	// 5. At least one `@union`-annotated struct rendered as oneOf.
	if msgRcv, ok := schemas["ChannelMessageReceivedPayload"].(map[string]any); ok {
		if _, ok := msgRcv["oneOf"]; !ok {
			t.Error("ChannelMessageReceivedPayload missing oneOf (expected union form)")
		}
	} else {
		t.Error("ChannelMessageReceivedPayload component missing")
	}

	// 6. At least one event wrapper exists and contains a const name.
	found := false
	for name, raw := range schemas {
		if !strings.HasSuffix(name, "Event") || name == "ServerEvent" {
			continue
		}
		s, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		props, _ := s["properties"].(map[string]any)
		nameProp, _ := props["name"].(map[string]any)
		if _, hasConst := nameProp["const"]; hasConst {
			found = true
			break
		}
	}
	if !found {
		t.Error("no event wrapper component with const `name` field found")
	}

	// 7. Paths registered (at least 25 operations after Task 10 strip).
	paths := spec["paths"].(map[string]any)
	ops := 0
	for _, item := range paths {
		if m, ok := item.(map[string]any); ok {
			ops += len(m)
		}
	}
	if ops < 25 {
		t.Errorf("expected >=25 operations, got %d", ops)
	}

	// 8. No inline enums outside components.schemas — enforced by validateSpec too,
	//    but we double-check here for paranoia.
	if err := validateInlineEnums(spec); err != nil {
		t.Errorf("inline enum check: %v", err)
	}
}

// TestEmitterIsIdempotent verifies two back-to-back emissions produce byte-identical
// output — protects against map iteration order leaking into the spec.
func TestEmitterIsIdempotent(t *testing.T) {
	tmp := t.TempDir()
	out1 := filepath.Join(tmp, "openapi1.json")
	out2 := filepath.Join(tmp, "openapi2.json")
	root := findModuleRoot(t)

	if err := Generate(root, out1); err != nil {
		t.Fatalf("first emit: %v", err)
	}
	if err := Generate(root, out2); err != nil {
		t.Fatalf("second emit: %v", err)
	}

	a, err := os.ReadFile(out1)
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(out2)
	if err != nil {
		t.Fatal(err)
	}
	if string(a) != string(b) {
		t.Error("emitter not idempotent: back-to-back runs differ")
	}
}

// validateInlineEnums ensures no schema outside components.schemas.* has an
// `enum` key. Mirrors validateSpec but with a simpler recursion.
func validateInlineEnums(spec map[string]any) error {
	// Walk spec.paths.
	if paths, ok := spec["paths"].(map[string]any); ok {
		if err := findInlineEnum(paths, "paths"); err != nil {
			return err
		}
	}
	return nil
}

func findInlineEnum(v any, path string) error {
	switch node := v.(type) {
	case map[string]any:
		if _, ok := node["enum"]; ok {
			return &inlineEnumError{path: path}
		}
		for k, child := range node {
			if err := findInlineEnum(child, path+"."+k); err != nil {
				return err
			}
		}
	case []any:
		for i, child := range node {
			if err := findInlineEnum(child, path); err != nil {
				_ = i
				return err
			}
		}
	}
	return nil
}

type inlineEnumError struct{ path string }

func (e *inlineEnumError) Error() string { return "inline enum at " + e.path }

// findModuleRoot walks up from the current test file directory until it finds a go.mod.
func findModuleRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	dir := wd
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("no go.mod found walking up from %s", wd)
		}
		dir = parent
	}
}
