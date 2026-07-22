package types

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// eventIDNamespace is a fixed UUID v5 namespace for hashing event bodies into deterministic IDs.
var eventIDNamespace = uuid.MustParse("a3bb189e-8bf9-3888-9912-ace4e6543002")

// hashEventID produces a deterministic UUID v5 from the JSON-serialized body.
func hashEventID(body any) uuid.UUID {
	data, err := json.Marshal(body)
	if err != nil {
		return uuid.New()
	}
	hash := sha256.Sum256(data)
	return uuid.NewSHA1(eventIDNamespace, hash[:])
}

// DomainEventI is the non-generic interface used by the mediator and BaseEntity.domainEvents.
// Since Go generics cannot be used in heterogeneous collections, this interface enables
// dispatching without knowing the concrete payload type.
type DomainEventI interface {
	GetEventName() string
	GetEntityID() uuid.UUID
	GetOwnerID() string
}

// DomainEvent is a generic domain event with a typed payload.
// Bounded contexts define their payload structs and create type aliases:
//
//	type OrderCreatedPayload struct { OrderID uuid.UUID; Amount float64 }
//	type OrderCreatedEvent = events.DomainEvent[OrderCreatedPayload]
//	const OrderCreatedEventName = "orders.order_created"
type DomainEvent[T any] struct {
	ID       uuid.UUID `json:"id"`
	EntityID uuid.UUID `json:"entityId"`
	OwnerID  string    `json:"ownerId"`
	Time     time.Time `json:"time"`
	Name     string    `json:"name"`
	Payload  T         `json:"payload"`
}

func NewDomainEvent[T any](name string, entityID uuid.UUID, ownerID string, payload T) DomainEvent[T] {
	ts := time.Now().UTC()
	body := struct {
		EntityID uuid.UUID `json:"entityId"`
		OwnerID  string    `json:"ownerId"`
		Time     time.Time `json:"time"`
		Name     string    `json:"name"`
		Payload  T         `json:"payload"`
	}{entityID, ownerID, ts, name, payload}

	return DomainEvent[T]{
		ID:       hashEventID(body),
		EntityID: entityID,
		OwnerID:  ownerID,
		Time:     ts,
		Name:     name,
		Payload:  payload,
	}
}

func (e DomainEvent[T]) GetEventName() string   { return e.Name }
func (e DomainEvent[T]) GetEntityID() uuid.UUID { return e.EntityID }
func (e DomainEvent[T]) GetOwnerID() string     { return e.OwnerID }
func (e DomainEvent[T]) GetEventID() string     { return e.ID.String() }
func (e DomainEvent[T]) GetPayload() json.RawMessage {
	b, _ := json.Marshal(e.Payload)
	return b
}

// IntegrationEventI is the non-generic interface used by the ExternalMediator.
type IntegrationEventI interface {
	GetEventName() string
	GetOwnerID() string
}

// IntegrationEvent is a generic cross-boundary event with a typed payload.
// Bounded contexts define their payload structs and create type aliases:
//
//	type OrderCompletedPayload struct { OrderID uuid.UUID }
//	type OrderCompletedIntegrationEvent = events.IntegrationEvent[OrderCompletedPayload]
//	const OrderCompletedIntegrationEventName = "integration.orders.order_completed"
type IntegrationEvent[T any] struct {
	ID      uuid.UUID `json:"id"`
	OwnerID string    `json:"ownerId"`
	Time    time.Time `json:"time"`
	Name    string    `json:"name"`
	Payload T         `json:"payload"`
}

func NewIntegrationEvent[T any](name string, ownerID string, payload T) IntegrationEvent[T] {
	ts := time.Now().UTC()
	body := struct {
		OwnerID string    `json:"ownerId"`
		Time    time.Time `json:"time"`
		Name    string    `json:"name"`
		Payload T         `json:"payload"`
	}{ownerID, ts, name, payload}

	return IntegrationEvent[T]{
		ID:      hashEventID(body),
		OwnerID: ownerID,
		Time:    ts,
		Name:    name,
		Payload: payload,
	}
}

func (e IntegrationEvent[T]) GetEventName() string { return e.Name }
func (e IntegrationEvent[T]) GetOwnerID() string   { return e.OwnerID }
func (e IntegrationEvent[T]) GetEventID() string   { return e.ID.String() }

// UnmarshalDomainEvent extracts a typed DomainEvent[T] from a generic DomainEventI.
// It handles both in-memory dispatch (already typed) and outbox dispatch (rawDomainEvent with json.RawMessage payload).
func UnmarshalDomainEvent[T any](event DomainEventI) (DomainEvent[T], error) {
	// Fast path: already the correct concrete type (direct in-memory publish).
	if typed, ok := event.(DomainEvent[T]); ok {
		return typed, nil
	}

	// Slow path: raw event from outbox — unmarshal the JSON payload.
	// GetPayload() returns the already-unwrapped inner payload (toRawDomainEvent extracts it),
	// so unmarshal directly into T (matching UnmarshalIntegrationEvent's pattern).
	type payloadProvider interface {
		GetPayload() json.RawMessage
	}
	provider, ok := event.(payloadProvider)
	if !ok {
		return DomainEvent[T]{}, fmt.Errorf("unexpected event type %T for domain event %s", event, event.GetEventName())
	}

	var payload T
	if err := json.Unmarshal(provider.GetPayload(), &payload); err != nil {
		return DomainEvent[T]{}, fmt.Errorf("failed to unmarshal payload for %s: %w", event.GetEventName(), err)
	}

	return DomainEvent[T]{
		EntityID: event.GetEntityID(),
		OwnerID:  event.GetOwnerID(),
		Name:     event.GetEventName(),
		Payload:  payload,
	}, nil
}

// UnmarshalIntegrationEvent extracts a typed IntegrationEvent[T] from a generic IntegrationEventI.
// It handles both in-memory dispatch (already typed) and external dispatch (raw event with json.RawMessage payload).
func UnmarshalIntegrationEvent[T any](event IntegrationEventI) (IntegrationEvent[T], error) {
	// Fast path: already the correct concrete type (in-memory mediator).
	if typed, ok := event.(IntegrationEvent[T]); ok {
		return typed, nil
	}

	// Slow path: raw event from Kafka — unmarshal the JSON payload.
	type payloadProvider interface {
		GetPayload() json.RawMessage
	}
	provider, ok := event.(payloadProvider)
	if !ok {
		return IntegrationEvent[T]{}, fmt.Errorf("unexpected event type %T: does not implement PayloadProvider", event)
	}

	var payload T
	if err := json.Unmarshal(provider.GetPayload(), &payload); err != nil {
		return IntegrationEvent[T]{}, fmt.Errorf("failed to unmarshal payload for %s: %w", event.GetEventName(), err)
	}

	return IntegrationEvent[T]{
		OwnerID: event.GetOwnerID(),
		Name:    event.GetEventName(),
		Payload: payload,
	}, nil
}
