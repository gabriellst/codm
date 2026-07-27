package mediator

import (
	"context"
	"encoding/json"

	"template/core-go/types"
)

// PayloadProvider is implemented by events that carry a raw JSON payload.
// Handlers use this to extract the payload for unmarshalling into specific DTO types.
type PayloadProvider interface {
	GetPayload() json.RawMessage
}

// DomainEventHandler handles a specific domain event type.
type DomainEventHandler interface {
	EventName() string
	Handle(ctx context.Context, event types.DomainEventI) error
}

// IntegrationEventHandler handles integration events from the external transport.
type IntegrationEventHandler interface {
	EventName() string
	Handle(ctx context.Context, event types.IntegrationEventI) error
}

// InternalMediator dispatches domain events in-process.
type InternalMediator interface {
	Register(h DomainEventHandler)
	RegisterCallback(fn func(ctx context.Context, event types.DomainEventI))
	Publish(ctx context.Context, event types.DomainEventI) error
	// Dispatch synchronously executes all registered handlers for the event.
	// Returns the first handler error (for outbox retry semantics).
	Dispatch(ctx context.Context, event types.DomainEventI) error
	Start(ctx context.Context)
	Stop()
}

// ExternalMediator publishes/consumes integration events across service boundaries.
//
// Register returns an error because a mediator may be constructed EGRESS-ONLY (see
// NewSqlExternalMediatorWithoutIngress): registering an ingress handler on one is a wiring
// mistake that has to fail at boot, not silently no-op into a handler that never fires.
type ExternalMediator interface {
	Register(h IntegrationEventHandler) error
	RegisterCallback(fn func(ctx context.Context, event types.IntegrationEventI))
	Publish(ctx context.Context, event types.IntegrationEventI) error
	Start(ctx context.Context) error
	Stop(ctx context.Context) error
}
