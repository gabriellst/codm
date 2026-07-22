package main

import (
	"testing"
	"time"

	"go.uber.org/fx"

	"template/api-go/internal/channel"
	shared "template/core-go"
)

// TestAppGraphValid validates the full fx dependency graph (shared infra + the
// channel bounded context) is constructable without missing/duplicate providers.
// fx.ValidateApp only type-checks the graph — it does NOT run OnStart hooks or
// touch Postgres/Redis — so it is safe to run in CI without infra.
//
// This guards the read-model wiring: the projection repos, the remote/message
// projectors, and the egress bridges must all resolve their dependencies.
func TestAppGraphValid(t *testing.T) {
	if err := fx.ValidateApp(
		fx.StopTimeout(30*time.Second),
		shared.Module,
		channel.Module,
		fx.Invoke(shared.StartHTTPServer),
	); err != nil {
		t.Fatalf("fx app graph invalid: %v", err)
	}
}
