package mock

import (
	"github.com/google/uuid"

	"template/api-go/internal/channel/services/gateway"
	repositories "template/core-go/repositories"
)

// compile-time interface check.
var _ gateway.ChannelFactory = (*MockChannelFactory)(nil)

// MockChannelFactory hands out MockChannel instances that all share the SAME
// Scenario — "o roteiro declarado no boot" (spec D6): every channel this
// factory creates plays the identical scripted QR/pairing/contacts/inbound
// sequence. Mirrors WhatsmeowChannelFactory's shape (one factory, many
// channels — services/gateway/whatsapp/whatsmeow_factory.go) minus a store:
// the mock has no persistent session to reload across restarts.
type MockChannelFactory struct {
	scenario        Scenario
	domainEventRepo repositories.DomainEventRepository
}

// NewMockChannelFactory creates a factory that scripts every channel it
// produces with scenario.
func NewMockChannelFactory(scenario Scenario, domainEventRepo repositories.DomainEventRepository) *MockChannelFactory {
	return &MockChannelFactory{scenario: scenario, domainEventRepo: domainEventRepo}
}

// Create creates a new scripted Channel for the given integrationID.
func (f *MockChannelFactory) Create(integrationID uuid.UUID, config gateway.ChannelConfig) (gateway.Channel, error) {
	return NewMockChannel(integrationID, config, f.scenario, f.domainEventRepo), nil
}
