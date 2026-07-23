package events

import (
	"time"

	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelSyncStartedPayload signals that a sync session has begun.
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
type ChannelSyncStartedPayload struct {
	ChannelID uuid.UUID `json:"channelId" validate:"required"`
	OwnerID   string    `json:"ownerId" validate:"required"`
	StartedAt time.Time `json:"startedAt" validate:"required"`
}

const SyncStartedEventName = "channel.sync_started"

type SyncStartedEvent = types.DomainEvent[ChannelSyncStartedPayload]

func NewSyncStartedEvent(entityID uuid.UUID, ownerID string, payload ChannelSyncStartedPayload) SyncStartedEvent {
	return types.NewDomainEvent(SyncStartedEventName, entityID, ownerID, payload)
}
