package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
)

const ChannelRemotesSyncedEventName = "integration.channel.remotes_synced"

type ChannelRemotesSyncedEvent = types.IntegrationEvent[channelevents.ChannelRemotesSyncedPayload]

func NewChannelRemotesSyncedEvent(ownerID string, payload channelevents.ChannelRemotesSyncedPayload) ChannelRemotesSyncedEvent {
	return types.NewIntegrationEvent(ChannelRemotesSyncedEventName, ownerID, payload)
}
