package events

import (
	"time"

	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelSyncCompletedPayload signals that a sync session has finished.
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
type ChannelSyncCompletedPayload struct {
	ChannelID   uuid.UUID `json:"channelId" validate:"required"`
	OwnerID     string    `json:"ownerId" validate:"required"`
	CompletedAt time.Time `json:"completedAt" validate:"required"`
}

const SyncCompletedEventName = "channel.sync_completed"

type SyncCompletedEvent = types.DomainEvent[ChannelSyncCompletedPayload]

func NewSyncCompletedEvent(entityID uuid.UUID, ownerID string, payload ChannelSyncCompletedPayload) SyncCompletedEvent {
	return types.NewDomainEvent(SyncCompletedEventName, entityID, ownerID, payload)
}
