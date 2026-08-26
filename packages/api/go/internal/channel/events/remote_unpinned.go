package events

import (
	"time"

	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelRemoteUnpinnedPayload is the data carried by the remote-unpinned domain event.
type ChannelRemoteUnpinnedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	RemoteID  string    `json:"remoteId"`
	At        time.Time `json:"at"`
	OwnerID   string    `json:"ownerId"`
}

const RemoteUnpinnedEventName = "channel.remote_unpinned"

type RemoteUnpinnedEvent = types.DomainEvent[ChannelRemoteUnpinnedPayload]

func NewRemoteUnpinnedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemoteUnpinnedPayload) RemoteUnpinnedEvent {
	return types.NewDomainEvent(RemoteUnpinnedEventName, entityID, ownerID, payload)
}
