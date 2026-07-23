package events

import (
	channelenums "template/api-go/internal/channel/enums"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelRemoteCreatedPayload is the data carried by the remote-created domain event.
// Raised when a Remote aggregate is first constructed (NewRemote). This event
// captures the identity and type of the remote — projection-only fields (name,
// avatarURL, etc.) are delivered via remote_updated events.
type ChannelRemoteCreatedPayload struct {
	ChannelID  uuid.UUID               `json:"channelId"`
	RemoteID   string                  `json:"remoteId"`
	RemoteType channelenums.RemoteType `json:"remoteType"`
	OwnerID    string                  `json:"ownerId"`
	Platform   channelenums.Platform   `json:"platform"`
}

// RemoteCreatedEventName is the in-process domain event name raised when a
// Remote aggregate is created.
const RemoteCreatedEventName = "channel.remote_created"

type RemoteCreatedEvent = types.DomainEvent[ChannelRemoteCreatedPayload]

func NewRemoteCreatedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemoteCreatedPayload) RemoteCreatedEvent {
	return types.NewDomainEvent(RemoteCreatedEventName, entityID, ownerID, payload)
}
