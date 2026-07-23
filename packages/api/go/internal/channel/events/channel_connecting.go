package events

import (
	"github.com/google/uuid"

	"template/core-go/types"
)

const ChannelConnectingEventName = "channel.channel_connecting"

type ChannelConnectingPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	OwnerID   string    `json:"ownerId"`
}

type ChannelConnectingEvent = types.DomainEvent[ChannelConnectingPayload]

func NewChannelConnectingEvent(entityID uuid.UUID, ownerID string, payload ChannelConnectingPayload) ChannelConnectingEvent {
	return types.NewDomainEvent(ChannelConnectingEventName, entityID, ownerID, payload)
}
