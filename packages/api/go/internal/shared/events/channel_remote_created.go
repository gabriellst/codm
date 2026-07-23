package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelRemoteCreatedEventName = "integration.channel.remote_created"

type ChannelRemoteCreatedEvent = types.IntegrationEvent[channelevents.ChannelRemoteCreatedPayload]

func NewChannelRemoteCreatedEvent(ownerID string, payload channelevents.ChannelRemoteCreatedPayload) ChannelRemoteCreatedEvent {
	return types.NewIntegrationEvent(ChannelRemoteCreatedEventName, ownerID, payload)
}
