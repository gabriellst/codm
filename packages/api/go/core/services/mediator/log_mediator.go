package mediator

import (
	"context"
	"encoding/json"
	"fmt"

	"template/core-go/types"
)

// LogExternalMediator implements ExternalMediator by printing events to stdout.
// Useful for testing and debugging progress events without the external transport.
type LogExternalMediator struct{}

func NewLogExternalMediator() ExternalMediator {
	return &LogExternalMediator{}
}

func (m *LogExternalMediator) Register(_ IntegrationEventHandler) error { return nil }

func (m *LogExternalMediator) RegisterCallback(_ func(ctx context.Context, event types.IntegrationEventI)) {
}

func (m *LogExternalMediator) Publish(_ context.Context, event types.IntegrationEventI) error {
	payload, err := json.MarshalIndent(event, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}
	fmt.Printf("\n📡 [%s] owner=%s\n%s\n", event.GetEventName(), event.GetOwnerID(), string(payload))
	return nil
}

func (m *LogExternalMediator) Start(_ context.Context) error { return nil }
func (m *LogExternalMediator) Stop(_ context.Context) error  { return nil }
