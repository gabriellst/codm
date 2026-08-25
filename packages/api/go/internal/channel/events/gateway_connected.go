package events

import (
	"template/contracts-go/wire"

	"template/core-go/types"

	"github.com/google/uuid"
)

// GatewayConnectedPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go, `wire.ChannelConnectedPayload`) —
// flat-events swap: the payload DECLARATION is single-sourced from
// `packages/contracts/src/wire/events/channel-connected.tsp`.
//
// Semantics (unchanged): raised when the platform session finishes pairing and
// is reachable. PlatformData is never set by the mapper today (omitted on the
// wire).
//
// Disclosed type adaptation: the binding types `Platform` as the wire `string`
// (verbatim gateway Platform; ChannelKind reconciliation deferred to the
// enum-harmonization handoff) — publishers cast `string(enums.Platform*)`.
type GatewayConnectedPayload = wire.ChannelConnectedPayload

const GatewayConnectedEventName = "channel.gateway_connected"

type GatewayConnectedEvent = types.DomainEvent[GatewayConnectedPayload]

func NewGatewayConnectedEvent(entityID uuid.UUID, ownerID string, payload GatewayConnectedPayload) GatewayConnectedEvent {
	return types.NewDomainEvent(GatewayConnectedEventName, entityID, ownerID, payload)
}
