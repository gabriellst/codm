package events

import (
	"time"

	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelRemoteUnarchivedPayload is the data carried by the remote-unarchived domain event.
type ChannelRemoteUnarchivedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	RemoteID  string    `json:"remoteId"`
	At        time.Time `json:"at"`
	OwnerID   string    `json:"ownerId"`
}

const RemoteUnarchivedEventName = "channel.remote_unarchived"

type RemoteUnarchivedEvent = types.DomainEvent[ChannelRemoteUnarchivedPayload]

func NewRemoteUnarchivedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemoteUnarchivedPayload) RemoteUnarchivedEvent {
	return types.NewDomainEvent(RemoteUnarchivedEventName, entityID, ownerID, payload)
}
