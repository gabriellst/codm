package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelPresenceUpdatedPayload is retargeted onto the frozen contracts wire
// binding (packages/contracts/generated/go/wire/events.go) — flat-events swap:
// the payload DECLARATION is single-sourced from
// `packages/contracts/wire/events/channel-presence-updated.tsp`.
//
// Semantics (unchanged): a contact's overall availability. Fires when
// whatsmeow emits *events.Presence (user went online/offline or their
// lastSeen timestamp advanced).
type ChannelPresenceUpdatedPayload = wire.ChannelPresenceUpdatedPayload

const PresenceUpdatedEventName = "channel.presence_updated"

type PresenceUpdatedEvent = types.DomainEvent[ChannelPresenceUpdatedPayload]

func NewPresenceUpdatedEvent(entityID uuid.UUID, ownerID string, payload ChannelPresenceUpdatedPayload) PresenceUpdatedEvent {
	return types.NewDomainEvent(PresenceUpdatedEventName, entityID, ownerID, payload)
}
