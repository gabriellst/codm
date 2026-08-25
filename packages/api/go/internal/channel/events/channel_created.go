package events

import (
	"github.com/google/uuid"

	"template/api-go/internal/channel/enums"
	"template/core-go/types"
)

const ChannelCreatedEventName = "channel.channel_created"

type ChannelCreatedPayload struct {
	ChannelID uuid.UUID      `json:"channelId"`
	Name      string         `json:"name"`
	Platform  enums.Platform `json:"platform"`
	OwnerID   string         `json:"ownerId"`
}

type ChannelCreatedEvent = types.DomainEvent[ChannelCreatedPayload]

func NewChannelCreatedEvent(entityID uuid.UUID, ownerID string, payload ChannelCreatedPayload) ChannelCreatedEvent {
	return types.NewDomainEvent(ChannelCreatedEventName, entityID, ownerID, payload)
}
