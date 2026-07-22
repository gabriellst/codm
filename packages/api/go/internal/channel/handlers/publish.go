// Package handlers holds the channel context's event handlers:
//   - egress.go: internal DomainEventHandlers that translate this context's
//     domain facts into the FROZEN wire integration events and publish them on
//     the ExternalMediator (Redis Streams egress).
//   - delivery_requested.go: the external IntegrationEventHandler that consumes
//     the core's delivery command and drives the live gateway session.
package handlers

import (
	"encoding/json"

	"template/core-go/types"
)

// wireEnvelope adapts a FROZEN contract wire event (a flat struct with its own
// name/entityId/ownerId/occurredAt fields) to the framework's IntegrationEventI
// so the ExternalMediator can publish it. MarshalJSON emits the flat wire shape
// verbatim — exactly what wire.UnmarshalIntegrationEvent expects on the other
// side. The wire types are NOT IntegrationEvent[T]; this is the only bridge.
type wireEnvelope struct {
	name    string
	ownerID string
	body    any
}

func (e wireEnvelope) GetEventName() string { return e.name }
func (e wireEnvelope) GetOwnerID() string   { return e.ownerID }

// MarshalJSON returns the flat wire JSON of the wrapped event.
func (e wireEnvelope) MarshalJSON() ([]byte, error) { return json.Marshal(e.body) }

var _ types.IntegrationEventI = wireEnvelope{}
