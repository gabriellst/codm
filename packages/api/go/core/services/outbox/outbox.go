// Package outbox drains the shared_outbox dispatch queue into the
// InternalMediator, closing the write→claim→dispatch loop that the
// DomainEventRepository's dual-write opens.
//
// This file holds the vocabulary shared by the dispatcher and its tests. The
// Postgres dispatcher that used to live beside it is gone: the process persists
// to a single SQLite store, so SqliteOutboxDispatcher is the only implementation.
package outbox

import (
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// Tuning shared by the claim loop.
const (
	// batchSize bounds how many rows one claim cycle takes.
	batchSize = 50
	// maxAttempts dead-letters a row after this many failed dispatches.
	maxAttempts = 5
	// pollMin is the tight poll interval used right after activity.
	pollMin = 50 * time.Millisecond
)

// OutboxSource discriminates rows produced by this service inside the shared
// outbox table. Each consumer polls only its own slice: the domain-event
// dispatcher claims "gateway", the integration mediator claims "integration",
// so the two never contend over the same rows.
//
// The value is NOT a local literal: the lane set is a cross-boundary contract
// (packages/contracts wire enum OutboxSource) because the TS daemon writes its
// own `api` rows into the SAME table. The string(...) conversion keeps this a
// plain string constant, so the query args and struct fields below are unchanged.
const OutboxSource = string(wire.OutboxSourcegateway)

// outboxRow is a single claimed outbox row plus its decoded event envelope.
type outboxRow struct {
	id       string
	name     string
	ownerID  string
	payload  json.RawMessage
	attempts int
}

// rawDomainEvent is a lightweight DomainEventI implementation built from an outbox row.
// It stores the raw JSON payload so that UnmarshalDomainEvent[T] can unmarshal it later
// via the PayloadProvider slow path.
type rawDomainEvent struct {
	eventID   uuid.UUID
	entityID  uuid.UUID
	ownerID   string
	eventName string
	time      time.Time
	payload   json.RawMessage
}

// MarshalJSON emits the canonical DomainEvent[T] envelope so that consumers
// (e.g. the SSE listener) receive the same shape as in-memory typed events.
func (e *rawDomainEvent) MarshalJSON() ([]byte, error) {
	payload := e.payload
	if len(payload) == 0 {
		payload = json.RawMessage("null")
	}
	return json.Marshal(types.DomainEvent[json.RawMessage]{
		ID:       e.eventID,
		EntityID: e.entityID,
		OwnerID:  e.ownerID,
		Name:     e.eventName,
		Time:     e.time,
		Payload:  payload,
	})
}

// GetEventName implements DomainEventI.
func (e *rawDomainEvent) GetEventName() string { return e.eventName }

// GetEventID exposes the source event id (same optional interface the typed
// DomainEvent[T] satisfies). Handlers that DERIVE new facts from a delivered
// event use it to mint deterministic derived-event ids, so an at-least-once
// redelivery maps onto the same row and the event store's
// INSERT ... ON CONFLICT (id) DO NOTHING dedupes the fact.
func (e *rawDomainEvent) GetEventID() string { return e.eventID.String() }

// GetEntityID implements DomainEventI.
func (e *rawDomainEvent) GetEntityID() uuid.UUID { return e.entityID }

// GetOwnerID implements DomainEventI.
func (e *rawDomainEvent) GetOwnerID() string { return e.ownerID }

// GetPayload implements mediator.PayloadProvider so that UnmarshalDomainEvent[T] can
// extract a typed payload from an outbox-dispatched event via JSON unmarshalling.
func (e *rawDomainEvent) GetPayload() json.RawMessage { return e.payload }

// Ensure rawDomainEvent satisfies both DomainEventI and PayloadProvider at compile time.
var _ types.DomainEventI = (*rawDomainEvent)(nil)
var _ mediator.PayloadProvider = (*rawDomainEvent)(nil)

// payloadEnvelope mirrors the JSON structure written to the outbox payload column by the
// TypeScript backend's DomainEventRepository and by Go's types.DomainEvent[T].
//
// The full envelope looks like:
//
//	{
//	  "id":       "<uuid>",
//	  "entityId": "<uuid>",
//	  "ownerId": "<string>",
//	  "name":     "<string>",
//	  "time":     "<RFC3339>",
//	  "payload":  { ... }   ← the typed inner payload
//	}
type payloadEnvelope struct {
	ID       string          `json:"id"`
	EntityID string          `json:"entityId"`
	OwnerID  string          `json:"ownerId"`
	Name     string          `json:"name"`
	Time     time.Time       `json:"time"`
	Payload  json.RawMessage `json:"payload"`
}

// toRawDomainEvent converts an outboxRow into a rawDomainEvent by unmarshalling the
// JSONB payload envelope to extract the core identity fields and the nested typed payload.
func toRawDomainEvent(row outboxRow) *rawDomainEvent {
	var env payloadEnvelope
	if err := json.Unmarshal(row.payload, &env); err != nil {
		// Fallback: use the outbox-level metadata and treat the whole payload as the inner payload.
		slog.Warn("outbox dispatcher: failed to unmarshal payload envelope, using raw payload",
			"id", row.id,
			"event", row.name,
			"error", err,
		)
		return &rawDomainEvent{
			eventID:   uuid.Nil,
			entityID:  uuid.Nil,
			ownerID:   row.ownerID,
			eventName: row.name,
			payload:   row.payload,
		}
	}

	eventID, _ := uuid.Parse(env.ID)
	entityID, _ := uuid.Parse(env.EntityID)

	// Prefer envelope-level ownerId and name; fall back to row-level values.
	ownerID := env.OwnerID
	if ownerID == "" {
		ownerID = row.ownerID
	}
	eventName := env.Name
	if eventName == "" {
		eventName = row.name
	}

	// The nested "payload" field is what handlers expect to unmarshal.
	innerPayload := env.Payload
	if len(innerPayload) == 0 {
		innerPayload = row.payload
	}

	return &rawDomainEvent{
		eventID:   eventID,
		entityID:  entityID,
		ownerID:   ownerID,
		eventName: eventName,
		time:      env.Time,
		payload:   innerPayload,
	}
}
