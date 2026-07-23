package events

import (
	"time"

	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelRemoteDeletedPayload is the data carried by the remote-deleted domain event.
type ChannelRemoteDeletedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	RemoteID  string    `json:"remoteId"`
	At        time.Time `json:"at"`
	OwnerID   string    `json:"ownerId"`
}

// RemoteDeletedEventName is the in-process domain event name raised when a
// Remote aggregate is soft-deleted.
const RemoteDeletedEventName = "channel.remote_deleted"

type RemoteDeletedEvent = types.DomainEvent[ChannelRemoteDeletedPayload]

func NewRemoteDeletedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemoteDeletedPayload) RemoteDeletedEvent {
	return types.NewDomainEvent(RemoteDeletedEventName, entityID, ownerID, payload)
}
