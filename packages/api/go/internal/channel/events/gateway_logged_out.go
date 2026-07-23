package events

import (
	"encoding/json"

	"template/api-go/internal/channel/enums"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelLoggedOutPayload is the data carried by the channel-logged-out events.
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
type ChannelLoggedOutPayload struct {
	ChannelID    uuid.UUID       `json:"channelId" validate:"required"`
	Reason       string          `json:"reason" validate:"required"`
	Platform     enums.Platform  `json:"platform" validate:"required"`
	PlatformData json.RawMessage `json:"platformData,omitempty"`
	OwnerID      string          `json:"ownerId" validate:"required"`
}

const GatewayLoggedOutEventName = "channel.gateway_logged_out"

type GatewayLoggedOutEvent = types.DomainEvent[ChannelLoggedOutPayload]

func NewGatewayLoggedOutEvent(entityID uuid.UUID, ownerID string, payload ChannelLoggedOutPayload) GatewayLoggedOutEvent {
	return types.NewDomainEvent(GatewayLoggedOutEventName, entityID, ownerID, payload)
}
