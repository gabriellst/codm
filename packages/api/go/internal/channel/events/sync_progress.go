package events

import (
	channelenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelSyncProgressPayload carries progress metrics for an ongoing sync session.
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
type ChannelSyncProgressPayload struct {
	ChannelID       uuid.UUID                    `json:"channelId" validate:"required"`
	OwnerID         string                       `json:"ownerId" validate:"required"`
	HistorySyncType channelenums.HistorySyncType `json:"historySyncType" validate:"required"`
	Percent         uint32                       `json:"percent"`
}

const SyncProgressEventName = "channel.sync_progress"

type SyncProgressEvent = types.DomainEvent[ChannelSyncProgressPayload]

func NewSyncProgressEvent(entityID uuid.UUID, ownerID string, payload ChannelSyncProgressPayload) SyncProgressEvent {
	return types.NewDomainEvent(SyncProgressEventName, entityID, ownerID, payload)
}
