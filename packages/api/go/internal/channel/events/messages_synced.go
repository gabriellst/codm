package events

import (
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelMessagesSyncedPayload is fired once per HistorySync batch that
// inserted new rows. Carries summary counts only; no per-message data.
type ChannelMessagesSyncedPayload struct {
	ChannelID uuid.UUID `json:"channelId" validate:"required"`
	OwnerID   string    `json:"ownerId"   validate:"required"`
	Total     int       `json:"total"     validate:"required"`
	Inserted  int       `json:"inserted"  validate:"required"`
}

const MessagesSyncedEventName = "channel.messages_synced"

type MessagesSyncedEvent = types.DomainEvent[ChannelMessagesSyncedPayload]

func NewMessagesSyncedEvent(entityID uuid.UUID, ownerID string, payload ChannelMessagesSyncedPayload) MessagesSyncedEvent {
	return types.NewDomainEvent(MessagesSyncedEventName, entityID, ownerID, payload)
}
