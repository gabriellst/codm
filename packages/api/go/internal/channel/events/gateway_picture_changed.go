package events

import (
	"github.com/google/uuid"

	"template/core-go/types"
)

const GatewayPictureChangedEventName = "channel.gateway.picture_changed"

// GatewayPictureChangedPayload is an internal mapper→handler handoff so the
// picture fetcher can run its RPC without blocking the whatsmeow event
// loop. Never exposed as an integration event.
type GatewayPictureChangedPayload struct {
	ChannelID uuid.UUID `json:"channelId" validate:"required"`
	RemoteID  string    `json:"remoteId" validate:"required"`
	OwnerID   string    `json:"ownerId" validate:"required"`
}

type GatewayPictureChangedEvent = types.DomainEvent[GatewayPictureChangedPayload]

func NewGatewayPictureChangedEvent(entityID uuid.UUID, ownerID string, payload GatewayPictureChangedPayload) GatewayPictureChangedEvent {
	return types.NewDomainEvent(GatewayPictureChangedEventName, entityID, ownerID, payload)
}
