// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/events/channel_connected.go
// Harvested verbatim for the event skill exemplar set — do not edit; re-harvest instead.
package events

import (
	"github.com/google/uuid"

	"monorepo/api/internal/shared/types"
)

const ChannelConnectedEventName = "channel.channel_connected"

type ChannelConnectedPayload struct {
	ChannelID     uuid.UUID `json:"channelId"`
	OwnerRemoteID string    `json:"ownerRemoteId"`
	OwnerID       string    `json:"ownerId"`
}

type ChannelConnectedEvent = types.DomainEvent[ChannelConnectedPayload]

func NewChannelConnectedEvent(entityID uuid.UUID, ownerID string, payload ChannelConnectedPayload) ChannelConnectedEvent {
	return types.NewDomainEvent(ChannelConnectedEventName, entityID, ownerID, payload)
}
