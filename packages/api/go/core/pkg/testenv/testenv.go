// Package testenv is the Go-internal test harness for the core-go environment
// axis (spec .specs/2026-08-10-eixo-ambiente-go-design.md, D7): it boots a
// SERVICE's fx app — base + the caller's environment overlays — against a
// scratch SQLite file and an ephemeral HTTP port, and hands the test a
// {URL, DB} handle to drive real HTTP calls and assert real rows.
//
// Generic on purpose, same rule as core/registry and core/config (spec
// AC-1): base, overlays and the config prefix are all supplied by the
// CALLER (the service under test and its own bounded contexts), so this
// package carries zero service-specific symbol. A test that needs a
// scripted scenario composes its OWN registry.Overlays and passes it in;
// testenv never knows what shape that overlay takes.
package testenv

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"go.uber.org/fx"

	core "template/core-go"
	"template/core-go/config"
	"template/core-go/db/sqlite"
	"template/core-go/registry"
)

// bootTimeout bounds how long the fx app gets to reach OnStart-complete
// (config load, migrations, listener bind, mediators, outbox dispatcher) —
// generous for CI, short enough that a genuinely stuck boot fails the test
// instead of hanging the suite.
const bootTimeout = 15 * time.Second

// stopTimeout bounds the mirror shutdown wait registered via t.Cleanup.
const stopTimeout = 10 * time.Second

// Backend is what Start hands back to a test: the base URL of the booted HTTP
// server (host+port only — callers append the API path) and the *sql.DB
// handle of the shared SQLite store, for assertions that need to read rows
// directly (e.g. shared_outbox) rather than through an HTTP response.
type Backend struct {
	URL string
	DB  *sql.DB
}

// Start boots base+overlays[env] as a real fx app for the duration of the
// test: CODM_ENV selects the column, CODM_DATA_DIR points at a fresh
// t.TempDir() (so the run never touches a developer's real data dir or
// collides with a parallel test), and the port env var config.Load will read
// for prefix — derived via config.EnvKey(prefix, "PORT"), the EXACT same
// precedence rule config.Load itself applies — is set to "0" to ask the OS
// for an ephemeral port. All are set via t.Setenv BEFORE the fx app is
// built, because config.Load runs as an fx provider inside fx.New and reads
// the process env at that point.
//
// prefix is the SAME config.Service.Prefix the caller's own composition root
// declares (e.g. a gateway test passes its service's ConfigService.Prefix) —
// testenv does not hardcode any service's prefix, it only knows the
// PRECEDENCE RULE (spec T11 AC-1: this package carries zero service name).
//
// The caller's base MUST already include core.Module(svc) (it is what
// provides *config.Config, the SQLite store, the outbox dispatcher, and
// core.ServerAddr) — the same base the service's own main() composes.
// overlays is registry.Overlays exactly as registry.App consumes it; the
// TEST decides its composition (spec: "testenv accepts (base, overlays) as
// parameters, so the TEST decides the composition") — reusing a service's
// production Overlays or building a scenario-scripted column ad hoc are both
// valid, testenv does not care which.
//
// t.Cleanup stops the app (HTTP server, mediators, outbox dispatcher, store)
// when the test ends.
func Start(t *testing.T, env registry.Env, prefix string, base fx.Option, overlays registry.Overlays) *Backend {
	t.Helper()

	t.Setenv("CODM_ENV", string(env))
	t.Setenv("CODM_DATA_DIR", t.TempDir())
	t.Setenv(config.EnvKey(prefix, "PORT"), "0")

	var (
		addr  *core.ServerAddr
		store *sqlite.SqliteStore
	)

	app := fx.New(
		registry.App(env, base, overlays),
		fx.Populate(&addr, &store),
		fx.Invoke(core.StartHTTPServer),
	)
	if err := app.Err(); err != nil {
		t.Fatalf("testenv: fx app failed to build: %v", err)
	}

	startCtx, cancelStart := context.WithTimeout(context.Background(), bootTimeout)
	defer cancelStart()
	if err := app.Start(startCtx); err != nil {
		t.Fatalf("testenv: fx app failed to start: %v", err)
	}

	t.Cleanup(func() {
		stopCtx, cancelStop := context.WithTimeout(context.Background(), stopTimeout)
		defer cancelStop()
		if err := app.Stop(stopCtx); err != nil {
			t.Errorf("testenv: fx app failed to stop cleanly: %v", err)
		}
	})

	return &Backend{
		URL: fmt.Sprintf("http://127.0.0.1:%d", addr.Port),
		DB:  store.DB(),
	}
}
