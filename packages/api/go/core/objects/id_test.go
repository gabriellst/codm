package objects

import (
	"regexp"
	"testing"
)

func TestIdNamespaceLocked(t *testing.T) {
	// Any change to this constant orphans every previously-ingested entity.
	// Mirrored in packages/api/typescript/core/src/objects/Id.ts.
	want := "f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e"
	if got := idNamespace.String(); got != want {
		t.Errorf("idNamespace = %q, want %q", got, want)
	}
}

func TestIDFromSeed_Deterministic(t *testing.T) {
	a, err := IDFromSeed("integration", "EXAMPLE", "foo.example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	b, err := IDFromSeed("integration", "EXAMPLE", "foo.example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if a.Value() != b.Value() {
		t.Errorf("IDFromSeed not deterministic: %s != %s", a.Value(), b.Value())
	}
}

func TestIDFromSeed_UUIDv5Format(t *testing.T) {
	id, _ := IDFromSeed("integration", "EXAMPLE", "x")
	re := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	if !re.MatchString(id.Value()) {
		t.Errorf("IDFromSeed does not match UUIDv5 format: %s", id.Value())
	}
}

func TestIDFromSeed_DiffersAcrossPlatforms(t *testing.T) {
	a, _ := IDFromSeed("integration", "EXAMPLE_A", "x")
	b, _ := IDFromSeed("integration", "EXAMPLE_B", "x")
	if a.Value() == b.Value() {
		t.Errorf("IDFromSeed should differ across platforms: both = %s", a.Value())
	}
}

func TestIDFromSeed_DiffersAcrossTypes(t *testing.T) {
	a, _ := IDFromSeed("integration", "EXAMPLE", "x")
	b, _ := IDFromSeed("product", "EXAMPLE", "x")
	if a.Value() == b.Value() {
		t.Errorf("IDFromSeed should differ across types: both = %s", a.Value())
	}
}

// GOLDEN VALUES — cross-language parity gate.
// TS-side test (packages/api/typescript/core/src/objects/Id.test.ts)
// asserts the same values. If either side drifts, that test fails first.
func TestIDFromSeed_GoldenHost(t *testing.T) {
	id, _ := IDFromSeed("integration", "EXAMPLE", "foo.example.com")
	want := "7d55c512-b5e1-523b-9945-8335b3103633"
	if id.Value() != want {
		t.Errorf("IDFromSeed(integration, EXAMPLE, foo.example.com) = %s, want %s", id.Value(), want)
	}
}

func TestIDFromSeed_GoldenShortSeed(t *testing.T) {
	id, _ := IDFromSeed("integration", "EXAMPLE", "x")
	want := "f174fbd3-677d-5099-a109-e5de85346b59"
	if id.Value() != want {
		t.Errorf("IDFromSeed(integration, EXAMPLE, x) = %s, want %s", id.Value(), want)
	}
}

func TestIDFromSeed_Empty(t *testing.T) {
	_, err := IDFromSeed()
	if err == nil {
		t.Error("IDFromSeed() should error on empty input, got nil")
	}
}
