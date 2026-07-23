package events

import (
	"encoding/json"

	"template/api-go/internal/channel/enums"
	"template/core-go/types"

	"github.com/google/uuid"
)

// GatewayConnectedPayload is the data carried by the channel-connected events.
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
type GatewayConnectedPayload struct {
	ChannelID    uuid.UUID       `json:"channelId" validate:"required"`
	Platform     enums.Platform  `json:"platform" validate:"required"`
	PlatformData json.RawMessage `json:"platformData,omitempty"`
	OwnerID      string          `json:"ownerId" validate:"required"`
}

const GatewayConnectedEventName = "channel.gateway_connected"

type GatewayConnectedEvent = types.DomainEvent[GatewayConnectedPayload]

func NewGatewayConnectedEvent(entityID uuid.UUID, ownerID string, payload GatewayConnectedPayload) GatewayConnectedEvent {
	return types.NewDomainEvent(GatewayConnectedEventName, entityID, ownerID, payload)
}
