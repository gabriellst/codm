package events

import (
	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelRemotesSyncedPayload is fired once per bootstrap contact sync pass
// to let consumers invalidate the sidebar. Carries summary counts only; no
// per-contact data.
type ChannelRemotesSyncedPayload struct {
	ChannelID uuid.UUID `json:"channelId" validate:"required"`
	OwnerID   string    `json:"ownerId"   validate:"required"`
	Total     int       `json:"total"     validate:"required"`
	Inserted  int       `json:"inserted"  validate:"required"`
}

const RemotesSyncedEventName = "channel.remotes_synced"

type RemotesSyncedEvent = types.DomainEvent[ChannelRemotesSyncedPayload]

func NewRemotesSyncedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemotesSyncedPayload) RemotesSyncedEvent {
	return types.NewDomainEvent(RemotesSyncedEventName, entityID, ownerID, payload)
}
