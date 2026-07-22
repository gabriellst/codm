package events

import (
	"time"

	channelenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelRemoteUpdatedPayload is the live-stream payload for real-time changes
// to a remote entity (user rename, group attribute change). Type discriminates:
// users carry Name only; groups carry Name (subject) + optional Description.
// Membership changes go through channel.membership_updated.
// Owned by the remote domain; shared/events imports this type for the
// integration wrapper.
type ChannelRemoteUpdatedPayload struct {
	ChannelID   uuid.UUID               `json:"channelId" validate:"required"`
	RemoteID    string                  `json:"remoteId" validate:"required"`
	Type        channelenums.RemoteType `json:"type" validate:"required"`
	Name        string                  `json:"name" validate:"required"`
	Description *string                 `json:"description,omitempty"`
	ObservedAt  time.Time               `json:"observedAt" validate:"required"`
	OwnerID     string                  `json:"ownerId" validate:"required"`
}

// RemoteUpdatedEventName is the observation event raised when the bootstrap
// scan (or a subsequent profile change) surfaces the latest snapshot of a
// user/broadcast remote.
const RemoteUpdatedEventName = "channel.remote_updated"

type RemoteUpdatedEvent = types.DomainEvent[ChannelRemoteUpdatedPayload]

func NewRemoteUpdatedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemoteUpdatedPayload) RemoteUpdatedEvent {
	return types.NewDomainEvent(RemoteUpdatedEventName, entityID, ownerID, payload)
}
