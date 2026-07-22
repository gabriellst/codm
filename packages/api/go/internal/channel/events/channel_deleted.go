package events

import (
	"github.com/google/uuid"

	"template/api-go/internal/shared/types"
)

const ChannelDeletedEventName = "channel.channel_deleted"

type ChannelDeletedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	OwnerID   string    `json:"ownerId"`
}

type ChannelDeletedEvent = types.DomainEvent[ChannelDeletedPayload]

func NewChannelDeletedEvent(entityID uuid.UUID, ownerID string, payload ChannelDeletedPayload) ChannelDeletedEvent {
	return types.NewDomainEvent(ChannelDeletedEventName, entityID, ownerID, payload)
}
