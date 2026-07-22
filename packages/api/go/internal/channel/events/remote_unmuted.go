package events

import (
	"time"

	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelRemoteUnmutedPayload is the data carried by the remote-unmuted domain event.
type ChannelRemoteUnmutedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	RemoteID  string    `json:"remoteId"`
	At        time.Time `json:"at"`
	OwnerID   string    `json:"ownerId"`
}

const RemoteUnmutedEventName = "channel.remote_unmuted"

type RemoteUnmutedEvent = types.DomainEvent[ChannelRemoteUnmutedPayload]

func NewRemoteUnmutedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemoteUnmutedPayload) RemoteUnmutedEvent {
	return types.NewDomainEvent(RemoteUnmutedEventName, entityID, ownerID, payload)
}
