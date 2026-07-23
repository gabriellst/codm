package mediator

import (
	"context"
	"strings"
	"testing"

	"template/core-go/types"
)

type stubIngressHandler struct{ name string }

func (h stubIngressHandler) EventName() string { return h.name }
func (h stubIngressHandler) Handle(_ context.Context, _ types.IntegrationEventI) error {
	return nil
}

// The mediator is egress-only: a registered ingress handler must make Start
// FAIL LOUD at wiring time (never a silent no-op that drops deliveries) until
// the XREADGROUP consumer is restored.
func TestRedisMediatorRegisterFailsLoudOnStart(t *testing.T) {
	m := &RedisExternalMediator{}
	m.Register(stubIngressHandler{name: "integration.channel.delivery_requested"})

	err := m.Start(context.Background())
	if err == nil {
		t.Fatal("Start must fail when ingress handlers are registered on the egress-only mediator")
	}
	if !strings.Contains(err.Error(), "integration.channel.delivery_requested") {
		t.Fatalf("error must name the dead registration, got: %v", err)
	}
	if !strings.Contains(err.Error(), "egress-only") {
		t.Fatalf("error must explain the egress-only condition, got: %v", err)
	}
}
