package events

import (
	"github.com/google/uuid"

	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/types"
)

const ChannelCreatedEventName = "channel.channel_created"

type ChannelCreatedPayload struct {
	ChannelID uuid.UUID            `json:"channelId"`
	Name      string               `json:"name"`
	Platform  sharedenums.Platform `json:"platform"`
	OwnerID   string               `json:"ownerId"`
}

type ChannelCreatedEvent = types.DomainEvent[ChannelCreatedPayload]

func NewChannelCreatedEvent(entityID uuid.UUID, ownerID string, payload ChannelCreatedPayload) ChannelCreatedEvent {
	return types.NewDomainEvent(ChannelCreatedEventName, entityID, ownerID, payload)
}
