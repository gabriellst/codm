package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
)

const ChannelRemoteUpdatedEventName = "integration.channel.remote_updated"

type ChannelRemoteUpdatedEvent = types.IntegrationEvent[channelevents.ChannelRemoteUpdatedPayload]

func NewChannelRemoteUpdatedEvent(ownerID string, payload channelevents.ChannelRemoteUpdatedPayload) ChannelRemoteUpdatedEvent {
	return types.NewIntegrationEvent(ChannelRemoteUpdatedEventName, ownerID, payload)
}
