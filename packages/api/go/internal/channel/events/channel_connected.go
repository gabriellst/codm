package events

import (
	"github.com/google/uuid"

	"template/api-go/internal/shared/types"
)

const ChannelConnectedEventName = "channel.channel_connected"

type ChannelConnectedPayload struct {
	ChannelID     uuid.UUID `json:"channelId"`
	OwnerRemoteID string    `json:"ownerRemoteId"`
	OwnerID       string    `json:"ownerId"`
}

type ChannelConnectedEvent = types.DomainEvent[ChannelConnectedPayload]

func NewChannelConnectedEvent(entityID uuid.UUID, ownerID string, payload ChannelConnectedPayload) ChannelConnectedEvent {
	return types.NewDomainEvent(ChannelConnectedEventName, entityID, ownerID, payload)
}
