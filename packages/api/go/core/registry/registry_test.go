package registry_test

// TDD (plan Step T1.1): written first, expected to fail to compile because
// package registry does not exist yet — RED before registry.go/validate.go land.

import (
	"testing"

	"go.uber.org/fx"

	"template/core-go/registry"
)

// Distinct marker types let App's composition be observed through fx.Populate
// without depending on any service-specific type: base provides baseMarker,
// the overlay (when selected) additionally provides overlayMarker. If App
// dropped the overlay, overlayMarker would never resolve; if App dropped the
// base, baseMarker would never resolve either.
type baseMarker string
type overlayMarker string

func TestApp_ComposesBasePlusSelectedOverlay(t *testing.T) {
	base := fx.Provide(func() baseMarker { return "base" })
	overlay := fx.Provide(func() overlayMarker { return "overlay" })
	overlays := registry.Overlays{registry.EnvIntegration: overlay}

	var b baseMarker
	var o overlayMarker
	app := fx.New(
		registry.App(registry.EnvIntegration, base, overlays),
		fx.Populate(&b, &o),
	)
	if err := app.Err(); err != nil {
		t.Fatalf("unexpected error building app for selected column: %v", err)
	}
	if b != "base" {
		t.Errorf("expected base marker %q, got %q", "base", b)
	}
	if o != "overlay" {
		t.Errorf("expected overlay marker %q, got %q", "overlay", o)
	}
}

func TestApp_MissingColumnFallsBackToBaseOnly(t *testing.T) {
	base := fx.Provide(func() baseMarker { return "base" })
	overlay := fx.Provide(func() overlayMarker { return "overlay" })
	// EnvE2e has no entry — App(EnvE2e, ...) must resolve to base alone.
	overlays := registry.Overlays{registry.EnvIntegration: overlay}

	var b baseMarker
	baseOnlyApp := fx.New(
		registry.App(registry.EnvE2e, base, overlays),
		fx.Populate(&b),
	)
	if err := baseOnlyApp.Err(); err != nil {
		t.Fatalf("unexpected error building base-only app: %v", err)
	}
	if b != "base" {
		t.Errorf("expected base marker %q, got %q", "base", b)
	}

	// The overlay's type must be absent entirely from the graph when its
	// column wasn't selected — proves App(EnvE2e, ...) really is base-only,
	// not base+overlay with the overlay silently ignored downstream.
	var o overlayMarker
	overlayAbsentApp := fx.New(
		registry.App(registry.EnvE2e, base, overlays),
		fx.Populate(&o),
	)
	if overlayAbsentApp.Err() == nil {
		t.Fatalf("expected error populating overlay-only type for an unselected column, got nil")
	}
}

func TestRefuse(t *testing.T) {
	// Falsifier of the fail-closed rule: only a non-real column under a
	// PRODUCTION deploy is refused. All 3 envs × 2 deploy states that matter.
	cases := []struct {
		name               string
		env                registry.Env
		deployIsProduction bool
		wantErr            bool
	}{
		{"real under production is allowed", registry.EnvReal, true, false},
		{"real under non-production is allowed", registry.EnvReal, false, false},
		{"integration under production is refused", registry.EnvIntegration, true, true},
		{"integration under non-production is allowed", registry.EnvIntegration, false, false},
		{"e2e under production is refused", registry.EnvE2e, true, true},
		{"e2e under non-production is allowed", registry.EnvE2e, false, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := registry.Refuse(tc.env, tc.deployIsProduction)
			if tc.wantErr && err == nil {
				t.Fatalf("expected Refuse(%s, %v) to error, got nil", tc.env, tc.deployIsProduction)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected Refuse(%s, %v) to be nil, got %v", tc.env, tc.deployIsProduction, err)
			}
		})
	}
}

func TestParseEnv(t *testing.T) {
	t.Run("empty defaults to real", func(t *testing.T) {
		env, err := registry.ParseEnv("")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if env != registry.EnvReal {
			t.Errorf("expected %q, got %q", registry.EnvReal, env)
		}
	})

	valid := []registry.Env{registry.EnvReal, registry.EnvIntegration, registry.EnvE2e}
	for _, want := range valid {
		t.Run("valid value "+string(want), func(t *testing.T) {
			env, err := registry.ParseEnv(string(want))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if env != want {
				t.Errorf("expected %q, got %q", want, env)
			}
		})
	}

	t.Run("unknown value is a named error, never a silent default", func(t *testing.T) {
		_, err := registry.ParseEnv("bogus")
		if err == nil {
			t.Fatalf("expected an error for an unknown CODM_ENV value, got nil")
		}
	})
}
