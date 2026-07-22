package events

import (
	"time"

	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelRemoteMutedPayload is the data carried by the remote-muted domain event.
//
// MutedUntil carries the absolute mute expiration from the platform (whatsmeow's
// GetMuteEndTimestamp). A nil value means "muted forever" — callers must treat
// an open-ended mute as distinct from "muted until now".
type ChannelRemoteMutedPayload struct {
	ChannelID  uuid.UUID  `json:"channelId"`
	RemoteID   string     `json:"remoteId"`
	At         time.Time  `json:"at"`
	MutedUntil *time.Time `json:"mutedUntil,omitempty"`
	OwnerID    string     `json:"ownerId"`
}

const RemoteMutedEventName = "channel.remote_muted"

type RemoteMutedEvent = types.DomainEvent[ChannelRemoteMutedPayload]

func NewRemoteMutedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemoteMutedPayload) RemoteMutedEvent {
	return types.NewDomainEvent(RemoteMutedEventName, entityID, ownerID, payload)
}
