package events

import (
	"github.com/google/uuid"

	"template/api-go/internal/shared/types"
)

const ChannelDisconnectedEventName = "channel.channel_disconnected"

type ChannelDisconnectedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	OwnerID  string    `json:"ownerId"`
}

type ChannelDisconnectedEvent = types.DomainEvent[ChannelDisconnectedPayload]

func NewChannelDisconnectedEvent(entityID uuid.UUID, ownerID string, payload ChannelDisconnectedPayload) ChannelDisconnectedEvent {
	return types.NewDomainEvent(ChannelDisconnectedEventName, entityID, ownerID, payload)
}
