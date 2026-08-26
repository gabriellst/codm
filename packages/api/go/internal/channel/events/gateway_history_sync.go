package events

import (
	channelenums "template/api-go/internal/channel/enums"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelGatewayHistorySyncPayload mirrors whatsmeow's HistorySync progress.
// Reused by the `channel.gateway.history_sync` domain event and by the
// `integration.channel.sync_progress` integration event via the domain→integration
// handler. Only the two user-facing SyncType variants are surfaced; whatsmeow's
// FULL, PUSH_NAME, NON_BLOCKING_DATA, and ON_DEMAND are dropped at the mapper.
// Owned by the channel domain; the integration wrapper in this package
// consumes this type.
type ChannelGatewayHistorySyncPayload struct {
	ChannelID       uuid.UUID                    `json:"channelId" validate:"required"`
	OwnerID         string                       `json:"ownerId" validate:"required"`
	HistorySyncType channelenums.HistorySyncType `json:"historySyncType" validate:"required"`
	Percent         uint32                       `json:"percent"`
}

// GatewayHistorySyncEventName is emitted once per whatsmeow *events.HistorySync
// with SyncType ∈ {INITIAL_BOOTSTRAP, RECENT}. Other whatsmeow SyncTypes are
// dropped at the event_mapper.
const GatewayHistorySyncEventName = "channel.gateway.history_sync"

type GatewayHistorySyncEvent = types.DomainEvent[ChannelGatewayHistorySyncPayload]

func NewGatewayHistorySyncEvent(entityID uuid.UUID, ownerID string, payload ChannelGatewayHistorySyncPayload) GatewayHistorySyncEvent {
	return types.NewDomainEvent(GatewayHistorySyncEventName, entityID, ownerID, payload)
}
