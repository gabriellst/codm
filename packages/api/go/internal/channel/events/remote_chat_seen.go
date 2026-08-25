package events

import (
	"time"

	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelRemoteChatSeenPayload is the data carried by the remote-chat-seen domain event.
//
// LastReadMessageID carries the message id at which the read watermark closed,
// or nil when the platform signal carried no specific id (whatsmeow's
// MarkChatAsRead typically batches up to the last delivered message).
type ChannelRemoteChatSeenPayload struct {
	ChannelID         uuid.UUID `json:"channelId"`
	RemoteID          string    `json:"remoteId"`
	At                time.Time `json:"at"`
	LastReadMessageID *string   `json:"lastReadMessageId,omitempty"`
	OwnerID           string    `json:"ownerId"`
}

const RemoteChatSeenEventName = "channel.remote_chat_seen"

type RemoteChatSeenEvent = types.DomainEvent[ChannelRemoteChatSeenPayload]

func NewRemoteChatSeenEvent(entityID uuid.UUID, ownerID string, payload ChannelRemoteChatSeenPayload) RemoteChatSeenEvent {
	return types.NewDomainEvent(RemoteChatSeenEventName, entityID, ownerID, payload)
}
