// The rail: fx.ValidateApp builds the entire graph of a column without running
// lifecycle — a missing provider breaks in CI, not at boot (spec AC-5).
package registry

import (
	"testing"

	"go.uber.org/fx"
)

// Validate runs fx.ValidateApp for every declared column + real. Call it from
// the service's *_test.go, passing the SAME composition as main.
func Validate(t *testing.T, base fx.Option, overlays Overlays, extra ...fx.Option) {
	t.Helper()
	for _, env := range []Env{EnvReal, EnvIntegration, EnvE2e} {
		env := env
		t.Run(string(env), func(t *testing.T) {
			opts := append([]fx.Option{App(env, base, overlays)}, extra...)
			if err := fx.ValidateApp(opts...); err != nil {
				t.Fatalf("grafo fx inválido na coluna %s: %v", env, err)
			}
		})
	}
}
