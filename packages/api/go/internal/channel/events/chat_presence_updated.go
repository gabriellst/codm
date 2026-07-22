package events

import (
	"time"

	msgenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelChatPresenceUpdatedPayload carries a typing/recording indicator
// inside a specific chat. Fires when whatsmeow emits *events.ChatPresence.
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
type ChannelChatPresenceUpdatedPayload struct {
	ChannelID  uuid.UUID                `json:"channelId" validate:"required"`
	ChatID     string                   `json:"chatId" validate:"required"`
	SenderID   string                   `json:"senderId" validate:"required"`
	State      msgenums.ChatPresenceType `json:"state" validate:"required"`
	ObservedAt time.Time                `json:"observedAt" validate:"required"`
	OwnerID    string                   `json:"ownerId" validate:"required"`
}

const ChatPresenceUpdatedEventName = "channel.chat_presence_updated"

type ChatPresenceUpdatedEvent = types.DomainEvent[ChannelChatPresenceUpdatedPayload]

func NewChatPresenceUpdatedEvent(entityID uuid.UUID, ownerID string, payload ChannelChatPresenceUpdatedPayload) ChatPresenceUpdatedEvent {
	return types.NewDomainEvent(ChatPresenceUpdatedEventName, entityID, ownerID, payload)
}
