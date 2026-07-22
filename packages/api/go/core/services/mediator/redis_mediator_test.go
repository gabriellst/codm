package mediator

import (
	"context"
	"encoding/json"
	"testing"

	"template/core-go/types"
)

type fakeIntegrationHandler struct {
	event   string
	gotName string
	gotJSON []byte
}

func (h *fakeIntegrationHandler) EventName() string { return h.event }
func (h *fakeIntegrationHandler) Handle(_ context.Context, e types.IntegrationEventI) error {
	h.gotName = e.GetEventName()
	if p, ok := e.(interface{ GetPayload() json.RawMessage }); ok {
		h.gotJSON = p.GetPayload()
	}
	return nil
}

func TestRedisExternalMediator_DispatchRoutesToRegisteredHandler(t *testing.T) {
	m := &RedisExternalMediator{handlers: map[string][]IntegrationEventHandler{}}
	h := &fakeIntegrationHandler{event: "integration.shared.integration.activated"}
	m.Register(h)

	raw := []byte(`{"name":"integration.shared.integration.activated","ownerId":"o1","storeIntegrationId":"s1"}`)
	if err := m.dispatchRaw(context.Background(), "integration.shared.integration.activated", raw); err != nil {
		t.Fatalf("dispatchRaw: %v", err)
	}

	if h.gotName != "integration.shared.integration.activated" {
		t.Fatalf("handler not invoked with event name, got %q", h.gotName)
	}
	if string(h.gotJSON) != string(raw) {
		t.Fatalf("handler got wrong payload: %s", h.gotJSON)
	}
}

func TestRedisExternalMediator_DispatchNoHandlerIsNoop(t *testing.T) {
	m := &RedisExternalMediator{handlers: map[string][]IntegrationEventHandler{}}
	if err := m.dispatchRaw(context.Background(), "unknown.event", []byte(`{}`)); err != nil {
		t.Fatalf("expected no error for unregistered event, got %v", err)
	}
}
