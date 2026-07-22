package events

import (
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelMessageSeenPayload signals that messages in a chat were read or
// played. Covers three whatsmeow receipt types that all mean "consumed":
//
//   - read              → counterparty opened the chat / message
//   - played            → counterparty played a voice/video note
//   - read-self (Self=true) → owner read the thread on another device
//
// Status aggregation (per-message ✓✓ blue) uses SenderID != owner rows.
// Remote chat_seen sync (multi-device) uses Self=true rows.
//
// Timestamp is a watermark — every owner message in the chat with
// message_timestamp <= Timestamp is considered seen.
//
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
type ChannelMessageSeenPayload struct {
	ChannelID  uuid.UUID            `json:"channelId" validate:"required"`
	RemoteID   string               `json:"remoteId" validate:"required"`
	SenderID   string               `json:"senderId" validate:"required"`
	MessageIDs []string             `json:"messageIds"`
	Timestamp  int64                `json:"timestamp" validate:"required"`
	Self       bool                 `json:"self"` // true when SenderID == owner (read-self)
	Platform   sharedenums.Platform `json:"platform" validate:"required"`
	OwnerID    string               `json:"ownerId" validate:"required"`
}

const MessageSeenEventName = "channel.message_seen"

type MessageSeenEvent = types.DomainEvent[ChannelMessageSeenPayload]

func NewMessageSeenEvent(entityID uuid.UUID, ownerID string, payload ChannelMessageSeenPayload) MessageSeenEvent {
	return types.NewDomainEvent(MessageSeenEventName, entityID, ownerID, payload)
}
