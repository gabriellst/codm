package events

import (
	"template/contracts-go/wire"

	"template/core-go/types"

	"github.com/google/uuid"
)

// GatewayDisconnectedPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go, `wire.ChannelDisconnectedPayload`) —
// flat-events swap: the payload DECLARATION is single-sourced from
// `packages/contracts/wire/events/channel-disconnected.tsp`.
//
// Semantics (unchanged): raised when the platform session is torn down.
// PlatformData is never set by the mapper today (omitted on the wire).
//
// Disclosed type adaptation: the binding types `Platform` as the wire `string`
// (verbatim gateway Platform; ChannelKind reconciliation deferred to the
// enum-harmonization handoff) — publishers cast `string(enums.Platform*)`.
type GatewayDisconnectedPayload = wire.ChannelDisconnectedPayload

const GatewayDisconnectedEventName = "channel.gateway_disconnected"

type GatewayDisconnectedEvent = types.DomainEvent[GatewayDisconnectedPayload]

func NewGatewayDisconnectedEvent(entityID uuid.UUID, ownerID string, payload GatewayDisconnectedPayload) GatewayDisconnectedEvent {
	return types.NewDomainEvent(GatewayDisconnectedEventName, entityID, ownerID, payload)
}
