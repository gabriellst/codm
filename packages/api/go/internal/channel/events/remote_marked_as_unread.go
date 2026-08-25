package events

import (
	"time"

	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelRemoteMarkedAsUnreadPayload is the data carried by the remote-marked-as-unread domain event.
type ChannelRemoteMarkedAsUnreadPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	RemoteID  string    `json:"remoteId"`
	At        time.Time `json:"at"`
	OwnerID   string    `json:"ownerId"`
}

const RemoteMarkedAsUnreadEventName = "channel.remote_marked_as_unread"

type RemoteMarkedAsUnreadEvent = types.DomainEvent[ChannelRemoteMarkedAsUnreadPayload]

func NewRemoteMarkedAsUnreadEvent(entityID uuid.UUID, ownerID string, payload ChannelRemoteMarkedAsUnreadPayload) RemoteMarkedAsUnreadEvent {
	return types.NewDomainEvent(RemoteMarkedAsUnreadEventName, entityID, ownerID, payload)
}
