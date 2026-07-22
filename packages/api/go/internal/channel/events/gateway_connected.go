package events

import (
	"encoding/json"

	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// GatewayConnectedPayload is the data carried by the channel-connected events.
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
// @union field=PlatformData discriminatedBy=Platform
type GatewayConnectedPayload struct {
	ChannelID    uuid.UUID            `json:"channelId" validate:"required"`
	Platform     sharedenums.Platform `json:"platform" validate:"required"`
	PlatformData json.RawMessage      `json:"platformData,omitempty"`
	OwnerID      string               `json:"ownerId" validate:"required"`
}

const GatewayConnectedEventName = "channel.gateway_connected"

type GatewayConnectedEvent = types.DomainEvent[GatewayConnectedPayload]

func NewGatewayConnectedEvent(entityID uuid.UUID, ownerID string, payload GatewayConnectedPayload) GatewayConnectedEvent {
	return types.NewDomainEvent(GatewayConnectedEventName, entityID, ownerID, payload)
}
