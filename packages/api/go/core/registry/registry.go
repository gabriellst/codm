// Package registry is the environment AXIS for Go services of this template —
// the mirror of core-typescript (BoundedContext.ts + Registry.ts): the base is
// the `real` module, and every other environment is an overlay that declares
// ONLY what diverges (fx.Replace/fx.Decorate). The lesson from the TS front
// (audit 11/14 tokens): e2e is real-minus-external-processes — that's why the
// base is real, and there is no inheritance chain between columns.
// This package stays generic on purpose: it must never reference any
// particular bounded context or gateway adapter, of this service or a fork's
// (spec AC-1 — enforced by grep, so no such name may appear here even in prose).
package registry

import (
	"fmt"

	"go.uber.org/fx"
)

type Env string

const (
	EnvReal        Env = "real"
	EnvIntegration Env = "integration"
	EnvE2e         Env = "e2e"
)

// Overlays maps column → fx options that replace base providers.
type Overlays map[Env]fx.Option

// ParseEnv validates CODM_ENV. Empty => real (production doesn't need to
// declare); unknown value => a loud error, never a silent fallback.
func ParseEnv(raw string) (Env, error) {
	switch Env(raw) {
	case "":
		return EnvReal, nil
	case EnvReal, EnvIntegration, EnvE2e:
		return Env(raw), nil
	}
	return "", fmt.Errorf("CODM_ENV inválido: %q (válidos: real, integration, e2e)", raw)
}

// App composes the service's app: base (real) + the selected column.
func App(env Env, base fx.Option, overlays Overlays) fx.Option {
	if overlay, ok := overlays[env]; ok {
		return fx.Options(base, overlay)
	}
	return base
}

// Refuse is the template's fail-closed (mirror of the TS falsifier): a test
// environment under a PRODUCTION deploy refuses to boot — a production server
// with test bindings would be a silent disaster.
// deployIsProduction is the DEPLOY Environment from config (a distinct axis
// from this one).
func Refuse(env Env, deployIsProduction bool) error {
	if env != EnvReal && deployIsProduction {
		return fmt.Errorf("CODM_ENV=%s é recusado sob ENVIRONMENT=PRODUCTION — bindings de teste não sobem em produção", env)
	}
	return nil
}
