package events

import (
	"template/api-go/internal/channel/enums"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelMessageDeliveredPayload signals that a recipient's device received
// one or more of the owner's messages in the given chat. Timestamp is treated
// as a watermark — every owner message in the chat with
// message_timestamp <= Timestamp is considered delivered to SenderID.
//
// MessageIDs may be empty (presence/online ack carrying no specific ids),
// populated with a single id (per-message ack), or batched. The read model
// does not use them; it only uses (RemoteID, SenderID, Timestamp) to close
// the watermark.
//
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
type ChannelMessageDeliveredPayload struct {
	ChannelID  uuid.UUID      `json:"channelId" validate:"required"`
	RemoteID   string         `json:"remoteId" validate:"required"`
	SenderID   string         `json:"senderId" validate:"required"`
	MessageIDs []string       `json:"messageIds"`
	Timestamp  int64          `json:"timestamp" validate:"required"`
	Platform   enums.Platform `json:"platform" validate:"required"`
	OwnerID    string         `json:"ownerId" validate:"required"`
}

const MessageDeliveredEventName = "channel.message_delivered"

type MessageDeliveredEvent = types.DomainEvent[ChannelMessageDeliveredPayload]

func NewMessageDeliveredEvent(entityID uuid.UUID, ownerID string, payload ChannelMessageDeliveredPayload) MessageDeliveredEvent {
	return types.NewDomainEvent(MessageDeliveredEventName, entityID, ownerID, payload)
}
