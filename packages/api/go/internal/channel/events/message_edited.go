package events

import (
	"encoding/json"

	msgenums "template/api-go/internal/channel/enums"
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelMessageEditedPayload captures a content revision to a previously
// sent or received message. The read model picks the most recent edit per
// MessageID and overlays its content onto the original sent/received event.
type ChannelMessageEditedPayload struct {
	ChannelID   uuid.UUID            `json:"channelId" validate:"required"`
	MessageID   string               `json:"messageId" validate:"required"`
	RemoteID    string               `json:"remoteId" validate:"required"`
	SenderID    string               `json:"senderId" validate:"required"`
	Timestamp   int64                `json:"timestamp" validate:"required"`
	MessageType msgenums.MessageType `json:"messageType" validate:"required"`
	Content     json.RawMessage      `json:"content,omitempty"`
	Platform    sharedenums.Platform `json:"platform" validate:"required"`
	OwnerID     string               `json:"ownerId" validate:"required"`
}

const MessageEditedEventName = "channel.message_edited"

type MessageEditedEvent = types.DomainEvent[ChannelMessageEditedPayload]

func NewMessageEditedEvent(entityID uuid.UUID, ownerID string, payload ChannelMessageEditedPayload) MessageEditedEvent {
	return types.NewDomainEvent(MessageEditedEventName, entityID, ownerID, payload)
}
