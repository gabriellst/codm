package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelSyncStartedEventName = "integration.channel.sync_started"

type ChannelSyncStartedEvent = types.IntegrationEvent[channelevents.ChannelSyncStartedPayload]

func NewChannelSyncStartedEvent(ownerID string, payload channelevents.ChannelSyncStartedPayload) ChannelSyncStartedEvent {
	return types.NewIntegrationEvent(ChannelSyncStartedEventName, ownerID, payload)
}
