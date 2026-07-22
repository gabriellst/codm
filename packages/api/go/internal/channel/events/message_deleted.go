package events

import (
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelMessageDeletedPayload is the tombstone for a previously sent or
// received message. The read model hides any MessageID that has at least
// one deletion event — the original sent/received event stays in
// shared.events for audit.
type ChannelMessageDeletedPayload struct {
	ChannelID uuid.UUID            `json:"channelId" validate:"required"`
	MessageID string               `json:"messageId" validate:"required"`
	RemoteID  string               `json:"remoteId" validate:"required"`
	Platform  sharedenums.Platform `json:"platform" validate:"required"`
	OwnerID   string               `json:"ownerId" validate:"required"`
}

const MessageDeletedEventName = "channel.message_deleted"

type MessageDeletedEvent = types.DomainEvent[ChannelMessageDeletedPayload]

func NewMessageDeletedEvent(entityID uuid.UUID, ownerID string, payload ChannelMessageDeletedPayload) MessageDeletedEvent {
	return types.NewDomainEvent(MessageDeletedEventName, entityID, ownerID, payload)
}
