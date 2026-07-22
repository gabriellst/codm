package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
)

const ChannelSyncProgressEventName = "integration.channel.sync_progress"

type ChannelSyncProgressEvent = types.IntegrationEvent[channelevents.ChannelSyncProgressPayload]

func NewChannelSyncProgressEvent(ownerID string, payload channelevents.ChannelSyncProgressPayload) ChannelSyncProgressEvent {
	return types.NewIntegrationEvent(ChannelSyncProgressEventName, ownerID, payload)
}
