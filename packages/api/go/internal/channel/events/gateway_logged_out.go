package events

import (
	"template/contracts-go/wire"

	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelLoggedOutPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go, `wire.ChannelLoggedOutPayload`) —
// flat-events swap: the payload DECLARATION is single-sourced from
// `packages/contracts/wire/events/channel-logged-out.tsp`.
//
// Semantics (unchanged): the platform forcibly logged the session out; Reason
// is the platform-supplied cause. PlatformData is never set by the mapper today.
//
// Disclosed type adaptation: the binding types `Platform` as the wire `string`
// (verbatim gateway Platform; ChannelKind reconciliation deferred to the
// enum-harmonization handoff) — publishers cast `string(enums.Platform*)`.
type ChannelLoggedOutPayload = wire.ChannelLoggedOutPayload

const GatewayLoggedOutEventName = "channel.gateway_logged_out"

type GatewayLoggedOutEvent = types.DomainEvent[ChannelLoggedOutPayload]

func NewGatewayLoggedOutEvent(entityID uuid.UUID, ownerID string, payload ChannelLoggedOutPayload) GatewayLoggedOutEvent {
	return types.NewDomainEvent(GatewayLoggedOutEventName, entityID, ownerID, payload)
}
