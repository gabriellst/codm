package events

import (
	"time"

	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelPresenceUpdatedPayload carries a contact's overall availability.
// Fires when whatsmeow emits *events.Presence (user went online/offline
// or their lastSeen timestamp advanced).
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
type ChannelPresenceUpdatedPayload struct {
	ChannelID   uuid.UUID `json:"channelId" validate:"required"`
	RemoteID    string    `json:"remoteId" validate:"required"`
	Unavailable bool      `json:"unavailable"`
	LastSeen    *int64    `json:"lastSeen,omitempty"`
	ObservedAt  time.Time `json:"observedAt" validate:"required"`
	OwnerID     string    `json:"ownerId" validate:"required"`
}

const PresenceUpdatedEventName = "channel.presence_updated"

type PresenceUpdatedEvent = types.DomainEvent[ChannelPresenceUpdatedPayload]

func NewPresenceUpdatedEvent(entityID uuid.UUID, ownerID string, payload ChannelPresenceUpdatedPayload) PresenceUpdatedEvent {
	return types.NewDomainEvent(PresenceUpdatedEventName, entityID, ownerID, payload)
}
