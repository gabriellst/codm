package events

import (
	"time"

	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelRemoteArchivedPayload is the data carried by the remote-archived domain event.
type ChannelRemoteArchivedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	RemoteID  string    `json:"remoteId"`
	At        time.Time `json:"at"`
	OwnerID   string    `json:"ownerId"`
}

const RemoteArchivedEventName = "channel.remote_archived"

type RemoteArchivedEvent = types.DomainEvent[ChannelRemoteArchivedPayload]

func NewRemoteArchivedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemoteArchivedPayload) RemoteArchivedEvent {
	return types.NewDomainEvent(RemoteArchivedEventName, entityID, ownerID, payload)
}
