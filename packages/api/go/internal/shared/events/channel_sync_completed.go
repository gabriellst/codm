package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
)

const ChannelSyncCompletedEventName = "integration.channel.sync_completed"

type ChannelSyncCompletedEvent = types.IntegrationEvent[channelevents.ChannelSyncCompletedPayload]

func NewChannelSyncCompletedEvent(ownerID string, payload channelevents.ChannelSyncCompletedPayload) ChannelSyncCompletedEvent {
	return types.NewIntegrationEvent(ChannelSyncCompletedEventName, ownerID, payload)
}
