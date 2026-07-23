package events

import (
	"encoding/json"

	"template/api-go/internal/channel/enums"
	"template/core-go/types"

	"github.com/google/uuid"
)

// GatewayDisconnectedPayload is the data carried by the channel-disconnected events.
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
type GatewayDisconnectedPayload struct {
	ChannelID    uuid.UUID       `json:"channelId" validate:"required"`
	Platform     enums.Platform  `json:"platform" validate:"required"`
	PlatformData json.RawMessage `json:"platformData,omitempty"`
	OwnerID      string          `json:"ownerId" validate:"required"`
}

const GatewayDisconnectedEventName = "channel.gateway_disconnected"

type GatewayDisconnectedEvent = types.DomainEvent[GatewayDisconnectedPayload]

func NewGatewayDisconnectedEvent(entityID uuid.UUID, ownerID string, payload GatewayDisconnectedPayload) GatewayDisconnectedEvent {
	return types.NewDomainEvent(GatewayDisconnectedEventName, entityID, ownerID, payload)
}
