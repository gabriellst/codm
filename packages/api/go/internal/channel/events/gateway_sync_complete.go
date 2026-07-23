package events

import (
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelGatewaySyncCompletePayload carries the sync completion signal raised
// when whatsmeow fires AppStateSyncComplete(name=regular).
// Owned by the channel domain; the integration wrapper in this package
// consumes this type.
type ChannelGatewaySyncCompletePayload struct {
	ChannelID uuid.UUID `json:"channelId" validate:"required"`
	OwnerID   string    `json:"ownerId" validate:"required"`
}

const GatewaySyncCompleteEventName = "channel.gateway.sync_complete"

type GatewaySyncCompleteEvent = types.DomainEvent[ChannelGatewaySyncCompletePayload]

func NewGatewaySyncCompleteEvent(entityID uuid.UUID, ownerID string, payload ChannelGatewaySyncCompletePayload) GatewaySyncCompleteEvent {
	return types.NewDomainEvent(GatewaySyncCompleteEventName, entityID, ownerID, payload)
}
